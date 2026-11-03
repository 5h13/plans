/**
 * Estimate → plan, for any template (ADR-033).
 *
 *   effort_r  = (base + rate × driver) × size factor × factors      size factor = (A / A_ref)^e for area-scaled templates, else 1
 *   cost      = Σ qty × unit cost, qty = base + rate × driver;  labor cost = Σ effort_r × rate_r (when every rate is set)
 *   duration  = max(minimum days, slowest role: effort_r / (people_r × allocation_r × hours/day))
 *   dates     = forward (finish-to-start from the start date) or backward (finish N days before the event date)
 */
import { addWorkingDays, durationDays, nextWorkingDay, sizeFactor } from "../../shared/estimation/method";
import type { CostLine, Estimate, EstimateLine, Library, Project, ProjectTemplate, TemplateWorkPackage } from "../model";
import { templateOf } from "../seed";
import { DomainError, nextNo, now, today, uuid } from "../util";
import { link } from "./registers";
import { setScheduleBaseline } from "./plan";

export const METHOD_VERSION = "plans-template/2.0.0";

export function staffingOf(p: Project, lib: Library) {
  return Object.fromEntries(templateOf(lib, p).roles.map((r) => [r.role_key, p.staffing[r.role_key] ?? { people: r.default_people, allocation: r.default_allocation }]));
}
export function setStaffing(p: Project, roleKey: string, people: number, allocation: number) {
  if (!(people >= 0) || !(allocation > 0 && allocation <= 1)) throw new DomainError("VALIDATION", "People must be ≥ 0 and allocation between 1 % and 100 %.");
  p.staffing[roleKey] = { people, allocation };
  return `Staffing ${roleKey.toLowerCase()}: ${people} × ${Math.round(allocation * 100)} %`;
}

/** Driver values for a project: stored values, the project's floor area for area drivers, else template defaults. */
export function driversOf(p: Project, t: ProjectTemplate): Record<string, number> {
  return Object.fromEntries(t.drivers.map((d) => [d.key, p.drivers?.[d.key] ?? (d.fromProjectArea && p.gross_floor_area_m2 ? p.gross_floor_area_m2 : d.default)]));
}
export function setDrivers(p: Project, lib: Library, values: Record<string, number | null>) {
  const t = templateOf(lib, p);
  for (const d of t.drivers) {
    const v = values[d.key];
    if (v == null) continue;
    if (!(v >= 0)) throw new DomainError("VALIDATION", `${d.label} must be zero or more.`);
    p.drivers[d.key] = v;
    if (d.fromProjectArea && v > 0) p.gross_floor_area_m2 = v;
  }
  return "Drivers saved";
}

const qty = (base: number, per: { driver: string; rate: number } | undefined, drivers: Record<string, number>) => base + (per ? per.rate * (drivers[per.driver] ?? 0) : 0);

export function compute(t: Pick<ProjectTemplate, "method" | "referenceArea" | "drivers" | "roles">, wps: TemplateWorkPackage[], drivers: Record<string, number>, factor: number, rates: Record<string, number | null>) {
  const areaKey = t.drivers.find((d) => d.fromProjectArea)?.key;
  if (t.method === "area_scaled" && !(areaKey && drivers[areaKey] > 0)) throw new DomainError("INCOMPLETE", "Enter the floor area first.");
  const lines: EstimateLine[] = [];
  const costLines: CostLine[] = [];
  for (const w of [...wps].sort((a, b) => a.sequence - b.sequence)) {
    const sf = t.method === "area_scaled" ? sizeFactor(drivers[areaKey!], t.referenceArea ?? 5000, w.exponent ?? 1) : 1;
    const byRole = new Map<string, { base: number; driver: number }>();
    for (const e of w.effort) {
      const cur = byRole.get(e.role) ?? { base: 0, driver: 0 };
      cur.base += e.base;
      cur.driver += qty(0, e.per, drivers);
      byRole.set(e.role, cur);
    }
    for (const [role_key, v] of byRole) {
      const mh = (v.base + v.driver) * sf * factor;
      if (mh > 0) lines.push({ wp_key: w.wp_key, wp_name: w.name, role_key, base_mh: v.base, driver_mh: v.driver, size_factor: sf, factor, estimated_mh: mh });
    }
    for (const c of w.costs) {
      const q = qty(c.base, c.per, drivers);
      if (q > 0) costLines.push({ wp_key: w.wp_key, wp_name: w.name, label: c.label, unit: c.unit, qty: q, unit_cost: c.unitCost, amount: q * c.unitCost });
    }
  }
  const byRole: Record<string, number> = {};
  const byPackage: Record<string, number> = {};
  const costByPackage: Record<string, number> = {};
  for (const l of lines) {
    byRole[l.role_key] = (byRole[l.role_key] ?? 0) + l.estimated_mh;
    byPackage[l.wp_key] = (byPackage[l.wp_key] ?? 0) + l.estimated_mh;
  }
  for (const c of costLines) costByPackage[c.wp_key] = (costByPackage[c.wp_key] ?? 0) + c.amount;
  const missingRates = Object.keys(byRole).filter((r) => rates[r] == null);
  const laborCost = missingRates.length ? null : Object.entries(byRole).reduce((s, [r, h]) => s + h * (rates[r] as number), 0);
  const otherCost = costLines.reduce((s, c) => s + c.amount, 0);
  const totalMh = Object.values(byRole).reduce((a, b) => a + b, 0);
  return { lines, costLines, totals: { byRole, byPackage, totalMh, laborCost, otherCost, cost: laborCost == null ? null : laborCost + otherCost, costByPackage, missingRates } };
}

