// Global search across rules markdown, table data, and card metadata.
// Cheap in-memory scanning — the corpus is small (~95 KB rules + 64 tables
// + 111 cards) so we don't need lunr/fuse.
//
// Pure functions: callers (typically the SearchView) pass the loaded
// corpus in. The lazy data layer only hands these out via Suspense, so
// search() never triggers an import on its own.

import type { CodexTable, TablesCodex, TableRow } from "@/types/tables";
import type { CardRecord, CardsIndex } from "@/types/cards";

export type HitSource = "rule" | "table" | "card";

export interface SearchHit {
  source: HitSource;
  /** Stable id for React keys. */
  id: string;
  /** Headline shown for the hit (e.g. heading text, table title, card name). */
  title: string;
  /** Optional context line shown under the title. */
  subtitle?: string;
  /** Pre-built excerpt with surrounding context (no <mark> wrapping). */
  snippet?: string;
  /** The actual matched substring inside `snippet`, used for highlighting. */
  match: string;
  /** Where to navigate when the user clicks. */
  to: string;
}

export interface SearchCorpus {
  tables: TablesCodex;
  cards: CardsIndex;
  rules: string;
}

const MAX_RULE_HITS = 30;
const MAX_TABLE_HITS = 30;
const MAX_CARD_HITS = 30;

// ---- Slugification -------------------------------------------------------
// Must produce IDs that match the ones rehype-slug emits in the Rules view
// for our deep links to land on the right heading. github-slugger (which
// rehype-slug wraps) lowercases, replaces non-alphanumerics with hyphens,
// strips leading/trailing hyphens. For repeated headings it appends `-1`,
// `-2`, etc. — we don't track that here, so collisions land on the first
// occurrence (acceptable for MVP).
export function simpleSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ---- Excerpting ----------------------------------------------------------

/** Build a snippet around the first occurrence of `query` in `text`. */
export function excerpt(text: string, query: string, before = 40, after = 100): string {
  if (!query) return text.slice(0, before + after);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, before + after);
  const start = Math.max(0, idx - before);
  const end = Math.min(text.length, idx + query.length + after);
  let out = text.slice(start, end);
  if (start > 0) out = "…" + out;
  if (end < text.length) out = out + "…";
  return out.replace(/\s+/g, " ");
}

// ---- Rules ---------------------------------------------------------------

interface RuleSection {
  /** The most-recent H2 / H3 / H4 chain at this paragraph. */
  heading: string;
  /** Slug of the leaf heading, for #anchor deep-linking. */
  headingSlug: string;
  /** The paragraph text. */
  text: string;
}

let ruleSectionsCache: { md: string; sections: RuleSection[] } | null = null;

function getRuleSections(rulesMd: string): RuleSection[] {
  if (ruleSectionsCache && ruleSectionsCache.md === rulesMd) {
    return ruleSectionsCache.sections;
  }
  const sections = parseRuleSections(rulesMd);
  ruleSectionsCache = { md: rulesMd, sections };
  return sections;
}

function parseRuleSections(rulesMd: string): RuleSection[] {
  const sections: RuleSection[] = [];
  const stack: { level: number; text: string; slug: string }[] = [];

  function currentChain(): { text: string; slug: string } {
    if (stack.length === 0) return { text: "", slug: "" };
    return {
      text: stack.map((s) => s.text).join(" › "),
      slug: stack[stack.length - 1].slug,
    };
  }

  let buffer: string[] = [];
  function flush() {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (!text) return;
    const ch = currentChain();
    sections.push({ heading: ch.text, headingSlug: ch.slug, text });
  }

  for (const raw of rulesMd.split("\n")) {
    const line = raw.replace(/^\s+|\s+$/g, "");
    if (!line || line.startsWith("<!--") || line === "</div>" || line === "<div>") {
      flush();
      continue;
    }
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      flush();
      const level = m[1].length;
      const text = m[2].trim();
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text, slug: simpleSlug(text) });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function searchRules(query: string, rulesMd: string): SearchHit[] {
  const q = query.toLowerCase();
  const out: SearchHit[] = [];
  let i = 0;
  for (const section of getRuleSections(rulesMd)) {
    if (out.length >= MAX_RULE_HITS) break;
    const idx = section.text.toLowerCase().indexOf(q);
    if (idx < 0) continue;
    out.push({
      source: "rule",
      id: `rule-${i++}`,
      title: section.heading || "(intro)",
      snippet: excerpt(section.text, query),
      match: query,
      to: section.headingSlug ? `/rules#${section.headingSlug}` : "/rules",
    });
  }
  return out;
}

// ---- Tables --------------------------------------------------------------

function flattenRow(row: TableRow): string {
  const parts: string[] = [];
  for (const v of Object.values(row)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const sub of v) parts.push(flattenRow(sub));
    } else {
      parts.push(String(v));
    }
  }
  return parts.join(" ");
}

function searchTables(query: string, tables: TablesCodex): SearchHit[] {
  const q = query.toLowerCase();
  const out: SearchHit[] = [];
  for (const [key, table] of Object.entries(tables) as [string, CodexTable][]) {
    if (out.length >= MAX_TABLE_HITS) break;

    if (table.title.toLowerCase().includes(q) || key.toLowerCase().includes(q)) {
      out.push({
        source: "table",
        id: `table-${key}-title`,
        title: table.title,
        subtitle: key,
        match: query,
        to: `/tables/${key}`,
      });
      continue;
    }
    if (table.notes && table.notes.toLowerCase().includes(q)) {
      out.push({
        source: "table",
        id: `table-${key}-notes`,
        title: table.title,
        subtitle: `${key} · notes`,
        snippet: excerpt(table.notes, query),
        match: query,
        to: `/tables/${key}`,
      });
      continue;
    }
    for (let r = 0; r < table.data.length; r++) {
      const flat = flattenRow(table.data[r]);
      if (flat.toLowerCase().includes(q)) {
        out.push({
          source: "table",
          id: `table-${key}-row-${r}`,
          title: table.title,
          subtitle: `${key} · row ${r + 1}`,
          snippet: excerpt(flat, query),
          match: query,
          to: `/tables/${key}`,
        });
        break;
      }
    }
  }
  return out;
}

// ---- Cards ---------------------------------------------------------------

function searchCards(query: string, cardsIndex: CardsIndex): SearchHit[] {
  const q = query.toLowerCase();
  const out: SearchHit[] = [];
  for (const c of cardsIndex.cards as CardRecord[]) {
    if (out.length >= MAX_CARD_HITS) break;
    if (!c.name.toLowerCase().includes(q)) continue;
    const subtitle =
      c.kind === "creature"
        ? `Level ${c.level} · ${c.category ?? ""} card`
        : `${c.kind} card`;
    out.push({
      source: "card",
      id: `card-${c.filename}`,
      title: c.name,
      subtitle,
      match: query,
      to: `/cards/${encodeURIComponent(c.filename)}`,
    });
  }
  return out;
}

// ---- Public API ----------------------------------------------------------

export interface SearchResults {
  query: string;
  rules: SearchHit[];
  tables: SearchHit[];
  cards: SearchHit[];
  total: number;
}

export function search(query: string, corpus: SearchCorpus): SearchResults {
  const q = query.trim();
  if (q.length < 2) {
    return { query: q, rules: [], tables: [], cards: [], total: 0 };
  }
  const rules = searchRules(q, corpus.rules);
  const tableHits = searchTables(q, corpus.tables);
  const cards = searchCards(q, corpus.cards);
  return {
    query: q,
    rules,
    tables: tableHits,
    cards,
    total: rules.length + tableHits.length + cards.length,
  };
}
