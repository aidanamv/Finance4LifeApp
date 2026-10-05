"""Convert the pilot PPTX decks to PDF, then import each page as a slide.

Pipeline:
  1. PowerPoint (COM) exports each ``.pptx`` deck to a ``.pdf`` (vector,
     verbatim layout) saved under ``static/pdfs/``.
  2. PyMuPDF rasterises every PDF page to a PNG under ``static/slides/<slug>/``.
  3. Each PNG becomes a Slide whose ``image_path`` points at the page image,
     so the in-app viewer shows the original deck exactly as designed.

Requirements: Microsoft PowerPoint installed + ``pywin32`` + ``pymupdf``.

Usage (PowerShell):
    python render_ppts.py                 # render all decks at 1600px wide
    python render_ppts.py --width 1920
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf  # PyMuPDF
import win32com.client  # type: ignore

from app.database import SessionLocal, init_db
from app.models import AgeBand, Lesson, Slide

PPTS_DIR = Path("ppts")
STATIC_DIR = Path("static/slides")
PDF_DIR = Path("static/pdfs")

# PowerPoint SaveAs file format constant for PDF (ppSaveAsPDF).
PP_SAVE_AS_PDF = 32

# Source file -> friendly lesson title (same mapping as import_ppts.py).
DECKS = [
    ("1. Introducción Finanzas Personales.pptx", "Introduction to Personal Finance"),
    ("2. Introduccion Presupuesto - Ingresos Piloto 1.pptx", "Budgeting: Income (Part 1)"),
    ("3. Presupuesto - Gastos Piloto 1.pptx", "Budgeting: Expenses (Part 1)"),
]


def _slug(title: str) -> str:
    return "".join(c for c in title.lower() if c.isalnum() or c == "_")[:40]


def _pptx_to_pdf(ppt_app, pptx_path: Path, slug: str) -> Path:
    """Export a .pptx to .pdf via PowerPoint; return the PDF path."""
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = (PDF_DIR / f"{slug}.pdf").resolve()
    presentation = ppt_app.Presentations.Open(str(pptx_path.resolve()), WithWindow=False)
    try:
        presentation.SaveAs(str(pdf_path), PP_SAVE_AS_PDF)
    finally:
        presentation.Close()
    return pdf_path


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

    ppt_app = win32com.client.Dispatch("PowerPoint.Application")
    db = SessionLocal()
    try:
        for filename, title in DECKS:
            path = PPTS_DIR / filename
            if not path.exists():
                print(f"[skip] {path} not found")
                continue

            # Idempotent: drop any previous import of this source file.
            existing = db.query(Lesson).filter(Lesson.source_file == path.name).all()
            for old in existing:
                db.delete(old)
            if existing:
                db.commit()
                print(f"[replace] removed {len(existing)} previous import(s) of {path.name}")

            slug = _slug(title)
            print(f"[pdf]    {path.name} -> PDF ...")
            pdf_path = _pptx_to_pdf(ppt_app, path, slug)
            print(f"[render] {pdf_path.name} -> PNGs ...")
            images = _pdf_to_pngs(pdf_path, slug, args.width)

            lesson = Lesson(
                title=title,
                age_band=AgeBand(args.age_band),
                locale=args.locale,
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
        ppt_app.Quit()


if __name__ == "__main__":
    main()

