/**
 * Project exchange files.
 *  - Export: "5h13-plans-pwa-project-file" — the project document plus its revisions. Opens on another
 *    phone, or in desktop Plans (Import → PWA project file).
 *  - Import: the same file, or a 5H13 Plans r44 project backup (same mapping as desktop import/r44.ts).
 */
import { R44_FORMAT, parseR44, previewR44, s, n, d, arr, MILESTONE_STATUS, COMMENT_STATUS, PRIORITY, type J } from "../../shared/import/r44-parse";
import type { Comment, Library, Project, Revision } from "../model";
import { DomainError, canonicalJson, nextNo, now, sha256, uuid } from "../util";
import { newProject } from "./project";
import { migrateProject } from "../seed";

declare const __APP_VERSION__: string;
export const PWA_FILE_FORMAT = "5h13-plans-pwa-project-file";

export interface ProjectFile { format: typeof PWA_FILE_FORMAT; version: 1; app_version: string; exported_at: string; sha256: string; project: Project; revisions: Revision[] }

export async function exportFile(p: Project, revisions: Revision[]): Promise<ProjectFile> {
  const body = { project: p, revisions };
  return { format: PWA_FILE_FORMAT, version: 1, app_version: `plans-pwa ${__APP_VERSION__}`, exported_at: now(), sha256: await sha256(canonicalJson(body)), ...body };
}

export type ImportPlan =
  | { kind: "pwa"; file: ProjectFile; checksumOk: boolean; existing: Project | null; summary: string[] }
  | { kind: "r44"; raw: unknown; preview: ReturnType<typeof previewR44>; alreadyImported: boolean; summary: string[] };

const wrap = <T,>(fn: () => T): T => {
  try { return fn(); } catch (e) { const x = e as { code?: string; message: string }; throw new DomainError(x.code ?? "INVALID_IMPORT", x.message); }
};

/** Reads and validates a file; nothing is written. */
export async function inspect(text: string, projects: Project[]): Promise<ImportPlan> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DomainError("INVALID_IMPORT", "The file is not JSON."); }
  const f = raw as J;
  if (f?.format === PWA_FILE_FORMAT) {
    const file = raw as ProjectFile;
    if (file.project?.schema !== "5h13-plans-pwa-project") throw new DomainError("INVALID_IMPORT", "The file has no project.");
    const ok = (await sha256(canonicalJson({ project: file.project, revisions: file.revisions ?? [] }))) === file.sha256;
    const p = file.project;
    return {
      kind: "pwa", file, checksumOk: ok, existing: projects.find((x) => x.id === p.id) ?? null,
      summary: [`${p.project_no} ${p.name}`, `${p.deliverables.length} deliverables, ${p.comments.length} comments, ${p.documents.length} documents, ${p.progressReports.length} progress reports, ${(file.revisions ?? []).length} revisions`, `exported ${file.exported_at} from ${file.app_version}`],
    };
  }
  if (f?.schema === R44_FORMAT) {
    const preview = wrap(() => previewR44(raw));
    const uid = s((f.payload as J)?.uid);
    const c = preview.counts;
    return {
      kind: "r44", raw, preview, alreadyImported: !!uid && projects.some((p) => p.imports.some((i) => i.source_format === R44_FORMAT && i.source_uid === uid)),
      summary: [`${preview.code} ${preview.name}`, `${c.milestones} milestones, ${c.deliverables} deliverables, ${c.comments} comments, ${c.documents} documents`, ...preview.warnings],
    };
  }
  throw new DomainError("INVALID_IMPORT", "Not a 5H13 Plans project file or r44 backup.");
}

/** A project from a PWA file. replace=false with an existing id makes a copy with a new id and number. */
export function fromPwaFile(file: ProjectFile, projects: Project[], opts: { replace: boolean; projectNo?: string }): { project: Project; revisions: Revision[] } {
  const p = migrateProject(structuredClone(file.project));
  const clash = projects.find((x) => x.id === p.id);
  if (clash && !opts.replace) {
    p.id = uuid();
    p.project_no = opts.projectNo?.trim() || `${p.project_no}-COPY`;
  } else if (!clash && opts.projectNo?.trim()) p.project_no = opts.projectNo.trim();
  if (projects.some((x) => x.id !== (clash && opts.replace ? clash.id : "") && x.project_no.toLowerCase() === p.project_no.toLowerCase())) {
    throw new DomainError("DUPLICATE", `A project numbered ${p.project_no} already exists; choose another project number.`);
  }
  p.audit = [{ at: now(), event: "project.imported", summary: `Imported from ${file.app_version} file (${file.exported_at})` }, ...p.audit];
  return { project: p, revisions: clash && !opts.replace ? [] : file.revisions ?? [] };
}

