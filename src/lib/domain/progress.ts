/** Progress reports — same rules as desktop progressService (ADR-031). Mobile is single-user: approval is self-approval, recorded as such. */
import type { Project, ProgressReport } from "../model";
import { DomainError, nextNo, now, uuid } from "../util";
import { getPlan } from "./plan";

export function plannedPercent(start: string | null, finish: string | null, at: string): number | null {
  if (!finish) return null;
  const s = start ?? finish;
  if (at < s) return 0;
  if (at >= finish) return 100;
  const d = (x: string) => Date.parse(`${x}T00:00:00Z`) / 864e5;
  const span = d(finish) - d(s);
  return span <= 0 ? 100 : Math.round(((d(at) - d(s)) / span) * 1000) / 10;
}

const approvedSorted = (p: Project) => p.progressReports.filter((r) => r.status === "APPROVED").sort((a, b) => a.period_end.localeCompare(b.period_end) || (a.approved_at ?? "").localeCompare(b.approved_at ?? ""));

export function createReport(p: Project, v: { periodStart: string; periodEnd: string; narrative?: string | null }) {
  if (!v.periodStart || !v.periodEnd) throw new DomainError("VALIDATION", "Enter the reporting period.");
  if (v.periodEnd < v.periodStart) throw new DomainError("VALIDATION", "The period must end on or after it starts.");
  const open = p.progressReports.find((r) => r.status !== "APPROVED");
  if (open) throw new DomainError("OPEN_REPORT", `${open.report_no} is still open; approve or delete it first.`);
  const prev = approvedSorted(p).at(-1);
  if (prev && v.periodStart <= prev.period_end) throw new DomainError("VALIDATION", `The period must start after the previous report's period end (${prev.period_end}).`);
  const ds = p.deliverables.filter((d) => !["cancelled", "superseded"].includes(d.state)).sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code));
  if (!ds.length) throw new DomainError("INCOMPLETE", "There are no deliverables to report on yet.");
  const no = nextNo(p.progressReports.map((r) => r.report_no), "PRG");
  const r: ProgressReport = {
    id: uuid(), report_no: no, period_start: v.periodStart, period_end: v.periodEnd, status: "DRAFT", previous_report_id: prev?.id ?? null, narrative: v.narrative || null,
    returned_note: null, created_at: now(), approved_at: null, snapshot: null, snapshot_sha256: null,
    lines: ds.map((d) => {
      const pl = prev?.lines.find((l) => l.deliverable_id === d.id);
      return {
        deliverable_id: d.id, code: d.code, title: d.title, milestone_id: d.milestone_id, weight: d.weight, measurement: d.measurement, quantity_unit: d.quantity_unit, quantity_total: d.quantity_total,
        previous_pct: pl?.current_pct ?? 0, current_pct: d.progress_percent, previous_qty: pl?.current_qty ?? (d.measurement === "QUANTITY" ? 0 : null),
        current_qty: d.measurement === "QUANTITY" ? d.quantity_done ?? 0 : null, planned_pct: plannedPercent(d.baseline_start ?? d.planned_start, d.baseline_finish ?? d.planned_finish, v.periodEnd), remarks: null,
      };
    }),
  };
  p.progressReports.push(r);
  return `${no} ${v.periodStart} → ${v.periodEnd}`;
}

const report = (p: Project, id: string) => {
  const r = p.progressReports.find((x) => x.id === id);
  if (!r) throw new DomainError("NOT_FOUND", "Report not found.");
  return r;
};
const editable = (r: ProgressReport) => {
  if (!["DRAFT", "RETURNED"].includes(r.status)) throw new DomainError("INVALID_TRANSITION", `${r.report_no} is ${r.status.toLowerCase()}; it can no longer be edited.`);
};

export function updateLine(p: Project, reportId: string, deliverableId: string, v: { currentPct?: number | null; currentQty?: number | null; remarks?: string | null }) {
  const r = report(p, reportId);
  editable(r);
  const l = r.lines.find((x) => x.deliverable_id === deliverableId);
  if (!l) throw new DomainError("NOT_FOUND", "Line not found.");
  let pct = v.currentPct ?? undefined;
  if (l.measurement === "QUANTITY" && v.currentQty != null) {
    if (v.currentQty < 0) throw new DomainError("VALIDATION", "Quantity cannot be negative.");
    pct = Math.min(100, (v.currentQty / (l.quantity_total ?? 1)) * 100);
    l.current_qty = v.currentQty;
  }
  if (pct !== undefined && (pct < 0 || pct > 100)) throw new DomainError("VALIDATION", "Progress must be between 0 and 100 %.");
  if (pct !== undefined) l.current_pct = pct;
  if (v.remarks !== undefined) l.remarks = v.remarks || null;
  return `${l.code} ${Math.round(l.current_pct)} %`;
}

