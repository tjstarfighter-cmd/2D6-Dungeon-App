import { DICE_FACES } from "@/lib/tables";
import type { ManoeuvreSlot } from "@/types/character";
import type { CreatureManoeuvre } from "@/types/creatures";

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

// ---- Fatigue Die ----------------------------------------------------------

/**
 * The Fatigue Die value at a given round. Per the Core Rules ("The Fatigue
 * Die"): the die starts at 1 on round 1 and increments by 1 at the end of
 * every round, capping at 6 from round 6 onwards.
 */
export function fatigueDieValue(round: number): number {
  if (round < 1) return 1;
  return Math.min(round, 6);
}

/**
 * Shift Point bonus granted by the Fatigue Die. Per Core Rules:
 *   fatigue 4 → +1 SP, 5 → +2 SP, 6 → +3 SP (locked at +3 once reached).
 *   Fatigue 1–3 grants nothing.
 * The bonus applies to "you and the enemy" — both combatants benefit.
 */
export function fatigueShiftBonus(round: number): number {
  const fd = fatigueDieValue(round);
  if (fd >= 6) return 3;
  if (fd === 5) return 2;
  if (fd === 4) return 1;
  return 0;
}

// ---- Enemy interrupts -----------------------------------------------------

export interface InterruptTrigger {
  name: string;
  slot: "primary" | "secondary";
  /** Die values that trigger this interrupt (e.g. [1, 4] for "Primary 1s and 4s"). */
  values: number[];
  /** Damage reduction when triggered. */
  modifier: number;
}

export interface InterruptMatch {
  trigger: InterruptTrigger;
  /** Which die value caused the match (1–6). */
  matchedValue: number;
}

// Match patterns like "Primary 1s and 4s -2 damage" or "Secondary 3s, 5s
// and 6s -1 damage". The "on" connector is optional (some cards drop it),
// "and and" typos are tolerated, and the minus may be hyphen or en-dash.
const INTERRUPT_RE =
  /\b(Primary|Secondary)\s+((?:\d+s)(?:\s*,?\s*(?:and\s+)*\d+s)*)\s*[-−]\s*(\d+)\s*damage/i;

/**
 * Parse a creature's free-text Interrupt string into structured triggers.
 * Returns an empty array for "None" or unrecognised formats — the caller
 * should fall back to manual entry.
 */
export function parseInterruptTriggers(text: string): InterruptTrigger[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];
  const out: InterruptTrigger[] = [];
  // Cards with two named interrupts separate them with " / ".
  for (const seg of trimmed.split("/")) {
    const m = INTERRUPT_RE.exec(seg);
    if (!m) continue;
    const slot = m[1].toLowerCase() as "primary" | "secondary";
    const values = Array.from(m[2].matchAll(/(\d+)s/g)).map((mm) => Number(mm[1]));
    const modifier = Number(m[3]);
    const slotIdx = seg.toLowerCase().indexOf(slot);
    const beforeSlot = seg.slice(0, slotIdx);
    const name = beforeSlot.replace(/\s+on\s*$/i, "").trim() || "Interrupt";
    out.push({ name, slot, values, modifier });
  }
  return out;
}

/**
 * Find which interrupt (if any) fires against a manoeuvre's post-shift dice.
 * Per Core Rules: matching is on "either the Primary or Secondary die of
 * your successful attack manoeuvre" — i.e. the manoeuvre's *target* dice
 * (post-shift), not the originally rolled dice.
 *
 * "A creature can only use one Interrupt per round, even if both match" —
 * when multiple triggers fire, we surface the one with the largest modifier
 * (worst for the player) by default. Caller can override.
 */
export function findInterruptMatch(
  triggers: InterruptTrigger[],
  manoeuvrePrimary: number,
  manoeuvreSecondary: number,
): InterruptMatch | null {
  let best: InterruptMatch | null = null;
  for (const t of triggers) {
    const dieValue = t.slot === "primary" ? manoeuvrePrimary : manoeuvreSecondary;
    if (t.values.includes(dieValue)) {
      if (!best || t.modifier > best.trigger.modifier) {
        best = { trigger: t, matchedValue: dieValue };
      }
    }
  }
  return best;
}

// ---- Prime Attack ---------------------------------------------------------

/**
 * For a player Prime Attack (natural double 6): every manoeuvre is treated
 * as an Exact Strike with cost 0. Per Core Rules: "Select any one of your
 * Manoeuvres to perform exactly; add your total Shift (including Shift from
 * the Fatigue Die) to the damage, and it cannot be affected by Interrupts."
 *
 * The rolled dice don't constrain the choice — you pick any manoeuvre at
 * will — so we ignore them here.
 */
export function evaluatePrimeOptions(
  manoeuvres: ManoeuvreSlot[],
): ManoeuvreOption[] {
  return manoeuvres
    .map<ManoeuvreOption>((m, i) => ({
      index: i,
      manoeuvre: m,
      diceSet: parseDiceSet(m.diceSet),
      cost: 0,
      exact: true,
      affordable: true,
    }))
    .sort((a, b) => a.manoeuvre.name.localeCompare(b.manoeuvre.name));
}

