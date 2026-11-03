import seed from "./seed.json";
import type { CodeSource, Library, Option, Project, ProjectTemplate } from "./model";
import { BUILT_IN_TEMPLATES } from "./templates";

/** Statutory defaults for Philippine projects (used by templates with a code basis). */
const DEFAULT_ROLE: Record<string, "design" | "statutory"> = {
  "21000000-0000-4000-8000-000000000101": "statutory",
  "21000000-0000-4000-8000-000000000102": "statutory",
  "21000000-0000-4000-8000-000000000103": "statutory",
  "21000000-0000-4000-8000-000000000001": "design",
  "21000000-0000-4000-8000-000000000104": "design",
  "21000000-0000-4000-8000-000000000105": "design",
  "21000000-0000-4000-8000-000000000106": "design",
};

export const LIBRARY_VERSION = 2;

/** The Plans library: settings, option lists, a code list and the project templates. Plans owns this data. */
export function seedLibrary(): Library {
  return {
    schema: "5h13-plans-pwa-library",
    version: LIBRARY_VERSION,
    settings: null,
    options: seed.options as Record<string, Option[]>,
    codes: (seed.codes as CodeSource[]).map((c) => ({ ...c, defaultRole: DEFAULT_ROLE[c.id] })),
    templates: structuredClone(BUILT_IN_TEMPLATES),
  };
}

/** Library v1 (one HVAC library) → v2 (templates). Keeps the owner's settings. */
export function migrateLibrary(lib: Library & { estimating?: unknown; stageTemplate?: unknown }): Library {
  if (!((lib.version ?? 1) >= LIBRARY_VERSION && Array.isArray(lib.templates))) return { ...seedLibrary(), settings: lib.settings ?? null };
  // Built-in templates the owner hasn't edited follow the app's current version; new built-ins are added.
  const fresh = BUILT_IN_TEMPLATES.map((b) => {
    const mine = lib.templates.find((t) => t.key === b.key);
    return mine?.custom ? mine : structuredClone(b);
  });
  const own = lib.templates.filter((t) => !BUILT_IN_TEMPLATES.some((b) => b.key === t.key));
  const templates = [...fresh, ...own];
  return JSON.stringify(templates) === JSON.stringify(lib.templates) ? lib : { ...lib, templates };
}

export function templateOf(lib: Library, p: Pick<Project, "template_key">): ProjectTemplate {
  return lib.templates.find((t) => t.key === p.template_key) ?? lib.templates.find((t) => t.key === "general") ?? BUILT_IN_TEMPLATES[0];
}

/** Projects created before templates were engineering design projects. */
export function migrateProject(p: Project): Project {
  if (p.template_key && p.drivers) return p;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = structuredClone(p) as any;
  x.template_key ??= "engineering_design";
  x.drivers ??= p.gross_floor_area_m2 ? { AREA: p.gross_floor_area_m2 } : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  x.estimates = (x.estimates ?? []).map((e: any) => {
    if (e.inputs?.templateKey) return e;
    const i = e.inputs ?? {};
    const factors: Record<string, { key: string; label: string; factor: number }> = {};
    for (const [k, set] of [["system", "SYSTEM"], ["complexity", "COMPLEXITY"], ["deliverable", "DELIVERABLE"], ["bim", "BIM_COORDINATION"]] as const) if (i[k]) factors[set] = i[k];
    const f = Object.values(factors).reduce((t, v) => t * v.factor, 1);
    return {
      ...e,
      inputs: {
        templateKey: "engineering_design", templateName: "Building services design (area-based)", method: "area_scaled", scheduling: "forward", calendar: "working",
        anchor: i.start, drivers: { AREA: i.areaM2 }, referenceArea: i.referenceAreaM2, currency: i.currency, factors, rates: i.rates ?? {}, staffing: i.staffing ?? {}, workingTime: i.workingTime,
        workPackages: (i.workPackages ?? []).map((w: Record<string, any>) => ({ wp_key: w.wp_key, name: w.name, sequence: w.sequence, stage_key: w.stage_key, deliverable_title: w.deliverable_title, predecessors: w.predecessors ?? [], exponent: w.exponent, effort: Object.entries(w.base ?? {}).map(([role, base]) => ({ role, base })), costs: [] })), // eslint-disable-line @typescript-eslint/no-explicit-any
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: (e.lines ?? []).map((l: any) => ({ wp_key: l.wp_key, wp_name: l.wp_name, role_key: l.role_key, base_mh: l.base_mh, driver_mh: 0, size_factor: l.size_factor, factor: f, estimated_mh: l.estimated_mh })),
      costLines: [],
      totals: { ...e.totals, laborCost: e.totals?.cost ?? null, otherCost: 0, costByPackage: {} },
    };
  });
  return x as Project;
}
