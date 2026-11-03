/**
 * 5H13 Plans PWA data model. Mirrors the desktop schema (spec v1.2 steps 1–7) in a
 * document shape: one Library plus one Project document per project, stored on the
 * device. Field names follow the desktop columns so exchange files map one-to-one.
 */

export type ISODate = string; // YYYY-MM-DD
export type ISOTime = string; // full ISO timestamp

export interface Settings {
  ownerName: string;
  ownerTitle?: string;
  unitSystem: "us_customary" | "si";
  currency: string;
  countryCode: string;
  hoursPerDay: number;
  daysPerWeek: number;
  workingDaysPerMonth: number;
  createdAt: ISOTime;
}

export interface Option { value_key: string; label: string }

export interface CodeSource { id: string; short_name: string; title: string; publisher: string; edition: string | null; source_type: string; defaultRole?: "design" | "statutory" }

export interface StageTemplateItem { stage_key: string; sequence: number; name: string; purpose: string; typical_outputs: string[]; optional: boolean }
export interface GateTemplateItem { gate_key: string; stage_key: string; name: string; purpose: string; criteria: Array<{ title: string; kind: CriterionKind; required: boolean; blocking: boolean }> }

export interface EstRole { role_key: string; label: string; hourly_rate: number | null; default_people: number; default_allocation: number }

/** Quantity = base + rate × driver value (e.g. 1.5 h per guest, 6 h per indoor unit). */
export interface PerDriver { driver: string; rate: number }
export interface EffortRule { role: string; base: number; per?: PerDriver }
export interface CostRule { label: string; unit: string; base: number; per?: PerDriver; unitCost: number }
export interface TemplateWorkPackage {
  wp_key: string; name: string; sequence: number; stage_key: string | null; deliverable_title: string | null; predecessors: string[];
  effort: EffortRule[]; costs: CostRule[];
  /** Area-scaled templates: effort × (size / reference) ^ exponent. */
  exponent?: number;
  /** Shortest duration in days (lead times, waiting for the client, vendor bookings). */
  minDays?: number;
  /** A fixed duration in days whatever the effort (an event day, a rehearsal). */
  fixedDays?: number;
  /** Backward-scheduled templates: finish this many calendar days before the anchor date (negative = after). */
  finishBeforeAnchorDays?: number;
}
export interface FactorSet { set: string; label: string; values: Array<{ key: string; label: string; factor: number; is_default: boolean }> }
export interface TemplateDriver { key: string; label: string; unit: string; default: number; fromProjectArea?: boolean }
export interface TemplateSection { key: DefinitionTextKey; label: string; prompt: string }

/** A project template: everything that makes Plans fit a kind of project. Data, not code; editable in the library. */
export interface ProjectTemplate {
  key: string;
  name: string;
  description: string;
  method: "lines" | "area_scaled";
  scheduling: "forward" | "backward";
  calendar: "working" | "calendar";
  anchorLabel: string;
  referenceArea?: number;
  features: { location: boolean; size: boolean; codes: boolean; permit: boolean; scopeModel: boolean };
  terms: { deliverable: string; deliverables: string };
  sections: TemplateSection[];
  criteriaLabel: string;
  criteriaCategories: Option[];
  drivers: TemplateDriver[];
  roles: EstRole[];
  factorSets: FactorSet[];
  stages: StageTemplateItem[];
  gates: GateTemplateItem[];
  workPackages: TemplateWorkPackage[];
}

export interface Library {
  schema: "5h13-plans-pwa-library";
  version: number;
  settings: Settings | null;
  options: Record<string, Option[]>;
  codes: CodeSource[];
  templates: ProjectTemplate[];
}

// ------------------------------------------------------------------ project document

export interface AuditEvent { at: ISOTime; event: string; summary: string }

export type DefinitionTextKey = "objective" | "scope" | "exclusions" | "assumptions" | "required_capacity" | "performance_criteria" | "operating_conditions" | "site_conditions" | "client_requirements" | "interfaces_summary" | "acceptance_criteria";

export interface Definition {
  objective: string | null; scope: string | null; exclusions: string | null; assumptions: string | null;
  required_capacity: string | null; performance_criteria: string | null; operating_conditions: string | null;
  site_conditions: string | null; client_requirements: string | null; interfaces_summary: string | null;
  budget_limit: number | null; budget_notes: string | null; target_start: ISODate | null; target_finish: ISODate | null;
  schedule_notes: string | null; acceptance_criteria: string | null;
  status: "draft" | "confirmed"; confirmed_at: ISOTime | null;
}

