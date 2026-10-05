# Finance for Life — Product Plan

> A gamified web app that teaches **teens** the basics of finance — **saving** and **investing** — through interactive lessons (from PowerPoint slides) and a safe, pretend-money investing sandbox.
>
> **Launch region:** Switzerland 🇨🇭 · **Primary audience:** teens (14–17) · **Status:** MVP built — FastAPI backend + Stitch web UI wired together (same-origin).

---

## 1. Vision & Principles

**Pitch:** A friendly money-world where a teen's profile grows a virtual nest egg by *learning*, *saving*, and *playing* a simulated market — all with pretend money.

**Unique angle:** Most kids' finance apps stop at saving. Finance for Life bridges **saving → investing** with a time-accelerated, bounded market sandbox that teaches risk/reward and compounding.

**Guiding principles**
- Every mechanic maps to one learning goal.
- No real money, no ads, no open chat, no dark patterns.
- Safety & privacy first (Swiss FADP + EU GDPR-K).
- Accessible and multilingual-ready (DE / FR / IT / EN).

**Brand palette** (from logo)
| Token | Hex | Use |
|-------|-----|-----|
| Blue | `#4294F7` | Background, primary buttons |
| White | `#FFFFFF` | Surfaces, "finance" wordmark |
| Light blue | `#B8D9FA` | Accents, "FOR" wordmark, borders |
| Yellow | `#F5D83C` | Coins, highlights, "LIFE" wordmark |
| Ink | `#163A63` | Text |

---

## 2. Target Audience

Primary: **Teens 14–17 (Investors+)** — full save + invest loop, risk/reward, diversification.

Age bands supported in data model for future expansion:
| Band | Name | Focus |
|------|------|-------|
| 5–7 | Explorers | One savings jar, tap games, no investing |
| 8–10 | Builders | Multiple goals, simple interest, badges |
| 11–13 | Investors | Simulated portfolio, risk/reward |
| **14–17** | **Teens** | **Full sandbox, compounding, diversification** |

---

## 3. Functionalities

### 3.1 Accounts & Onboarding
- [x] Parent account sign-up (email + password, hashed).
- [x] **Parental consent gate** (FADP / GDPR-K) — required before a teen profile exists.
- [x] Create teen profile (display name, age band, avatar).
- [x] Session persistence (localStorage) with profile switch.
- [x] **Demo auto-session** — the web UI bootstraps a parent → consent → child on first load.
- [ ] Real parent login / password reset (replace auto demo session).
- [ ] Parent dashboard (progress, time limits, approvals).

### 3.2 Lessons (from PowerPoint)
- [x] **PPTX importer** — decks → lessons (slides, images, speaker notes).
- [x] **Spanish → launch-locale translation** — source pilot decks in `ppts/`
  are in Spanish; the importer translates titles, bodies and notes on import
  (`--translate-from es`). Two engines with automatic selection:
  **Argos Translate (offline, preferred)** — a one-time model download, then
  fully local with no rate limits; and **Google (`deep-translator`, online
  fallback)** — throttled + retried. Falls back to original text if neither
  is available. The 3 pilot decks are imported & translated (134 slides).
- [x] Lesson list + slide-by-slide player.
- [x] **In-app slide viewer** — Learning Quests lessons open a modal that
  plays the imported slides (title, body, slide image, speaker notes) with
  Prev/Next + progress; finishing a lesson awards coins.
- [x] Complete lesson → earn coins.
- [x] **Lessons rendered into the Learning Quests path** (imported lessons appear in the UI quest roadmap).
- [ ] Quizzes per lesson wired end-to-end (backend ready) → scored UI.
- [ ] Audio narration from speaker notes.
- [ ] Lesson completion map / learning path.

### 3.3 Gamification — Earning
- [x] Virtual wallet with coin balance + transaction log.
- [x] Coins for completing lessons (`coins_per_lesson`).
- [x] Coins for correct quiz answers (`coins_per_quiz_correct`).
- [x] **Live wallet pill** reflects real coins across all UI pages.
- [x] **Demo coin grant** endpoint (`/demo/grant`) so UI flows work without content.
- [ ] Daily streaks & bonuses (currently static in UI).
- [ ] Badges / achievements engine (model exists, needs award logic).
- [ ] Avatar cosmetics purchasable with coins.

