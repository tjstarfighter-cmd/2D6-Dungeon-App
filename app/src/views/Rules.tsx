import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { useRulesData } from "@/data/lazy";
import { remarkCrossLinkTables } from "@/lib/rules-cross-link";
import { makeMarkdownComponents } from "@/lib/markdownComponents";

interface TocItem {
  text: string;
  id: string;
}

interface Section {
  slug: string;
  title: string;
  body: string;
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
        {/* Story 5.7 — Sections dropdown replaces the side-by-side Toc
            so the layout fits inside the narrow desktop slide-over. */}
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
      </div>
    </section>
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

