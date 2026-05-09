import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { useRulesData } from "@/data/lazy";
import { remarkCrossLinkTables } from "@/lib/rules-cross-link";
import { makeMarkdownComponents } from "@/lib/markdownComponents";
import { excerpt, getRuleSections } from "@/lib/search";
import { useRegisterRulesSearch } from "@/components/RulesSearch";

interface TocItem {
  text: string;
  id: string;
}

interface Section {
  slug: string;
  title: string;
  body: string;
}

interface SearchResult {
  heading: string;
  slug: string;
  snippet: string;
}

// Story 5.7 — sessionStorage-backed state so closing + reopening the
// slide-over restores scroll position and the set of expanded H2
// sections. sessionStorage (not localStorage) keeps the state per-tab
// and discards it across full reloads, matching "session" intent.

const RULES_SESSION_KEY = "2d6d.rulesSession";
interface RulesSessionState {
  openSlugs: string[];
  scrollTop: number;
}

function readRulesSession(): RulesSessionState {
  if (typeof window === "undefined") return { openSlugs: [], scrollTop: 0 };
  try {
    const raw = window.sessionStorage.getItem(RULES_SESSION_KEY);
    if (!raw) return { openSlugs: [], scrollTop: 0 };
    const parsed = JSON.parse(raw) as Partial<RulesSessionState>;
    return {
      openSlugs: Array.isArray(parsed.openSlugs) ? parsed.openSlugs : [],
      scrollTop:
        typeof parsed.scrollTop === "number" ? parsed.scrollTop : 0,
    };
  } catch {
    return { openSlugs: [], scrollTop: 0 };
  }
}

function writeRulesSession(state: RulesSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RULES_SESSION_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable (private mode); silent fallback.
  }
}

