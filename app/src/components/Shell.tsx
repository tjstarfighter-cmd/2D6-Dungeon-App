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
import { ToastProvider } from "@/components/Toast";
import {
  WelcomeModal,
  ackFirstLaunch,
  isFirstLaunchAcked,
} from "@/components/WelcomeModal";
import {
  CharacterCreateWizard,
  type CreatedCharacterInput,
} from "@/components/CharacterCreateWizard";
import {
  OnboardingTour,
  isOnboardingTourSeen,
  type TourStep,
} from "@/components/OnboardingTour";
import { RoomGenProvider, useRoomGen } from "@/components/RoomGen";
import { RoomGenPreviewModal } from "@/components/RoomGenPreviewModal";
import { LevelUpWatcher } from "@/components/LevelUpWatcher";
import { LevelUpWizardModal } from "@/components/LevelUpWizardModal";

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
  // Story 6.2 — open the 5-step character-creation wizard. Used by
  // Welcome modal (6.1) and CharacterSwitcher's [+ New character].
  openWizard: () => void;
  // Story 6.7 — re-summon the level-up wizard for any unresolved
  // pending choices (badge tap on PinnedVitals).
  openLevelUp: () => void;
}
const ShellNavContext = createContext<ShellNavApi>({
  openCombat: () => {},
  openWizard: () => {},
  openLevelUp: () => {},
});
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
          data-tour-anchor={
            t.key === "log"
              ? "log-tab"
              : t.key === "combat"
                ? "combat-tab"
                : undefined
          }
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
    <div
      data-tour-anchor="map-area"
      className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
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
              data-tour-anchor={
                t.key === "combat"
                  ? "combat-tab"
                  : t.key === "log"
                    ? "log-tab"
                    : undefined
              }
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
  | "welcome"
  | "wizard"
  | "tour"
  | "levelup";

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

// Story 6.1 / 6.2 — adapter so WelcomeModal can dismiss + hand off to
// the character-creation wizard via ShellNavContext. Lives inside the
// providers so it can call useShellNav.
function ConnectedWelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const nav = useShellNav();
  function handleCreate() {
    ackFirstLaunch();
    onDismiss();
    nav.openWizard();
  }
  function handleExplore() {
    ackFirstLaunch();
    onDismiss();
  }
  return (
    <WelcomeModal onCreate={handleCreate} onExplore={handleExplore} />
  );
}

// Story 6.2 — adapter that fills the new character with the wizard's
// selections plus the auto-applied starting kit, sets it active, and
// fires the Story 6.3 onboarding tour (suppressed if already seen).
function ConnectedCreateWizard({
  setPhoneTab,
  setSheetSubTab,
  setModal,
  onDismiss,
}: {
  setPhoneTab: Dispatch<SetStateAction<PhoneTab>>;
  setSheetSubTab: Dispatch<SetStateAction<SheetSubTab>>;
  setModal: Dispatch<SetStateAction<ModalKey | null>>;
  onDismiss: () => void;
}) {
  const { create, update } = useCharacters();

  function handleCreate(input: CreatedCharacterInput) {
    const c = create(input.name);
    update(c.id, {
      weapon: input.weapon,
      manoeuvres: input.manoeuvres,
      armour: [input.armour],
      scrolls: [
        {
          name: input.scroll.name,
          orbit: "",
          dispelDoubles: "",
          effectModifier: input.scroll.modifier,
        },
      ],
      potions: [{ name: "Potion of Healing", effectModifier: "" }],
      backpack: {
        // The starting kit ("flint & steel, lantern, 3 rations, pouch,
        // wax sealing kit, large backpack") is split between large /
        // small / rations slots per the physical sheet's structure.
        largeItems: ["lantern", "wax sealing kit", "", "", ""],
        smallItems: "flint & steel, pouch",
        rations: "3",
        lootLockup: "",
        additionalNotes: "",
      },
    });
    onDismiss();
    setPhoneTab("sheet");
    setSheetSubTab("loadout");
    if (!isOnboardingTourSeen()) {
      // Defer one tick so the wizard's modal can fully unmount before
      // the tour overlay measures its anchors.
      setTimeout(() => setModal("tour"), 50);
    }
  }

  return (
    <CharacterCreateWizard onCreate={handleCreate} onCancel={onDismiss} />
  );
}

