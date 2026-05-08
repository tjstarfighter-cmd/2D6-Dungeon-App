import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

// Toast framework. Three flavours by Story 1.3 ACs:
//
//   suggestion  — decision-driving prompt. Persists until acted on. Three
//                 controls: primary action (whole-toast tap), Edit, ✕.
//   success     — confirmation. Auto-fades after ~3s; an optional Undo
//                 button stays live for ~5s before the toast vanishes.
//   error       — manual dismiss only. Announced via aria-live="assertive".
//
// At most 3 visible at a time (newest on top, anchored bottom-center).
// Toasts past the cap queue and surface as visible toasts dismiss.

interface BaseToast {
  id: string;
  message: string;
}

export interface SuggestionToast extends BaseToast {
  type: "suggestion";
  primary: { label: string; onClick: () => void };
  edit?: () => void;
}

export interface SuccessToast extends BaseToast {
  type: "success";
  undo?: () => void;
}

export interface ErrorToast extends BaseToast {
  type: "error";
}

type Toast = SuggestionToast | SuccessToast | ErrorToast;

export interface ToastApi {
  suggestion: (input: Omit<SuggestionToast, "id" | "type">) => string;
  success: (input: Omit<SuccessToast, "id" | "type">) => string;
  error: (input: Omit<ErrorToast, "id" | "type">) => string;
  dismiss: (id: string) => void;
}

const noop: ToastApi = {
  suggestion: () => "",
  success: () => "",
  error: () => "",
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi>(noop);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const VISIBLE_MAX = 3;
const SUCCESS_LIFETIME_MS = 5000;
const SUCCESS_FADE_AT_MS = 3000;

let seq = 0;
const nextId = () => `toast-${++seq}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  // Newest first. Visible = first VISIBLE_MAX; rest queue silently.
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      suggestion: (input) => {
        const t: SuggestionToast = { ...input, id: nextId(), type: "suggestion" };
        setToasts((ts) => [t, ...ts]);
        return t.id;
      },
      success: (input) => {
        const t: SuccessToast = { ...input, id: nextId(), type: "success" };
        setToasts((ts) => [t, ...ts]);
        // Auto-dismiss honours the success-toast lifetime; fade animation
        // happens earlier inside <ToastView> via its own timer.
        window.setTimeout(() => dismiss(t.id), SUCCESS_LIFETIME_MS);
        return t.id;
      },
      error: (input) => {
        const t: ErrorToast = { ...input, id: nextId(), type: "error" };
        setToasts((ts) => [t, ...ts]);
        return t.id;
      },
      dismiss,
    }),
    [dismiss],
  );

  // Dev convenience: expose the API on window so I can fire test toasts
  // from the console while later stories haven't yet wired their callers.
  // Stripped from prod builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __toast?: ToastApi }).__toast = api;
    return () => {
      delete (window as unknown as { __toast?: ToastApi }).__toast;
    };
  }, [api]);

  const visible = toasts.slice(0, VISIBLE_MAX);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={visible} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      // bottom-20 keeps the stack above the phone bottom-tabs strip;
      // lg:bottom-4 trims to standard padding on desktop where there are
      // no bottom tabs.
      className="pointer-events-none fixed bottom-20 left-1/2 z-40 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 lg:bottom-4"
    >
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastView({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  if (t.type === "suggestion") {
    return <SuggestionView toast={t} onDismiss={onDismiss} />;
  }
  if (t.type === "success") {
    return <SuccessView toast={t} onDismiss={onDismiss} />;
  }
  return <ErrorView toast={t} onDismiss={onDismiss} />;
}

function SuggestionView({
  toast: t,
  onDismiss,
}: {
  toast: SuggestionToast;
  onDismiss: (id: string) => void;
}) {
  // Whole-toast tap fires the primary action; nested controls stop
  // propagation so they're addressable individually.
  function stop(e: MouseEvent) {
    e.stopPropagation();
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onClick={t.primary.onClick}
      className="pointer-events-auto flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <span className="grow text-zinc-800 dark:text-zinc-100">{t.message}</span>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          t.primary.onClick();
        }}
        className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {t.primary.label}
      </button>
      {t.edit && (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            t.edit!();
          }}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Edit
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          onDismiss(t.id);
        }}
        aria-label="Dismiss"
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        ✕
      </button>
    </div>
  );
}

function SuccessView({
  toast: t,
  onDismiss,
}: {
  toast: SuccessToast;
  onDismiss: (id: string) => void;
}) {
  // Two-phase visibility: full opacity for the first ~3s, then a
  // 2s opacity fade. Undo stays interactive throughout the 5s lifetime
  // (the parent's setTimeout handles final removal).
  const [fading, setFading] = useState(false);
  const fadeRef = useRef<number | null>(null);
  useEffect(() => {
    fadeRef.current = window.setTimeout(() => setFading(true), SUCCESS_FADE_AT_MS);
    return () => {
      if (fadeRef.current != null) window.clearTimeout(fadeRef.current);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`pointer-events-auto flex items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm shadow-lg transition-opacity duration-[2000ms] dark:border-emerald-700 dark:bg-emerald-950/70 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <span className="grow text-emerald-900 dark:text-emerald-100">
        {t.message}
      </span>
      {t.undo && (
        <button
          type="button"
          onClick={() => {
            t.undo!();
            onDismiss(t.id);
          }}
          className="rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-600 dark:text-emerald-100 dark:hover:bg-emerald-900/60"
        >
          Undo
        </button>
      )}
    </div>
  );
}

function ErrorView({
  toast: t,
  onDismiss,
}: {
  toast: ErrorToast;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="pointer-events-auto flex items-center gap-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm shadow-lg dark:border-rose-700 dark:bg-rose-950/70"
    >
      <span className="grow text-rose-900 dark:text-rose-100">⚠ {t.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss"
        className="rounded-md border border-rose-400 px-2 py-1 text-xs text-rose-800 hover:bg-rose-100 dark:border-rose-600 dark:text-rose-100 dark:hover:bg-rose-900/60"
      >
        ✕
      </button>
    </div>
  );
}
