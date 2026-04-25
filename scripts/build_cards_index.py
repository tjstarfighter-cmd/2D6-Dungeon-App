"""
Build a structured index of all card PNGs in docs/2D6 Dungeon Cards/.

Output: data/processed/cards_index.json

Filename convention for creature cards:
    <Card Name> L<N> (<CategoryCode>).png

CategoryCode: A=Animal, F=Fungal, H=Human, I=Insect, U=Undead,
              M=Monster, C=Creature.

The folder structure (e.g. "L1 Cards/L1 Human Cards/") gives an
independent (level, category) signal we cross-check against the
filename. If they disagree, we keep both and flag the mismatch.

Special folders:
- God Cards       -> kind=god,       no level/category
- Herb Cards      -> kind=herb,      no level/category
- Reference Cards -> kind=reference, no level/category
- Loose top-level PNGs (character sheets, backpack, narrative
  moments) -> kind=sheet
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS_DIR = ROOT / "docs" / "2D6 Dungeon Cards"
OUT = ROOT / "data" / "processed" / "cards_index.json"

CATEGORY_CODES = {
    "A": "Animal",
    "F": "Fungal",
    "H": "Human",
    "I": "Insect",
    "U": "Undead",
    "M": "Monster",
    "C": "Creature",
}

# "<Name> L<level><optional space>(<code>)" -- tolerates the "Medic L1(H)" case.
NAME_RE = re.compile(r"^(?P<name>.+?)\s+L(?P<level>\d{1,2})\s*\((?P<code>[A-Z])\)$")
LEVEL_FOLDER_RE = re.compile(r"^L(?P<level>\d{1,2})\s+Cards$", re.I)
SUBFOLDER_RE = re.compile(r"^L(?P<level>\d{1,2})\s+(?P<cat>.+?)(?:\s+Cards)?$", re.I)


def categorise_subfolder(name: str) -> str | None:
    """Map a leaf folder name's category word to a canonical category."""
    m = SUBFOLDER_RE.match(name)
    if not m:
        return None
    word = m.group("cat").strip().lower()
    # Strip trailing "cards" if SUBFOLDER_RE didn't catch it.
    word = re.sub(r"\s+cards?$", "", word)
    word = word.rstrip("s")  # "Humans" -> "Human", "Monsters" -> "Monster"
    return word.capitalize() if word else None


def relpath(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def parse_creature_card(path: Path) -> dict:
    """Parse one creature-card PNG into a structured record."""
    stem = path.stem  # filename without extension
    m = NAME_RE.match(stem)
    folder_level = None
    folder_cat = None

    # The grandparent folder ("L3 Cards") gives us the level.
    gp = path.parent.parent.name
    fm = LEVEL_FOLDER_RE.match(gp)
    if fm:
        folder_level = int(fm.group("level"))

    # The parent folder ("L3 Human Cards") gives us the category word.
    folder_cat = categorise_subfolder(path.parent.name)

    record: dict = {
        "kind": "creature",
        "image": relpath(path),
        "filename": path.name,
        "raw_stem": stem,
    }
    issues: list[str] = []

    if m:
        record["name"] = m.group("name").strip()
        record["level"] = int(m.group("level"))
        record["category"] = CATEGORY_CODES.get(m.group("code"), m.group("code"))
        record["category_code"] = m.group("code")
    else:
        issues.append("filename did not match `<Name> L<N> (<Code>)` pattern")
        record["name"] = stem
        record["level"] = folder_level
        record["category"] = folder_cat

    # Cross-check against folder hints.
    if folder_level is not None and record.get("level") not in (None, folder_level):
        issues.append(
            f"level mismatch: filename says L{record['level']}, folder says L{folder_level}"
        )
    if folder_cat is not None and record.get("category") not in (None, folder_cat):
        issues.append(
            f"category mismatch: filename says {record['category']}, folder says {folder_cat}"
        )

    if issues:
        record["issues"] = issues
    return record


def main() -> None:
    if not CARDS_DIR.exists():
        raise SystemExit(f"Cards dir not found: {CARDS_DIR}")

    cards: list[dict] = []

    # Per-level creature cards.
    for level_dir in sorted(CARDS_DIR.iterdir()):
        if not level_dir.is_dir() or not LEVEL_FOLDER_RE.match(level_dir.name):
            continue
        for sub in sorted(level_dir.iterdir()):
            if not sub.is_dir():
                continue
            for png in sorted(sub.glob("*.png")):
                cards.append(parse_creature_card(png))

    # Themed top-level folders.
    for folder, kind in [
        ("God Cards", "god"),
        ("Herb Cards", "herb"),
        ("Reference Cards", "reference"),
    ]:
        d = CARDS_DIR / folder
        if not d.exists():
            continue
        for png in sorted(d.glob("*.png")):
            cards.append({
                "kind": kind,
                "image": relpath(png),
                "filename": png.name,
                "name": png.stem,
            })

    # Loose top-level PNGs (sheets, backpack, narrative moments).
    for png in sorted(CARDS_DIR.glob("*.png")):
        cards.append({
            "kind": "sheet",
            "image": relpath(png),
            "filename": png.name,
            "name": png.stem,
        })

    # Build a small summary block alongside the records.
    by_kind: dict[str, int] = {}
    by_level: dict[int, int] = {}
    by_category: dict[str, int] = {}
    issues = 0
    for c in cards:
        by_kind[c["kind"]] = by_kind.get(c["kind"], 0) + 1
        if c.get("level") is not None:
            by_level[c["level"]] = by_level.get(c["level"], 0) + 1
        if c.get("category"):
            by_category[c["category"]] = by_category.get(c["category"], 0) + 1
        if c.get("issues"):
            issues += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "summary": {
                    "total": len(cards),
                    "by_kind": by_kind,
                    "by_level": dict(sorted(by_level.items())),
                    "by_category": by_category,
                    "records_with_issues": issues,
                },
                "cards": cards,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print(f"Wrote {OUT.relative_to(ROOT).as_posix()}")
    print(f"  total cards: {len(cards)}")
    print(f"  by kind: {by_kind}")
    print(f"  by level: {dict(sorted(by_level.items()))}")
    print(f"  by category: {by_category}")
    print(f"  records with parse issues: {issues}")


if __name__ == "__main__":
    main()
