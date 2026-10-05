"""Lightweight text translation helper used by the PPTX importer.

Wraps ``deep-translator`` (Google Translate backend) so Spanish source
decks can be translated into the target launch locale (German, French,
Italian or English) before they are stored as lessons.

Design goals:
- **Optional dependency**: if ``deep-translator`` is not installed or the
  network is unavailable, translation degrades gracefully and the original
  text is returned (the importer keeps working).
- **Cheap**: an in-memory cache avoids re-translating identical strings
  (titles, repeated bullet points, etc.).
- **Safe chunking**: Google Translate limits requests to ~5000 chars, so
  long slide bodies are split on paragraph/line boundaries.
"""

from __future__ import annotations

import re
import time

# Map our app locale codes (e.g. "de-CH") to ISO-639-1 codes the
# translation backend understands (e.g. "de").
_LOCALE_TO_LANG = {
    "de-CH": "de",
    "fr-CH": "fr",
    "it-CH": "it",
    "en": "en",
    "es": "es",
    "es-ES": "es",
}

_MAX_CHARS = 4500  # stay safely under Google Translate's ~5000 char limit
_MIN_INTERVAL = 0.6  # seconds between requests (well under 5 req/s)
_MAX_RETRIES = 6  # retries on rate-limit / transient errors

# Sentinel used to pack multiple segments into one request. Punctuation-only
# on its own line so translators tend to leave it untouched.
_SEP = "\n@@@\n"
_SEP_RE = re.compile(r"\n?\s*@@@\s*\n?")


def locale_to_lang(locale: str) -> str:
    """Return the ISO-639-1 language code for an app locale string."""
    if locale in _LOCALE_TO_LANG:
        return _LOCALE_TO_LANG[locale]
    # Fall back to the part before the region separator ("fr-CH" -> "fr").
    return locale.split("-")[0].lower()


