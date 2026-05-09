import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { AboutModal } from "@/components/AboutModal";
import { BackupRestoreModal } from "@/components/BackupRestoreModal";
import { CharacterSwitcherModal } from "@/components/CharacterSwitcherModal";
import { Header } from "@/components/Header";
import { HelpModal } from "@/components/HelpModal";
import { PinnedVitals } from "@/components/PinnedVitals";
import { RulesOverlay } from "@/components/RulesOverlay";
import {
  SheetTabs,
  SHEET_SUB_TABS,
  type SheetSubTab,
} from "@/components/SheetTabs";
import { ActivePinProvider, LogAutoFlipBridge } from "@/components/ActivePin";
import { LogPanel } from "@/components/LogPanel";
import { MapToolsProvider, useMapTools } from "@/components/MapTools";
import {
  TablesSearchProvider,
  useTablesSearch,
} from "@/components/TablesSearch";
import {
  RulesSearchProvider,
  useTryFocusRulesSearch,
} from "@/components/RulesSearch";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  WelcomeModal,
  ackFirstLaunch,
  isFirstLaunchAcked,
} from "@/components/WelcomeModal";

// Lazy-load each panel's view so first paint doesn't pay for everything.
// Mirrors App.tsx's lazy imports — Vite dedupes the chunks.
const MapView = lazy(() => import("@/views/MapV2"));
const CombatView = lazy(() => import("@/views/Combat"));
const TablesView = lazy(() => import("@/views/Tables"));

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
// "log" is phone-only (the Map tab gains a third inner tab on phone, per
// design memo §"Map column"). Desktop's [Map][Combat] strip filters it out.
type MiddleTab = "map" | "combat" | "log";
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

// Log tab placeholder until the per-room log threads ship in Epic 2.
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