### 3.4 Saving
- [x] Savings-goal "jars" (name + target).
- [x] Deposit coins into a jar; progress bar; achieved state.
- [x] **CHF Vault page wired to real goals** — buckets + Total Saved from backend; Micro-Deposit grants + deposits.
- [ ] Simple-interest "growth" on saved coins (teach compounding).
- [ ] Goal templates (bike, concert, game).

### 3.5 Investing Sandbox (pretend money only)
- [x] Fictional, kid-friendly assets (LemonadeCo, SpaceToys, GreenFarm, PixelGames, Safe Savings Bond).
- [x] Buy / sell with pretend cash; holdings + avg cost.
- [x] Portfolio with cash, holdings, total value.
- [x] **Bounded** random-walk market (`max_daily_price_move_pct`) + "⏩ Next day" tick.
- [x] **Interactive Sims page fully wired** — live asset cards, HUD cash/value, holdings table, buy/sell, time-travel ticks with daily deltas.
- [ ] Persisted price-history chart per asset in UI.
- [ ] Scripted "event cards" (good/bad news) for cause/effect.
- [ ] Diversification challenge + "hold vs sell" reflection prompts.
- [ ] Compounding fast-forward visualization.

### 3.6 Safety, Privacy, Accessibility
- [x] No real money anywhere; clear "pretend money" labeling.
- [x] Server-side consent enforcement.
- [x] Capped volatility so no one is "wiped out".
- [ ] Data-deletion & export endpoints (GDPR rights).
- [ ] Screen-reader labels, color-blind-safe checks, large touch targets.
- [ ] Time limits & parental controls.

---

## 4. Architecture

```
┌──────────────────────────┐    same-origin fetch    ┌──────────────────────┐
│  Stitch Web UI (ui/)      │  ─────────────────────▶ │  FastAPI backend      │
│  Tailwind + Material theme│    /api (REST / JSON)   │  SQLAlchemy 2.0 ORM   │
│  4 pages + api.js         │  ◀───────────────────── │  SQLite (dev)         │
│  (served at /ui/)         │                         │  serves /ui + /static │
└──────────────────────────┘                         └──────────┬───────────┘
                                                                │
                                              ┌─────────────────┴───────────────┐
                                              │ python-pptx importer (CLI)        │
                                              │ market simulation (bounded walk)  │
                                              └───────────────────────────────────┘
```

> **Deployment model:** the FastAPI app serves the Stitch UI at `/ui/` (same
> origin), so there is **no CORS** and **one server** to run. `/` redirects to
> `/ui/`. Imported slide images are served from `/static/`.

**Backend modules** (`app/`)
- `config.py` — settings (locales, coin rewards, volatility caps).
- `database.py` — engine, session, `Base`, `init_db`.
- `models.py` — all ORM entities.
- `schemas.py` — Pydantic request/response models.
- `security.py` — password hashing (pbkdf2_sha256).
- `market.py` — asset seeding + `step_market`.
- `pptx_importer.py` — PPTX → lessons (also CLI).
- `translation.py` — offline-first translator (Argos Translate, with Google
  `deep-translator` fallback) used to translate Spanish decks on import.
- `main.py` — FastAPI app, endpoints, static mounts, `/demo/grant`.

**Web UI** (`ui/`) — generated with Stitch, Material Design tokens, Plus Jakarta Sans
- `index.html` — Learning Quests (slides + quiz + quest path).
- `sims.html` — Interactive Sims (trading sandbox).
- `vault.html` — Swiss Franc (CHF) Vault (savings buckets + 50/30/20 engine).
- `leaderboard.html` — Leaderboard & Badges.
- `api.js` — shared client: demo-session bootstrap, wallet pill, and per-page
  wiring (sims, quests, vault) to the backend; graceful fallback to demo content.

**React prototype** (`frontend/`) — earlier brand-palette SPA, kept for reference.

---

## 5. Data Model

