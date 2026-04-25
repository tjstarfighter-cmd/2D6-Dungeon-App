import type { ReactNode } from "react";

interface Props {
  title: string;
  description: ReactNode;
  upcoming?: string[];
}

/**
 * Placeholder used by every view until its real implementation lands.
 * Lets us scaffold the router + layout end-to-end on day 1.
 */
export function StubView({ title, description, upcoming }: Props) {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </header>
      {upcoming && (
        <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Coming soon
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {upcoming.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
