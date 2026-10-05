"""Translate and import the Spanish pilot decks in ``ppts/`` as lessons.

The source slide decks under ``ppts/`` are written in Spanish. This script
translates each deck into the target launch locale (default English) and
imports it as a Lesson so it shows up in the Learning Quests path.

Usage (PowerShell):
    python import_ppts.py                 # translate es -> en, import all
    python import_ppts.py --locale de-CH  # translate es -> German instead
    python import_ppts.py --no-translate  # import as-is (keep Spanish)
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.database import SessionLocal, init_db
from app.models import AgeBand, Lesson
from app.pptx_importer import import_pptx

PPTS_DIR = Path("ppts")

# Friendly lesson titles for each source file (kept in the launch locale via
# translation of the deck's own title when --translate-from is set, but these
# give nicer names than the Spanish filenames).
DECKS = [
    ("1. Introducción Finanzas Personales.pptx", "Introduction to Personal Finance"),
    ("2. Introduccion Presupuesto - Ingresos Piloto 1.pptx", "Budgeting: Income (Part 1)"),
    ("3. Presupuesto - Gastos Piloto 1.pptx", "Budgeting: Expenses (Part 1)"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locale", default="en", help="Target locale (e.g. en, de-CH).")
    parser.add_argument(
        "--age-band", default=AgeBand.TEENS.value, choices=[b.value for b in AgeBand]
    )
    parser.add_argument(
        "--no-translate",
        action="store_true",
        help="Import the decks without translating (keep original Spanish).",
    )
    args = parser.parse_args()

    translate_from = None if args.no_translate else "es"

    init_db()
    db = SessionLocal()
    try:
        for filename, title in DECKS:
            path = PPTS_DIR / filename
            if not path.exists():
                print(f"[skip] {path} not found")
                continue
            # Idempotent: drop any previous import of this source file so
            # re-running replaces (not duplicates) the lesson.
            existing = (
                db.query(Lesson).filter(Lesson.source_file == path.name).all()
            )
            for old in existing:
                db.delete(old)
            if existing:
                db.commit()
                print(f"[replace] removed {len(existing)} previous import(s) of {path.name}")
            lesson = import_pptx(
                db,
                str(path),
                title=title,
                age_band=AgeBand(args.age_band),
                locale=args.locale,
                translate_from=translate_from,
            )
            print(
                f"[ok] Imported '{lesson.title}' with {len(lesson.slides)} slides "
                f"(id={lesson.id}, locale={args.locale})."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()

