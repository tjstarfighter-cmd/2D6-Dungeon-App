import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { getRunMode } from "@/lib/character";
import type { RunMode } from "@/types/character";
import { ShellPicker } from "@/components/ShellPicker";
import { ThemeToggle } from "@/components/ThemeToggle";

// New shell for the rewrite (Phase 1). Selected via the ShellPicker toggle.
//
// Structure:
//   - Top header: title, search, shell picker, theme toggle
//   - Phone-only vitals strip below header; tap opens SheetDrawer
//   - Main area (left): router Outlet — existing views render here unchanged
//     - In mapAnchored mode, ViewOverlay covers main when a bottom-bar
//       action is open (Combat / Tables / Rules / Cards / Notes)
//   - Sheet sidebar (right, md+): vitals + run mode toggle + sheet tabs
//   - Bottom action bar: Combat / Tables / Rules / Cards / Notes / + note

// Views reachable from the bottom action bar. In `lookup` mode they navigate;
// in `mapAnchored` mode they open as overlays over the main area.
export type ShellOverlayView = "combat" | "tables" | "rules" | "cards" | "notes";

const bottomActions: { view: ShellOverlayView; to: string; label: string }[] = [
  { view: "combat", to: "/combat", label: "Combat" },
  { view: "tables", to: "/tables", label: "Tables" },
  { view: "rules", to: "/rules", label: "Rules" },
  { view: "cards", to: "/cards", label: "Cards" },
  { view: "notes", to: "/notes", label: "Notes" },
];

// Lazy-loaded view registry — same chunks the router uses, deduped by Vite.
const overlayComponents: Record<ShellOverlayView, ComponentType> = {
  combat: lazy(() => import("@/views/Combat")),
  tables: lazy(() => import("@/views/Tables")),
  rules: lazy(() => import("@/views/Rules")),
  cards: lazy(() => import("@/views/Cards")),
  notes: lazy(() => import("@/views/Notes")),
};

const overlayTitles: Record<ShellOverlayView, string> = {
  combat: "Combat",
  tables: "Tables",
  rules: "Rules",
  cards: "Cards",
  notes: "Notes",
};

const sheetTabs: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Sheet", end: true },
  { to: "/notes", label: "Notes" },
];

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setQ("");
  }
  return (
    <form onSubmit={onSubmit} role="search" className="hidden grow max-w-md md:block">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search rules, tables, cards…"
        aria-label="Search"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    </form>
  );
}

function VitalsStrip() {
  const { active } = useCharacters();
  if (!active) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">
        No character selected.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">{active.name}</span>
        <span className="text-xs text-zinc-500">Lvl {active.level}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Stat label="HP" value={`${active.hp.current}/${active.hp.baseline}`} />
        <Stat label="XP" value={active.xp} />
        <Stat label="Bloodied" value={`${active.status.bloodied}/7`} />
        <Stat label="Soaked" value={`${active.status.soaked}/7`} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}

// Compact single-row vitals for phone-portrait. Tapping it opens the drawer
// with the full sheet sidebar content.
function PhoneVitalsStrip({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { active } = useCharacters();
  return (
    <button
      type="button"
      onClick={onOpenDrawer}
      aria-label="Open sheet drawer"
      className="flex w-full shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs md:hidden dark:border-zinc-800 dark:bg-zinc-900"
    >
      {active ? (
        <>
          <span className="truncate font-semibold text-sm">{active.name}</span>
          <span className="text-zinc-500">Lvl {active.level}</span>
          <span className="ml-auto flex items-center gap-3 tabular-nums">
            <span>
              <span className="text-zinc-500">HP</span>{" "}
              {active.hp.current}/{active.hp.baseline}
            </span>
            <span>
              <span className="text-zinc-500">XP</span> {active.xp}
            </span>
            <span aria-hidden="true">≡</span>
          </span>
        </>
      ) : (
        <>
          <span className="text-zinc-500">No character selected</span>
          <span className="ml-auto" aria-hidden="true">≡</span>
        </>
      )}
    </button>
  );
}

// Shared body for the sheet sidebar — used by the desktop SheetSidebar and
// by the phone SheetDrawer so they stay in sync.
function SheetSidebarBody() {
  return (
    <>
      <VitalsStrip />
      <div className="mt-3">
        <RunModeToggle />
      </div>
      <nav className="mt-3 flex gap-1">
        {sheetTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-3 flex-1 overflow-auto text-xs text-zinc-500">
        {/* Tab contents arrive in later slices; for now the sheet view itself
            still renders in the main area. */}
        <p className="italic">Sidebar tab content TBD.</p>
      </div>
    </>
  );
}

// Phone-only slide-in drawer holding the same content as the desktop
// SheetSidebar. ESC and backdrop tap close.
function SheetDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Sheet drawer">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/40"
      />
      <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Sheet
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            ✕
          </button>
        </div>
        <SheetSidebarBody />
      </aside>
    </div>
  );
}

