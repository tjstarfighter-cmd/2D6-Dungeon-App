import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { useRulesData } from "@/data/lazy";
import { remarkCrossLinkTables } from "@/lib/rules-cross-link";

interface TocItem {
  text: string;
  id: string;
}

interface Section {
  slug: string;
  title: string;
  body: string;
}

export default function RulesView() {
  const location = useLocation();
  const navigate = useNavigate();
  const rulesMd = useRulesData();
  const contentRef = useRef<HTMLDivElement | null>(null);

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

  const components = useMemo(() => makeMarkdownComponents(), []);

  return (
    <section className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden">
      <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <Toc items={toc} onSelect={(id) => navigate(`/rules#${id}`)} />
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

function Toc({
  items,
  onSelect,
}: {
  items: TocItem[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <aside className="text-sm text-zinc-500">Building contents…</aside>;
  }
  return (
    <aside className="md:sticky md:top-2 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto md:pr-2">
      {/* Mobile: collapsed by default */}
      <details className="md:hidden">
        <summary className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          Contents ({items.length})
        </summary>
        <TocList items={items} onSelect={onSelect} className="mt-2" />
      </details>
      {/* Desktop: always visible */}
      <div className="hidden md:block">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Contents
        </h2>
        <TocList items={items} onSelect={onSelect} />
      </div>
    </aside>
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

// ---------------------------------------------------------------------------

function makeMarkdownComponents() {
  return {
    h1: (props: any) => (
      <h1 className="mb-4 mt-6 text-3xl font-bold tracking-tight" {...props} />
    ),
    h2: (props: any) => (
      <h2
        className="mb-3 mt-8 scroll-mt-4 border-b border-zinc-200 pb-1 text-2xl font-semibold tracking-tight dark:border-zinc-800"
        {...props}
      />
    ),
    h3: (props: any) => (
      <h3 className="mb-2 mt-6 scroll-mt-4 text-xl font-semibold" {...props} />
    ),
    h4: (props: any) => (
      <h4 className="mb-2 mt-4 text-base font-semibold text-zinc-800 dark:text-zinc-200" {...props} />
    ),
    p: (props: any) => <p className="my-3 leading-relaxed" {...props} />,
    strong: (props: any) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100" {...props} />,
    em: (props: any) => <em {...props} />,
    a: ({ href, children, ...props }: any) => {
      const cls =
        "text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300";
      // Route in-app links through React Router so navigation is
      // client-side (no full reload). External links and same-page hash
      // anchors stay as plain <a>.
      if (typeof href === "string" && href.startsWith("/")) {
        return (
          <Link to={href} className={cls} {...props}>
            {children}
          </Link>
        );
      }
      return (
        <a href={href} className={cls} {...props}>
          {children}
        </a>
      );
    },
    ul: (props: any) => <ul className="my-3 list-disc space-y-1 pl-6" {...props} />,
    ol: (props: any) => <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    blockquote: (props: any) => (
      <blockquote
        className="my-3 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        {...props}
      />
    ),
    code: (props: any) => {
      // Inline code (block code uses <pre><code>; we don't expect that in rules).
      return (
        <code
          className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          {...props}
        />
      );
    },
    table: (props: any) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),
    thead: (props: any) => (
      <thead className="border-b border-zinc-300 dark:border-zinc-700" {...props} />
    ),
    th: (props: any) => (
      <th
        className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
        {...props}
      />
    ),
    tr: (props: any) => (
      <tr className="border-b border-zinc-200 dark:border-zinc-800" {...props} />
    ),
    td: (props: any) => <td className="px-2 py-1.5 align-top" {...props} />,
    hr: (props: any) => <hr className="my-6 border-zinc-200 dark:border-zinc-800" {...props} />,
  };
}
