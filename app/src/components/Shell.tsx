import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { AboutModal } from "@/components/AboutModal";
import { BackupRestoreModal } from "@/components/BackupRestoreModal";
import { Header } from "@/components/Header";
import { HelpModal } from "@/components/HelpModal";
import { RulesOverlay } from "@/components/RulesOverlay";
import { ToastProvider } from "@/components/Toast";

// Lazy-load each panel's view so first paint doesn't pay for everything.
// Mirrors App.tsx's lazy imports — Vite dedupes the chunks.
const SheetView = lazy(() => import("@/views/Sheet"));
const MapView = lazy(() => import("@/views/MapV2"));
const CombatView = lazy(() => import("@/views/Combat"));
const TablesView = lazy(() => import("@/views/Tables"));
const NotesView = lazy(() => import("@/views/Notes")); // placeholder Log surface

// ---- Shell tab state ------------------------------------------------------
//
// Three independent state slots, all persisted across breakpoint flips:
//   phoneTab   — which bottom tab is active on phone; ignored on desktop
//   middleTab  — Map vs Combat, the middle desktop column / phone Map tab
//   rightTab   — Tables vs Log, the right desktop column
//
// Story 1.1 keeps Log on desktop right column only; phone Log access is
// part of Story 1.13 and intentionally not wired here.
type PhoneTab = "sheet" | "map" | "tables";
type MiddleTab = "map" | "combat";
type RightTab = "tables" | "log";

// Bridge so descendants (e.g. MapV2's "Start combat" button) can summon the
// Combat tab without knowing which shell they're in. Replaces the old
// OverlayContext that bridged the legacy / v1.5 shells.
interface ShellNavApi {
  openCombat: () => void;
}
const ShellNavContext = createContext<ShellNavApi>({ openCombat: () => {} });
export function useShellNav(): ShellNavApi {
  return useContext(ShellNavContext);
}

