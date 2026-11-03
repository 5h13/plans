/** Stages and readiness — same rules as desktop stageService (ADR-029). */
import type { EntityType, Gate, Library, Project, ReadinessCriterion, Stage } from "../model";
import { DomainError, now, uuid } from "../util";
import { templateOf } from "../seed";
import { labelOf } from "./registers";

export function applyTemplate(p: Project, lib: Library, skipOptional: string[] = []) {
  if (p.stages.length) throw new DomainError("ALREADY_SET_UP", "This project already has stages; edit them instead.");
  const t = templateOf(lib, p);
  const ids: Record<string, string> = {};
  for (const it of [...t.stages].sort((a, b) => a.sequence - b.sequence)) {
    const skip = it.optional && skipOptional.includes(it.stage_key);
    const id = uuid();
    ids[it.stage_key] = id;
    p.stages.push({
      id, stage_key: it.stage_key, name: it.name, purpose: it.purpose, typical_outputs: it.typical_outputs, sequence: it.sequence,
      status: skip ? "SKIPPED" : "NOT_STARTED", started_at: null, completed_at: null, skipped_reason: skip ? "Not in our scope" : null, revisit_count: 0, history: [],
    });
  }
  for (const g of t.gates) {
    const gid = uuid();
    p.gates.push({ id: gid, gate_key: g.gate_key, name: g.name, purpose: g.purpose, stage_id: ids[g.stage_key] ?? null });
    g.criteria.forEach((c, i) => p.readiness.push({
      id: uuid(), gate_id: gid, seq: (i + 1) * 10, title: c.title, kind: c.kind, required: c.required, blocking: c.blocking,
      source_type: null, source_id: null, met: false, met_at: null, evidence: [], exception: null,
    }));
  }
  return `${t.stages.length} stages from ${t.name}`;
}

function linkedDone(p: Project, type: EntityType | null, id: string | null): boolean {
  if (!type || !id) return false;
  switch (type) {
    case "DELIVERABLE": { const d = p.deliverables.find((x) => x.id === id); return !!d && (d.progress_percent >= 100 || ["approved", "accepted", "issued"].includes(d.state)); }
    case "MILESTONE": return p.milestones.find((x) => x.id === id)?.status === "COMPLETE";
    case "COMMENT": return ["VERIFIED", "CLOSED"].includes(p.comments.find((x) => x.id === id)?.status ?? "");
    case "ISSUE": return ["closed", "cancelled"].includes(p.issues.find((x) => x.id === id)?.status ?? "");
    case "RISK": return ["CLOSED", "MITIGATED"].includes(p.risks.find((x) => x.id === id)?.status ?? "");
    case "CHANGE_RECORD": return ["approved", "closed", "verified"].includes(p.changes.find((x) => x.id === id)?.status ?? "");
    case "DOCUMENT": return p.documents.some((x) => x.id === id);
    case "STAGE": return ["COMPLETE", "SKIPPED"].includes(p.stages.find((x) => x.id === id)?.status ?? "");
    default: return false;
  }
}

export type CriterionState = ReadinessCriterion & { is_met: boolean; reason: string; source_label: string | null; blocking_now: boolean };
export type GateState = Gate & { criteria: CriterionState[]; status: "READY" | "BLOCKED" | "OPEN_ITEMS"; blockers: number; open_items: number };

export function getGates(p: Project): GateState[] {
  const confirmed = p.definition.status === "confirmed";
  return p.gates.map((g) => {
    const criteria = p.readiness
      .filter((c) => c.gate_id === g.id)
      .sort((a, b) => a.seq - b.seq)
      .map((c) => {
        const done = c.kind === "LINKED" ? linkedDone(p, c.source_type, c.source_id) : false;
        const label = c.source_type && c.source_id ? labelOf(p, c.source_type, c.source_id) : null;
        const is_met = c.kind === "DEFINITION_CONFIRMED" ? confirmed : c.kind === "LINKED" ? done : c.met;
        const reason = c.kind === "DEFINITION_CONFIRMED" ? (confirmed ? "Definition confirmed" : "Definition still in draft") : c.kind === "LINKED" ? `${label ?? "linked record"} ${done ? "is done" : "is not done yet"}` : c.met ? "Checked" : "Not yet checked";
        return { ...c, is_met, reason, source_label: label, blocking_now: c.required && c.blocking && !is_met && !c.exception };
      });
    const blockers = criteria.filter((c) => c.blocking_now).length;
    const open = criteria.filter((c) => !c.is_met && !c.exception && !c.blocking_now).length;
    return { ...g, criteria, blockers, open_items: open, status: blockers ? "BLOCKED" : open ? "OPEN_ITEMS" : "READY" };
  });
}

const stage = (p: Project, id: string) => {
  const s = p.stages.find((x) => x.id === id);
  if (!s) throw new DomainError("NOT_FOUND", "Stage not found.");
  return s;
};
const rec = (s: Stage, to: Stage["status"], note: string | null) => s.history.push({ at: now(), from: s.status, to, note });
const lc = (s: string) => s.toLowerCase().replace("_", " ");

