/**
 * Project templates as data (ADR-034): create, copy, edit, validate, delete, reset, import, export, and
 * save a finished project as a template. No code changes are needed to add a kind of project.
 */
import type { DefinitionTextKey, Library, Project, ProjectTemplate, TemplateWorkPackage } from "../model";
import { BUILT_IN_TEMPLATES } from "../templates";
import { DomainError } from "../util";

export const TEMPLATE_FILE_FORMAT = "5h13-plans-template";
export const DEFINITION_KEYS: Array<{ key: DefinitionTextKey; label: string }> = [
  { key: "objective", label: "Objective" }, { key: "scope", label: "Scope" }, { key: "exclusions", label: "Exclusions" }, { key: "assumptions", label: "Assumptions" },
  { key: "required_capacity", label: "Required capacity" }, { key: "performance_criteria", label: "Performance criteria" }, { key: "operating_conditions", label: "Operating conditions" },
  { key: "site_conditions", label: "Site conditions" }, { key: "client_requirements", label: "Client requirements" }, { key: "interfaces_summary", label: "Interfaces" },
  { key: "acceptance_criteria", label: "Acceptance criteria" },
];

/** UPPER_SNAKE key from a label, unique among `taken`. */
export function keyFrom(label: string, taken: string[]): string {
  const base = label.toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "ITEM";
  let k = /^[A-Z]/.test(base) ? base : `X_${base}`;
  for (let i = 2; taken.includes(k); i++) k = `${base}_${i}`;
  return k;
}
const slug = (name: string, taken: string[]) => keyFrom(name, taken.map((t) => t.toUpperCase())).toLowerCase();

/** Everything that would make a template unusable, as sentences. Empty when it is fine. */
export function validateTemplate(t: ProjectTemplate, all: ProjectTemplate[] = []): string[] {
  const e: string[] = [];
  if (!t.name.trim()) e.push("The template needs a name.");
  if (all.some((x) => x.key !== t.key && x.name.trim().toLowerCase() === t.name.trim().toLowerCase())) e.push(`Another template is already called “${t.name}”.`);
  if (!t.stages.length) e.push("Add at least one stage.");
  if (!t.roles.length && t.workPackages.some((w) => w.effort.length)) e.push("Work items have hours but the template has no roles.");
  const dup = (xs: string[], what: string) => { const d = xs.find((x, i) => xs.indexOf(x) !== i); if (d) e.push(`Two ${what} have the same key (${d}).`); };
  dup(t.stages.map((s) => s.stage_key), "stages"); dup(t.roles.map((r) => r.role_key), "roles"); dup(t.drivers.map((d) => d.key), "drivers"); dup(t.workPackages.map((w) => w.wp_key), "work items");
  const stages = new Set(t.stages.map((s) => s.stage_key)), roles = new Set(t.roles.map((r) => r.role_key)), drivers = new Set(t.drivers.map((d) => d.key)), wps = new Set(t.workPackages.map((w) => w.wp_key));
  for (const s of t.stages) if (!s.name.trim()) e.push("Every stage needs a name.");
  for (const g of t.gates) {
    if (!stages.has(g.stage_key)) e.push(`Gate “${g.name}” belongs to a stage that no longer exists.`);
    if (!g.name.trim()) e.push("Every gate needs a name.");
  }
  for (const d of t.drivers) { if (!d.label.trim()) e.push("Every driver needs a name."); if (!(d.default >= 0)) e.push(`${d.label}: the default must be zero or more.`); }
  for (const r of t.roles) { if (!r.label.trim()) e.push("Every role needs a name."); if (!(r.default_allocation > 0 && r.default_allocation <= 1)) e.push(`${r.label}: allocation must be between 1 % and 100 %.`); }
  for (const w of t.workPackages) {
    const n = w.name || w.wp_key;
    if (!w.name.trim()) e.push("Every work item needs a name.");
    if (w.stage_key && !stages.has(w.stage_key)) e.push(`${n}: its stage no longer exists.`);
    for (const p of w.predecessors) if (!wps.has(p)) e.push(`${n}: it follows a work item that no longer exists.`);
    for (const x of w.effort) { if (!roles.has(x.role)) e.push(`${n}: hours for a role that no longer exists.`); if (x.per && !drivers.has(x.per.driver)) e.push(`${n}: hours per a driver that no longer exists.`); if (!(x.base >= 0)) e.push(`${n}: hours must be zero or more.`); }
    for (const c of w.costs) { if (c.per && !drivers.has(c.per.driver)) e.push(`${n}: a cost per a driver that no longer exists.`); if (!(c.unitCost >= 0) || !(c.base >= 0)) e.push(`${n}: quantities and prices must be zero or more.`); if (!c.label.trim()) e.push(`${n}: every cost line needs a name.`); }
    if (w.minDays != null && !(w.minDays >= 0)) e.push(`${n}: minimum days must be zero or more.`);
    if (w.fixedDays != null && !(w.fixedDays >= 1)) e.push(`${n}: a fixed duration must be at least 1 day.`);
  }
  // finish-to-start cycles
  const byKey = new Map(t.workPackages.map((w) => [w.wp_key, w]));
  const state = new Map<string, number>();
  const visit = (k: string): boolean => {
    if (state.get(k) === 1) return true;
    if (state.get(k) === 2) return false;
    state.set(k, 1);
    for (const p of byKey.get(k)?.predecessors ?? []) if (visit(p)) return true;
    state.set(k, 2);
    return false;
  };
  if (t.workPackages.some((w) => visit(w.wp_key))) e.push("Work items depend on each other in a circle.");
  if (t.method === "area_scaled" && !t.drivers.some((d) => d.fromProjectArea)) e.push("An area-based template needs a floor-area driver.");
  if (!t.sections.length) e.push("Choose at least one definition question.");
  return [...new Set(e)];
}