export function setNarrative(p: Project, reportId: string, narrative: string) {
  const r = report(p, reportId);
  editable(r);
  r.narrative = narrative || null;
  return `${r.report_no} narrative saved`;
}

export interface ReportException { code: "PROGRESS_REGRESSION" | "AHEAD_OF_PERIOD"; severity: "BLOCKING" | "WARNING"; deliverable_id: string; message: string }

export function reportView(r: ProgressReport) {
  const exceptions: ReportException[] = [];
  for (const l of r.lines) {
    if (l.current_pct < l.previous_pct && !l.remarks?.trim()) exceptions.push({ code: "PROGRESS_REGRESSION", severity: "BLOCKING", deliverable_id: l.deliverable_id, message: `${l.code} progress went down from ${l.previous_pct} % to ${l.current_pct} %; add a remark explaining why.` });
    if (l.planned_pct !== null && l.current_pct - l.planned_pct > 50) exceptions.push({ code: "AHEAD_OF_PERIOD", severity: "WARNING", deliverable_id: l.deliverable_id, message: `${l.code} reports ${Math.round(l.current_pct)} % against ${l.planned_pct} % planned — check it.` });
  }
  const weighted = (f: (l: ProgressReport["lines"][number]) => number) => {
    const tw = r.lines.reduce((t, l) => t + l.weight, 0);
    return r.lines.length ? (tw > 0 ? r.lines.reduce((t, l) => t + l.weight * f(l), 0) / tw : r.lines.reduce((t, l) => t + f(l), 0) / r.lines.length) : 0;
  };
  const summary = { previous: weighted((l) => l.previous_pct), current: weighted((l) => l.current_pct), planned: r.lines.some((l) => l.planned_pct !== null) ? weighted((l) => l.planned_pct ?? 0) : null };
  return { exceptions, summary: { ...summary, period: summary.current - summary.previous } };
}

export function submitReport(p: Project, id: string) {
  const r = report(p, id);
  editable(r);
  const blocking = reportView(r).exceptions.filter((e) => e.severity === "BLOCKING");
  if (blocking.length) throw new DomainError("REPORT_EXCEPTIONS", blocking.map((e) => e.message).join(" "));
  r.status = "SUBMITTED";
  return `${r.report_no} submitted`;
}

export function returnReport(p: Project, id: string, note: string) {
  const r = report(p, id);
  if (r.status !== "SUBMITTED") throw new DomainError("INVALID_TRANSITION", "Only a submitted report can be returned.");
  if (!note.trim()) throw new DomainError("VALIDATION", "Say what needs to change.");
  r.status = "RETURNED";
  r.returned_note = note.trim();
  return `${r.report_no} returned`;
}

/** Applies the report's progress to the deliverables and freezes the snapshot. The caller supplies its SHA-256 (async on the web). */
export function approveReport(p: Project, id: string, sha: (snapshot: unknown) => string | null = () => null) {
  const r = report(p, id);
  if (r.status !== "SUBMITTED") throw new DomainError("INVALID_TRANSITION", "Submit the report before approving it.");
  const view = reportView(r);
  if (view.exceptions.some((e) => e.severity === "BLOCKING")) throw new DomainError("REPORT_EXCEPTIONS", "Resolve the blocking exceptions first.");
  for (const l of r.lines) {
    const d = p.deliverables.find((x) => x.id === l.deliverable_id);
    if (!d) continue;
    d.progress_percent = l.current_pct;
    if (l.current_qty != null) d.quantity_done = l.current_qty;
    if (l.current_pct > 0) d.actual_start ??= r.period_end;
    if (l.current_pct >= 100) d.actual_finish ??= r.period_end;
  }
  const plan = getPlan(p);
  const prev = p.progressReports.find((x) => x.id === r.previous_report_id);
  const acc = p.estimates.find((e) => e.status === "ACCEPTED");
  r.snapshot = {
    report: { report_no: r.report_no, period_start: r.period_start, period_end: r.period_end, narrative: r.narrative, previous_report_no: prev?.report_no ?? null, approval: "self-approved (mobile)" },
    summary: view.summary,
    lines: r.lines,
    milestones: plan.milestones.map((m) => ({ id: m.id, code: m.code, name: m.name, weight: m.weight, progress_percent: m.progress_percent, baseline_finish: m.baseline_finish, forecast_finish: m.forecast_finish, variance_days: m.variance_days, budget: m.budget, actual_cost: m.actual_cost })),
    project: plan.project,
    approvedChanges: p.changes
      .filter((c) => ["approved", "closed", "verified"].includes(c.status) && (c.decided_at ?? c.initiated_at).slice(0, 10) <= r.period_end)
      .sort((a, b) => a.change_no.localeCompare(b.change_no))
      .map((c) => ({ change_no: c.change_no, change_class: c.change_class, change_type: c.change_type, title: c.title, status: c.status, cost_effect: c.cost_effect, schedule_effect_days: c.schedule_effect_days, decided_at: c.decided_at })),
    baselineEstimate: acc ? { estimate_no: acc.estimate_no, total_mh: acc.totals.totalMh } : null,
  };
  r.status = "APPROVED";
  r.approved_at = now();
  r.snapshot_sha256 = sha(r.snapshot);
  return `${r.report_no} approved: ${view.summary.current.toFixed(1)} %`;
}

