// remark plugin: turn mentions of known game-table titles in the rules
// markdown into links to /tables/<key>.
//
// Only tables that exist in tables_codex.json are linked. Mentions of
// tables that aren't in the Free Version (Liberating Prisoners, Market
// Bartering, Tavern Exploits, Arm Wrestle, Adventurer Levels, Herbal
// Remedies) are left as plain text — clicking them would 404.

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

// (pattern, key) pairs. Order is irrelevant — `findNextMatch` always picks
// the earliest occurrence; longer pattern wins on a tie. Listed roughly
// most-cited first for readability.
const TABLE_REFS: ReadonlyArray<readonly [string, string]> = [
  // Generic / reference
  ["Weapon Manoeuvres Table 1", "WMT1"],
  ["Weapon Manoeuvres Table", "WMT1"],
  ["Starting Armour Table", "SAT1"],
  ["Starting Scrolls Table", "SST_Start"],
  ["Starting Scroll Table", "SST_Start"],
  ["Magic Scrolls Table", "MST1"],
  ["Magic Scroll Table", "MST1"],
  ["Magic Potions Table", "MPT1"],
  ["Magic Items Table", "MIT1"],
  ["Armour Table", "AT1"],
  ["Values of Miscellaneous Items Table", "VMIT1"],
  ["Values of Gems Table", "VGT1"],
  ["Gem Value Table", "VGT1"],
  ["Exit Type Table", "EXT1"],
  ["Portcullis Lever Table 1", "POLT1"],
  ["Portcullis Lever Table", "POLT1"],
  ["Failed to Cast Correctly Table", "FTCCT1"],
  ["Encounter Prisoner Table", "ENP1"],
  ["Stolen Item Table", "STIT1"],
  ["Enchanted Armour Table", "ENAT1"],
  ["Gem Combination Table", "GCT1"],
  ["Recovery from Unconsciousness Table", "RFUT1"],
  ["Interruptions and the Unexpected Table", "IAUT1"],
  ["Half an Ornate Item Table", "HAOIT1"],

  // Level-1 specific. Caveat: the rules also reference per-level variants
  // (Level 2 Patrol Table, etc.) — we still point at L1 because that's all
  // the Free Version covers. Worst case: user follows a link, sees the L1
  // version, and reads the chapter intros for higher levels.
  ["Patrol Table", "L1P"],
  ["Level Patrol Table", "L1P"],
];

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-zA-Z0-9]/.test(ch);
}

interface Match {
  idx: number;
  pattern: string;
  key: string;
}

function findNextMatch(text: string, startIdx: number): Match | null {
  let best: Match | null = null;
  for (const [pattern, key] of TABLE_REFS) {
    let from = startIdx;
    while (from <= text.length - pattern.length) {
      const idx = text.indexOf(pattern, from);
      if (idx < 0) break;
      // Word-boundary check on the trailing edge (so "Table" doesn't match
      // inside "Tableau"). The leading edge is fine to be lax — patterns
      // start with capital words that won't be word-glued in practice.
      if (isWordChar(text[idx + pattern.length])) {
        from = idx + 1;
        continue;
      }
      if (best === null || idx < best.idx || (idx === best.idx && pattern.length > best.pattern.length)) {
        best = { idx, pattern, key };
      }
      break;
    }
  }
  return best;
}

function transformText(text: string): MdNode[] {
  const out: MdNode[] = [];
  let pos = 0;
  while (pos < text.length) {
    const match = findNextMatch(text, pos);
    if (!match) {
      out.push({ type: "text", value: text.slice(pos) });
      break;
    }
    if (match.idx > pos) {
      out.push({ type: "text", value: text.slice(pos, match.idx) });
    }
    out.push({
      type: "link",
      url: `/tables/${match.key}`,
      children: [{ type: "text", value: match.pattern }],
    });
    pos = match.idx + match.pattern.length;
  }
  return out;
}

function walk(node: MdNode): void {
  // Skip transforming text inside existing links (don't double-wrap) and
  // inside code blocks (the markdown is literal there).
  if (node.type === "link" || node.type === "code" || node.type === "inlineCode") return;
  if (!node.children) return;

  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (child.type === "text" && typeof child.value === "string") {
      const replaced = transformText(child.value);
      const onlyText = replaced.every((n) => n.type === "text");
      if (onlyText) {
        // No matches found — leave the original child in place.
        i++;
        continue;
      }
      node.children.splice(i, 1, ...replaced);
      i += replaced.length;
    } else {
      walk(child);
      i++;
    }
  }
}

/**
 * remark plugin. Add to `remarkPlugins` in your <ReactMarkdown>.
 */
export function remarkCrossLinkTables() {
  return (tree: MdNode) => walk(tree);
}
