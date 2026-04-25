"""
Pass 1 extraction: dump raw per-page text from every PDF in docs/ to data/raw/.

For each PDF, writes:
  - <stem>.txt        Full text, with `===== PAGE N =====` separators.
  - <stem>.pages.tsv  Per-page char count, so we can spot image-only pages
                      that may need OCR in a later pass.
"""

import os
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = ROOT / "data" / "raw"
OUT.mkdir(parents=True, exist_ok=True)

# Skip duplicates: docs/2D6_Dungeon_Cards_A4.pdf is identical to
# docs/2D6 Dungeon Cards/2D6_Dungeon_Cards_A4.pdf, and the Letter
# variant is the same content in US paper size.
SKIP = {
    "docs/2D6_Dungeon_Cards_A4.pdf",
    "docs/2D6 Dungeon Cards/2D6_Dungeon_Cards_Letter.pdf",
}


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def extract_pdf(pdf_path: Path) -> tuple[int, int, int]:
    """Return (page_count, total_chars, low_text_pages)."""
    stem = pdf_path.stem
    out_txt = OUT / f"{stem}.txt"
    out_tsv = OUT / f"{stem}.pages.tsv"

    doc = fitz.open(pdf_path)
    total_chars = 0
    low_text = 0

    with out_txt.open("w", encoding="utf-8") as fout, out_tsv.open(
        "w", encoding="utf-8"
    ) as ftsv:
        ftsv.write("page\tchars\n")
        for i, page in enumerate(doc, start=1):
            text = page.get_text()
            n = len(text.strip())
            total_chars += n
            if n < 50:
                low_text += 1
            fout.write(f"===== PAGE {i} =====\n")
            fout.write(text)
            if not text.endswith("\n"):
                fout.write("\n")
            ftsv.write(f"{i}\t{n}\n")

    page_count = doc.page_count
    doc.close()
    return page_count, total_chars, low_text


def main() -> int:
    pdfs = sorted(DOCS.rglob("*.pdf"))
    print(f"{'pages':>5} {'chars':>9} {'low':>4}  file")
    print("-" * 70)
    for pdf in pdfs:
        if rel(pdf) in SKIP:
            print(f"{'-':>5} {'-':>9} {'-':>4}  {rel(pdf)} (skipped duplicate)")
            continue
        try:
            pages, chars, low = extract_pdf(pdf)
            print(f"{pages:>5} {chars:>9} {low:>4}  {rel(pdf)}")
        except Exception as e:
            print(f"  ERR {rel(pdf)} :: {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
