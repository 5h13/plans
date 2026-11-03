import { useState, type ReactNode } from "react";
import { DomainError } from "../lib/util";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-base shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100";

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-300",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};
export type Tone = keyof typeof TONES;
export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-surface shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

type Variant = "primary" | "secondary" | "danger" | "approve" | "ghost";
const BTN: Record<Variant, string> = {
  primary: "bg-blue-700 font-semibold text-white active:bg-blue-800",
  secondary: "bg-surface text-slate-800 ring-1 ring-slate-300 active:bg-slate-100",
  danger: "bg-red-700 text-white active:bg-red-800",
  approve: "bg-emerald-700 font-semibold text-slate-50 active:bg-emerald-800",
  ghost: "text-blue-700",
};
export function Button({ children, onClick, variant = "primary", disabled, className = "", type = "button" }: { children: ReactNode; onClick?: () => void; variant?: Variant; disabled?: boolean; className?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`min-h-10 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50 ${BTN[variant]} ${className}`}>
      {children}
    </button>
  );
}

/** Runs a command; shows its message or the rule it broke (with the code, like the desktop app). */
export function useCommand() {
  const [state, setState] = useState<{ ok?: string; error?: string; code?: string; busy?: boolean }>({});
  const run = async (fn: () => Promise<unknown> | unknown, okMessage?: string) => {
    setState({ busy: true });
    try {
      const r = await fn();
      setState({ ok: okMessage ?? (typeof r === "string" ? r : "Saved.") });
      return true;
    } catch (e) {
      const err = e instanceof DomainError ? e : new DomainError("UNEXPECTED", (e as Error).message);
      setState({ error: err.message, code: err.code });
      return false;
    }
  };
  const message = state.error ? (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="mr-1 font-mono text-xs font-semibold">{state.code}</span>
      {state.error}
    </p>
  ) : state.ok ? (
    <p className="text-sm text-emerald-700">{state.ok}</p>
  ) : null;
  return { run, message, busy: !!state.busy, clear: () => setState({}) };
}

export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {sub && <p className="text-sm text-slate-600">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Pct({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded bg-slate-200">
        <span className={`block h-full ${v >= 100 ? "bg-emerald-600" : "bg-blue-600"}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-xs tabular-nums text-slate-700">{Math.round(v)}%</span>
    </span>
  );
}

export function Variance({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-slate-400">—</span>;
  const cls = days > 0 ? "text-red-700" : days < 0 ? "text-emerald-700" : "text-slate-600";
  return <span className={`text-xs font-medium tabular-nums ${cls}`}>{days > 0 ? `+${days} d late` : days < 0 ? `${-days} d ahead` : "on time"}</span>;
}

export const money = (n: number | null | undefined, currency: string) => (n == null ? "—" : `${currency} ${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`);
export const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");