function Loader() {
  return (
    <div className="p-6 text-sm text-zinc-500" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

// Phone-only persistent vitals strip. Tap → focuses the Sheet bottom tab.
function PhoneVitals({ onTap }: { onTap: () => void }) {
  const { active } = useCharacters();
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label="Open Sheet"
      className="flex w-full shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs lg:hidden dark:border-zinc-800 dark:bg-zinc-900"
    >
      {active ? (
        <>
          <span className="truncate text-sm font-semibold">{active.name}</span>
          <span className="text-zinc-500">Lvl {active.level}</span>
          <span className="ml-auto flex items-center gap-3 tabular-nums">
            <span>
              <span className="text-zinc-500">HP</span>{" "}
              {active.hp.current}/{active.hp.baseline}
            </span>
            <span>
              <span className="text-zinc-500">XP</span> {active.xp}
            </span>
            <span aria-hidden="true">→</span>
          </span>
        </>
      ) : (
        <>
          <span className="text-zinc-500">No active character</span>
          <span className="ml-auto" aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}

// Tab strip used inside both the middle (Map/Combat) and right (Tables/Log)
// columns. Generic over the tab key type.
function PanelTabBar<T extends string>({
  ariaLabel,
  tabs,
  active,
  onChange,
}: {
  ariaLabel: string;
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            t.key === active
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Column shell. On phone: shown only when its bottom tab is active. On
// desktop (≥lg): always visible side-by-side with sibling columns. The
// `display: none` toggle (rather than unmount) is what preserves the inner
// scroll position when crossing 1024px.
function Column({
  active,
  side,
  children,
}: {
  active: boolean;
  side: "left" | "middle" | "right";
  children: ReactNode;
}) {
  // Desktop sizing: left + right are fixed-width, middle takes the rest.
  const desktopSize =
    side === "middle"
      ? "lg:flex-1"
      : side === "left"
      ? "lg:w-80 lg:shrink-0 lg:border-r lg:border-zinc-200 dark:lg:border-zinc-800"
      : "lg:w-80 lg:shrink-0 lg:border-l lg:border-zinc-200 dark:lg:border-zinc-800";

  const phoneVisibility = active ? "flex flex-1" : "hidden";

  return (
    <section
      className={`min-h-0 min-w-0 flex-col bg-zinc-50 dark:bg-zinc-950 ${phoneVisibility} lg:flex ${desktopSize}`}
    >
      {children}
    </section>
  );
}

// Bottom tabs — phone-only.
function PhoneBottomTabs({
  active,
  onChange,
}: {
  active: PhoneTab;
  onChange: (next: PhoneTab) => void;
}) {
  const tabs: { key: PhoneTab; label: string }[] = [
    { key: "sheet", label: "Sheet" },
    { key: "map", label: "Map" },
    { key: "tables", label: "Tables" },
  ];
  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 items-stretch gap-1 border-t border-zinc-200 bg-white px-2 py-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-900"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-current={active === t.key ? "page" : undefined}
          onClick={() => onChange(t.key)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            active === t.key
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

type ModalKey = "rules" | "help" | "about" | "backup";

export function Shell() {
  const location = useLocation();
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("map");
  const [middleTab, setMiddleTab] = useState<MiddleTab>("map");
  const [rightTab, setRightTab] = useState<RightTab>("tables");
  const [modal, setModal] = useState<ModalKey | null>(null);

  // URL → tab sync. Old bookmarks (/tables/T1, /map, /combat) and
  // cross-link navigations from Rules markdown still map to the right
  // panel on phone. Desktop ignores phoneTab so this is a phone affordance.
  useEffect(() => {
    const path = location.pathname;
    if (path === "/" || path.startsWith("/sheet")) {
      setPhoneTab("sheet");
    } else if (path.startsWith("/tables")) {
      setPhoneTab("tables");
      setRightTab("tables");
    } else if (path.startsWith("/combat")) {
      setPhoneTab("map");
      setMiddleTab("combat");
    } else if (path.startsWith("/map")) {
      setPhoneTab("map");
      setMiddleTab("map");
    } else if (path.startsWith("/notes")) {
      setRightTab("log");
    }
  }, [location.pathname]);

  const shellNav = useMemo<ShellNavApi>(
    () => ({
      openCombat: () => {
        setPhoneTab("map");
        setMiddleTab("combat");
      },
    }),
    [],
  );

  const closeModal = () => setModal(null);

  return (
    <ShellNavContext.Provider value={shellNav}>
     <ToastProvider>
      <div className="flex h-[100dvh] flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Header
          onOpenRules={() => setModal("rules")}
          onOpenHelp={() => setModal("help")}
          onOpenAbout={() => setModal("about")}
          onOpenBackup={() => setModal("backup")}
        />
        <PhoneVitals onTap={() => setPhoneTab("sheet")} />

        <div className="flex min-h-0 flex-1">
          {/* Sheet column */}
          <Column active={phoneTab === "sheet"} side="left">
            <div className="flex-1 overflow-auto p-4">
              <Suspense fallback={<Loader />}>
                <SheetView />
              </Suspense>
            </div>
          </Column>

          {/* Middle: Map / Combat */}
          <Column active={phoneTab === "map"} side="middle">
            <PanelTabBar<MiddleTab>
              ariaLabel="Map column"
              tabs={[
                { key: "map", label: "Map" },
                { key: "combat", label: "Combat" },
              ]}
              active={middleTab}
              onChange={setMiddleTab}
            />
            <div className="relative flex-1 overflow-auto">
              <Suspense fallback={<Loader />}>
                {middleTab === "map" ? <MapView /> : <CombatView />}
              </Suspense>
            </div>
          </Column>

          {/* Right: Tables / Log (Notes view as placeholder) */}
          <Column active={phoneTab === "tables"} side="right">
            <PanelTabBar<RightTab>
              ariaLabel="Tables column"
              tabs={[
                { key: "tables", label: "Tables" },
                { key: "log", label: "Log" },
              ]}
              active={rightTab}
              onChange={setRightTab}
            />
            <div className="flex-1 overflow-auto p-4">
              <Suspense fallback={<Loader />}>
                {rightTab === "tables" ? <TablesView /> : <NotesView />}
              </Suspense>
            </div>
          </Column>
        </div>

        <PhoneBottomTabs active={phoneTab} onChange={setPhoneTab} />
      </div>

      {modal === "rules" && <RulesOverlay onClose={closeModal} />}
      {modal === "help" && <HelpModal onClose={closeModal} />}
      {modal === "about" && <AboutModal onClose={closeModal} />}
      {modal === "backup" && <BackupRestoreModal onClose={closeModal} />}
     </ToastProvider>
    </ShellNavContext.Provider>
  );
}
