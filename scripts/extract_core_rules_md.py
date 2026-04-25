"""
Convert the Core Rules PDF to clean Markdown.

Approach:
- Walk the PDF page-by-page, in column order (left col then right col).
- Group lines into paragraphs using vertical gap detection (blank lines).
- Map font sizes to Markdown heading levels:
    26.0 -> H1   (book title)
    15.9 -> H2   (chapter)
    12.1 -> H3   (section)
    11.1 -> H4   (subsection)
    other -> body
- Within body paragraphs, render bold spans as **bold**.
- Pages 1-2 are image-only covers; skip silently.
- Tiny "page number" blocks (just digits, top of page) are filtered out.
- Each page begins with an HTML comment <!-- page N --> to preserve
  source mapping for debugging without polluting the rendered doc.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "2D6_Dungeon_Core_Rules_Current_Version.pdf"
OUT = ROOT / "data" / "processed" / "core_rules.md"

# Font-size -> heading level. Sizes are rounded to 1dp to match PyMuPDF output.
HEADING_LEVELS = {
    26.0: 1,
    15.9: 2,
    12.1: 3,
    11.1: 4,
}
BODY_SIZE = 10.1
PAGE_NUM_RE = re.compile(r"^\s*\d{1,3}\s*$")
# Bold flag in PyMuPDF span flags is bit 4 (value 16).
BOLD_FLAG = 16


def line_kind(line: dict) -> tuple[int, float]:
    """Return (heading_level, max_size) for a line. heading_level=0 means body."""
    max_size = 0.0
    for span in line.get("spans", []):
        if not span["text"].strip():
            continue
        s = round(span["size"], 1)
        if s > max_size:
            max_size = s
    return HEADING_LEVELS.get(max_size, 0), max_size


def render_inline(line: dict, *, mark_bold: bool = True) -> str:
    """Render a line's spans as text. If mark_bold, wrap bold runs in **...**.

    Adjacent spans with the same bold-ness are merged before wrapping so a
    word split across two spans (e.g. "Walm" + "sley") doesn't render as
    "**Walm****sley**".
    """
    # Merge adjacent same-style spans into runs of (is_bold, text).
    runs: list[list] = []  # [is_bold, text]
    for span in line.get("spans", []):
        text = span["text"]
        if not text:
            continue
        is_bold = bool(span["flags"] & BOLD_FLAG)
        if runs and runs[-1][0] == is_bold:
            runs[-1][1] += text
        else:
            runs.append([is_bold, text])

    parts: list[str] = []
    for is_bold, text in runs:
        text = text.replace("**", r"\*\*")
        if mark_bold and is_bold and text.strip():
            stripped = text.strip()
            lead = text[: len(text) - len(text.lstrip())]
            trail = text[len(text.rstrip()):]
            parts.append(f"{lead}**{stripped}**{trail}")
        else:
            parts.append(text)
    return "".join(parts)


def column_of(block: dict, page_mid_x: float) -> int:
    """0 = left column, 1 = right column. Based on block x-centre."""
    bbox = block["bbox"]
    cx = (bbox[0] + bbox[2]) / 2
    return 0 if cx < page_mid_x else 1


def iter_blocks_in_reading_order(page: fitz.Page) -> Iterable[dict]:
    """Yield text blocks left-column-first, then right-column, each top-to-bottom."""
    page_mid_x = page.rect.width / 2
    blocks = [b for b in page.get_text("dict")["blocks"] if b.get("type", 0) == 0]
    blocks.sort(key=lambda b: (column_of(b, page_mid_x), b["bbox"][1]))
    return blocks


def is_page_number_line(line: dict) -> bool:
    """A standalone digit line at small size, used as page chrome."""
    text = "".join(s["text"] for s in line.get("spans", [])).strip()
    return bool(PAGE_NUM_RE.match(text))


def convert() -> None:
    doc = fitz.open(PDF)
    out_lines: list[str] = []
    out_lines.append("<!-- Generated from docs/2D6_Dungeon_Core_Rules_Current_Version.pdf -->")
    out_lines.append("<!-- Do not hand-edit; re-run scripts/extract_core_rules_md.py -->")
    out_lines.append("")

    # Paragraph accumulator. We flush whenever the heading level changes or a
    # blank vertical gap is detected.
    para_text_parts: list[str] = []
    para_level: int = 0  # 0 = body
    last_y_bottom: float | None = None
    last_block_id: tuple[int, int] | None = None  # (page, block_index)

    def flush() -> None:
        nonlocal para_text_parts, para_level
        if not para_text_parts:
            return
        text = " ".join(para_text_parts).strip()
        # Collapse runs of whitespace.
        text = re.sub(r"\s+", " ", text)
        if not text:
            para_text_parts = []
            para_level = 0
            return
        if para_level == 0:
            out_lines.append(text)
        else:
            out_lines.append("#" * para_level + " " + text)
        out_lines.append("")
        para_text_parts = []
        para_level = 0

    for pno in range(doc.page_count):
        page = doc[pno]
        # Skip cover/blank pages — they have no real text content.
        if pno < 2:
            continue
        out_lines.append(f"<!-- page {pno + 1} -->")
        out_lines.append("")
        # When a new page starts, force a paragraph flush so paragraphs don't
        # silently bleed across page boundaries (column reading order changes).
        flush()
        last_y_bottom = None
        last_block_id = None

        for bi, block in enumerate(iter_blocks_in_reading_order(page)):
            for line in block.get("lines", []):
                if not line.get("spans"):
                    continue
                if is_page_number_line(line):
                    continue
                level, _max_size = line_kind(line)
                bbox = line["bbox"]
                y_top, y_bottom = bbox[1], bbox[3]
                line_height = y_bottom - y_top

                # Detect a vertical gap (blank line) inside the same block.
                gap = (
                    (y_top - last_y_bottom)
                    if last_y_bottom is not None and last_block_id == (pno, bi)
                    else 0.0
                )
                gap_breaks_paragraph = gap > 1.6 * max(line_height, 1.0)

                # Flush conditions:
                #   * heading level changes
                #   * vertical gap large enough to be a paragraph break
                #   * we crossed into a different block (column change)
                if (
                    level != para_level
                    or gap_breaks_paragraph
                    or (last_block_id is not None and last_block_id != (pno, bi))
                ):
                    flush()
                    para_level = level

                # Headings are already styled by the leading `#`; wrapping them
                # in **...** as well is redundant noise.
                rendered = render_inline(line, mark_bold=(level == 0)).strip()
                if rendered:
                    para_text_parts.append(rendered)

                last_y_bottom = y_bottom
                last_block_id = (pno, bi)

        flush()

    flush()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out_lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT).as_posix()}  ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    convert()
