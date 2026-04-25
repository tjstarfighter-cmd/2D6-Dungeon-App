import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { rulesMd } from "@/data";

interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

export function RulesView() {
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build the TOC from the rendered DOM (so IDs match exactly what
  // rehype-slug produced, including its dedup suffixes).
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
    const items: TocItem[] = headings.map((h) => ({
      level: h.tagName === "H2" ? 2 : 3,
      text: h.textContent?.trim() ?? "",
      id: h.id,
    }));
    setToc(items);
  }, []);

  // Scroll-spy: keep the most-recently-passed heading marked active.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost heading currently visible in the upper third.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      // Active when a heading sits in the upper-middle of the viewport.
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [toc]);

  // Deep-link via URL hash: scroll the matching heading into view on mount
  // and whenever the hash changes (clicking a TOC item updates it).
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const el = document.getElementById(id);
    if (el) {
      // Defer to let the markdown render before scrolling.
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [location.hash, toc]);

  const components = useMemo(() => makeMarkdownComponents(), []);

  return (
    <section className="mx-auto max-w-7xl">
      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <Toc
          items={toc}
          activeId={activeId}
          onSelect={(id) => navigate(`/rules#${id}`)}
        />
        <article
          ref={contentRef}
          className="rounded-lg border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={components}
            // Strip our generator marker comments — they have no meaning at
            // render time.
            skipHtml
          >
            {rulesMd}
          </ReactMarkdown>
        </article>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Toc({
  items,
  activeId,
  onSelect,
}: {
  items: TocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <aside className="text-sm text-zinc-500">Building contents…</aside>
    );
  }
  return (
    <aside className="md:sticky md:top-2 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto md:pr-2">
      {/* Mobile: collapsed by default */}
      <details className="md:hidden">
        <summary className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          Contents ({items.length})
        </summary>
        <TocList items={items} activeId={activeId} onSelect={onSelect} className="mt-2" />
      </details>
      {/* Desktop: always visible */}
      <div className="hidden md:block">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Contents
        </h2>
        <TocList items={items} activeId={activeId} onSelect={onSelect} />
      </div>
    </aside>
  );
}

function TocList({
  items,
  activeId,
  onSelect,
  className = "",
}: {
  items: TocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={`space-y-0.5 text-sm ${className}`}>
      {items.map((item, i) => {
        const isActive = activeId === item.id;
        return (
          <li key={`${item.id}-${i}`} className={item.level === 3 ? "pl-3" : ""}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={`block w-full truncate rounded px-2 py-1 text-left transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : item.level === 2
                    ? "font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              title={item.text}
            >
              {item.text}
            </button>
          </li>
        );
      })}
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
    a: (props: any) => (
      <a className="text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300" {...props} />
    ),
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
