/**
 * Man-hour estimation method (execution model §9–13). Pure functions; no database.
 *
 *   SizeFactor_i   = (A / A_ref) ^ e_i                 (area driver; other drivers inactive → 1.0)
 *   EstimatedMH_ir = BaseMH_ir × SizeFactor_i × F_system × F_complexity × F_deliverable × F_BIM × F_other
 *
 * Seed values are editable defaults, not industry norms.
 */
export const METHOD_VERSION = "mh-scaling/1.0.0";

export interface WorkPackage {
  wp_key: string;
  name: string;
  sequence: number;
  exponent: number;
  stage_key: string | null;
  deliverable_title: string | null;
  predecessors: string[];
  base: Record<string, number>; // role → base MH
}

export interface EstimateInputs {
  areaM2: number;
  referenceAreaM2: number;
  systemFactor: number;
  complexityFactor: number;
  deliverableFactor: number;
  bimFactor: number;
  otherFactor?: number;
}

export interface EstimateLine {
  wp_key: string;
  wp_name: string;
  role_key: string;
  base_mh: number;
  exponent: number;
  size_factor: number;
  system_factor: number;
  complexity_factor: number;
  deliverable_factor: number;
  bim_factor: number;
  other_factor: number;
  estimated_mh: number;
}

export function sizeFactor(areaM2: number, referenceAreaM2: number, exponent: number): number {
  if (!(areaM2 > 0) || !(referenceAreaM2 > 0)) throw new RangeError("Area and reference area must be positive.");
  return Math.pow(areaM2 / referenceAreaM2, exponent);
}

export function estimate(wps: WorkPackage[], roles: string[], x: EstimateInputs): EstimateLine[] {
  const other = x.otherFactor ?? 1;
  const lines: EstimateLine[] = [];
  for (const wp of [...wps].sort((a, b) => a.sequence - b.sequence)) {
    const sf = sizeFactor(x.areaM2, x.referenceAreaM2, wp.exponent);
    for (const role of roles) {
      const base = wp.base[role] ?? 0;
      if (base === 0) continue;
      lines.push({
        wp_key: wp.wp_key,
        wp_name: wp.name,
        role_key: role,
        base_mh: base,
        exponent: wp.exponent,
        size_factor: sf,
        system_factor: x.systemFactor,
        complexity_factor: x.complexityFactor,
        deliverable_factor: x.deliverableFactor,
        bim_factor: x.bimFactor,
        other_factor: other,
        estimated_mh: base * sf * x.systemFactor * x.complexityFactor * x.deliverableFactor * x.bimFactor * other,
      });
    }
  }
  return lines;
}

export function totals(lines: EstimateLine[], rates: Record<string, number | null>) {
  const byRole: Record<string, number> = {};
  const byPackage: Record<string, number> = {};
  for (const l of lines) {
    byRole[l.role_key] = (byRole[l.role_key] ?? 0) + l.estimated_mh;
    byPackage[l.wp_key] = (byPackage[l.wp_key] ?? 0) + l.estimated_mh;
  }
  const total = Object.values(byRole).reduce((a, b) => a + b, 0);
  const missingRates = Object.keys(byRole).filter((r) => rates[r] == null);
  const cost = missingRates.length ? null : Object.entries(byRole).reduce((t, [r, mh]) => t + mh * (rates[r] as number), 0);
  return { byRole, byPackage, totalMh: total, cost, missingRates };
}

/** Calendar helpers on ISO dates (UTC), working Monday–Friday when daysPerWeek = 5. */
export function addWorkingDays(start: string, days: number, daysPerWeek: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  const working = (x: Date) => daysPerWeek >= 7 || (daysPerWeek === 6 ? x.getUTCDay() !== 0 : x.getUTCDay() !== 0 && x.getUTCDay() !== 6);
  while (!working(d)) d.setUTCDate(d.getUTCDate() + 1);
  let left = Math.max(1, Math.ceil(days)) - 1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (working(d)) left--;
  }
  return d.toISOString().slice(0, 10);
}

export function nextWorkingDay(date: string, daysPerWeek: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return addWorkingDays(d.toISOString().slice(0, 10), 1, daysPerWeek);
}

export interface Staffing {
  [role: string]: { people: number; allocation: number };
}

/** Duration of a package = the slowest role: MH_r / (people_r × allocation_r × hours/day). */
export function durationDays(mhByRole: Record<string, number>, staffing: Staffing, hoursPerDay: number): number {
  let days = 0;
  for (const [role, mh] of Object.entries(mhByRole)) {
    if (mh <= 0) continue;
    const s = staffing[role];
    const rate = s ? s.people * s.allocation * hoursPerDay : 0;
    if (!(rate > 0)) throw new RangeError(`No ${role.toLowerCase().replace("_", "/")} staffing for work that needs ${mh.toFixed(1)} MH.`);
    days = Math.max(days, mh / rate);
  }
  return days;
}

/**
 * Forward-pass schedule: a package starts the working day after its latest predecessor
 * finishes (finish-to-start), or on the project start.
 */
export function schedule(
  wps: WorkPackage[],
  mhByPackageRole: Record<string, Record<string, number>>,
  staffing: Staffing,
  opts: { start: string; hoursPerDay: number; daysPerWeek: number },
) {
  const out: Record<string, { start: string; finish: string; days: number }> = {};
  const keys = new Set(wps.map((w) => w.wp_key));
  const visiting = new Set<string>();
  const visit = (wp: WorkPackage): { start: string; finish: string; days: number } => {
    if (out[wp.wp_key]) return out[wp.wp_key];
    if (visiting.has(wp.wp_key)) throw new RangeError(`Circular dependency at ${wp.name}.`);
    visiting.add(wp.wp_key);
    let start = opts.start;
    for (const p of wp.predecessors.filter((x) => keys.has(x))) {
      const f = visit(wps.find((w) => w.wp_key === p)!).finish;
      const s = nextWorkingDay(f, opts.daysPerWeek);
      if (s > start) start = s;
    }
    const days = durationDays(mhByPackageRole[wp.wp_key] ?? {}, staffing, opts.hoursPerDay);
    const r = { start: addWorkingDays(start, 1, opts.daysPerWeek), finish: addWorkingDays(start, days, opts.daysPerWeek), days };
    out[wp.wp_key] = r;
    visiting.delete(wp.wp_key);
    return r;
  };
  for (const wp of wps) visit(wp);
  return out;
}