export interface Criterion { id: string; category: string; criterion: string; value_text: string; unit: string | null; source: string | null }
export interface CodeBasis { id: string; code_source_id: string; basis_role: "design" | "statutory" | "reference"; adopted_edition: string | null; verification_status: "unverified" | "verified" }

export interface Milestone {
  id: string; code: string; name: string; description: string | null; phase: string | null; sequence: number; weight: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "ON_HOLD" | "CANCELLED"; gate_critical: boolean; source_estimate_id?: string | null;
}

export interface Deliverable {
  id: string; code: string; title: string; description: string | null; milestone_id: string | null; sequence: number;
  state: string; weight: number; budget: number; actual_cost: number; progress_percent: number;
  measurement: "PERCENT" | "QUANTITY"; quantity_unit: string | null; quantity_total: number | null; quantity_done: number | null;
  responsible_name: string | null;
  baseline_start: ISODate | null; baseline_finish: ISODate | null; planned_start: ISODate | null; planned_finish: ISODate | null;
  actual_start: ISODate | null; actual_finish: ISODate | null; forecast_finish: ISODate | null;
  type_name?: string | null; source_estimate_id?: string | null; wp_key?: string | null;
}

export interface CommentHistory { at: ISOTime; entry: string; from_status: string | null; to_status: string | null; by: string | null }
export interface Comment {
  id: string; comment_no: string; title: string; body: string | null; category: string; priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "VERIFIED" | "CLOSED" | "DEFERRED"; critical: boolean; resolution: string | null;
  responsible_name: string | null; phase: string | null; created_at: ISOTime; history: CommentHistory[];
}

export interface Risk {
  id: string; risk_no: string; title: string; description: string | null; category: string; likelihood: "LOW" | "MEDIUM" | "HIGH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; mitigation: string | null; responsible_name: string | null; due_date: ISODate | null;
  status: "OPEN" | "MITIGATED" | "CLOSED" | "REALISED"; realised_issue_id: string | null;
}

export interface Issue {
  id: string; issue_no: string; issue_type: string; title: string; description: string | null; severity: "low" | "medium" | "high" | "critical";
  status: "open" | "closed"; responsible_name: string | null; due_date: ISODate | null; resolution: string | null; created_at: ISOTime; closed_at: ISOTime | null;
}

export interface Change {
  id: string; change_no: string; change_class: "engineering" | "contractual"; change_type: string; title: string; reason: string; description: string | null;
  cost_effect: number | null; schedule_effect_days: number | null; document_id: string | null;
  status: "pending_approval" | "approved" | "rejected" | "closed" | string; initiated_at: ISOTime; decided_at: ISOTime | null; decision_note: string | null;
}

export interface DocumentRec {
  id: string; doc_no: string; category: string; title: string; version: string | null; doc_date: ISODate | null; location: string | null;
  file_name: string | null; extracted_text: string | null; notes: string | null;
}

export interface Asset { id: string; asset_no: string; name: string; serial_or_tag: string | null; location: string | null; status: "IN_STOCK" | "DEPLOYED" | "MAINTENANCE" | "DECOMMISSIONED" }

export type EntityType = "MILESTONE" | "DELIVERABLE" | "CHANGE_RECORD" | "ISSUE" | "RISK" | "COMMENT" | "DOCUMENT" | "ASSET" | "STAGE";
export interface Link { id: string; from_type: EntityType; from_id: string; to_type: EntityType; to_id: string; relationship: string; notes: string | null }

export type CriterionKind = "MANUAL" | "DEFINITION_CONFIRMED" | "LINKED";
export interface Stage {
  id: string; stage_key: string; name: string; purpose: string | null; typical_outputs: string[]; sequence: number;
  status: "NOT_STARTED" | "ACTIVE" | "COMPLETE" | "SKIPPED"; started_at: ISOTime | null; completed_at: ISOTime | null; skipped_reason: string | null; revisit_count: number;
  history: Array<{ at: ISOTime; from: string | null; to: string; note: string | null }>;
}
export interface Gate { id: string; gate_key: string; name: string; purpose: string | null; stage_id: string | null }
export interface ReadinessCriterion {
  id: string; gate_id: string; seq: number; title: string; kind: CriterionKind; required: boolean; blocking: boolean;
  source_type: EntityType | null; source_id: string | null; met: boolean; met_at: ISOTime | null;
  evidence: Array<{ at: ISOTime; description: string }>;
  exception: { reason: string; accepted_at: ISOTime } | null;
}

