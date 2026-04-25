import { NavLink, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { to: "/", label: "Sheet", end: true },
  { to: "/combat", label: "Combat" },
  { to: "/tables", label: "Tables" },
  { to: "/cards", label: "Cards" },
  { to: "/rules", label: "Rules" },
  { to: "/notes", label: "Notes" },
];

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
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:justify-end dark:border-zinc-800 dark:bg-zinc-900">
          <div className="md:hidden">
            <span className="font-semibold">2D6 Dungeon</span>
          </div>
          <ThemeToggle />
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
