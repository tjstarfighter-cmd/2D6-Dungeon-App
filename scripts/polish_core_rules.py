"""
Polish core_rules.md by reconstructing embedded tables that fragmented
during PDF extraction.

For tables we can map confidently to keys in tables_codex.json, we render a
proper Markdown table from the JSON data. For other "### ... Table" headings
we leave the fragmented body in place but insert a one-line admonition.

Idempotent: re-running scans for headings (not for previously-inserted
markers) so it always converges to the same output.

Run AFTER extract_core_rules_md.py.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / "data" / "processed" / "core_rules.md"
TABLES_JSON = ROOT / "data" / "processed" / "tables_codex.json"

# Confident mappings: rules heading text -> tables_codex.json key
MAPPINGS: dict[str, str] = {
    "Starting Armour Table": "SAT1",
    "Starting Scrolls Table": "SST_Start",
    "Gem Value Table": "VGT1",
}

# Headings we know are "### <Name> Table" but for which the JSON has no
# matching entry (Free version coverage gap or different table). These get
# an admonition note. Order doesn't matter; lookup is by exact match.
KNOWN_UNMAPPED: set[str] = {
    "Adventurer Levels Table",
    "Herbal Remedies Table",
    "Liberating Prisoners Table",
    "Market Bartering Table",
    "Herbalist Table",
    "Tavern Exploits Table",
    "Arm Wrestle Table",
}

# Fragmented-region detector: paragraphs longer than this many characters
# are treated as real prose, ending the table body.
PROSE_PARA_THRESHOLD = 90

# Admonition + replacement regions are bracketed by these markers so we
# can recognise (and replace) them on a second run.
GENERATED_BEGIN = "<!-- BEGIN auto-table -->"
GENERATED_END = "<!-- END auto-table -->"
NOTE_BEGIN = "<!-- BEGIN auto-note -->"
NOTE_END = "<!-- END auto-note -->"


def md_escape(value: object) -> str:
    """Escape a cell value for Markdown table syntax."""
    s = "" if value is None else str(value)
    s = s.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")
    return s.strip()


def render_table_block(key: str, table: dict) -> list[str]:
    """Render a JSON table as Markdown lines, including a source footer."""
    rows = table.get("data", [])
    if not rows:
        return [f"_(empty table: `{key}`)_"]

    # Use the keys of the first row as columns; assumes flat schema.
    columns = list(rows[0].keys())

    lines: list[str] = []
    lines.append(GENERATED_BEGIN)
    lines.append("")
    title = table.get("title", key)
    lines.append(f"_Reconstructed from `data/processed/tables_codex.json` key_ `{key}` _({title})_")
    lines.append("")
    lines.append("| " + " | ".join(columns) + " |")
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for r in rows:
        lines.append("| " + " | ".join(md_escape(r.get(c, "")) for c in columns) + " |")
    notes = table.get("notes")
    if notes:
        lines.append("")
        lines.append(f"> **Notes:** {notes}")
    flavor = table.get("flavorText")
    if flavor:
        lines.append("")
        lines.append(f"> _{flavor}_")
    lines.append("")
    lines.append(GENERATED_END)
    return lines


def render_unmapped_note(heading_text: str) -> list[str]:
    """Render an admonition for tables we cannot reconstruct."""
    return [
        NOTE_BEGIN,
        "",
        f"> ⚠️ **{heading_text}** — original cells fragmented during PDF text extraction "
        f"and no equivalent exists in the Free Tables Codex JSON. "
        f"Refer to the source PDF (`docs/2D6_Dungeon_Core_Rules_Current_Version.pdf`) "
        f"or transcribe manually.",
        "",
        NOTE_END,
    ]


HEADING_RE = re.compile(r"^### (.+?)\s*$")


def find_table_region_end(lines: list[str], start: int) -> int:
    """
    Given the index of the line right after a `### ... Table` heading,
    walk forward and return the exclusive end index of the fragmented
    table body. The body ends at:
      - the next heading line (#, ##, ###, ####, etc.), OR
      - a non-empty paragraph with > PROSE_PARA_THRESHOLD chars, OR
      - end of file.

    Each "paragraph" is a maximal run of non-blank lines.
    """
    i = start
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.startswith("#"):
            return i
        if not line.strip():
            i += 1
            continue
        # Collect the contiguous paragraph (non-blank lines).
        j = i
        para_parts: list[str] = []
        while j < n and lines[j].strip() and not lines[j].startswith("#"):
            para_parts.append(lines[j])
            j += 1
        para_text = " ".join(p.strip() for p in para_parts)
        # Skip generator markers/comments — they belong to a previous run
        # and we should pass through them transparently.
        if para_text.startswith("<!--") and para_text.endswith("-->"):
            i = j
            continue
        if len(para_text) > PROSE_PARA_THRESHOLD:
            return i
        i = j
    return n


def strip_existing_block(lines: list[str], start: int, begin_marker: str, end_marker: str) -> int:
    """
    If the lines starting at `start` (skipping blank lines) begin with a
    previously generated block bracketed by begin_marker/end_marker,
    splice it out and return the new index of `start` (unchanged) so the
    caller can re-emit. Returns `start` unchanged if no block is present.
    """
    i = start
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].strip() == begin_marker:
        # Find the matching end marker.
        j = i + 1
        while j < len(lines) and lines[j].strip() != end_marker:
            j += 1
        if j < len(lines):
            del lines[start:j + 1]
            # Also collapse any trailing blank lines we just exposed.
            while start < len(lines) and not lines[start].strip():
                del lines[start]
    return start


def polish() -> None:
    text = MD.read_text(encoding="utf-8")
    tables = json.loads(TABLES_JSON.read_text(encoding="utf-8"))
    lines = text.split("\n")

    out: list[str] = []
    i = 0
    n_replaced = 0
    n_noted = 0

    while i < len(lines):
        line = lines[i]
        m = HEADING_RE.match(line)
        if m and m.group(1) in MAPPINGS:
            heading_text = m.group(1)
            key = MAPPINGS[heading_text]
            table = tables.get(key)
            if table is None:
                out.append(line)
                i += 1
                continue
            out.append(line)
            i += 1
            # Skip a single blank line conventionally following a heading.
            if i < len(lines) and not lines[i].strip():
                out.append(lines[i])
                i += 1
            # Strip any previously generated block, then strip the
            # fragmented original body in place.
            i = _consume_old_block(lines, i, GENERATED_BEGIN, GENERATED_END)
            end = find_table_region_end(lines, i)
            i = end  # skip the fragmented region entirely
            out.extend(render_table_block(key, table))
            out.append("")
            n_replaced += 1
            continue

        if m and m.group(1) in KNOWN_UNMAPPED:
            heading_text = m.group(1)
            out.append(line)
            i += 1
            if i < len(lines) and not lines[i].strip():
                out.append(lines[i])
                i += 1
            # Remove a previously inserted note (if any) so we re-emit fresh.
            i = _consume_old_block(lines, i, NOTE_BEGIN, NOTE_END)
            out.extend(render_unmapped_note(heading_text))
            out.append("")
            n_noted += 1
            continue

        out.append(line)
        i += 1

    new_text = "\n".join(out).rstrip() + "\n"
    MD.write_text(new_text, encoding="utf-8")
    print(f"Polished {MD.relative_to(ROOT).as_posix()}")
    print(f"  reconstructed tables: {n_replaced}")
    print(f"  unmapped notes:       {n_noted}")
    print(f"  size now:             {MD.stat().st_size:,} bytes")


def _consume_old_block(lines: list[str], start: int, begin: str, end: str) -> int:
    """
    If a previously generated block is at `start` (allowing leading blanks),
    splice it out so we can re-emit. Returns the (possibly unchanged) index
    `start` for the caller to continue from.
    """
    i = start
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].strip() == begin:
        j = i + 1
        while j < len(lines) and lines[j].strip() != end:
            j += 1
        if j < len(lines):
            del lines[start:j + 1]
            while start < len(lines) and not lines[start].strip():
                del lines[start]
    return start


if __name__ == "__main__":
    polish()
