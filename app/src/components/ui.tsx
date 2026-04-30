// Small UI primitives used by the Character Sheet (and likely beyond).
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

const inputStyle =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500";
const inputBase = `block w-full ${inputStyle}`;

const btnBase =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
  className = "",
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function NumberField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputBase} min-h-[5rem] resize-y ${props.className ?? ""}`}
    />
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "danger" | "primary" }) {
  const variantCls =
    variant === "danger"
      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      : variant === "primary"
        ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        : "";
  return (
    <button type="button" {...rest} className={`${btnBase} ${variantCls} ${className}`}>
      {children}
    </button>
  );
}

/**
 * Number input with -/+ steppers. Use for HP, XP, coins, favour points, etc.
 * `min` defaults to 0; pass `min={-Infinity}` if negatives should be allowed.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  width = "w-16",
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: string;
  ariaLabel?: string;
}) {
  const clamp = (n: number) => {
    if (Number.isNaN(n)) return min;
    if (max !== undefined && n > max) return max;
    if (n < min) return min;
    return n;
  };
  return (
    <div className="inline-flex items-stretch gap-1">
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} decrease` : "decrease"}
        onClick={() => onChange(clamp(value - step))}
        className={btnBase}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className={`${inputStyle} text-center ${width}`}
      />
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} increase` : "increase"}
        onClick={() => onChange(clamp(value + step))}
        className={btnBase}
      >
        +
      </button>
    </div>
  );
}

/** Row of clickable boxes used for Bloodied / Soaked pips. */
export function Pips({
  count,
  filled,
  onChange,
  ariaLabel,
}: {
  count: number;
  filled: number;
  onChange: (next: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={ariaLabel}>
      {Array.from({ length: count }).map((_, i) => {
        const on = i < filled;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${ariaLabel ?? "pip"} ${i + 1}`}
            aria-pressed={on}
            // Click on a pip toggles up to that pip; click on the active one to toggle off.
            onClick={() => onChange(i + 1 === filled ? i : i + 1)}
            className={`size-5 rounded border ${
              on
                ? "border-red-500 bg-red-500"
                : "border-zinc-400 bg-transparent hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-800"
            }`}
          />
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-500"
      />
      <span>{label}</span>
    </label>
  );
}
