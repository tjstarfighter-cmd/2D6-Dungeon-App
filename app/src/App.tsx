import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Shell } from "@/components/Shell";

// Presenter views render outside the Shell — chrome-less, full-bleed for OBS.
const PresentIndex = lazy(() => import("@/views/present/Index"));
const PresentMap = lazy(() => import("@/views/present/Map"));
const PresentCard = lazy(() => import("@/views/present/Card"));
const PresentTable = lazy(() => import("@/views/present/Table"));
const PresentRoll = lazy(() => import("@/views/present/Roll"));

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

      {/* Everything else lands in the new Shell. The Shell renders Sheet,
          Map, Combat, Tables, and Log panels directly; legacy URLs like
          /tables/T1 still route here so Tables can pick up the :id, and
          the Shell maps the path to the right phone tab. */}
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}