// Map column tab strip. Desktop shows [Map][Combat]; phone adds a Log
// inner tab (per design memo §"Map column"). Right side hosts the
// support buttons that bridge into MapV2 via MapToolsContext.
function MapAreaTabStrip({
  active,
  onChange,
}: {
  active: MiddleTab;
  onChange: (next: MiddleTab) => void;
}) {
  const tools = useMapTools();
  const desktopTabs: { key: MiddleTab; label: string }[] = [
    { key: "map", label: "Map" },
    { key: "combat", label: "Combat" },
  ];
  const phoneTabs: { key: MiddleTab; label: string }[] = [
    ...desktopTabs,
    { key: "log", label: "Log" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
      <div role="tablist" aria-label="Map area" className="flex items-center gap-1">
        {/* Phone shows three tabs (Map/Combat/Log); desktop hides Log */}
        {phoneTabs.map((t) => {
          const desktopOnly = desktopTabs.some((d) => d.key === t.key);
          const visibility = desktopOnly ? "" : "lg:hidden";
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active}
              onClick={() => onChange(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${visibility} ${
                t.key === active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <SupportButton label="Setup" glyph="⚙" onClick={tools.openSetup} />
        <SupportButton label="Roll" glyph="🎲" onClick={tools.openRoll} />
        <SupportButton label="Undo" glyph="↶" onClick={tools.undo} />
        <SupportButton label="Zoom to fit" glyph="⌖" onClick={tools.zoomFit} />
      </div>
    </div>
  );
}

function SupportButton({
  label,
  glyph,
  onClick,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {glyph}
    </button>
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

type ModalKey =
  | "rules"
  | "help"
  | "about"
  | "backup"
  | "switcher"
  | "welcome";

// Global keyboard shortcuts (Story 1.12). Lives inside TablesSearchProvider
// so it can resolve the focus handler registered by views/Tables.
function ShellHotkeys({
  setSheetSubTab,
  setPhoneTab,
  setRightTab,
  setModal,
}: {
  setSheetSubTab: Dispatch<SetStateAction<SheetSubTab>>;
  setPhoneTab: Dispatch<SetStateAction<PhoneTab>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setModal: Dispatch<SetStateAction<ModalKey | null>>;
}) {
  const focusTablesSearch = useTablesSearch();
  const tryFocusRulesSearch = useTryFocusRulesSearch();
  // Keep the latest callable in a ref so the [] effect doesn't go stale.
  const focusRef = useRef(focusTablesSearch);
  const rulesFocusRef = useRef(tryFocusRulesSearch);
  useEffect(() => {
    focusRef.current = focusTablesSearch;
    rulesFocusRef.current = tryFocusRulesSearch;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      const inEditable =
        target instanceof HTMLElement &&
        target.matches("input, textarea, [contenteditable='true']");

      // Cmd/Ctrl combos (no shift/alt). Cmd+1..4 → Sheet sub-tab; Cmd+K
      // → focus Tables search. preventDefault so the browser doesn't run
      // its own binding (e.g. Chrome's address-bar focus on Cmd+K).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const idx = SHEET_SUB_TABS.findIndex((t) => t.shortcut === e.key);
        if (idx !== -1) {
          if (inEditable) return;
          e.preventDefault();
          setSheetSubTab(SHEET_SUB_TABS[idx].key);
          setPhoneTab("sheet");
          return;
        }
        if (e.key.toLowerCase() === "k") {
          if (inEditable) return;
          e.preventDefault();
          setPhoneTab("tables");
          setRightTab("tables");
          focusRef.current();
        }
        return;
      }

      // Bare-key shortcuts. ? requires Shift on US layouts but the produced
      // KeyboardEvent.key is "?", so we don't filter on shift here. Skip
      // while typing so '?' / '/' still flow into inputs.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (inEditable) return;

      if (e.key === "?") {
        e.preventDefault();
        setModal((prev) => (prev === "help" ? null : "help"));
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        // Story 5.8 — when the Rules overlay is open, "/" focuses the
        // in-Rules search input (the active surface's primary search,
        // per FR62). Otherwise fall through to Tables search.
        if (rulesFocusRef.current()) return;
        setPhoneTab("tables");
        setRightTab("tables");
        focusRef.current();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSheetSubTab, setPhoneTab, setRightTab, setModal]);

  return null;
}

// Story 6.1 — adapter so WelcomeModal can fire a toast (it sits inside
// ToastProvider; Shell itself can't call useToast). Story 6.2 will
// replace the placeholder toast with the actual character-creation
// wizard.
function ConnectedWelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const toast = useToast();
  function handleCreate() {
    ackFirstLaunch();
    onDismiss();
    toast.suggestion({
      message:
        "Character creation wizard arrives in Story 6.2 — the empty Sheet is your stand-in for now.",
      primary: { label: "OK", onClick: () => {} },
    });
  }
  function handleExplore() {
    ackFirstLaunch();
    onDismiss();
  }
  return (
    <WelcomeModal onCreate={handleCreate} onExplore={handleExplore} />
  );
}

export function Shell() {
  const location = useLocation();
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("map");
  const [middleTab, setMiddleTab] = useState<MiddleTab>("map");
  const [rightTab, setRightTab] = useState<RightTab>("tables");
  const [sheetSubTab, setSheetSubTab] = useState<SheetSubTab>("loadout");
  // Story 6.1 — initial modal state covers first-launch detection so the
  // Welcome modal appears synchronously before the empty-state UIs flash
  // through. characters.length is read in initialiser only; subsequent
  // character mutations don't re-fire the modal.
  const initialChars = useCharacters().characters;
  const [modal, setModal] = useState<ModalKey | null>(() =>
    !isFirstLaunchAcked() && initialChars.length === 0 ? "welcome" : null,
  );

  // URL → tab sync. Old bookmarks (/tables/T1, /map, /combat) and
  // cross-link navigations from Rules markdown still map to the right
  // panel on phone. Desktop ignores phoneTab so this is a phone affordance.
  // Story 5.8 — depend on location.key (not just pathname) so two
  // back-to-back /rules#anchor cross-links re-fire even though pathname
  // doesn't change. /rules also opens the Rules overlay.
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
    } else if (path.startsWith("/rules")) {
      setModal("rules");
    }
  }, [location.key, location.pathname]);

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
      <ActivePinProvider>
      <LogAutoFlipBridge
        setRightTab={setRightTab}
        setMiddleTab={setMiddleTab}
      />
      <TablesSearchProvider>
      <RulesSearchProvider>
      <ShellHotkeys
        setSheetSubTab={setSheetSubTab}
        setPhoneTab={setPhoneTab}
        setRightTab={setRightTab}
        setModal={setModal}
      />
      <div className="flex h-[100dvh] flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Header
          onOpenRules={() => setModal("rules")}
          onOpenHelp={() => setModal("help")}
          onOpenAbout={() => setModal("about")}
          onOpenBackup={() => setModal("backup")}
        />
        <PhoneVitals onTap={() => setPhoneTab("sheet")} />

        <div className="flex min-h-0 flex-1">
          {/* Sheet column — pinned vitals stay above; sub-tabs below
              swap Loadout / Magic / Pack / Lore content. Stories 1.6–1.9
              replace each tab's body. */}
          <Column active={phoneTab === "sheet"} side="left">
            <PinnedVitals onOpenSwitcher={() => setModal("switcher")} />
            <SheetTabs active={sheetSubTab} onChange={setSheetSubTab} />
          </Column>

          {/* Middle: Map / Combat (+ Log inner-tab on phone) */}
          <Column active={phoneTab === "map"} side="middle">
            <MapToolsProvider>
              <MapAreaTabStrip active={middleTab} onChange={setMiddleTab} />
              <div className="relative flex-1 overflow-auto">
                <Suspense fallback={<Loader />}>
                  {middleTab === "combat" ? (
                    <CombatView />
                  ) : middleTab === "log" ? (
                    <LogPanel />
                  ) : (
                    <MapView />
                  )}
                </Suspense>
              </div>
            </MapToolsProvider>
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
                {rightTab === "tables" ? <TablesView /> : <LogPanel />}
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
      {modal === "switcher" && <CharacterSwitcherModal onClose={closeModal} />}
      {modal === "welcome" && (
        <ConnectedWelcomeModal onDismiss={closeModal} />
      )}
      </RulesSearchProvider>
      </TablesSearchProvider>
      </ActivePinProvider>
     </ToastProvider>
    </ShellNavContext.Provider>
  );
}