export function startStage(p: Project, id: string, note?: string) {
  const s = stage(p, id);
  if (s.status !== "NOT_STARTED") throw new DomainError("INVALID_TRANSITION", `${s.name} is ${lc(s.status)}.`);
  rec(s, "ACTIVE", note || null);
  s.status = "ACTIVE";
  s.started_at ??= now();
  return `${s.name} started`;
}
export function completeStage(p: Project, id: string, note?: string) {
  const s = stage(p, id);
  if (s.status !== "ACTIVE") throw new DomainError("INVALID_TRANSITION", `Only an active stage can be completed (${s.name} is ${lc(s.status)}).`);
  const blockers = getGates(p).filter((g) => g.stage_id === id).flatMap((g) => g.criteria.filter((c) => c.blocking_now).map((c) => `${g.name}: ${c.title}`));
  if (blockers.length) throw new DomainError("GATE_BLOCKED", `${s.name} cannot complete — blocking: ${blockers.join("; ")}. Meet them or record an accepted exception.`);
  rec(s, "COMPLETE", note || null);
  s.status = "COMPLETE";
  s.completed_at = now();
  return `${s.name} complete`;
}
export function skipStage(p: Project, id: string, reason: string) {
  const s = stage(p, id);
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give the reason this stage is skipped.");
  if (s.status === "COMPLETE") throw new DomainError("INVALID_TRANSITION", "A completed stage cannot be skipped; reopen it first.");
  rec(s, "SKIPPED", reason);
  s.status = "SKIPPED";
  s.skipped_reason = reason.trim();
  return `${s.name} skipped`;
}
export function reopenStage(p: Project, id: string, reason: string) {
  const s = stage(p, id);
  if (!["COMPLETE", "SKIPPED"].includes(s.status)) throw new DomainError("INVALID_TRANSITION", `${s.name} is not complete or skipped.`);
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give the reason for revisiting this stage.");
  if (s.status === "COMPLETE") s.revisit_count++;
  rec(s, "ACTIVE", `Revisit: ${reason}`);
  s.status = "ACTIVE";
  s.completed_at = null;
  s.skipped_reason = null;
  s.started_at ??= now();
  return `${s.name} reopened`;
}
export function moveStage(p: Project, id: string, dir: "up" | "down") {
  const sorted = [...p.stages].sort((a, b) => a.sequence - b.sequence);
  const i = sorted.findIndex((x) => x.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i].sequence, sorted[j].sequence] = [sorted[j].sequence, sorted[i].sequence];
  return `${sorted[i].name} moved ${dir}`;
}
export function addStage(p: Project, name: string, purpose?: string | null, afterId?: string | null) {
  if (!name.trim()) throw new DomainError("VALIDATION", "Enter the stage name.");
  const after = afterId ? stage(p, afterId) : null;
  let seq: number;
  if (after) {
    for (const s of p.stages) if (s.sequence > after.sequence) s.sequence += 2;
    seq = after.sequence + 1;
  } else seq = Math.max(0, ...p.stages.map((s) => s.sequence)) + 10;
  const key = `CUSTOM_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "STAGE"}`;
  p.stages.push({ id: uuid(), stage_key: key, name: name.trim(), purpose: purpose || null, typical_outputs: [], sequence: seq, status: "NOT_STARTED", started_at: null, completed_at: null, skipped_reason: null, revisit_count: 0, history: [] });
  return `Stage ${name} added`;
}

export function addCriterion(p: Project, gateId: string, v: { title: string; required?: boolean; blocking?: boolean; source?: { type: EntityType; id: string } | null }) {
  if (!p.gates.some((g) => g.id === gateId)) throw new DomainError("NOT_FOUND", "Gate not found.");
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Enter the criterion.");
  const seq = Math.max(0, ...p.readiness.filter((c) => c.gate_id === gateId).map((c) => c.seq)) + 10;
  p.readiness.push({
    id: uuid(), gate_id: gateId, seq, title: v.title.trim(), kind: v.source ? "LINKED" : "MANUAL", required: v.required ?? true, blocking: v.blocking ?? false,
    source_type: v.source?.type ?? null, source_id: v.source?.id ?? null, met: false, met_at: null, evidence: [], exception: null,
  });
  return `Criterion added: ${v.title}`;
}
const crit = (p: Project, id: string) => {
  const c = p.readiness.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Criterion not found.");
  return c;
};
export function setCriterionMet(p: Project, id: string, met: boolean, evidence?: string) {
  const c = crit(p, id);
  if (c.kind !== "MANUAL") throw new DomainError("INVALID_TRANSITION", "This criterion is evaluated automatically from the linked record.");
  c.met = met;
  c.met_at = met ? now() : null;
  if (evidence?.trim()) c.evidence.push({ at: now(), description: evidence.trim() });
  return `${c.title}: ${met ? "met" : "not met"}`;
}
export function acceptException(p: Project, id: string, reason: string) {
  const c = crit(p, id);
  if (reason.trim().length < 10) throw new DomainError("VALIDATION", "Document the exception (at least 10 characters): why it is acceptable to proceed.");
  c.exception = { reason: reason.trim(), accepted_at: now() };
  return `Exception accepted: ${c.title}`;
}
export function withdrawException(p: Project, id: string) {
  const c = crit(p, id);
  c.exception = null;
  return `Exception withdrawn: ${c.title}`;
}