export function deleteDraft(p: Project, id: string) {
  const r = report(p, id);
  if (r.status === "APPROVED") throw new DomainError("INVALID_TRANSITION", "An approved report is frozen and cannot be deleted.");
  p.progressReports = p.progressReports.filter((x) => x.id !== id);
  return `${r.report_no} deleted`;
}

type Snap = {
  report: { report_no: string; period_end: string };
  summary: { current: number; planned: number | null };
  lines: Array<{ deliverable_id: string; code: string; title: string; current_pct: number; planned_pct: number | null; remarks: string | null }>;
  milestones: Array<{ id: string; code: string; name: string; progress_percent: number; forecast_finish: string | null }>;
  project: { forecast_finish: string | null };
  approvedChanges: Array<{ change_no: string; title: string; cost_effect: number | null; schedule_effect_days: number | null }>;
};

export function compareReports(p: Project, fromId: string, toId: string) {
  const a = report(p, fromId), b = report(p, toId);
  if (a.status !== "APPROVED" || b.status !== "APPROVED") throw new DomainError("INVALID_TRANSITION", "Only approved (frozen) reports can be compared.");
  const [x, y] = (a.period_end <= b.period_end ? [a.snapshot, b.snapshot] : [b.snapshot, a.snapshot]) as [Snap, Snap];
  const ids = new Set([...x.lines.map((l) => l.deliverable_id), ...y.lines.map((l) => l.deliverable_id)]);
  const deliverables = [...ids].map((id) => {
    const u = x.lines.find((l) => l.deliverable_id === id), v = y.lines.find((l) => l.deliverable_id === id);
    const from = u?.current_pct ?? null, to = v?.current_pct ?? null, delta = (to ?? 0) - (from ?? 0);
    const status = !u ? "ADDED" : !v ? "REMOVED" : delta > 0 ? "ADVANCED" : delta < 0 ? "REGRESSED" : "UNCHANGED";
    return { code: (v ?? u)!.code, title: (v ?? u)!.title, from, to, delta, plannedTo: v?.planned_pct ?? null, status, remarks: v?.remarks ?? null };
  }).sort((m, n) => m.code.localeCompare(n.code));
  const mids = new Set([...x.milestones.map((m) => m.id), ...y.milestones.map((m) => m.id)]);
  const milestones = [...mids].map((id) => {
    const u = x.milestones.find((m) => m.id === id), v = y.milestones.find((m) => m.id === id);
    return { code: (v ?? u)!.code, name: (v ?? u)!.name, from: u?.progress_percent ?? null, to: v?.progress_percent ?? null, delta: (v?.progress_percent ?? 0) - (u?.progress_percent ?? 0), forecastFrom: u?.forecast_finish ?? null, forecastTo: v?.forecast_finish ?? null };
  });
  const before = new Set(x.approvedChanges.map((c) => c.change_no));
  return {
    from: x.report, to: y.report,
    project: { from: x.summary.current, to: y.summary.current, delta: y.summary.current - x.summary.current, plannedTo: y.summary.planned, forecastFrom: x.project.forecast_finish, forecastTo: y.project.forecast_finish },
    milestones, deliverables, changesAdded: y.approvedChanges.filter((c) => !before.has(c.change_no)),
  };
}
