"""Import the pilot decks straight from their PDF exports as lessons.

Unlike ``render_ppts.py`` (which needs Microsoft PowerPoint to turn the
``.pptx`` into a ``.pdf`` first), this script takes the already-exported
``.pdf`` files and rasterises each page to a PNG under
``static/slides/<slug>/``. Each PNG becomes a Slide whose ``image_path``
points at the page image, so the in-app viewer shows the original deck
exactly as designed — no reformatting, no translation.

Requirements: ``pymupdf`` only.

Usage (PowerShell):
    python import_pdfs.py                 # render all decks at 1600px wide
    python import_pdfs.py --width 1920
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf  # PyMuPDF

from app.database import SessionLocal, init_db
from app.models import AgeBand, Lesson, Slide

PPTS_DIR = Path("ppts")
STATIC_DIR = Path("static/slides")

# Source PDF -> friendly lesson title. The PDFs live next to the .pptx decks
# in ``ppts/`` and keep their original (Spanish) layout verbatim.
DECKS = [
    ("1. Introducción Finanzas Personales.pdf", "Introduction to Personal Finance"),
    ("2. Introduccion Presupuesto - Ingresos Piloto 1.pdf", "Budgeting: Income (Part 1)"),
    ("3. Presupuesto - Gastos Piloto 1.pdf", "Budgeting: Expenses (Part 1)"),
]


def _slug(title: str) -> str:
    return "".join(c for c in title.lower() if c.isalnum() or c == "_")[:40]


def _pdf_to_pngs(pdf_path: Path, slug: str, width: int) -> list[str]:
    """Rasterise each PDF page to a PNG; return relative image paths."""
    out_dir = STATIC_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    doc = pymupdf.open(str(pdf_path))
    try:
        for i, page in enumerate(doc):
            zoom = width / page.rect.width
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            filename = f"slide_{i:03d}.png"
            pix.save(str(out_dir / filename))
            paths.append(f"static/slides/{slug}/{filename}")
    finally:
        doc.close()
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=1600, help="PNG width in px.")
    parser.add_argument(
        "--age-band", default=AgeBand.TEENS.value, choices=[b.value for b in AgeBand]
    )
    parser.add_argument("--locale", default="es", help="Lesson locale tag.")
    args = parser.parse_args()

    init_db()

    db = SessionLocal()
    try:
        for order_index, (filename, title) in enumerate(DECKS):
            path = PPTS_DIR / filename
            if not path.exists():
                print(f"[skip] {path} not found")
                continue

            # Idempotent: drop any previous import of this source file so
            # re-running replaces (not duplicates) the lesson.
            existing = db.query(Lesson).filter(Lesson.source_file == path.name).all()
            for old in existing:
                db.delete(old)
            if existing:
                db.commit()
                print(f"[replace] removed {len(existing)} previous import(s) of {path.name}")

            slug = _slug(title)
            print(f"[render] {path.name} -> PNGs ...")
            images = _pdf_to_pngs(path, slug, args.width)

            lesson = Lesson(
                title=title,
                age_band=AgeBand(args.age_band),
                locale=args.locale,
                order_index=order_index,
                source_file=path.name,
            )
            db.add(lesson)
            db.flush()
            for i, rel in enumerate(images):
                db.add(
                    Slide(
                        lesson_id=lesson.id,
                        order_index=i,
                        title="",
                        body="",
                        image_path=rel,
                        notes="",
                    )
                )
            db.commit()
            db.refresh(lesson)
            print(f"[ok] Imported '{lesson.title}' with {len(images)} slides from PDF (id={lesson.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()