export function calculateEstimate(p: Project, lib: Library, v: { factors?: Record<string, string>; anchor?: string | null; note?: string | null }) {
  const t = templateOf(lib, p);
  if (!t.workPackages.length) throw new DomainError("INCOMPLETE", `The ${t.name} template has no starter work. Add milestones and ${t.terms.deliverables.toLowerCase()} on the Plan page.`);
  const settings = lib.settings!;
  const drivers = driversOf(p, t);
  const factors: Estimate["inputs"]["factors"] = {};
  for (const fs of t.factorSets) {
    const key = v.factors?.[fs.set];
    const f = (key ? fs.values.find((x) => x.key === key) : null) ?? fs.values.find((x) => x.is_default) ?? fs.values[0];
    if (f) factors[fs.set] = { key: f.key, label: f.label, factor: f.factor };
  }
  const factor = Object.values(factors).reduce((a, f) => a * f.factor, 1);
  const rates = Object.fromEntries(t.roles.map((r) => [r.role_key, r.hourly_rate]));
  const r = compute(t, t.workPackages, drivers, factor, rates);
  const anchor = v.anchor || (t.scheduling === "backward" ? p.definition.target_finish : p.definition.target_start) || today();
  for (const e of p.estimates) if (e.status === "DRAFT") e.status = "SUPERSEDED";
  const no = nextNo(p.estimates.map((e) => e.estimate_no), "EST");
  p.estimates.push({
    id: uuid(), estimate_no: no, status: "DRAFT", method_version: METHOD_VERSION, created_at: now(), accepted_at: null, note: v.note || null,
    inputs: {
      templateKey: t.key, templateName: t.name, method: t.method, scheduling: t.scheduling, calendar: t.calendar, anchor, drivers, referenceArea: t.referenceArea ?? null,
      currency: p.currency, factors, rates, staffing: staffingOf(p, lib),
      workingTime: { hoursPerDay: settings.hoursPerDay, daysPerWeek: settings.daysPerWeek, workingDaysPerMonth: settings.workingDaysPerMonth },
      workPackages: structuredClone(t.workPackages),
    },
    ...r,
  });
  return `${no}: ${r.totals.totalMh.toFixed(1)} h${r.totals.otherCost ? `, ${p.currency} ${Math.round(r.totals.otherCost).toLocaleString("en-PH")} costs` : ""}`;
}

