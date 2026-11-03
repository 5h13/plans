/**
 * Projects from contracts (ADR-034): start a project from a contract or project definition document,
 * and ingest a revised contract with its revisions logged as change records.
 */
import type { DefinitionTextKey, Library, Project } from "../model";
import type { ProposalKey } from "../ingest/extract";
import type { ChangeProposal } from "../ingest/revision";
import { DomainError, now } from "../util";
import { newProject } from "./project";
import { addContractChange, addDocument, link, setDocumentText } from "./registers";

export interface SourceFile { name: string; text: string; kind: string }

const TEXT_KEYS: DefinitionTextKey[] = ["objective", "scope", "exclusions", "assumptions", "required_capacity", "performance_criteria", "operating_conditions", "site_conditions", "client_requirements", "interfaces_summary", "acceptance_criteria"];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A new project from accepted proposals, with the source registered as its baseline contract. */
export function projectFromDocument(lib: Library, existing: Project[], v: { templateKey: string; projectNo: string; category: string; version: string; values: Partial<Record<ProposalKey, string>>; file: SourceFile }): Project {
  const val = (k: ProposalKey) => v.values[k]?.trim() || null;
  const t = lib.templates.find((x) => x.key === v.templateKey);
  if (!t) throw new DomainError("VALIDATION", "Choose a template.");
  const name = val("project.name");
  if (!name) throw new DomainError("VALIDATION", "The project needs a name.");
  const num = (k: ProposalKey) => { const s = val(k); if (s == null) return null; const n = Number(s.replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; };
  const drivers = Object.fromEntries(t.drivers.map((d) => [d.key, num(`driver.${d.key}`)]).filter(([, x]) => x != null)) as Record<string, number>;
  const start = val("definition.target_start"), finish = val("definition.target_finish");
  for (const d of [start, finish]) if (d && !isDate(d)) throw new DomainError("VALIDATION", `Dates must be YYYY-MM-DD (got “${d}”).`);
  const area = t.features.size ? drivers.AREA ?? null : null;
  const p = newProject(lib, existing, {
    templateKey: t.key, projectNo: v.projectNo, name, projectType: t.key.toUpperCase(), clientName: val("project.client_name"), siteAddress: val("project.site_address"),
    currency: (val("project.currency") ?? lib.settings!.currency).toUpperCase().slice(0, 3), drivers, grossFloorAreaM2: area,
    anchor: t.scheduling === "backward" ? finish : start,
  });
  for (const k of TEXT_KEYS) { const s = val(`definition.${k}`); if (s) p.definition[k] = s; }
  p.definition.schedule_notes = val("definition.schedule_notes");
  p.definition.budget_notes = val("definition.budget_notes");
  p.definition.budget_limit = num("definition.budget_limit");
  p.definition.target_start = start;
  p.definition.target_finish = finish;
  addDocument(p, { title: name, category: v.category, version: v.version || "1", location: v.file.name });
  const doc = p.documents.at(-1)!;
  setDocumentText(p, doc.id, v.file.text, v.file.name);
  doc.notes = `${v.category === "Contract" ? "Baseline contract" : "Source document"}: the project was created from this file (${v.file.kind}).`;
  p.audit.unshift({ at: now(), event: "project.from_document", summary: `${p.project_no} created from ${v.file.name}` });
  return p;
}

/** The next version label: 1 → 2, A → B, Rev 3 → Rev 4, v1.2 → v1.3; otherwise “<previous> rev”. */
export function nextVersion(prev: string | null): string {
  if (!prev) return "2";
  const m = /^(.*?)(\d+)$/.exec(prev);
  if (m) return `${m[1]}${+m[2] + 1}`;
  if (/^[A-Y]$/i.test(prev)) return String.fromCharCode(prev.charCodeAt(0) + 1);
  return `${prev} rev`;
}

/**
 * Registers a revised contract as the next version of a document and logs the accepted revisions as
 * contractual change records (pending approval), each linked to the new version.
 */
export function ingestRevision(p: Project, v: { previousId: string; version: string; file: SourceFile; changes: ChangeProposal[]; note?: string | null }) {
  const prev = p.documents.find((d) => d.id === v.previousId);
  if (!prev) throw new DomainError("NOT_FOUND", "Choose the document this file revises.");
  if (!v.file.text.trim()) throw new DomainError("VALIDATION", "The revised file has no readable text.");
  if (p.documents.some((d) => d.title === prev.title && d.version === v.version)) throw new DomainError("DUPLICATE", `${prev.title} version ${v.version} is already registered.`);
  addDocument(p, { title: prev.title, category: prev.category, version: v.version, location: v.file.name });
  const doc = p.documents.at(-1)!;
  setDocumentText(p, doc.id, v.file.text, v.file.name);
  doc.notes = `Revises ${prev.doc_no} (version ${prev.version ?? "—"}).${v.note ? ` ${v.note}` : ""}`;
  link(p, { type: "DOCUMENT", id: prev.id }, { type: "DOCUMENT", id: doc.id }, "REVISED_BY");
  const logged: string[] = [];
  for (const c of v.changes) {
    const desc = [c.before && `Before:\n${c.before}`, c.after && `After:\n${c.after}`].filter(Boolean).join("\n\n");
    addContractChange(p, {
      changeType: c.changeType, title: c.title, reason: `Contract revision ${prev.version ?? "—"} → ${v.version}${c.clause ? `, clause “${c.clause}”` : ""}${c.by === "ai" ? " (found by AI)" : ""}`,
      description: desc || null, costEffect: c.costEffect, scheduleEffectDays: c.scheduleEffectDays, documentId: doc.id,
    });
    logged.push(p.changes.at(-1)!.change_no);
  }
  return `${doc.doc_no} version ${v.version} registered${logged.length ? `; ${logged.length} change(s) logged: ${logged.join(", ")}` : "; no changes logged"}`;
}
