import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { ShellRoot } from "@/components/ShellRoot";

// Each view is its own chunk so the first paint doesn't pay for
// react-markdown / remark-gfm / rehype-slug (Rules) up front.
const SheetView = lazy(() => import("@/views/Sheet"));
const CombatView = lazy(() => import("@/views/Combat"));
const TablesView = lazy(() => import("@/views/Tables"));
const CardsView = lazy(() => import("@/views/Cards"));
const RulesView = lazy(() => import("@/views/Rules"));
const NotesView = lazy(() => import("@/views/Notes"));
const SearchView = lazy(() => import("@/views/Search"));
const MapView = lazy(() => import("@/views/Map"));

// Presenter views render outside Layout — chrome-less, full-bleed for OBS.
const PresentIndex = lazy(() => import("@/views/present/Index"));
const PresentMap = lazy(() => import("@/views/present/Map"));
const PresentCard = lazy(() => import("@/views/present/Card"));
const PresentTable = lazy(() => import("@/views/present/Table"));
const PresentRoll = lazy(() => import("@/views/present/Roll"));

// Phase 0 throwaway: dot-grid drawing spike. Chrome-less, full-bleed.
const SpikeDraw = lazy(() => import("@/views/SpikeDraw"));

function Loader() {
  return (
    <div className="p-6 text-sm text-zinc-500" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      {/* Chrome-less presenter routes for OBS Browser Source. */}
      <Route path="present" element={<Lazy><PresentIndex /></Lazy>} />
      <Route path="present/map/:id" element={<Lazy><PresentMap /></Lazy>} />
      <Route path="present/card/:id" element={<Lazy><PresentCard /></Lazy>} />
      <Route path="present/table/:id" element={<Lazy><PresentTable /></Lazy>} />
      <Route path="present/roll" element={<Lazy><PresentRoll /></Lazy>} />

      <Route path="spike/draw" element={<Lazy><SpikeDraw /></Lazy>} />

      <Route element={<ShellRoot />}>
        <Route index element={<Lazy><SheetView /></Lazy>} />
        <Route path="combat" element={<Lazy><CombatView /></Lazy>} />
        <Route path="tables" element={<Lazy><TablesView /></Lazy>} />
        <Route path="tables/:id" element={<Lazy><TablesView /></Lazy>} />
        <Route path="cards" element={<Lazy><CardsView /></Lazy>} />
        <Route path="cards/:id" element={<Lazy><CardsView /></Lazy>} />
        <Route path="rules" element={<Lazy><RulesView /></Lazy>} />
        <Route path="notes" element={<Lazy><NotesView /></Lazy>} />
        <Route path="search" element={<Lazy><SearchView /></Lazy>} />
        <Route path="map" element={<Lazy><MapView /></Lazy>} />
        <Route path="*" element={<Lazy><SheetView /></Lazy>} />
      </Route>
    </Routes>
  );
}
