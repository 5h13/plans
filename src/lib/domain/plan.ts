/** Plan control — same rules as desktop controlService (ADR-027). */
import type { Deliverable, Milestone, Project } from "../model";
import { DomainError, nextNo, today, uuid } from "../util";

const day = (d: string | null | undefined) => (d ? Date.parse(`${d}T00:00:00Z`) / 864e5 : null);
export const varianceDays = (baseline: string | null, current: string | null) => {
  const a = day(baseline);
  const b = day(current);
  return a === null || b === null ? null : Math.round(b - a);
};
export function weightedProgress(items: Array<{ weight: number; progress_percent: number }>): number {
  if (!items.length) return 0;
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return items.reduce((s, x) => s + x.progress_percent, 0) / items.length;
  return items.reduce((s, x) => s + x.weight * x.progress_percent, 0) / total;
}
const min = (xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
const max = (xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

export type DRow = Deliverable & { variance_days: number | null; schedule_status: "UNSET" | "LATE" | "AHEAD" | "ON TIME" };
export type MRow = Milestone & {
  deliverables: DRow[]; baseline_finish: string | null; planned_start: string | null; planned_finish: string | null; forecast_finish: string | null;
  actual_finish: string | null; progress_percent: number; budget: number; actual_cost: number; variance_days: number | null;
};

export function getPlan(p: Project) {
  const ds: DRow[] = [...p.deliverables]
    .filter((d) => !["cancelled", "superseded"].includes(d.state))
    .sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code))
    .map((d) => {
      const v = varianceDays(d.baseline_finish, d.actual_finish ?? d.forecast_finish ?? d.planned_finish);
      return { ...d, variance_days: v, schedule_status: v === null ? "UNSET" : v > 0 ? "LATE" : v < 0 ? "AHEAD" : "ON TIME" };
    });
  const milestones: MRow[] = [...p.milestones].sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code)).map((m) => {
    const items = ds.filter((d) => d.milestone_id === m.id);
    const forecast = max(items.map((d) => d.actual_finish ?? d.forecast_finish ?? d.planned_finish));
    const baseline = max(items.map((d) => d.baseline_finish));
    return {
      ...m, deliverables: items, baseline_finish: baseline, planned_start: min(items.map((d) => d.planned_start)), planned_finish: max(items.map((d) => d.planned_finish)),
      forecast_finish: forecast, actual_finish: items.length && items.every((d) => d.actual_finish) ? max(items.map((d) => d.actual_finish)) : null,
      progress_percent: items.length ? weightedProgress(items) : m.status === "COMPLETE" ? 100 : 0,
      budget: items.reduce((s, d) => s + d.budget, 0), actual_cost: items.reduce((s, d) => s + d.actual_cost, 0), variance_days: varianceDays(baseline, forecast),
    };
  });
  const unassigned = ds.filter((d) => !d.milestone_id || !p.milestones.some((m) => m.id === d.milestone_id));
  const project = {
    planned_start: min(ds.map((d) => d.planned_start)),
    planned_finish: max(ds.map((d) => d.planned_finish)),
    baseline_finish: max(ds.map((d) => d.baseline_finish)),
    forecast_finish: max(ds.map((d) => d.actual_finish ?? d.forecast_finish ?? d.planned_finish)),
    progress_percent: milestones.length
      ? weightedProgress([...milestones.map((m) => ({ weight: m.weight, progress_percent: m.progress_percent })), ...(unassigned.length ? [{ weight: 0, progress_percent: weightedProgress(unassigned) }] : [])])
      : weightedProgress(ds),
    budget: ds.reduce((s, d) => s + d.budget, 0),
    actual_cost: ds.reduce((s, d) => s + d.actual_cost, 0),
    deliverable_count: ds.length,
    done_count: ds.filter((d) => d.progress_percent >= 100).length,
  };
  return { milestones, unassigned, project: { ...project, variance_days: varianceDays(project.baseline_finish, project.forecast_finish) } };
}

const checkDates = (s?: string | null, f?: string | null) => {
  if (s && f && f < s) throw new DomainError("VALIDATION", "Finish date must be on or after the start date.");
};

export function addMilestone(p: Project, v: { name: string; phase?: string | null; weight?: number | null; gateCritical?: boolean }) {
  if (!v.name.trim()) throw new DomainError("VALIDATION", "Enter the milestone name.");
  const code = nextNo(p.milestones.map((m) => m.code), "M");
  p.milestones.push({
    id: uuid(), code, name: v.name.trim(), description: null, phase: v.phase || null, sequence: Math.max(0, ...p.milestones.map((m) => m.sequence)) + 10,
    weight: v.weight ?? 0, status: "NOT_STARTED", gate_critical: !!v.gateCritical,
  });
  return `${code} ${v.name}`;
}

