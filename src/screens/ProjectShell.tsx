import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import { href } from "../lib/router";
import type { Project } from "../lib/model";

const TABS: Array<[string, string, string]> = [
  ["", "Overview", "M3 12l9-9 9 9M5 10v10h14V10"],
  ["plan", "Plan", "M4 6h16M4 12h10M4 18h7"],
  ["progress", "Progress", "M4 19V9m6 10V5m6 14v-7m4 7H2"],
  ["registers", "Registers", "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"],
  ["more", "More", "M5 12h.01M12 12h.01M19 12h.01"],
];

export function ProjectShell({ p, tab, children }: { p: Project; tab: string; children: ReactNode }) {
  const owner = useStore((s) => s.library.settings?.ownerName);
  const sectionOf = (t: string) => (["", "definition"].includes(t) ? "" : ["plan", "schedule", "deliverable", "stages", "estimate"].includes(t) ? "plan" : ["progress", "report", "compare"].includes(t) ? "progress" : ["registers", "comments", "comment", "risks", "changes", "documents", "doccompare"].includes(t) ? "registers" : "more");
  const active = tab === "definition" ? "more" : sectionOf(tab);
  return (
    <div className="min-h-screen pb-24">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <a href={href("/")} aria-label="All projects" className="text-xl leading-none text-slate-600">‹</a>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{p.name}</div>
            <div className="truncate font-mono text-xs text-slate-500">{p.project_no} · {owner}</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-surface">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map(([seg, label, d]) => (
            <a key={seg} href={href(`/p/${p.id}${seg ? `/${seg}` : ""}`)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active === seg ? "text-blue-700" : "text-slate-500"}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active === seg ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
              {label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function MenuList({ items }: { items: Array<{ to: string; label: string; sub?: string; badge?: ReactNode }> }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      {items.map((i) => (
        <li key={i.to}>
          <a href={href(i.to)} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50">
            <span>
              <span className="block text-sm font-medium">{i.label}</span>
              {i.sub && <span className="block text-xs text-slate-500">{i.sub}</span>}
            </span>
            <span className="flex items-center gap-2">{i.badge}<span className="text-slate-400">›</span></span>
          </a>
        </li>
      ))}
    </ul>
  );
}
