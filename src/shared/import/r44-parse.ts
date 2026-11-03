/** Pure parsing and preview of a 5H13 Plans (r44) project backup — no database, usable in the browser (PWA). */
import { DomainError } from "../db/errors";

export const R44_FORMAT = "5h13-plans-backup";

export type J = Record<string, unknown>;
export const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
export const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : 0);
export const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
export const arr = (v: unknown) => (Array.isArray(v) ? (v as J[]) : []);

export interface R44Preview {
  code: string;
  name: string;
  counts: { milestones: number; deliverables: number; comments: number; documents: number; changes: number; risks: number; assets: number; progressReports: number };
  unmappedKeys: string[];
  warnings: string[];
  alreadyImported: boolean;
}

/** Validates the file and describes what will be imported (no database writes). */
export function parseR44(raw: unknown): { payload: J; meta: J } {
  const f = raw as J;
  if (!f || f.schema !== R44_FORMAT) throw new DomainError("INVALID_IMPORT", "This is not a 5H13 Plans project backup (schema 5h13-plans-backup).");
  if (f.backupType !== "project") throw new DomainError("INVALID_IMPORT", `Only project backups can be imported (this is a ${String(f.backupType)} backup).`);
  const p = f.payload as J;
  if (!p || !s(p.code) || !s(p.name)) throw new DomainError("INVALID_IMPORT", "The backup has no project code or name.");
  return { payload: p, meta: f };
}

const MAPPED = new Set([
  "uid", "name", "code", "category", "manager", "scope", "outscope", "assumptions", "start", "target", "baseline", "status",
  "milestones", "comments", "documents", "changes", "risks", "assets", "phases", "progressMethod",
]);

export function previewR44(raw: unknown): Omit<R44Preview, "alreadyImported"> {
  const { payload: p } = parseR44(raw);
  const ms = arr(p.milestones);
  const warnings: string[] = [];
  if (n(p.baseline) > 0) warnings.push(`The r44 baseline amount ${n(p.baseline).toLocaleString("en-PH")} is imported as a legacy, unverified budget limit.`);
  if (arr(p.progressReports).length) warnings.push(`${arr(p.progressReports).length} progress report(s) are kept in the import record; progress reports arrive in a later step.`);
  if (arr(p.changes).length) warnings.push(`${arr(p.changes).length} change record(s) are kept in the import record for review.`);
  for (const c of arr(p.comments)) {
    if (["RESOLVED", "VERIFIED", "CLOSED"].includes(String(c.status).toUpperCase().replace(/ /g, "_")) && !s(c.resolution)) {
      warnings.push(`${String(c.id)} is ${String(c.status).toLowerCase()} but has no resolution text.`);
    }
  }
  return {
    code: s(p.code)!,
    name: s(p.name)!,
    counts: {
      milestones: ms.length,
      deliverables: ms.reduce((t, m) => t + arr(m.items).length, 0),
      comments: arr(p.comments).length,
      documents: arr(p.documents).length,
      changes: arr(p.changes).length,
      risks: arr(p.risks).length,
      assets: arr(p.assets).length,
      progressReports: arr(p.progressReports).length,
    },
    unmappedKeys: Object.keys(p).filter((k) => !MAPPED.has(k)).sort(),
    warnings,
  };
}

export const MILESTONE_STATUS: Record<string, string> = { done: "COMPLETE", complete: "COMPLETE", progress: "IN_PROGRESS", ongoing: "IN_PROGRESS", not: "NOT_STARTED", hold: "ON_HOLD" };
export const COMMENT_STATUS: Record<string, string> = { OPEN: "OPEN", IN_PROGRESS: "IN_PROGRESS", RESOLVED: "RESOLVED", VERIFIED: "VERIFIED", CLOSED: "CLOSED", DEFERRED: "DEFERRED" };
export const PRIORITY: Record<string, string> = { LOW: "LOW", NORMAL: "NORMAL", MEDIUM: "NORMAL", HIGH: "HIGH", CRITICAL: "CRITICAL" };