class Translator:
    """Translate text into ``target_locale``.

    When ``enabled`` is False (or the backend cannot be loaded) every call
    returns the input unchanged, so callers never have to special-case the
    "no translation" path.
    """

    def __init__(self, target_locale: str, source: str = "auto", enabled: bool = True):
        self.target_lang = locale_to_lang(target_locale)
        self.source_lang = source if source == "auto" else locale_to_lang(source)
        self.enabled = enabled
        self.engine = None  # "argos" (offline) or "google" (online)
        self._backend = None
        self._argos = None
        self._last_call = 0.0
        self._cache: dict[str, str] = {}
        if enabled:
            self._init_backend()

    # -- backend plumbing ---------------------------------------------------
    def _init_backend(self):
        # Prefer the offline Argos Translate engine: no rate limits, no network
        # at translate time (model is downloaded once). Fall back to Google.
        self._argos = self._make_argos()
        if self._argos is not None:
            self.engine = "argos"
            return
        self._backend = self._make_google()
        if self._backend is not None:
            self.engine = "google"

    def _make_argos(self):
        if self.source_lang == "auto":
            return None  # Argos needs an explicit source language.
        try:
            import argostranslate.package as pkg
            import argostranslate.settings as settings
            import argostranslate.translate as translate

            # Use the lightweight MiniSBD sentence splitter so we never pull a
            # stanza/spaCy model over the network (blocked in some environments).
            settings.chunk_type = settings.ChunkType.MINISBD

            installed = {
                (l.code, j.to_lang.code)
                for l in translate.get_installed_languages()
                for j in l.translations_from
            }
            if (self.source_lang, self.target_lang) not in installed:
                try:
                    pkg.update_package_index()
                    avail = pkg.get_available_packages()
                    match = next(
                        p
                        for p in avail
                        if p.from_code == self.source_lang and p.to_code == self.target_lang
                    )
                    pkg.install_from_path(match.download())
                except Exception as exc:
                    print(f"[translation] could not install Argos {self.source_lang}->"
                          f"{self.target_lang} model ({exc}); will try Google.")
                    return None

            langs = translate.get_installed_languages()
            from_lang = next((l for l in langs if l.code == self.source_lang), None)
            to_lang = next((l for l in langs if l.code == self.target_lang), None)
            if from_lang is None or to_lang is None:
                return None
            translation = from_lang.get_translation(to_lang)
            if translation is None:
                return None
            print(f"[translation] using offline Argos engine ({self.source_lang}->{self.target_lang}).")
            return translation.translate
        except Exception as exc:  # pragma: no cover - import issues
            print(f"[translation] Argos unavailable ({exc}); will try Google.")
            return None

    def _make_google(self):
        try:
            from deep_translator import GoogleTranslator

            print("[translation] using online Google engine (rate-limited).")
            return GoogleTranslator(source=self.source_lang, target=self.target_lang)
        except Exception as exc:  # pragma: no cover - import/network issues
            print(
                f"[translation] disabled (could not init backend: {exc}). "
                "Keeping original text."
            )
            return None

    @property
    def _active(self) -> bool:
        return self._argos is not None or self._backend is not None

    def _call_backend(self, text: str) -> str:
        """Translate one request. Argos is local (no throttle); Google is
        throttled + retried to respect rate limits."""
        if self._argos is not None:
            return self._argos(text) or text
        for attempt in range(_MAX_RETRIES):
            # Throttle: never exceed the provider's requests-per-second cap.
            wait = _MIN_INTERVAL - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            try:
                result = self._backend.translate(text)
                self._last_call = time.monotonic()
                return result if result is not None else text
            except Exception as exc:  # rate limit / transient network error
                self._last_call = time.monotonic()
                if attempt == _MAX_RETRIES - 1:
                    raise
                backoff = 2.0 * (2**attempt)
                print(
                    f"[translation] retry {attempt + 1}/{_MAX_RETRIES} "
                    f"after {backoff:.1f}s ({exc})"
                )
                time.sleep(backoff)
        return text

    # -- single-string API --------------------------------------------------
    def translate(self, text: str) -> str:
        if not text or not text.strip() or not self._active:
            return text
        if text in self._cache:
            return self._cache[text]
        try:
            out = self._translate_long(text)
        except Exception as exc:  # pragma: no cover - network/runtime issues
            print(f"[translation] failed for a text block ({exc}); keeping original.")
            out = text
        self._cache[text] = out
        return out

    def _translate_long(self, text: str) -> str:
        if len(text) <= _MAX_CHARS:
            return self._call_backend(text)
        # Split long text into chunks on line boundaries, translate each.
        out: list[str] = []
        buf = ""
        for line in text.splitlines(keepends=True):
            if len(buf) + len(line) > _MAX_CHARS and buf:
                out.append(self._call_backend(buf))
                buf = ""
            buf += line
        if buf:
            out.append(self._call_backend(buf))
        return "".join(out)

    # -- batch API (packs many segments per request) ------------------------
    def translate_batch(self, texts: list[str]) -> list[str]:
        """Translate a list of strings, minimizing the number of requests.

        Returns a list aligned 1:1 with ``texts``. Empty/blank items and the
        no-op case (translation disabled) are passed through unchanged.
        """
        results: list[str | None] = [None] * len(texts)

        # Resolve trivial / cached items up front; collect the rest as unique.
        pending: dict[str, list[int]] = {}
        for i, t in enumerate(texts):
            if not t or not t.strip() or not self._active:
                results[i] = t
            elif t in self._cache:
                results[i] = self._cache[t]
            else:
                pending.setdefault(t, []).append(i)

        unique = list(pending.keys())
        # Argos is local/fast and may not preserve the packing delimiter, so
        # translate each string on its own. Google benefits from packing many
        # segments per request to avoid rate limits.
        groups = [[u] for u in unique] if self.engine == "argos" else self._pack(unique)
        for group in groups:
            translated = self._translate_group(group)
            for original, out in zip(group, translated):
                self._cache[original] = out
                for idx in pending[original]:
                    results[idx] = out

        return [r if r is not None else texts[i] for i, r in enumerate(results)]

    @staticmethod
    def _pack(segments: list[str]) -> list[list[str]]:
        """Group segments so each group (joined by _SEP) fits in one request."""
        groups: list[list[str]] = []
        cur: list[str] = []
        cur_len = 0
        for seg in segments:
            seg_len = len(seg) + len(_SEP)
            # An oversized single segment is handled on its own via _translate_long.
            if seg_len > _MAX_CHARS:
                if cur:
                    groups.append(cur)
                    cur, cur_len = [], 0
                groups.append([seg])
                continue
            if cur and cur_len + seg_len > _MAX_CHARS:
                groups.append(cur)
                cur, cur_len = [], 0
            cur.append(seg)
            cur_len += seg_len
        if cur:
            groups.append(cur)
        return groups

    def _translate_group(self, group: list[str]) -> list[str]:
        if len(group) == 1:
            return [self._translate_long(group[0])]
        packed = _SEP.join(group)
        try:
            raw = self._call_backend(packed)
            parts = [p.strip() for p in _SEP_RE.split(raw) if p.strip() != ""]
            if len(parts) == len(group):
                return parts
            print(
                f"[translation] delimiter mismatch (got {len(parts)}, "
                f"expected {len(group)}); falling back to per-item."
            )
        except Exception as exc:
            print(f"[translation] group failed ({exc}); falling back to per-item.")
        # Fallback: translate each item on its own (slower but reliable).
        out: list[str] = []
        for seg in group:
            try:
                out.append(self._translate_long(seg))
            except Exception:
                out.append(seg)
        return out

