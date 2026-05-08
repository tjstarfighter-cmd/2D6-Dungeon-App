import { useEffect, useRef, useState, type ReactNode } from "react";

import { InstallPill } from "@/components/InstallPill";
import { ThemePicker, ThemeToggle } from "@/components/ThemeToggle";

export interface HeaderProps {
  onOpenRules: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  onOpenBackup: () => void;
}

export function Header(props: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-base font-semibold">
        2D6 Dungeon
        <span className="ml-2 text-xs font-normal text-zinc-500">companion</span>
      </h1>
      <DesktopActions {...props} />
      <PhoneActions {...props} />
    </header>
  );
}

// ----- Desktop -------------------------------------------------------------

function DesktopActions({
  onOpenRules,
  onOpenHelp,
  onOpenAbout,
  onOpenBackup,
}: HeaderProps) {
  return (
    <div className="ml-auto hidden items-center gap-2 lg:flex">
      <HeaderButton onClick={onOpenRules}>Rules</HeaderButton>
      <InstallPill />
      <a
        href="/present"
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        Present↗
      </a>
      <SettingsMenu
        onOpenHelp={onOpenHelp}
        onOpenAbout={onOpenAbout}
        onOpenBackup={onOpenBackup}
      />
      <ThemeToggle />
    </div>
  );
}

function SettingsMenu({
  onOpenHelp,
  onOpenAbout,
  onOpenBackup,
}: {
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  onOpenBackup: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        ⚙
      </button>
      {open && (
        <MenuPanel className="right-0">
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenHelp();
            }}
          >
            Help / Cheatsheet
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenBackup();
            }}
          >
            Backup &amp; restore…
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenAbout();
            }}
          >
            About
          </MenuItem>
        </MenuPanel>
      )}
    </div>
  );
}

// ----- Phone ---------------------------------------------------------------

function PhoneActions({
  onOpenRules,
  onOpenHelp,
  onOpenAbout,
  onOpenBackup,
}: HeaderProps) {
  return (
    <div className="ml-auto flex items-center gap-2 lg:hidden">
      <InstallPill compact />
      <OverflowMenu
        onOpenRules={onOpenRules}
        onOpenHelp={onOpenHelp}
        onOpenAbout={onOpenAbout}
        onOpenBackup={onOpenBackup}
      />
    </div>
  );
}

function OverflowMenu({
  onOpenRules,
  onOpenHelp,
  onOpenAbout,
  onOpenBackup,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        ⋯
      </button>
      {open && (
        <MenuPanel className="right-0 w-56">
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenRules();
            }}
          >
            Rules
          </MenuItem>
          <MenuLink
            href="/present"
            onClick={() => setOpen(false)}
          >
            Present ↗
          </MenuLink>
          <MenuSeparator />
          <li className="px-2 py-1.5">
            <ThemePicker />
          </li>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenHelp();
            }}
          >
            Help / Cheatsheet
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenBackup();
            }}
          >
            Backup &amp; restore…
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenAbout();
            }}
          >
            About
          </MenuItem>
        </MenuPanel>
      )}
    </div>
  );
}

// ----- Shared menu primitives ---------------------------------------------

function HeaderButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {children}
    </button>
  );
}

function MenuPanel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      role="menu"
      className={`absolute top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </ul>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {children}
      </button>
    </li>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li role="none">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {children}
      </a>
    </li>
  );
}

function MenuSeparator() {
  return (
    <li role="separator" className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
  );
}

function useDismiss<T extends HTMLElement>(
  active: boolean,
  onDismiss: () => void,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, onDismiss]);
  return ref;
}
