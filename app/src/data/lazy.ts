// Lazy data layer: each game-data file is its own dynamic import,
// triggered only when a view that needs it actually mounts.
//
// Vite code-splits each `import("...")` into its own chunk. The promise
// is cached at module scope so multiple consumers share one fetch.
//
// React 19's `use()` hook is the right primitive here — it unwraps a
// promise and triggers Suspense if it's still pending. Each view is
// already wrapped in <Suspense> by the App.tsx Lazy router, so callers
// don't need to manage loading state themselves.

import { use } from "react";

import type { TablesCodex } from "@/types/tables";
import type { CardsIndex } from "@/types/cards";

let _tables: Promise<TablesCodex> | null = null;
let _cards: Promise<CardsIndex> | null = null;
let _rules: Promise<string> | null = null;

function tablesPromise(): Promise<TablesCodex> {
  if (!_tables) {
    _tables = import("@game-data/tables_codex.json").then(
      (m) => m.default as unknown as TablesCodex,
    );
  }
  return _tables;
}

function cardsPromise(): Promise<CardsIndex> {
  if (!_cards) {
    _cards = import("@game-data/cards_index.json").then(
      (m) => m.default as unknown as CardsIndex,
    );
  }
  return _cards;
}

function rulesPromise(): Promise<string> {
  if (!_rules) {
    _rules = import("@game-data/core_rules.md?raw").then((m) => m.default);
  }
  return _rules;
}

/** Suspense-aware getter for the Tables Codex JSON. */
export function useTablesData(): TablesCodex {
  return use(tablesPromise());
}

/** Suspense-aware getter for the Cards index JSON. */
export function useCardsData(): CardsIndex {
  return use(cardsPromise());
}

/** Suspense-aware getter for the Core Rules Markdown. */
export function useRulesData(): string {
  return use(rulesPromise());
}

/**
 * Fire-and-forget preload helpers. Call from a hover handler / nav-mount
 * to warm a chunk before the user actually navigates.
 */
export const preloadTables = tablesPromise;
export const preloadCards = cardsPromise;
export const preloadRules = rulesPromise;