export interface EstimateLine { wp_key: string; wp_name: string; role_key: string; base_mh: number; driver_mh: number; size_factor: number; factor: number; estimated_mh: number }
export interface CostLine { wp_key: string; wp_name: string; label: string; unit: string; qty: number; unit_cost: number; amount: number }
export interface Estimate {
  id: string; estimate_no: string; status: "DRAFT" | "ACCEPTED" | "SUPERSEDED"; method_version: string; created_at: ISOTime; accepted_at: ISOTime | null; note: string | null;
  inputs: {
    templateKey: string; templateName: string; method: ProjectTemplate["method"]; scheduling: ProjectTemplate["scheduling"]; calendar: ProjectTemplate["calendar"];
    anchor: ISODate; drivers: Record<string, number>; referenceArea: number | null; currency: string;
    factors: Record<string, { key: string; label: string; factor: number }>;
    rates: Record<string, number | null>; staffing: Record<string, { people: number; allocation: number }>;
    workingTime: { hoursPerDay: number; daysPerWeek: number; workingDaysPerMonth: number };
    workPackages: TemplateWorkPackage[];
  };
  totals: { byRole: Record<string, number>; byPackage: Record<string, number>; totalMh: number; laborCost: number | null; otherCost: number; cost: number | null; costByPackage: Record<string, number>; missingRates: string[] };
  lines: EstimateLine[];
  costLines: CostLine[];
}
export interface MhActual { id: string; wp_key: string; role_key: string; kind: "INITIAL" | "ITERATION"; hours: number; work_date: ISODate; note: string | null }

export interface ProgressLine {
  deliverable_id: string; code: string; title: string; milestone_id: string | null; weight: number; measurement: string; quantity_unit: string | null; quantity_total: number | null;
  previous_pct: number; current_pct: number; previous_qty: number | null; current_qty: number | null; planned_pct: number | null; remarks: string | null;
}
export interface ProgressReport {
  id: string; report_no: string; period_start: ISODate; period_end: ISODate; status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
  previous_report_id: string | null; narrative: string | null; returned_note: string | null; created_at: ISOTime; approved_at: ISOTime | null;
  lines: ProgressLine[]; snapshot: unknown | null; snapshot_sha256: string | null;
}

export interface Revision { id: string; revision_no: number; note: string; created_at: ISOTime; snapshot_hash: string; app_version: string; snapshot: unknown }

export interface ImportRecord { source_app: string; source_format: string; source_uid: string | null; imported_at: ISOTime; report: unknown; unmapped: unknown }

export interface Project {
  schema: "5h13-plans-pwa-project";
  id: string;
  project_no: string;
  name: string;
  project_type: string;
  delivery_model: string | null;
  client_name: string | null;
  country_code: string;
  region: string | null; province: string | null; city_municipality: string | null; barangay: string | null;
  site_address: string | null; permit_authority: string | null;
  state_region?: string | null; locality?: string | null;
  gross_floor_area_m2: number | null; floors_above_grade: number | null; floors_below_grade: number | null;
  unit_system: "us_customary" | "si";
  currency: string;
  status: "active" | "on_hold" | "closeout" | "closed" | "archived";
  /** The template the project was created from (its stages, drivers, estimate method). */
  template_key: string;
  /** Driver values for the estimate, e.g. { GUESTS: 120 } or { UNITS: 6 }. */
  drivers: Record<string, number>;
  created_at: ISOTime;
  updated_at: ISOTime;
  definition: Definition;
  criteria: Criterion[];
  codeBasis: CodeBasis[];
  milestones: Milestone[];
  deliverables: Deliverable[];
  comments: Comment[];
  risks: Risk[];
  issues: Issue[];
  changes: Change[];
  documents: DocumentRec[];
  assets: Asset[];
  links: Link[];
  stages: Stage[];
  gates: Gate[];
  readiness: ReadinessCriterion[];
  staffing: Record<string, { people: number; allocation: number }>;
  estimates: Estimate[];
  mhActuals: MhActual[];
  mhForecasts: Record<string, number>; // `${wp}|${role}` → MH
  progressReports: ProgressReport[];
  audit: AuditEvent[];
  imports: ImportRecord[];
}
