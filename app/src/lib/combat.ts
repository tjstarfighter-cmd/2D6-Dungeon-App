import { DICE_FACES } from "@/lib/tables";
import type { ManoeuvreSlot } from "@/types/character";

// ---- Dice helpers ---------------------------------------------------------

const FACE_TO_NUM: Record<string, number> = {
  "⚀": 1,
  "⚁": 2,
  "⚂": 3,
  "⚃": 4,
  "⚄": 5,
  "⚅": 6,
};

/**
 * Parse a dice-set string into a [primary, secondary] pair.
 * Tolerates dice unicode ("⚂ ⚃"), plain digits ("3, 4"), or mixed.
 * Returns null if we can't extract exactly two faces in 1–6.
 */
export function parseDiceSet(s: string): [number, number] | null {
  if (!s) return null;
  const out: number[] = [];
  for (const c of s) {
    if (FACE_TO_NUM[c]) {
      out.push(FACE_TO_NUM[c]);
    } else if (c >= "1" && c <= "6") {
      out.push(Number(c));
    }
    if (out.length === 2) break;
  }
  return out.length === 2 ? [out[0], out[1]] : null;
}

export function formatDiceSet(primary: number, secondary: number): string {
  return `${DICE_FACES[primary - 1] ?? primary} ${DICE_FACES[secondary - 1] ?? secondary}`;
}

/**
 * Parse every die value from a free-form dice-set string. Tolerates dice
 * unicode and digits, and ignores everything else (whitespace, "+", commas).
 * Returns dice in the order they appear, e.g. "⚅ ⚁ + ⚁" -> [6, 2, 2].
 */
export function parseDiceList(s: string): number[] {
  if (!s) return [];
  const out: number[] = [];
  for (const c of s) {
    if (FACE_TO_NUM[c]) {
      out.push(FACE_TO_NUM[c]);
    } else if (c >= "1" && c <= "6") {
      out.push(Number(c));
    }
  }
  return out;
}

export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---- Shift logic ----------------------------------------------------------

/**
 * Cost in Shift Points to move `from` to `to` on a single die.
 *
 * Rules: shifts are sequential (you cannot skip values), and you cannot
 * shift directly between 1 and 6 (no wraparound). Cost is the absolute
 * numerical difference; "no 1↔6 in one step" is implicit because reaching
 * the other end requires the intermediate steps.
 */
export function shiftCost(from: number, to: number): number {
  return Math.abs(from - to);
}

export interface ManoeuvreOption {
  index: number;            // index in character.manoeuvres
  manoeuvre: ManoeuvreSlot;
  diceSet: [number, number] | null;
  cost: number;             // Shift Points required (Infinity if unparseable)
  exact: boolean;           // true if cost === 0
  affordable: boolean;      // cost ≤ available shift
}

/**
 * Given the rolled dice and the character's manoeuvres, return ranked
 * options (cheapest shift first, exact strikes first within ties).
 * Manoeuvres with unparseable dice sets are returned at the end with
 * cost=Infinity so the user can still see + commit them by hand.
 */
export function evaluateManoeuvres(
  manoeuvres: ManoeuvreSlot[],
  primary: number,
  secondary: number,
  shiftAvailable: number,
): ManoeuvreOption[] {
  const options: ManoeuvreOption[] = manoeuvres.map((m, i) => {
    const dice = parseDiceSet(m.diceSet);
    if (!dice) {
      return {
        index: i,
        manoeuvre: m,
        diceSet: null,
        cost: Infinity,
        exact: false,
        affordable: false,
      };
    }
    const cost = shiftCost(primary, dice[0]) + shiftCost(secondary, dice[1]);
    return {
      index: i,
      manoeuvre: m,
      diceSet: dice,
      cost,
      exact: cost === 0,
      affordable: cost <= shiftAvailable,
    };
  });
  options.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return a.manoeuvre.name.localeCompare(b.manoeuvre.name);
  });
  return options;
}

// ---- Damage formula -------------------------------------------------------

