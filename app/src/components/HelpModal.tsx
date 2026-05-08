import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { Modal } from "@/components/Modal";
import { useCheatsheetData } from "@/data/lazy";
import { makeMarkdownComponents } from "@/lib/markdownComponents";

// Story 1.12: Help / Cheatsheet pulls its body from
// app/src/data/cheatsheet.md so content can grow (gestures, NEXT flow,
// toast patterns) without code changes.

function CheatsheetBody() {
  const md = useCheatsheetData();
  const components = makeMarkdownComponents();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
      components={components}
    >
      {md}
    </ReactMarkdown>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Help / Cheatsheet" onClose={onClose}>
      <Suspense
        fallback={
          <p className="text-zinc-500" role="status" aria-live="polite">
            Loading…
          </p>
        }
      >
        <CheatsheetBody />
      </Suspense>
    </Modal>
  );
}