export default function RulesView({
  onInAppNavigate,
}: {
  onInAppNavigate?: (href: string) => void;
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const rulesMd = useRulesData();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Story 5.7 — track open H2 slugs in state so the controlled
  // <details> rerender on toggle. A mirror ref carries the latest set
  // into the unmount cleanup without a stale-closure problem.
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(
    () => new Set(readRulesSession().openSlugs),
  );
  const openSlugsLatestRef = useRef(openSlugs);
  useEffect(() => {
    openSlugsLatestRef.current = openSlugs;
  });
  function setSectionOpen(slug: string, isOpen: boolean) {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  // Story 5.8 — in-Rules search. While `query` has 2+ chars the article
  // is replaced with a result list; clearing the query restores the
  // pre-search scroll + open-section snapshot taken when search began.
  const [query, setQuery] = useState("");
  const preSearchSnapshotRef = useRef<{
    openSlugs: Set<string>;
    scrollTop: number;
  } | null>(null);
  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= 2;

  useRegisterRulesSearch(
    useCallback(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, []),
  );

  // Mount: restore scroll. While mounted: persist scroll on every
  // scroll event (rAF-debounced). Reading scrollTop in an unmount
  // cleanup is unreliable in React 19 — by the time cleanup runs, the
  // overlay's container has been detached and scrollTop reads as 0 —
  // so we capture continuously instead.
  useEffect(() => {
    const scroller = contentRef.current?.closest(".overflow-auto");
    if (!(scroller instanceof HTMLElement)) return;
    scroller.scrollTop = readRulesSession().scrollTop;

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        writeRulesSession({
          openSlugs: Array.from(openSlugsLatestRef.current),
          scrollTop: scroller.scrollTop,
        });
      });
    }
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Persist open-section changes immediately (separate from scroll
  // because <details> toggles don't fire scroll events).
  useEffect(() => {
    writeRulesSession({
      openSlugs: Array.from(openSlugs),
      scrollTop: readRulesSession().scrollTop,
    });
  }, [openSlugs]);

  // Chunk the markdown into a preface + per-H2 sections so each section
  // can render as a collapsible <details>. Single-pass split; slugs are
  // deduped with the same -1 / -2 suffix scheme rehype-slug uses, so URLs
  // formed from outside (TOC clicks, deep links) keep working.
  const { preface, sections } = useMemo(() => splitMd(rulesMd), [rulesMd]);

  // Story 5.8 — paragraph-level matches against the rules markdown. Cap
  // the count so the slide-over doesn't unscroll into a wall of hits.
  const searchResults = useMemo(() => {
    if (!showResults) return [];
    const q = trimmedQuery.toLowerCase();
    const out: SearchResult[] = [];
    const all = getRuleSections(rulesMd);
    for (const sec of all) {
      const inHeading = sec.heading.toLowerCase().includes(q);
      const inBody = sec.text.toLowerCase().includes(q);
      if (!inHeading && !inBody) continue;
      out.push({
        heading: sec.heading || "(intro)",
        slug: sec.headingSlug,
        snippet: inBody ? excerpt(sec.text, trimmedQuery) : "",
      });
      if (out.length >= 30) break;
    }
    return out;
  }, [showResults, trimmedQuery, rulesMd]);

  // Snapshot pre-search state when query becomes non-empty; restore on
  // clear. Captures the scroll container via the article ref.
  // Restore the pre-search snapshot when query is cleared. Snapshot is
  // captured synchronously in handleQueryChange (below) — capturing in
  // an effect after the article has unmounted is too late: the
  // .overflow-auto column's scrollTop clamps to fit the much-shorter
  // results list, so the original scroll position is gone by then. Two
  // rAFs let the article re-mount + lay out before we write scrollTop.
  useEffect(() => {
    if (showResults) return;
    const snap = preSearchSnapshotRef.current;
    if (!snap) return;
    setOpenSlugs(new Set(snap.openSlugs));
    const overlay = document.querySelector(
      '[role="dialog"][aria-label="Rules"] .overflow-auto',
    );
    if (overlay instanceof HTMLElement) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.scrollTop = snap.scrollTop;
        });
      });
    }
    preSearchSnapshotRef.current = null;
  }, [showResults]);

  function handleQueryChange(next: string) {
    const wasShowing = query.trim().length >= 2;
    const willShow = next.trim().length >= 2;
    if (!wasShowing && willShow && !preSearchSnapshotRef.current) {
      const scroller = contentRef.current?.closest(".overflow-auto");
      preSearchSnapshotRef.current = {
        openSlugs: new Set(openSlugsLatestRef.current),
        scrollTop:
          scroller instanceof HTMLElement ? scroller.scrollTop : 0,
      };
    }
    setQuery(next);
  }

  function onSelectSearchHit(slug: string) {
    // Discard the pre-search snapshot before clearing query so the
    // showResults effect doesn't undo the result navigation. Tapping a
    // result is a deliberate jump; only an explicit clear (✕ button or
    // delete) should restore the prior state.
    preSearchSnapshotRef.current = null;
    setQuery("");
    if (slug) navigate(`/rules#${slug}`);
  }

  const toc = useMemo<TocItem[]>(
    () => sections.map((s) => ({ text: s.title, id: s.slug })),
    [sections],
  );

  // Deep-link via URL hash: open the target section (and any ancestor
  // details, in case we ever nest them) and scroll it to the top. Also
  // fires on TOC clicks since those just update the hash.
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      let cur: HTMLElement | null = el;
      while (cur) {
        if (cur instanceof HTMLDetailsElement) cur.open = true;
        cur = cur.parentElement;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash, sections.length]);

  // Story 3.6 — when the user taps a [T1]-style cross-link, close the
  // Rules overlay so the Tables surface (which the link routes to) is
  // actually visible. Only fire for /tables/ navigations; anchor links
  // within the same Rules page must keep Rules open.
  const components = useMemo(
    () =>
      makeMarkdownComponents({
        onInAppNavigate: (href) => {
          if (href.startsWith("/tables/")) onInAppNavigate?.(href);
        },
      }),
    [onInAppNavigate],
  );

  return (
    <section className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden">
      <div className="space-y-3">
        {/* Story 5.8 — in-Rules search. Press / on desktop while Rules
            is open to focus this input; clearing it restores the
            article's pre-search scroll + open-section snapshot. */}
        <RulesSearchInput
          inputRef={searchInputRef}
          query={query}
          onChange={handleQueryChange}
        />
        {showResults ? (
          <RulesSearchResults
            query={trimmedQuery}
            results={searchResults}
            onSelect={onSelectSearchHit}
          />
        ) : (
          <>
            {/* Story 5.7 — Sections dropdown replaces the side-by-side
                Toc so the layout fits inside the narrow desktop slide-
                over. */}
            <SectionsDropdown
              items={toc}
              onSelect={(id) => navigate(`/rules#${id}`)}
            />
            <article
              ref={contentRef}
              className="min-w-0 rounded-lg border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {preface.trim() && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkCrossLinkTables]}
                  rehypePlugins={[rehypeSlug]}
                  components={components}
                  skipHtml
                >
                  {preface}
                </ReactMarkdown>
              )}
              {sections.map((s) => (
                <details
                  key={s.slug}
                  id={s.slug}
                  open={openSlugs.has(s.slug)}
                  onToggle={(e) =>
                    setSectionOpen(s.slug, e.currentTarget.open)
                  }
                  className="group my-3 scroll-mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xl font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <span
                      aria-hidden="true"
                      className="text-sm text-zinc-400 transition-transform group-open:rotate-90"
                    >
                      ▸
                    </span>
                    <span className="min-w-0 flex-1">{s.title}</span>
                  </summary>
                  <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkCrossLinkTables]}
                      rehypePlugins={[rehypeSlug]}
                      components={components}
                      skipHtml
                    >
                      {s.body}
                    </ReactMarkdown>
                  </div>
                </details>
              ))}
            </article>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RulesSearchInput({
  inputRef,
  query,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search rules…"
        aria-label="Search rules"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-8 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function RulesSearchResults({
  query,
  results,
  onSelect,
}: {
  query: string;
  results: SearchResult[];
  onSelect: (slug: string) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No matches for "{query}".
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {results.map((r, i) => (
        <li key={`${r.slug}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(r.slug)}
            className="block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:bg-emerald-50 hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-emerald-950/30 dark:hover:border-emerald-800"
          >
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {r.heading}
            </div>
            {r.snippet && (
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {r.snippet}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitMd(md: string): { preface: string; sections: Section[] } {
  if (!md) return { preface: "", sections: [] };
  const lines = md.split("\n");
  const sections: Section[] = [];
  const prefaceLines: string[] = [];
  const slugCounts = new Map<string, number>();
  let currentTitle: string | null = null;
  let currentSlug: string | null = null;
  let bodyLines: string[] = [];

  function flush() {
    if (currentTitle === null || currentSlug === null) return;
    sections.push({
      slug: currentSlug,
      title: currentTitle,
      body: bodyLines.join("\n"),
    });
  }

  for (const line of lines) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      flush();
      currentTitle = m[1];
      const base = slugify(currentTitle);
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      currentSlug = n === 0 ? base : `${base}-${n}`;
      bodyLines = [];
    } else if (currentTitle !== null) {
      bodyLines.push(line);
    } else {
      prefaceLines.push(line);
    }
  }
  flush();

  return { preface: prefaceLines.join("\n"), sections };
}

// ---------------------------------------------------------------------------

// Story 5.7 — single-column "Sections" dropdown above the article. The
// previous side-by-side Toc didn't fit inside the narrow desktop slide-
// over, so we collapse it into a closed-by-default details summary on
// every viewport.
function SectionsDropdown({
  items,
  onSelect,
}: {
  items: TocItem[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Building contents…</p>;
  }
  return (
    <details className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold">
        Sections ({items.length}) ▾
      </summary>
      <TocList items={items} onSelect={onSelect} className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800" />
    </details>
  );
}

function TocList({
  items,
  onSelect,
  className = "",
}: {
  items: TocItem[];
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={`space-y-0.5 text-sm ${className}`}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="block w-full truncate rounded px-2 py-1 text-left font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            title={item.text}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

