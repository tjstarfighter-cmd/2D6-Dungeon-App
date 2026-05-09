// Story 6.8 — pure damage parser. Used by EventDamageWatcher to mine
// resolved Event log entries for "trap-shaped" damage and offer the
// player a one-tap Apply to HP.
//
// Conservative by design: numbers that aren't paired with one of the
// damage phrases (or match "+N XP", "N gc", etc.) do NOT count, so we
// never surface a false-positive trap toast.

export interface DamageMatch {
  /** Integer damage amount. */
  amount: number;
  /** The exact substring that matched, surfaced in the Edit breakdown. */
  phrase: string;
}

export interface DamageParseResult {
  matches: DamageMatch[];
  total: number;
}

// Pattern reference (case-insensitive, integer N):
//   "take N damage"
//   "take N HP damage"
//   "take N points of damage"
//   "lose N HP"
//   "suffer N damage"
//   "deals N damage"
//   "you take N"   (only when followed by "damage" or "HP" within ~20 chars)
//
// Each regex captures group 1 = amount, group 0 = phrase span.

const PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:take|takes|suffer|suffers|deals?|deal)\s+(\d+)\s+(?:hp\s+)?(?:points?\s+of\s+)?damage\b/gi,
  /\blose[s]?\s+(\d+)\s+hp\b/gi,
  /\b(\d+)\s+damage\b/gi, // "for 3 damage" / "5 damage to you"
];

export function parseDamage(text: string): DamageParseResult {
  if (!text) return { matches: [], total: 0 };
  const matches: DamageMatch[] = [];
  // Track consumed spans to avoid one phrase being counted twice when
  // the broader "(\d+) damage" rule overlaps a more specific match.
  const consumed: Array<[number, number]> = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (consumed.some(([a, b]) => start < b && end > a)) continue;
      const amount = parseInt(m[1], 10);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      consumed.push([start, end]);
      matches.push({ amount, phrase: m[0] });
    }
  }
  // Stable order: by source position so the Edit-modal breakdown reads
  // like the original sentence.
  matches.sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase));
  const total = matches.reduce((s, m) => s + m.amount, 0);
  return { matches, total };
}
