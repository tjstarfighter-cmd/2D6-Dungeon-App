import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";

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
      <Route element={<Layout />}>
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
        {/* Reserved for the OBS presenter epic. */}
        <Route path="present/*" element={<Lazy><SheetView /></Lazy>} />
        <Route path="*" element={<Lazy><SheetView /></Lazy>} />
      </Route>
    </Routes>
  );
}