const blank = (name: string, key: string): ProjectTemplate => ({
  key, name, description: "", custom: true, basedOn: null, method: "lines", scheduling: "forward", calendar: "working", anchorLabel: "Start date",
  features: { location: true, size: false, codes: false, permit: false, scopeModel: false }, terms: { deliverable: "Deliverable", deliverables: "Deliverables" },
  sections: [{ key: "objective", label: "Objective", prompt: "What must the project achieve?" }, { key: "scope", label: "Scope", prompt: "What is included." }, { key: "exclusions", label: "Exclusions", prompt: "What is not included." }],
  criteriaLabel: "Requirements", criteriaCategories: [{ value_key: "REQUIREMENT", label: "Requirement" }, { value_key: "OTHER", label: "Other" }],
  drivers: [], roles: [{ role_key: "LEAD", label: "Lead", hourly_rate: null, default_people: 1, default_allocation: 1 }], factorSets: [],
  stages: [{ stage_key: "PLAN", sequence: 10, name: "Plan", purpose: "", typical_outputs: [], optional: false }, { stage_key: "DELIVER", sequence: 20, name: "Deliver", purpose: "", typical_outputs: [], optional: false }],
  gates: [{ gate_key: "DEFINED", stage_key: "PLAN", name: "Defined", purpose: "The definition is agreed.", criteria: [{ title: "Project definition confirmed", kind: "DEFINITION_CONFIRMED", required: true, blocking: true }] }],
  workPackages: [],
});

/** A new template: blank, or a copy of an existing one. */
export function createTemplate(lib: Library, name: string, fromKey?: string | null): ProjectTemplate {
  if (!name.trim()) throw new DomainError("VALIDATION", "Name the template.");
  const key = slug(name, lib.templates.map((t) => t.key));
  const src = fromKey ? lib.templates.find((t) => t.key === fromKey) : null;
  if (fromKey && !src) throw new DomainError("NOT_FOUND", "Template not found.");
  return src ? { ...structuredClone(src), key, name: name.trim(), custom: true, basedOn: src.key } : blank(name.trim(), key);
}

export function saveTemplate(lib: Library, t: ProjectTemplate) {
  const errors = validateTemplate(t, lib.templates);
  if (errors.length) throw new DomainError("TEMPLATE_INVALID", errors.join(" "));
  const tt = structuredClone(t);
  tt.stages.forEach((s, i) => (s.sequence = (i + 1) * 10));
  tt.workPackages.forEach((w, i) => (w.sequence = (i + 1) * 10));
  tt.custom = true; // a saved built-in counts as edited (it can be reset)
  const i = lib.templates.findIndex((x) => x.key === tt.key);
  if (i >= 0) lib.templates[i] = tt; else lib.templates.push(tt);
}

export function deleteTemplate(lib: Library, key: string, projects: Project[]) {
  if (BUILT_IN_TEMPLATES.some((b) => b.key === key)) throw new DomainError("BUILT_IN", "Built-in templates can't be deleted; reset it instead.");
  const used = projects.filter((p) => p.template_key === key);
  if (used.length) throw new DomainError("IN_USE", `${used.length} project(s) use this template (${used.slice(0, 3).map((p) => p.project_no).join(", ")}).`);
  lib.templates = lib.templates.filter((t) => t.key !== key);
}

export function resetTemplate(lib: Library, key: string) {
  const b = BUILT_IN_TEMPLATES.find((x) => x.key === key);
  if (!b) throw new DomainError("NOT_BUILT_IN", "Only built-in templates can be reset.");
  lib.templates = lib.templates.map((t) => (t.key === key ? structuredClone(b) : t));
}