export function updateMilestone(p: Project, id: string, v: Partial<Pick<Milestone, "name" | "phase" | "weight" | "status" | "gate_critical">>) {
  const m = p.milestones.find((x) => x.id === id);
  if (!m) throw new DomainError("NOT_FOUND", "Milestone not found.");
  if (v.name !== undefined && !v.name.trim()) throw new DomainError("VALIDATION", "The milestone needs a name.");
  Object.assign(m, v);
  return `${m.code} updated`;
}

export function addDeliverable(p: Project, v: { title: string; milestoneId?: string | null; weight?: number | null; budget?: number | null; responsibleName?: string | null; plannedStart?: string | null; plannedFinish?: string | null; measurement?: "PERCENT" | "QUANTITY"; quantityUnit?: string | null; quantityTotal?: number | null }) {
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Enter the deliverable title.");
  checkDates(v.plannedStart, v.plannedFinish);
  if (v.measurement === "QUANTITY" && !(v.quantityUnit && v.quantityTotal && v.quantityTotal > 0)) throw new DomainError("VALIDATION", "Quantity measurement needs a unit and a total.");
  const code = nextNo(p.deliverables.map((d) => d.code), "D");
  p.deliverables.push({
    id: uuid(), code, title: v.title.trim(), description: null, milestone_id: v.milestoneId || null, sequence: Math.max(0, ...p.deliverables.map((d) => d.sequence)) + 10,
    state: "not_started", weight: v.weight ?? 0, budget: v.budget ?? 0, actual_cost: 0, progress_percent: 0, measurement: v.measurement ?? "PERCENT",
    quantity_unit: v.measurement === "QUANTITY" ? v.quantityUnit ?? null : null, quantity_total: v.measurement === "QUANTITY" ? v.quantityTotal ?? null : null, quantity_done: null,
    responsible_name: v.responsibleName || null, baseline_start: null, baseline_finish: null, planned_start: v.plannedStart || null, planned_finish: v.plannedFinish || null,
    actual_start: null, actual_finish: null, forecast_finish: v.plannedFinish || null,
  });
  return `${code} ${v.title}`;
}

export function updateDeliverable(p: Project, id: string, v: Partial<Pick<Deliverable, "title" | "description" | "milestone_id" | "weight" | "budget" | "actual_cost" | "responsible_name" | "planned_start" | "planned_finish" | "actual_start" | "actual_finish" | "forecast_finish">>) {
  const d = p.deliverables.find((x) => x.id === id);
  if (!d) throw new DomainError("NOT_FOUND", "Deliverable not found.");
  checkDates(v.planned_start ?? d.planned_start, v.planned_finish ?? d.planned_finish);
  checkDates(v.actual_start ?? d.actual_start, v.actual_finish ?? d.actual_finish);
  if (v.title !== undefined && !v.title.trim()) throw new DomainError("VALIDATION", "The deliverable needs a title.");
  for (const k of ["weight", "budget", "actual_cost"] as const) if (v[k] != null && !((v[k] as number) >= 0)) throw new DomainError("VALIDATION", `${k.replace("_", " ")} must be zero or more.`);
  Object.assign(d, v);
  return `${d.code} saved`;
}

export function recordProgress(p: Project, id: string, v: { percent?: number | null; quantityDone?: number | null }, on = today()) {
  const d = p.deliverables.find((x) => x.id === id);
  if (!d) throw new DomainError("NOT_FOUND", "Deliverable not found.");
  let pct: number;
  if (d.measurement === "QUANTITY") {
    if (v.quantityDone == null || v.quantityDone < 0) throw new DomainError("VALIDATION", "Enter the quantity done.");
    d.quantity_done = v.quantityDone;
    pct = Math.min(100, (v.quantityDone / (d.quantity_total ?? 1)) * 100);
  } else {
    if (v.percent == null || v.percent < 0 || v.percent > 100) throw new DomainError("VALIDATION", "Progress must be between 0 and 100 %.");
    pct = v.percent;
  }
  d.progress_percent = pct;
  if (pct > 0) d.actual_start ??= on;
  d.actual_finish = pct >= 100 ? d.actual_finish ?? on : null;
  return `${d.code} ${Math.round(pct)} %`;
}

/** Copies planned dates into the baseline (r44 / desktop: baseline changes only by approval). */
export function setScheduleBaseline(p: Project, note: string) {
  const missing = p.deliverables.filter((d) => !d.planned_finish && !["cancelled", "superseded"].includes(d.state)).length;
  if (missing) throw new DomainError("INCOMPLETE", `${missing} deliverable(s) have no planned finish date.`);
  for (const d of p.deliverables) {
    d.baseline_start = d.planned_start;
    d.baseline_finish = d.planned_finish;
    d.forecast_finish ??= d.planned_finish;
  }
  return `Schedule baseline approved: ${note || "—"}`;
}