// Story 6.3 — tour adapter. Builds steps that orchestrate tab/sub-tab
// state via prepare() so each anchor is on-screen before the tooltip
// measures its bounding rect. On phone the tour walks across columns;
// on desktop the prepare()s are no-ops for already-visible anchors.
function ConnectedOnboardingTour({
  setPhoneTab,
  setMiddleTab,
  setRightTab,
  setSheetSubTab,
  onDismiss,
}: {
  setPhoneTab: Dispatch<SetStateAction<PhoneTab>>;
  setMiddleTab: Dispatch<SetStateAction<MiddleTab>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setSheetSubTab: Dispatch<SetStateAction<SheetSubTab>>;
  onDismiss: () => void;
}) {
  const steps: TourStep[] = [
    {
      selectors: ['[data-tour-anchor="sheet-vitals"]'],
      title: "Your character lives here",
      body: "HP, status, and identity. Sub-tabs below swap Loadout, Magic, Pack, and Lore.",
      prepare: () => {
        setPhoneTab("sheet");
        setSheetSubTab("loadout");
      },
    },
    {
      selectors: [
        '[data-tour-anchor="map-tools"]',
        '[data-tour-anchor="map-area"]',
      ],
      title: "Draw your dungeon",
      body: "Pan, draw walls, erase, place exits. Create a map to unlock the full tool palette.",
      prepare: () => {
        setPhoneTab("map");
        setMiddleTab("map");
      },
    },
    {
      selectors: [
        '[data-tour-anchor="pin-tool"]',
        '[data-tour-anchor="map-area"]',
      ],
      title: "Pins anchor everything",
      body: "Once you have a map, the Pin tool labels rooms and hallways. Pins drive the per-room log and combat picker.",
      prepare: () => {
        setPhoneTab("map");
        setMiddleTab("map");
      },
    },
    {
      selectors: ['[data-tour-anchor="combat-tab"]'],
      title: "Combat overlay",
      body: "Switch here to manage encounters: roster, round-by-round resolution, and a full combat log.",
      prepare: () => {
        setPhoneTab("map");
        setMiddleTab("map");
      },
    },
    {
      selectors: [
        '[data-tour-anchor="tables-next"]',
        '[data-tour-anchor="tables-panel"]',
      ],
      title: "Tables — and what comes NEXT",
      body: "Search 170 tables. Resolved rolls auto-populate a NEXT section here so you don't lose your place.",
      prepare: () => {
        setPhoneTab("tables");
        setRightTab("tables");
      },
    },
    {
      selectors: ['[data-tour-anchor="log-tab"]'],
      title: "Per-room log",
      body: "Capture loot, rolls, and notes against the active pin. Pending entries promote to resolved as you finish them.",
      prepare: () => {
        // Phone: surface the Map column's Log inner-tab. Desktop: the
        // right-column Log tab is the primary anchor — switch the right
        // tab so it's selected when the highlight ring lands.
        setPhoneTab("map");
        setMiddleTab("log");
        setRightTab("log");
      },
    },
  ];
  return <OnboardingTour steps={steps} onClose={onDismiss} />;
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
      openWizard: () => {
        setModal("wizard");
      },
      openLevelUp: () => {
        setModal("levelup");
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
      <RoomGenProvider>
      <LevelUpWatcher onResolveChoices={() => setModal("levelup")} />
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
      {modal === "wizard" && (
        <ConnectedCreateWizard
          setPhoneTab={setPhoneTab}
          setSheetSubTab={setSheetSubTab}
          setModal={setModal}
          onDismiss={closeModal}
        />
      )}
      {modal === "tour" && (
        <ConnectedOnboardingTour
          setPhoneTab={setPhoneTab}
          setMiddleTab={setMiddleTab}
          setRightTab={setRightTab}
          setSheetSubTab={setSheetSubTab}
          onDismiss={closeModal}
        />
      )}
      <RoomGenPreviewMount />
      {modal === "levelup" && (
        <LevelUpWizardModal onClose={closeModal} />
      )}
      </RoomGenProvider>
      </RulesSearchProvider>
      </TablesSearchProvider>
      </ActivePinProvider>
     </ToastProvider>
    </ShellNavContext.Provider>
  );
}

// Story 6.5 — render the preview modal only when a preview is active.
// Wrapper exists so the modal can `useState(() => preview…)` and reset
// drafts each time a new preview opens (via the keyed remount below).
function RoomGenPreviewMount() {
  const { preview } = useRoomGen();
  if (!preview) return null;
  return <RoomGenPreviewModal key={preview.regionHash + preview.fromTableId} />;
}