/** An r44 backup as a project (desktop import/r44.ts mapping, document form). */
export async function fromR44(raw: unknown, lib: Library, projects: Project[], projectNo?: string): Promise<Project> {
  const { payload: p, meta } = wrap(() => parseR44(raw));
  const preview = wrap(() => previewR44(raw));
  const uid = s(p.uid);
  if (uid && projects.some((x) => x.imports.some((i) => i.source_format === R44_FORMAT && i.source_uid === uid))) throw new DomainError("ALREADY_IMPORTED", `${preview.code} has already been imported on this device.`);
  const typeKey = lib.options.project_type?.find((o) => o.label.toUpperCase().startsWith((s(p.category) ?? "~").toUpperCase()))?.value_key ?? "OTHER";
  const pr = newProject(lib, projects, { projectNo: projectNo?.trim() || preview.code, name: preview.name, projectType: typeKey, templateKey: "general" });
  if (s(p.status) && ["active", "on_hold", "closeout", "closed", "archived"].includes(String(p.status))) pr.status = p.status as Project["status"];
  Object.assign(pr.definition, {
    scope: s(p.scope), exclusions: s(p.outscope), assumptions: s(p.assumptions), target_start: d(p.start), target_finish: d(p.target), objective: s(p.scope),
    budget_limit: n(p.baseline) > 0 ? n(p.baseline) : null,
    budget_notes: n(p.baseline) > 0 ? "Legacy baseline imported from 5H13 Plans r44 — unverified; to be replaced by an estimate built from project inputs." : null,
  });
  const idMap: Record<string, string> = {};
  let seq = 0;
  for (const m of arr(p.milestones)) {
    const name = s(m.name) ?? "Milestone";
    const match = /^(M\d+)\s*[—–-]\s*(.+)$/.exec(name);
    const mid = uuid();
    pr.milestones.push({ id: mid, code: match ? match[1] : s(m.id) ?? nextNo(pr.milestones.map((x) => x.code), "M"), name: match ? match[2] : name, description: s(m.scheduleEvidence), phase: s(m.phase), sequence: (seq += 10), weight: n(m.weight), status: (MILESTONE_STATUS[String(m.status)] ?? "NOT_STARTED") as "NOT_STARTED", gate_critical: false });
    if (s(m.uid)) idMap[String(m.uid)] = mid;
    for (const it of arr(m.items)) {
      const num = /(\d+)$/.exec(String(it.id ?? ""))?.[1];
      const status = String(it.status ?? "not");
      const done = status === "done";
      const did = uuid();
      pr.deliverables.push({
        id: did, code: num ? `D-${num.padStart(3, "0")}` : nextNo(pr.deliverables.map((x) => x.code), "D"), title: s(it.name) ?? "Deliverable", description: null, milestone_id: mid, sequence: (seq += 10),
        state: done ? "accepted" : status === "progress" ? "in_progress" : "not_started", weight: n(it.weight), budget: n(it.budget), actual_cost: n(it.actual), progress_percent: done ? 100 : n(it.progress ?? it.pct ?? 0),
        measurement: "PERCENT", quantity_unit: null, quantity_total: null, quantity_done: null, responsible_name: s(it.owner),
        baseline_start: d(it.baselineStart), baseline_finish: d(it.baselineFinish), planned_start: d(it.plannedStart), planned_finish: d(it.plannedFinish), actual_start: d(it.actualStart), actual_finish: d(it.actualFinish), forecast_finish: d(it.forecastFinish),
      });
      if (s(it.uid)) idMap[String(it.uid)] = did;
    }
  }
  for (const c of arr(p.comments)) {
    const cid = uuid();
    const status = (COMMENT_STATUS[String(c.status ?? "OPEN").toUpperCase().replace(/ /g, "_")] ?? "OPEN") as Comment["status"];
    const entries = arr(c.history).map(String).filter((x) => x.trim());
    entries.push(`Imported from 5H13 Plans r44 with status ${String(c.status)}`);
    const ev = c.verificationEvidence as J | null | undefined;
    if (ev && typeof ev === "object") entries.push(`r44 verification: ${String(ev.method ?? "")} ${ev.passed ? "passed" : "failed"} (${String(ev.buildId ?? "")}, ${String(ev.verifiedAt ?? "")})`);
    const t = now();
    pr.comments.push({
      id: cid, comment_no: s(c.id) ?? nextNo(pr.comments.map((x) => x.comment_no), "COM"), title: s(c.title) ?? "(untitled)", body: null, category: s(c.category) ?? "Requirement",
      priority: (PRIORITY[String(c.priority ?? "NORMAL").toUpperCase()] ?? "NORMAL") as Comment["priority"], status, critical: c.critical === true, resolution: s(c.resolution),
      responsible_name: s(c.owner), phase: s(c.phase), created_at: t,
      history: entries.map((e, i) => ({ at: t, entry: e, from_status: null, to_status: i === entries.length - 1 ? status : null, by: "import" })),
    });
    const target = (s(c.deliverableUid) && idMap[s(c.deliverableUid)!] && { type: "DELIVERABLE" as const, id: idMap[s(c.deliverableUid)!] }) || (s(c.milestoneUid) && idMap[s(c.milestoneUid)!] && { type: "MILESTONE" as const, id: idMap[s(c.milestoneUid)!] });
    if (target) pr.links.push({ id: uuid(), from_type: "COMMENT", from_id: cid, to_type: target.type, to_id: target.id, relationship: "RAISED_ON", notes: null });
  }
  for (const doc of arr(p.documents)) {
    const id = uuid();
    pr.documents.push({
      id, doc_no: s(doc.id) ?? nextNo(pr.documents.map((x) => x.doc_no), "DOC"), category: s(doc.category) ?? "Other", title: s(doc.title) ?? s(doc.fileName) ?? "(untitled)", version: s(doc.version),
      doc_date: d(doc.date), location: s(doc.fileName), file_name: s(doc.fileName), extracted_text: s(doc.text), notes: "Imported from 5H13 Plans r44 (text extracted by r44; original file not included in the backup).",
    });
    if (s(doc.uid)) idMap[String(doc.uid)] = id;
  }
  const unmapped: J = {};
  for (const k of preview.unmappedKeys) unmapped[k] = p[k];
  for (const k of ["changes", "risks", "assets", "progressReports"]) if (arr(p[k]).length) unmapped[k] = p[k];
  pr.imports.push({ source_app: s(meta.app) ?? "5H13 Plans", source_format: R44_FORMAT, source_uid: uid, imported_at: now(), report: { ...preview, idMap, file_sha256: await sha256(canonicalJson(raw)) }, unmapped });
  pr.audit.unshift({ at: now(), event: "project.imported", summary: `Imported ${preview.code} from 5H13 Plans r44` });
  return pr;
}

export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