export function templateFile(t: ProjectTemplate) {
  return { format: TEMPLATE_FILE_FORMAT, version: 1, exported_at: new Date().toISOString(), template: t };
}

/** A template from a file: checked, given a new key if this device already has one with that key. */
export function importTemplate(lib: Library, raw: unknown): ProjectTemplate {
  const f = raw as { format?: string; template?: ProjectTemplate };
  if (f?.format !== TEMPLATE_FILE_FORMAT || !f.template?.key) throw new DomainError("INVALID_IMPORT", "This is not a 5H13 Plans template file.");
  const t = structuredClone(f.template);
  t.custom = true;
  if (lib.templates.some((x) => x.key === t.key)) { t.key = slug(t.name, lib.templates.map((x) => x.key)); }
  if (lib.templates.some((x) => x.name.toLowerCase() === t.name.toLowerCase())) t.name = `${t.name} (imported)`;
  for (const k of ["stages", "gates", "drivers", "roles", "factorSets", "workPackages", "sections", "criteriaCategories"] as const) if (!Array.isArray(t[k])) (t as unknown as Record<string, unknown>)[k] = [];
  const errors = validateTemplate(t, lib.templates);
  if (errors.length) throw new DomainError("TEMPLATE_INVALID", errors.join(" "));
  return t;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/**
 * A template from a project: its milestones become stages, its plan items work items with their
 * durations, order and costs; hours come from the accepted estimate. Definition questions, drivers
 * and roles come from the project's template.
 */
export function templateFromProject(lib: Library, p: Project, name: string): ProjectTemplate {
  const base = lib.templates.find((t) => t.key === p.template_key) ?? lib.templates[0];
  const t = createTemplate(lib, name, base.key);
  t.description = `Made from ${p.project_no} ${p.name}.`;
  const ms = [...p.milestones].sort((a, b) => a.sequence - b.sequence);
  const mKey = new Map<string, string>();
  t.stages = ms.map((m, i) => { const k = keyFrom(m.name, ms.slice(0, i).map((x) => mKey.get(x.id)!)); mKey.set(m.id, k); return { stage_key: k, sequence: (i + 1) * 10, name: m.name, purpose: m.description ?? "", typical_outputs: [], optional: false }; });
  if (!t.stages.length) t.stages = base.stages.map((s) => ({ ...s }));
  const firstStage = t.stages[0].stage_key;
  t.gates = t.gates.filter((g) => t.stages.some((s) => s.stage_key === g.stage_key));
  if (!t.gates.length) t.gates = [{ gate_key: "DEFINED", stage_key: firstStage, name: "Defined", purpose: "The definition is agreed.", criteria: [{ title: "Project definition confirmed", kind: "DEFINITION_CONFIRMED", required: true, blocking: true }] }];
  const acc = p.estimates.find((e) => e.status === "ACCEPTED");
  const ds = p.deliverables.filter((d) => !["cancelled", "superseded"].includes(d.state)).sort((a, b) => a.sequence - b.sequence);
  const dKey = new Map<string, string>();
  ds.forEach((d) => dKey.set(d.id, keyFrom(d.title, [...dKey.values()])));
  const anchor = base.scheduling === "backward" ? p.definition.target_finish : p.definition.target_start;
  t.workPackages = ds.map((d, i): TemplateWorkPackage => {
    const start = d.baseline_start ?? d.planned_start, finish = d.baseline_finish ?? d.planned_finish;
    const days = start && finish ? Math.max(1, dayDiff(start, finish) + 1) : undefined;
    const effort = acc && d.wp_key ? acc.lines.filter((l) => l.wp_key === d.wp_key).map((l) => ({ role: l.role_key, base: Math.round(l.estimated_mh * 10) / 10 })) : [];
    const preds = p.links.filter((l) => l.relationship === "REQUIRES" && l.from_type === "DELIVERABLE" && l.from_id === d.id && l.to_type === "DELIVERABLE").map((l) => dKey.get(l.to_id)).filter((x): x is string => !!x);
    return {
      wp_key: dKey.get(d.id)!, name: d.title, sequence: (i + 1) * 10, stage_key: d.milestone_id ? mKey.get(d.milestone_id) ?? firstStage : firstStage, deliverable_title: d.title, predecessors: base.scheduling === "forward" ? preds : [],
      effort: effort.filter((x) => t.roles.some((r) => r.role_key === x.role)),
      costs: d.budget > 0 && !effort.length ? [{ label: "Budget", unit: "lot", base: 1, unitCost: d.budget }] : [],
      minDays: days, finishBeforeAnchorDays: base.scheduling === "backward" && anchor && finish ? dayDiff(finish, anchor) : undefined,
    };
  });
  t.method = "lines";
  t.drivers = t.drivers.filter((d) => !d.fromProjectArea);
  t.features = { ...t.features, size: false };
  return t;
}