| Entity | Key fields | Purpose |
|--------|-----------|---------|
| `ParentAccount` | email, hashed_password, consent_given/at, locale | Auth + consent |
| `ChildProfile` | parent_id, display_name, age_band, avatar | The learner |
| `Lesson` | title, age_band, locale, source_file | Imported deck |
| `Slide` | lesson_id, order, title, body, image, notes | One slide |
| `QuizQuestion` | lesson_id, prompt, options, correct_index | Quiz |
| `Progress` | child_id, lesson_id, completed, quiz_score | Tracking |
| `Wallet` / `WalletTransaction` | coins, amount, reason | Currency |
| `SavingsGoal` | name, target, saved, achieved | Saving |
| `Asset` / `PriceHistory` | symbol, price, volatility, tick | Market |
| `Portfolio` / `Holding` | cash, shares, avg_cost | Investing |
| `Badge` / `AchievementAward` | code, name, earned_at | Rewards |

---

## 6. API Surface

| Area | Endpoint |
|------|----------|
| Health | `GET /health` |
| Accounts | `POST /parents`, `POST /parents/{id}/consent`, `POST /parents/{id}/children` |
| Lessons | `GET /lessons`, `GET /lessons/{id}`, `POST /lessons/{id}/complete`, `POST /lessons/{id}/quiz` |
| Wallet | `GET /children/{id}/wallet` |
| Savings | `POST/GET /children/{id}/goals`, `POST /goals/{id}/deposit` |
| Market | `GET /market/assets`, `POST /market/tick` |
| Portfolio | `GET /children/{id}/portfolio`, `POST /market/buy`, `POST /market/sell` |
| Demo helper | `POST /demo/grant?child_id=&amount=` (UI convenience, grants coins) |
| Static | `GET /ui/*` (web UI), `GET /static/*` (slide images), `GET /` → `/ui/` |

---

## 7. Roadmap

### Phase 1 — MVP ✅ (done)
Accounts + consent, PPTX lessons, wallet, savings jars, investing sandbox,
**Stitch web UI served by FastAPI and wired to the backend** (Sims, Quests, Vault).

### Phase 2 — v1 (engagement)
- Real auth (login/reset) replacing the demo auto-session; parent dashboard.
- Quizzes scored end-to-end + badges engine.
- Persisted price-history charts + market event cards.
- Leaderboard & streaks backed by real per-child data.
- Avatars & cosmetics shop.
- DE / FR / IT localization (i18n).

### Phase 3 — v2 (scale)
- Classroom / teacher mode + leaderboards.
- Analytics & progress reporting.
- Content authoring tools (build lessons without PPTX).
- Postgres + Alembic migrations, deployment (Swiss hosting).
- Accessibility audit (WCAG) & data-rights endpoints.

---

## 8. Compliance Checklist (Switzerland-first)

- [x] Verifiable parental consent before data collection.
- [x] No real money / financial transactions.
- [ ] Minimal data collection documented (privacy policy).
- [ ] Data export + deletion (FADP / GDPR data-subject rights).
- [ ] Swiss data residency for hosting.
- [ ] Age-appropriate content review.
- [ ] No third-party ad/tracking SDKs.

---

## 9. How to Run

```powershell
# Backend (also serves the web UI)
python -m pip install -r requirements.txt
python main.py                       # http://127.0.0.1:8000  → redirects to /ui/
                                     #   web UI:  http://127.0.0.1:8000/ui/
                                     #   API docs: http://127.0.0.1:8000/docs

# Import a slide deck as a lesson (appears in the Learning Quests path)
python -m app.pptx_importer "deck.pptx" --title "Saving Basics" --locale de-CH

# Import the Spanish pilot decks in ppts/ — translated to the launch locale
python import_ppts.py                 # translate es -> en, import all 3 decks
python import_ppts.py --locale de-CH  # translate es -> German instead
python import_ppts.py --no-translate  # import as-is (keep original Spanish)

# Translate a single deck on import (any language) to the target locale
python -m app.pptx_importer "ppts/deck.pptx" --translate-from es --locale en

# Tests
python -m pytest -s
```

> The Stitch UI (`ui/`) is served by FastAPI, so you only run **one** server.
> The earlier React prototype in `frontend/` is optional and run separately
> with `npm run dev` if needed.

