import type { Components } from "react-markdown";
import { Link } from "react-router-dom";

// Shared ReactMarkdown component map. Used by Rules.tsx (Core Rules) and
// HelpModal.tsx (cheatsheet). Keeping a single factory means typography,
// link routing, and table styling stay consistent across markdown surfaces.

export interface MarkdownComponentOptions {
  /**
   * Optional callback fired when an in-app link is followed (e.g. a Rules
   * cross-link to /tables/X). Story 3.6 uses this to close the Rules
   * overlay so the Tables surface is actually visible after the tap.
   */
  onInAppNavigate?: (href: string) => void;
}

export function makeMarkdownComponents(
  options: MarkdownComponentOptions = {},
): Components {
  const { onInAppNavigate } = options;
  return {
    h1: (props) => (
      <h1 className="mb-4 mt-6 text-3xl font-bold tracking-tight" {...props} />
    ),
    h2: (props) => (
      <h2
        className="mb-3 mt-8 scroll-mt-4 border-b border-zinc-200 pb-1 text-2xl font-semibold tracking-tight dark:border-zinc-800"
        {...props}
      />
    ),
    h3: (props) => (
      <h3 className="mb-2 mt-6 scroll-mt-4 text-xl font-semibold" {...props} />
    ),
    h4: (props) => (
      <h4
        className="mb-2 mt-4 text-base font-semibold text-zinc-800 dark:text-zinc-200"
        {...props}
      />
    ),
    p: (props) => <p className="my-3 leading-relaxed" {...props} />,
    strong: (props) => (
      <strong
        className="font-semibold text-zinc-900 dark:text-zinc-100"
        {...props}
      />
    ),
    em: (props) => <em {...props} />,
    a: ({ href, children, ...props }) => {
      const cls =
        "text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300";
      // Route in-app links through React Router so navigation is
      // client-side (no full reload). External links and same-page hash
      // anchors stay as plain <a>.
      if (typeof href === "string" && href.startsWith("/")) {
        return (
          <Link
            to={href}
            className={cls}
            onClick={() => onInAppNavigate?.(href)}
          >
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
    ul: (props) => (
      <ul className="my-3 list-disc space-y-1 pl-6" {...props} />
    ),
    ol: (props) => (
      <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />
    ),
    li: (props) => <li className="leading-relaxed" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="my-3 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        {...props}
      />
    ),
    code: (props) => (
      <code
        className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
        {...props}
      />
    ),
    table: (props) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),
    thead: (props) => (
      <thead
        className="border-b border-zinc-300 dark:border-zinc-700"
        {...props}
      />
    ),
    th: (props) => (
      <th
        className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
        {...props}
      />
    ),
    tr: (props) => (
      <tr
        className="border-b border-zinc-200 dark:border-zinc-800"
        {...props}
      />
    ),
    td: (props) => <td className="px-2 py-1.5 align-top" {...props} />,
    hr: (props) => (
      <hr className="my-6 border-zinc-200 dark:border-zinc-800" {...props} />
    ),
  };
}
