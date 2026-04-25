import { Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { SheetView } from "@/views/Sheet";
import { CombatView } from "@/views/Combat";
import { TablesView } from "@/views/Tables";
import { CardsView } from "@/views/Cards";
import { RulesView } from "@/views/Rules";
import { NotesView } from "@/views/Notes";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SheetView />} />
        <Route path="combat" element={<CombatView />} />
        <Route path="tables" element={<TablesView />} />
        <Route path="tables/:id" element={<TablesView />} />
        <Route path="cards" element={<CardsView />} />
        <Route path="cards/:id" element={<CardsView />} />
        <Route path="rules" element={<RulesView />} />
        <Route path="notes" element={<NotesView />} />
        {/* Reserved for future epics — render a friendly stub if someone
            navigates there manually. */}
        <Route path="map" element={<SheetView />} />
        <Route path="present/*" element={<SheetView />} />
        <Route path="*" element={<SheetView />} />
      </Route>
    </Routes>
  );
}