// ---- Enemy manoeuvres -----------------------------------------------------

export interface EnemyManoeuvreOption {
  index: number;
  manoeuvre: CreatureManoeuvre;
  cost: number;
  exact: boolean;
  affordable: boolean;
  /** Best-effort theoretical max damage, used to rank "more powerful" options. */
  maxDamage: number | null;
}

/**
 * Rank a creature's manoeuvres against a rolled D66.
 *
 * Per the Core Rules ("Shifting Dice for Monsters"): if shifting can reach
 * a manoeuvre, the creature must use it; if multiple manoeuvres are reachable,
 * pick the most powerful one. We sort affordable options to the front, then
 * by max-damage descending (more powerful first), then by cost ascending.
 * Manoeuvres with unparseable formulae sort last among affordables.
 */
export function evaluateEnemyManoeuvres(
  manoeuvres: CreatureManoeuvre[],
  primary: number,
  secondary: number,
  shiftAvailable: number,
): EnemyManoeuvreOption[] {
  const options: EnemyManoeuvreOption[] = manoeuvres.map((m, i) => {
    const cost = shiftCost(primary, m.primary) + shiftCost(secondary, m.secondary);
    const formula = parseDamageFormula(m.formula);
    const maxDamage = formula
      ? formula.dice * formula.sides + formula.modifier
      : null;
    return {
      index: i,
      manoeuvre: m,
      cost,
      exact: cost === 0,
      affordable: cost <= shiftAvailable,
      maxDamage,
    };
  });
  options.sort((a, b) => {
    if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
    const aMax = a.maxDamage ?? -Infinity;
    const bMax = b.maxDamage ?? -Infinity;
    if (aMax !== bMax) return bMax - aMax;
    return a.cost - b.cost;
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
 * True when `rolls` has one valid die value (1..sides) for every die in the
 * formula. Used to gate the Apply button so a positive-modifier formula like
 * "D6 +2" can't deliver damage before the dice are actually rolled.
 */
export function rollsComplete(rolls: number[], formula: DamageFormula): boolean {
  if (rolls.length < formula.dice) return false;
  for (let i = 0; i < formula.dice; i++) {
    const r = rolls[i];
    if (!Number.isInteger(r) || r < 1 || r > formula.sides) return false;
  }
  return true;
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
 * Split an armour dice set into Primary alternates and Secondary alternates.
 *
 * Per the Core Rules' armour examples:
 *   Jerkin       (1 die):  Primary 4s
 *   Steel Buckler (2 die): Primary 4s and Secondary 1s
 *   Scale Jacket (3 die):  Primary 5s and 2s and Secondary 4s
 *   Full Plate   (4 die):  Primary 5s and 3s and Secondary 4s and 2s
 *
 * The free-text dice-set field on the character sheet doesn't carry the
 * Primary/Secondary boundary explicitly, so we use the canonical split:
 *   1 die  → 1 primary, 0 secondary  (Primary-only check, e.g. Jerkin)
 *   2 dice → 1 primary, 1 secondary  (Steel Buckler)
 *   n dice → ceil(n/2) primary, floor(n/2) secondary  (Scale Jacket, Full Plate)
 *
 * That matches every example in the rulebook.
 */
function splitArmourDice(dice: number[]): {
  primary: number[];
  secondary: number[];
  split: number;
} {
  if (dice.length === 0) return { primary: [], secondary: [], split: 0 };
  if (dice.length === 1) return { primary: [dice[0]], secondary: [], split: 1 };
  const split = Math.ceil(dice.length / 2);
  return { primary: dice.slice(0, split), secondary: dice.slice(split), split };
}

/**
 * Evaluate whether one armour piece deflects an enemy attack roll.
 *
 * Per the Core Rules' worked example (banded shield [6, 5] deflecting
 * CRUSHING BLOW (6, 3)): a multi-die armour set lists alternative trigger
 * conditions — match *any* Primary alternate against the enemy's Primary
 * die OR any Secondary alternate against the enemy's Secondary die, and
 * the piece deflects. A 1-die armour set has only the Primary trigger.
 *
 * The `fullMatch` name is preserved for callers; semantically it means
 * "this piece deflects" given the rolled dice.
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
  const { primary, secondary, split } = splitArmourDice(diceSet);
  const primaryMatch = primary.includes(enemyPrimary);
  const secondaryMatch =
    secondary.length > 0 && secondary.includes(enemySecondary);
  const fullMatch = primaryMatch || secondaryMatch;
  // Per-die match indicator for the UI: which specific armour values fired
  // (primary alternates compared to enemy's primary; secondary alternates
  // to enemy's secondary). Used to highlight matching dice in green.
  const matches = diceSet.map((d, i) =>
    i < split ? d === enemyPrimary : d === enemySecondary,
  );
  return { diceSet, matches, fullMatch, modifier };
}
