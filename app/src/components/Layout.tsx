import { useState, type FormEvent } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ShellPicker } from "@/components/ShellPicker";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { to: "/", label: "Sheet", end: true },
  { to: "/combat", label: "Combat" },
  { to: "/tables", label: "Tables" },
  { to: "/cards", label: "Cards" },
  { to: "/rules", label: "Rules" },
  { to: "/notes", label: "Notes" },
  { to: "/map", label: "Map" },
  { to: "/search", label: "Search" },
  { to: "/present", label: "Present" },
  // Phase 0 spike — remove once the new map ships.
  { to: "/spike/draw", label: "Spike" },
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

export function Layout() {
  return (
    <div className="flex min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 md:block dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-lg font-semibold">
          2D6 Dungeon
          <span className="ml-2 text-xs font-normal text-zinc-500">companion</span>
        </h1>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="md:hidden">
            <span className="font-semibold">2D6 Dungeon</span>
          </div>
          <HeaderSearch />
          <div className="ml-auto flex items-center gap-2">
            <ShellPicker />
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile nav: simple horizontal strip when sidebar is hidden. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-2 py-2 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
