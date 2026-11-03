/** Project revisions: named, hashed snapshots of the project document, compared with the shared desktop diff. */
import { diffSnapshots, type Snapshot } from "../../shared/revisions/diff";
import type { Project, Revision } from "../model";
import { getRevisions, getState, putRevisions } from "../store";
import { DomainError, canonicalJson, now, sha256, uuid } from "../util";

declare const __APP_VERSION__: string;

const TABLES: Array<[keyof Project, string]> = [
  ["milestones", "milestones"], ["deliverables", "deliverables"], ["criteria", "criteria"], ["codeBasis", "code_basis"], ["comments", "comments"], ["risks", "risks"],
  ["issues", "issues"], ["changes", "changes"], ["documents", "documents"], ["assets", "assets"], ["links", "entity_links"], ["stages", "project_stages"],
  ["gates", "readiness_gates"], ["readiness", "readiness_criteria"], ["estimates", "project_estimates"], ["mhActuals", "project_mh_actuals"], ["progressReports", "progress_reports"],
];

/** The project as tables of rows (same shape the desktop snapshot uses), without volatile fields. */
export function snapshotOf(p: Project): Snapshot {
  const { definition, staffing, mhForecasts } = p;
  const strip = (r: Record<string, unknown>) => {
    const { history: _h, lines: _l, snapshot: _s, evidence: _e, extracted_text, ...rest } = r;
    const named = typeof rest.report_no === "string" ? { ...rest, name: rest.report_no } : typeof rest.estimate_no === "string" ? { ...rest, name: rest.estimate_no } : rest;
    return extracted_text != null ? { ...named, text_length: String(extracted_text).length } : named;
  };
  const out: Snapshot = {
    projects: [{ id: p.id, project_no: p.project_no, name: p.name, client_name: p.client_name, project_type: p.project_type, delivery_model: p.delivery_model, region: p.region, province: p.province, city_municipality: p.city_municipality, barangay: p.barangay, site_address: p.site_address, permit_authority: p.permit_authority, gross_floor_area_m2: p.gross_floor_area_m2, status: p.status }],
    project_definitions: [{ id: `def:${p.id}`, title: "Definition", ...definition }],
    project_staffing: Object.entries(staffing).map(([k, v]) => ({ id: `staff:${k}`, name: k, ...v })),
    project_mh_forecasts: Object.entries(mhForecasts).map(([k, v]) => ({ id: `fc:${k}`, name: k, forecast_mh: v })),
  };
  for (const [key, table] of TABLES) out[table] = (p[key] as unknown as Array<Record<string, unknown>>).map(strip);
  return out;
}

export async function saveRevision(projectId: string, note: string): Promise<Revision> {
  const p = getState().projects[projectId];
  if (!p) throw new DomainError("NOT_FOUND", "Project not found.");
  if (!note.trim()) throw new DomainError("VALIDATION", "Describe the revision.");
  const snapshot = snapshotOf(p);
  const hash = await sha256(canonicalJson(snapshot));
  const revs = await getRevisions(projectId);
  const last = revs.at(-1);
  if (last && last.snapshot_hash === hash) throw new DomainError("NO_CHANGE", `Nothing has changed since revision ${last.revision_no}.`);
  const rev: Revision = { id: uuid(), revision_no: (last?.revision_no ?? 0) + 1, note: note.trim(), created_at: now(), snapshot_hash: hash, app_version: `plans-pwa ${__APP_VERSION__}`, snapshot };
  await putRevisions(projectId, [...revs, rev]);
  return rev;
}

export function compareSnapshots(before: unknown, after: unknown) {
  return diffSnapshots(before as Snapshot, after as Snapshot);
}