function RunModeToggle() {
  const { active, update } = useCharacters();
  if (!active) return null;
  const mode = getRunMode(active);
  function set(next: RunMode) {
    if (!active || next === mode) return;
    update(active.id, {
      currentRun: { ...(active.currentRun ?? {}), mode: next },
    });
  }
  const options: { value: RunMode; label: string; hint: string }[] = [
    { value: "mapAnchored", label: "Map", hint: "Map anchored — overlays for everything else" },
    { value: "lookup", label: "Lookup", hint: "Lookup — nav between views (physical-paper play)" },
  ];
  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Run mode
      </div>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => set(opt.value)}
            title={opt.hint}
            aria-pressed={mode === opt.value}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === opt.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SheetSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-zinc-200 bg-white p-3 md:flex dark:border-zinc-800 dark:bg-zinc-900">
      <SheetSidebarBody />
    </aside>
  );
}

interface BottomBarProps {
  mode: RunMode;
  activeOverlay: ShellOverlayView | null;
  onOpenOverlay: (view: ShellOverlayView) => void;
  onQuickAddNote: () => void;
}

function BottomBar({
  mode,
  activeOverlay,
  onOpenOverlay,
  onQuickAddNote,
}: BottomBarProps) {
  const itemBase =
    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const itemIdle =
    "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";
  const itemActive =
    "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";

  return (
    <nav
      aria-label="Quick actions"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {bottomActions.map((action) =>
        mode === "lookup" ? (
          <NavLink
            key={action.view}
            to={action.to}
            className={({ isActive }) =>
              `${itemBase} ${isActive ? itemActive : itemIdle}`
            }
          >
            {action.label}
          </NavLink>
        ) : (
          <button
            key={action.view}
            type="button"
            onClick={() => onOpenOverlay(action.view)}
            aria-current={activeOverlay === action.view ? "true" : undefined}
            className={`${itemBase} ${
              activeOverlay === action.view ? itemActive : itemIdle
            }`}
          >
            {action.label}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={onQuickAddNote}
        className="ml-auto whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        + note
      </button>
      {/* Phase 2 in-progress map — remove once /map is replaced. */}
      <NavLink
        to="/mapv2"
        className={({ isActive }) =>
          `whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            isActive
              ? "border-amber-500 bg-amber-500 text-zinc-900"
              : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          }`
        }
      >
        Map v2
      </NavLink>
    </nav>
  );
}

interface ViewOverlayProps {
  view: ShellOverlayView;
  onClose: () => void;
}

// The view inside the overlay reads `useParams()` from the outer router's
// URL. If the user opens, say, the Tables overlay while sitting at
// `/cards/CARD123`, Tables sees `id = "CARD123"`, fails the lookup, and
// renders its index — surprising but harmless. Wrapping each overlay in
// a MemoryRouter would isolate params cleanly but break Rules' table
// cross-links (which point at `/tables/X` and need to drive the main URL).
// Revisit when overlays gain richer in-context behavior (Phase 4).
function ViewOverlay({ view, onClose }: ViewOverlayProps) {
  const Component = overlayComponents[view];
  const title = overlayTitles[view];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
      className="absolute inset-0 z-30 flex flex-col bg-zinc-50 dark:bg-zinc-950"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Suspense
          fallback={
            <div className="text-sm text-zinc-500" role="status" aria-live="polite">
              Loading…
            </div>
          }
        >
          <Component />
        </Suspense>
      </div>
    </div>
  );
}

export function ShellLayout() {
  const { active } = useCharacters();
  const navigate = useNavigate();
  const mode = getRunMode(active);
  const [overlay, setOverlay] = useState<ShellOverlayView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openOverlay(view: ShellOverlayView) {
    if (mode === "mapAnchored") {
      setOverlay(view);
    } else {
      navigate(`/${view}`);
    }
  }

  function quickAddNote() {
    if (mode === "mapAnchored") {
      setOverlay("notes");
    } else {
      navigate("/notes");
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-base font-semibold">
          2D6 Dungeon
          <span className="ml-2 text-xs font-normal text-zinc-500">companion</span>
        </h1>
        <HeaderSearch />
        <div className="ml-auto flex items-center gap-2">
          <ShellPicker />
          <ThemeToggle />
        </div>
      </header>

      <PhoneVitalsStrip onOpenDrawer={() => setDrawerOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-auto p-4 md:p-6">
          <Outlet />
          {overlay && (
            <ViewOverlay view={overlay} onClose={() => setOverlay(null)} />
          )}
        </main>
        <SheetSidebar />
      </div>

      <BottomBar
        mode={mode}
        activeOverlay={overlay}
        onOpenOverlay={openOverlay}
        onQuickAddNote={quickAddNote}
      />

      <SheetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
