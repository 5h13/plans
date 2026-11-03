import type { CodeBasis, Definition, Library, Project } from "../model";
import { DomainError, now, uuid } from "../util";

export const emptyDefinition = (): Definition => ({
  objective: null, scope: null, exclusions: null, assumptions: null, required_capacity: null, performance_criteria: null,
  operating_conditions: null, site_conditions: null, client_requirements: null, interfaces_summary: null, budget_limit: null,
  budget_notes: null, target_start: null, target_finish: null, schedule_notes: null, acceptance_criteria: null, status: "draft", confirmed_at: null,
});

export interface NewProject {
  projectNo: string;
  name: string;
  projectType: string;
  deliveryModel?: string | null;
  clientName?: string | null;
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  siteAddress?: string | null;
  permitAuthority?: string | null;
  grossFloorAreaM2?: number | null;
  floorsAboveGrade?: number | null;
  floorsBelowGrade?: number | null;
  unitSystem?: "us_customary" | "si";
  currency?: string;
  codeBasis?: string[];
  templateKey: string;
  drivers?: Record<string, number>;
  anchor?: string | null;
}

export function newProject(lib: Library, existing: Project[], v: NewProject): Project {
  const no = v.projectNo.trim();
  if (!no) throw new DomainError("VALIDATION", "Enter a project number.");
  if (!v.name.trim()) throw new DomainError("VALIDATION", "Enter a project name.");
  if (existing.some((p) => p.project_no.toLowerCase() === no.toLowerCase())) throw new DomainError("DUPLICATE", `A project numbered ${no} already exists.`);
  if (v.grossFloorAreaM2 != null && !(v.grossFloorAreaM2 > 0)) throw new DomainError("VALIDATION", "Floor area must be positive.");
  const s = lib.settings!;
  const tpl = lib.templates.find((t) => t.key === v.templateKey);
  if (!tpl) throw new DomainError("VALIDATION", "Choose a template.");
  const t = now();
  const basis: CodeBasis[] = (tpl.features.codes ? v.codeBasis ?? [] : []).map((id) => ({
    id: uuid(), code_source_id: id, basis_role: lib.codes.find((c) => c.id === id)?.defaultRole ?? "design", adopted_edition: null, verification_status: "unverified",
  }));
  return {
    schema: "5h13-plans-pwa-project",
    id: uuid(),
    project_no: no,
    name: v.name.trim(),
    project_type: v.projectType || tpl.key.toUpperCase(),
    template_key: tpl.key,
    drivers: Object.fromEntries(tpl.drivers.map((d) => [d.key, v.drivers?.[d.key] ?? (d.fromProjectArea && v.grossFloorAreaM2 ? v.grossFloorAreaM2 : d.default)])),
    delivery_model: v.deliveryModel ?? null,
    client_name: v.clientName?.trim() || null,
    country_code: "PH",
    region: v.region || null, province: v.province || null, city_municipality: v.cityMunicipality || null, barangay: v.barangay || null,
    site_address: v.siteAddress || null, permit_authority: v.permitAuthority || null,
    gross_floor_area_m2: v.grossFloorAreaM2 ?? null, floors_above_grade: v.floorsAboveGrade ?? null, floors_below_grade: v.floorsBelowGrade ?? null,
    unit_system: v.unitSystem ?? s.unitSystem,
    currency: (v.currency || s.currency).toUpperCase(),
    status: "active",
    created_at: t,
    updated_at: t,
    definition: { ...emptyDefinition(), ...(v.anchor ? (tpl.scheduling === "backward" ? { target_finish: v.anchor } : { target_start: v.anchor }) : {}) },
    criteria: [], codeBasis: basis, milestones: [], deliverables: [], comments: [], risks: [], issues: [], changes: [], documents: [], assets: [], links: [],
    stages: [], gates: [], readiness: [], staffing: {}, estimates: [], mhActuals: [], mhForecasts: {}, progressReports: [],
    audit: [{ at: t, event: "project.created", summary: `${no} ${v.name.trim()}` }],
    imports: [],
  };
}