export interface DamageRoll {
  rolls: number[];
  modifier: number;
  total: number;     // sum of rolls + modifier (with the "6 ≥ 1" rule applied)
  has6: boolean;
}

interface DamageFormula {
  dice: number;
  sides: number;
  modifier: number;
}

/** Parse a damage formula like "D6 +2 damage" or "2D6 -1". Returns null if unrecognised. */
export function parseDamageFormula(formula: string): DamageFormula | null {
  if (!formula) return null;
  const m = formula.match(/(\d*)\s*[dD](\d+)\s*([+\-−]\s*\d+)?/);
  if (!m) return null;
  const dice = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  // Normalise minus sign (en-dash, hyphen) and remove whitespace.
  const modText = m[3] ? m[3].replace(/[−\s]/g, "-") : "";
  const modifier = modText ? Number(modText) : 0;
  if (Number.isNaN(dice) || Number.isNaN(sides) || Number.isNaN(modifier)) return null;
  return { dice, sides, modifier };
}

/**
 * Roll damage for a parsed formula and apply the "6 always ≥ 1 damage" rule
 * from the Core Rules: if any damage die rolled a 6, total damage is at
 * least 1 even after negative modifiers.
 */
export function rollDamage(formula: DamageFormula): DamageRoll {
  const rolls = Array.from({ length: formula.dice }, rollD6IfSixSided(formula.sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  const raw = sum + formula.modifier;
  const has6 = rolls.includes(6);
  const total = has6 ? Math.max(1, raw) : Math.max(0, raw);
  return { rolls, modifier: formula.modifier, total, has6 };
}

function rollD6IfSixSided(sides: number): () => number {
  return () => Math.floor(Math.random() * sides) + 1;
}

/** Same "6 ≥ 1" rule applied to a manually-entered damage value. */
export function applySixRule(rolls: number[], modifier: number): number {
  const sum = rolls.reduce((a, b) => a + b, 0);
  const raw = sum + modifier;
  const has6 = rolls.includes(6);
  return has6 ? Math.max(1, raw) : Math.max(0, raw);
}

// ---- Armour deflection ---------------------------------------------------

/** Parse the |reduction| amount from an armour modifier like "-1 Damage". */
export function parseArmourDeflection(modifier: string): number {
  if (!modifier) return 0;
  const m = modifier.match(/[-−](\d+)/);
  return m ? Number(m[1]) : 0;
}

export interface DeflectionEval {
  diceSet: number[];        // parsed armour dice
  matches: boolean[];       // per-die match against the enemy roll
  fullMatch: boolean;       // true when the whole armour set matches → suggest applying
  modifier: number;         // damage reduction this piece would grant if applied
}

/**
 * Evaluate whether one armour piece deflects an enemy attack roll.
 *
 * Per the Core Rules: a 1-die armour set matches the enemy's Primary
 * attack die; a 2-die set matches Primary AND Secondary in order. For
 * 3+ dice (notation like "⚅ ⚁ + ⚁") the rules are nuanced; we use a
 * loose heuristic — every armour die must equal Primary or Secondary —
 * and let the player override the suggested check.
 */
export function evaluateDeflection(
  diceSetText: string,
  enemyPrimary: number,
  enemySecondary: number,
  modifierText: string,
): DeflectionEval {
  const diceSet = parseDiceList(diceSetText);
  const modifier = parseArmourDeflection(modifierText);
  if (diceSet.length === 0) {
    return { diceSet: [], matches: [], fullMatch: false, modifier };
  }
  let matches: boolean[];
  if (diceSet.length === 1) {
    matches = [diceSet[0] === enemyPrimary];
  } else if (diceSet.length === 2) {
    matches = [diceSet[0] === enemyPrimary, diceSet[1] === enemySecondary];
  } else {
    matches = diceSet.map(
      (d) => d === enemyPrimary || d === enemySecondary,
    );
  }
  const fullMatch = matches.every(Boolean);
  return { diceSet, matches, fullMatch, modifier };
}