export function byPackageRole(e: Estimate) {
  const out: Record<string, Record<string, number>> = {};
  for (const l of e.lines) (out[l.wp_key] ??= {})[l.role_key] = (out[l.wp_key][l.role_key] ?? 0) + l.estimated_mh;
  return out;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Dates for each work package that has effort or costs. */
export function previewSchedule(e: Estimate) {
  const byPkg = byPackageRole(e);
  const used = e.inputs.workPackages.filter((w) => byPkg[w.wp_key] || e.costLines.some((c) => c.wp_key === w.wp_key));
  const dpw = e.inputs.calendar === "calendar" ? 7 : e.inputs.workingTime.daysPerWeek;
  try {
    const days = Object.fromEntries(used.map((w) => [w.wp_key, w.fixedDays ?? Math.max(w.minDays ?? 0, durationDays(byPkg[w.wp_key] ?? {}, e.inputs.staffing, e.inputs.workingTime.hoursPerDay), 1)]));
    const dates: Record<string, { start: string; finish: string; days: number }> = {};
    if (e.inputs.scheduling === "backward") {
      for (const w of used) {
        const finish = addDays(e.inputs.anchor, -(w.finishBeforeAnchorDays ?? 0));
        dates[w.wp_key] = { start: addDays(finish, -(Math.ceil(days[w.wp_key]) - 1)), finish, days: days[w.wp_key] };
      }
    } else {
      const keys = new Set(used.map((w) => w.wp_key));
      const visiting = new Set<string>();
      const visit = (w: TemplateWorkPackage): { start: string; finish: string; days: number } => {
        if (dates[w.wp_key]) return dates[w.wp_key];
        if (visiting.has(w.wp_key)) throw new RangeError(`Circular dependency at ${w.name}.`);
        visiting.add(w.wp_key);
        let start = e.inputs.anchor;
        for (const pre of w.predecessors.filter((k) => keys.has(k))) {
          const s = nextWorkingDay(visit(used.find((x) => x.wp_key === pre)!).finish, dpw);
          if (s > start) start = s;
        }
        dates[w.wp_key] = { start: addWorkingDays(start, 1, dpw), finish: addWorkingDays(start, days[w.wp_key], dpw), days: days[w.wp_key] };
        visiting.delete(w.wp_key);
        return dates[w.wp_key];
      };
      for (const w of used) visit(w);
    }
    return { ok: true as const, byPkg, used, dates };
  } catch (err) {
    return { ok: false as const, byPkg, used, error: (err as Error).message };
  }
}

export function generatePlan(p: Project, lib: Library, estimateId: string) {
  const e = p.estimates.find((x) => x.id === estimateId);
  if (!e) throw new DomainError("NOT_FOUND", "Estimate not found.");
  if (e.status === "SUPERSEDED") throw new DomainError("INVALID_TRANSITION", "This estimate has been superseded; use the latest one.");
  if (p.deliverables.some((d) => d.source_estimate_id)) throw new DomainError("ALREADY_GENERATED", "A plan has already been generated for this project. Edit it on the Plan page.");
  const sch = previewSchedule(e);
  if (!sch.ok) throw new DomainError("INCOMPLETE", sch.error);
  const t = templateOf(lib, p);
  const used = [...sch.used].sort((a, b) => a.sequence - b.sequence);
  const msIds: Record<string, string> = {};
  let seq = Math.max(0, ...p.milestones.map((m) => m.sequence));
  for (const s of [...t.stages].sort((a, b) => a.sequence - b.sequence).filter((s) => used.some((w) => w.stage_key === s.stage_key))) {
    const ws = used.filter((w) => w.stage_key === s.stage_key);
    const weight = ws.reduce((x, w) => x + (e.totals.byPackage[w.wp_key] ?? 0), 0) || ws.length;
    const id = uuid();
    p.milestones.push({ id, code: nextNo(p.milestones.map((m) => m.code), "M"), name: s.name, description: null, phase: s.name, sequence: (seq += 10), weight: Math.round(weight * 10) / 10, status: "NOT_STARTED", gate_critical: false, source_estimate_id: e.id });
    msIds[s.stage_key] = id;
  }
  const ids: Record<string, string> = {};
  for (const w of used) {
    const roleMh = sch.byPkg[w.wp_key] ?? {};
    const mh = Object.values(roleMh).reduce((a, b) => a + b, 0);
    const missing = Object.keys(roleMh).some((r) => e.inputs.rates[r] == null);
    const labor = missing ? 0 : Object.entries(roleMh).reduce((s, [r, h]) => s + h * (e.inputs.rates[r] as number), 0);
    const other = e.totals.costByPackage[w.wp_key] ?? 0;
    const costs = e.costLines.filter((c) => c.wp_key === w.wp_key);
    const dt = sch.dates[w.wp_key];
    const id = uuid();
    p.deliverables.push({
      id, code: nextNo(p.deliverables.map((d) => d.code), "D"), title: w.deliverable_title ?? w.name,
      description: [
        mh ? `${w.name}: ${mh.toFixed(1)} h (${Object.entries(roleMh).map(([r, h]) => `${(t.roles.find((x) => x.role_key === r)?.label ?? r).toLowerCase()} ${h.toFixed(1)}`).join(", ")})` : w.name,
        ...costs.map((c) => `${c.label}: ${c.qty.toLocaleString("en-PH")} ${c.unit} × ${c.unit_cost.toLocaleString("en-PH")}`),
        `from ${e.estimate_no}${missing && mh ? "; labour cost not established (no rates)" : ""}`,
      ].join("; "),
      milestone_id: w.stage_key ? msIds[w.stage_key] ?? null : null, sequence: w.sequence, state: "not_started", weight: Math.round((mh || 1) * 10) / 10, budget: Math.round(labor + other), actual_cost: 0, progress_percent: 0,
      measurement: "PERCENT", quantity_unit: null, quantity_total: null, quantity_done: null, responsible_name: null,
      baseline_start: null, baseline_finish: null, planned_start: dt.start, planned_finish: dt.finish, actual_start: null, actual_finish: null, forecast_finish: dt.finish,
      source_estimate_id: e.id, wp_key: w.wp_key,
    });
    ids[w.wp_key] = id;
  }
  if (e.inputs.scheduling === "forward") for (const w of used) for (const pre of w.predecessors) if (ids[pre]) link(p, { type: "DELIVERABLE", id: ids[w.wp_key] }, { type: "DELIVERABLE", id: ids[pre] }, "REQUIRES", "finish-to-start");
  return `${used.length} ${t.terms.deliverables.toLowerCase()}, ${Object.keys(msIds).length} milestones from ${e.estimate_no}`;
}

/** Accepts the estimate and its generated plan as the baseline (self-approved on mobile). The caller saves a revision afterwards. */
export function acceptAsBaseline(p: Project, estimateId: string) {
  const e = p.estimates.find((x) => x.id === estimateId);
  if (!e) throw new DomainError("NOT_FOUND", "Estimate not found.");
  if (e.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", `${e.estimate_no} is ${e.status.toLowerCase()}.`);
  if (!p.deliverables.some((d) => d.source_estimate_id === e.id)) throw new DomainError("INCOMPLETE", "Generate the plan from this estimate before accepting it as the baseline.");
  for (const x of p.estimates) if (x.status === "ACCEPTED") x.status = "SUPERSEDED";
  e.status = "ACCEPTED";
  e.accepted_at = now();
  setScheduleBaseline(p, `${e.estimate_no} accepted`);
  return `${e.estimate_no} accepted as baseline`;
}

// ---------------------------------------------------------------- effort tracking
export function recordActual(p: Project, v: { wpKey: string; roleKey: string; kind: "INITIAL" | "ITERATION"; hours: number | null; workDate?: string | null; note?: string | null }) {
  if (!(v.hours && v.hours > 0)) throw new DomainError("VALIDATION", "Hours must be more than zero.");
  p.mhActuals.push({ id: uuid(), wp_key: v.wpKey, role_key: v.roleKey, kind: v.kind, hours: v.hours, work_date: v.workDate || today(), note: v.note || null });
  return `${v.hours} h ${v.kind === "INITIAL" ? "work" : "rework"} on ${v.wpKey}`;
}
export function setForecast(p: Project, wpKey: string, roleKey: string, mh: number | null) {
  if (mh == null || !(mh >= 0)) throw new DomainError("VALIDATION", "Forecast must be zero or more.");
  p.mhForecasts[`${wpKey}|${roleKey}`] = mh;
  return `Forecast ${wpKey} ${roleKey.toLowerCase()}: ${mh} h`;
}
export function mhSummary(p: Project) {
  const acc = p.estimates.find((e) => e.status === "ACCEPTED");
  const planned: Record<string, number> = {};
  if (acc) for (const l of acc.lines) planned[`${l.wp_key}|${l.role_key}`] = (planned[`${l.wp_key}|${l.role_key}`] ?? 0) + l.estimated_mh;
  const act: Record<string, { i: number; it: number }> = {};
  for (const a of p.mhActuals) {
    const k = `${a.wp_key}|${a.role_key}`;
    act[k] ??= { i: 0, it: 0 };
    if (a.kind === "INITIAL") act[k].i += a.hours; else act[k].it += a.hours;
  }
  const keys = [...new Set([...Object.keys(planned), ...Object.keys(p.mhForecasts), ...Object.keys(act)])];
  const rows = keys.map((k) => {
    const [wp_key, role_key] = k.split("|");
    const pl = planned[k] ?? 0;
    return { wp_key, role_key, planned: pl, forecast: p.mhForecasts[k] ?? pl, actual_initial: act[k]?.i ?? 0, actual_iteration: act[k]?.it ?? 0, actual_total: (act[k]?.i ?? 0) + (act[k]?.it ?? 0) };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  return { accepted: acc ?? null, rows, totals: { planned: sum((r) => r.planned), forecast: sum((r) => r.forecast), actual_initial: sum((r) => r.actual_initial), actual_iteration: sum((r) => r.actual_iteration) } };
}

// ---------------------------------------------------------------- template editing (this device's library)
const tpl = (lib: Library, key: string) => {
  const t = lib.templates.find((x) => x.key === key);
  if (!t) throw new DomainError("NOT_FOUND", "Template not found.");
  return t;
};
const wpOf = (lib: Library, key: string, wpKey: string) => {
  const w = tpl(lib, key).workPackages.find((x) => x.wp_key === wpKey);
  if (!w) throw new DomainError("NOT_FOUND", "Work package not found.");
  return w;
};
export function setRate(lib: Library, key: string, roleKey: string, rate: number | null) {
  if (rate !== null && !(rate >= 0)) throw new DomainError("VALIDATION", "Rates must be zero or more.");
  const r = tpl(lib, key).roles.find((x) => x.role_key === roleKey);
  if (!r) throw new DomainError("NOT_FOUND", "Role not found.");
  r.hourly_rate = rate;
}
export function setFactor(lib: Library, key: string, set: string, valueKey: string, factor: number) {
  if (!(factor > 0)) throw new DomainError("VALIDATION", "Factors must be greater than zero.");
  const f = tpl(lib, key).factorSets.find((s) => s.set === set)?.values.find((v) => v.key === valueKey);
  if (!f) throw new DomainError("NOT_FOUND", "Factor not found.");
  f.factor = factor;
}
export function setReferenceArea(lib: Library, key: string, m2: number) {
  if (!(m2 > 0)) throw new DomainError("VALIDATION", "The reference area must be positive.");
  tpl(lib, key).referenceArea = m2;
}
export function setWorkPackage(lib: Library, key: string, wpKey: string, v: { exponent?: number | null; minDays?: number | null; finishBeforeAnchorDays?: number | null; effort: Array<{ base: number; rate?: number | null }>; costs: Array<{ base: number; rate?: number | null; unitCost: number }> }) {
  const w = wpOf(lib, key, wpKey);
  if (v.exponent != null) {
    if (!(v.exponent >= 0 && v.exponent <= 2)) throw new DomainError("VALIDATION", "Exponents must be between 0 and 2.");
    w.exponent = v.exponent;
  }
  if (v.minDays != null) {
    if (!(v.minDays >= 0)) throw new DomainError("VALIDATION", "Minimum days must be zero or more.");
    w.minDays = v.minDays;
  }
  if (v.finishBeforeAnchorDays != null) w.finishBeforeAnchorDays = v.finishBeforeAnchorDays;
  v.effort.forEach((e, i) => {
    if (!(e.base >= 0) || (e.rate != null && !(e.rate >= 0))) throw new DomainError("VALIDATION", "Hours must be zero or more.");
    w.effort[i].base = e.base;
    if (e.rate != null && w.effort[i].per) w.effort[i].per!.rate = e.rate;
  });
  v.costs.forEach((c, i) => {
    if (!(c.base >= 0) || !(c.unitCost >= 0) || (c.rate != null && !(c.rate >= 0))) throw new DomainError("VALIDATION", "Quantities and prices must be zero or more.");
    w.costs[i].base = c.base;
    w.costs[i].unitCost = c.unitCost;
    if (c.rate != null && w.costs[i].per) w.costs[i].per!.rate = c.rate;
  });
}
