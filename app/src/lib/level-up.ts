// Story 6.7 — character-level progression. The Adventurer Levels Table
// in core_rules.md (p.18) was fragmented during PDF extraction and isn't
// available as a tables_codex entry, so the table below is a curated
// reconstruction from the visible rows. Treat values as approximate
// until the source can be re-extracted.
//
// `xpToReach` is the XP a Raw character needs to advance INTO this
// level. Level 1 starts at 0 XP. The threshold for advancing into
// Level N+1 is `LEVELS[N].xpToReach`.
//
// `maxManoeuvreLevel` controls which WMT1 sublist the player can pick a
// manoeuvre from at level-up time (Level 1 manoeuvres / Level 2 / Level 3).

export interface LevelTier {
  level: number;
  tier: string;
  xpToReach: number;
  /** Total max manoeuvre count after reaching this level. */
  maxManoeuvres: number;
  /** Highest WMT1 sublist available — 1 / 2 / 3. */
  maxManoeuvreLevel: number;
}

export const LEVELS: readonly LevelTier[] = [
  { level: 1, tier: "Raw", xpToReach: 0, maxManoeuvres: 2, maxManoeuvreLevel: 1 },
  { level: 2, tier: "Novice", xpToReach: 200, maxManoeuvres: 2, maxManoeuvreLevel: 1 },
  { level: 3, tier: "Apprentice", xpToReach: 1000, maxManoeuvres: 2, maxManoeuvreLevel: 1 },
  { level: 4, tier: "Skilful", xpToReach: 2000, maxManoeuvres: 2, maxManoeuvreLevel: 2 },
  { level: 5, tier: "Experienced", xpToReach: 3000, maxManoeuvres: 2, maxManoeuvreLevel: 2 },
  { level: 6, tier: "Adept", xpToReach: 5000, maxManoeuvres: 3, maxManoeuvreLevel: 2 },
  { level: 7, tier: "Accomplished", xpToReach: 10000, maxManoeuvres: 3, maxManoeuvreLevel: 3 },
  { level: 8, tier: "Expert", xpToReach: 15000, maxManoeuvres: 3, maxManoeuvreLevel: 3 },
  { level: 9, tier: "Professional", xpToReach: 25000, maxManoeuvres: 3, maxManoeuvreLevel: 3 },
  { level: 10, tier: "Master", xpToReach: 40000, maxManoeuvres: 3, maxManoeuvreLevel: 3 },
];

export function tierFor(level: number): LevelTier {
  return (
    LEVELS.find((l) => l.level === level) ??
    LEVELS[LEVELS.length - 1]
  );
}

/**
 * Given a current level and current XP, return the highest reachable
 * level. Used by the watcher to detect threshold crossings (and apply
 * silent HP/level bumps if more than one threshold was crossed in a
 * single XP write).
 */
export function levelForXp(currentLevel: number, xp: number): number {
  let best = Math.max(1, currentLevel);
  for (const tier of LEVELS) {
    if (tier.xpToReach <= xp) best = Math.max(best, tier.level);
  }
  return Math.max(best, currentLevel);
}

export type StatKey = "shift" | "discipline" | "precision";

export const STAT_OPTIONS: ReadonlyArray<{ key: StatKey; label: string }> = [
  { key: "shift", label: "Shift" },
  { key: "discipline", label: "Discipline" },
  { key: "precision", label: "Precision" },
];