export type DetailsInput = Partial<Pick<Project, "name" | "project_type" | "delivery_model" | "client_name" | "region" | "province" | "city_municipality" | "barangay" | "site_address" | "permit_authority" | "gross_floor_area_m2" | "floors_above_grade" | "floors_below_grade" | "status">>;

export function updateDetails(p: Project, v: DetailsInput) {
  if (v.name !== undefined && !v.name?.trim()) throw new DomainError("VALIDATION", "The project needs a name.");
  if (v.gross_floor_area_m2 != null && !(v.gross_floor_area_m2 > 0)) throw new DomainError("VALIDATION", "Floor area must be positive.");
  Object.assign(p, v);
  return "Project details changed";
}

export const DEFINITION_FIELDS = [
  "objective", "scope", "exclusions", "assumptions", "required_capacity", "performance_criteria", "operating_conditions",
  "site_conditions", "client_requirements", "interfaces_summary", "budget_notes", "schedule_notes", "acceptance_criteria",
] as const;

/** Saving any field returns a confirmed definition to draft (it must be confirmed again). */
export function saveDefinition(p: Project, v: Partial<Definition>) {
  const next = { ...p.definition, ...v };
  if (next.target_start && next.target_finish && next.target_finish < next.target_start) throw new DomainError("VALIDATION", "Target finish must be on or after target start.");
  if (next.budget_limit != null && !(next.budget_limit >= 0)) throw new DomainError("VALIDATION", "Budget limit must be zero or more.");
  const wasConfirmed = p.definition.status === "confirmed";
  p.definition = { ...next, status: "draft", confirmed_at: null };
  return wasConfirmed ? "Definition edited — returned to draft" : "Definition edited";
}

export function confirmDefinition(p: Project) {
  const missing = [["objective", p.definition.objective], ["scope", p.definition.scope]].filter(([, x]) => !x || !String(x).trim()).map(([k]) => k);
  if (missing.length) throw new DomainError("INCOMPLETE", `Fill in ${missing.join(" and ")} before confirming the definition.`);
  p.definition.status = "confirmed";
  p.definition.confirmed_at = now();
  return "Definition confirmed";
}

const backToDraft = (p: Project) => {
  if (p.definition.status === "confirmed") p.definition = { ...p.definition, status: "draft", confirmed_at: null };
};

export function addCriterion(p: Project, v: { category: string; criterion: string; value_text: string; unit?: string; source?: string }) {
  if (!v.criterion.trim() || !v.value_text.trim()) throw new DomainError("VALIDATION", "Enter the criterion and its value.");
  p.criteria.push({ id: uuid(), category: v.category, criterion: v.criterion.trim(), value_text: v.value_text.trim(), unit: v.unit?.trim() || null, source: v.source?.trim() || null });
  backToDraft(p);
  return `Design criterion: ${v.criterion}`;
}
export function removeCriterion(p: Project, id: string) {
  p.criteria = p.criteria.filter((c) => c.id !== id);
  backToDraft(p);
  return "Design criterion removed";
}

export function addCodeBasis(p: Project, v: { codeSourceId: string; basisRole: CodeBasis["basis_role"]; adoptedEdition?: string }) {
  if (p.codeBasis.some((b) => b.code_source_id === v.codeSourceId)) throw new DomainError("DUPLICATE", "That code is already in the project's code basis.");
  p.codeBasis.push({ id: uuid(), code_source_id: v.codeSourceId, basis_role: v.basisRole, adopted_edition: v.adoptedEdition?.trim() || null, verification_status: "unverified" });
  return "Code basis changed";
}
export function removeCodeBasis(p: Project, id: string) {
  p.codeBasis = p.codeBasis.filter((b) => b.id !== id);
  return "Code basis changed";
}
export function setEdition(p: Project, id: string, edition: string) {
  const b = p.codeBasis.find((x) => x.id === id);
  if (!b) throw new DomainError("NOT_FOUND", "Not in the code basis.");
  b.adopted_edition = edition.trim() || null;
  return "Code edition confirmed";
}
