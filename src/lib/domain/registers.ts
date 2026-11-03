/** Registers — same rules as desktop registerService (ADR-027). The PWA is single-user: approvals are self-approvals. */
import type { Change, Comment, EntityType, Project, Risk } from "../model";
import { DomainError, nextNo, now, uuid } from "../util";

// ---------------------------------------------------------------- links
export function link(p: Project, from: { type: EntityType; id: string }, to: { type: EntityType; id: string }, relationship = "RELATES_TO", notes?: string) {
  const exists = (t: EntityType, id: string) => {
    const coll: Record<EntityType, Array<{ id: string }>> = {
      MILESTONE: p.milestones, DELIVERABLE: p.deliverables, CHANGE_RECORD: p.changes, ISSUE: p.issues, RISK: p.risks, COMMENT: p.comments, DOCUMENT: p.documents, ASSET: p.assets, STAGE: p.stages,
    };
    return coll[t]?.some((x) => x.id === id);
  };
  if (!exists(from.type, from.id) || !exists(to.type, to.id)) throw new DomainError("RULE_VIOLATION", "Both linked records must exist in this project.");
  if (from.type === to.type && from.id === to.id) throw new DomainError("RULE_VIOLATION", "A record cannot link to itself.");
  if (p.links.some((l) => l.from_type === from.type && l.from_id === from.id && l.to_type === to.type && l.to_id === to.id && l.relationship === relationship)) return;
  p.links.push({ id: uuid(), from_type: from.type, from_id: from.id, to_type: to.type, to_id: to.id, relationship, notes: notes ?? null });
}

export function labelOf(p: Project, type: EntityType, id: string): string {
  switch (type) {
    case "MILESTONE": { const x = p.milestones.find((m) => m.id === id); return x ? `${x.code} ${x.name}` : "?"; }
    case "DELIVERABLE": { const x = p.deliverables.find((m) => m.id === id); return x ? `${x.code} ${x.title}` : "?"; }
    case "CHANGE_RECORD": { const x = p.changes.find((m) => m.id === id); return x ? `${x.change_no} ${x.title}` : "?"; }
    case "ISSUE": { const x = p.issues.find((m) => m.id === id); return x ? `${x.issue_no} ${x.title}` : "?"; }
    case "RISK": { const x = p.risks.find((m) => m.id === id); return x ? `${x.risk_no} ${x.title}` : "?"; }
    case "COMMENT": { const x = p.comments.find((m) => m.id === id); return x ? `${x.comment_no} ${x.title}` : "?"; }
    case "DOCUMENT": { const x = p.documents.find((m) => m.id === id); return x ? `${x.doc_no} ${x.title}` : "?"; }
    case "ASSET": { const x = p.assets.find((m) => m.id === id); return x ? `${x.asset_no} ${x.name}` : "?"; }
    case "STAGE": { const x = p.stages.find((m) => m.id === id); return x ? x.name : "?"; }
  }
}

export function linksOf(p: Project, type: EntityType, id: string) {
  return p.links
    .filter((l) => (l.from_type === type && l.from_id === id) || (l.to_type === type && l.to_id === id))
    .map((l) => {
      const out = l.from_type === type && l.from_id === id;
      const ot = out ? l.to_type : l.from_type;
      const oid = out ? l.to_id : l.from_id;
      return { id: l.id, direction: out ? "out" : "in", relationship: l.relationship, other_type: ot, other_id: oid, other_label: labelOf(p, ot, oid) };
    });
}

// ---------------------------------------------------------------- comments
const FLOW: Record<Comment["status"], Comment["status"][]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "DEFERRED", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "OPEN", "DEFERRED"],
  RESOLVED: ["VERIFIED", "OPEN"],
  VERIFIED: ["CLOSED", "OPEN"],
  DEFERRED: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"],
};
export const COMMENT_NEXT = FLOW;

export function addComment(p: Project, v: { title: string; body?: string | null; category?: string; priority?: Comment["priority"]; critical?: boolean; responsibleName?: string | null; on?: { type: EntityType; id: string } }, by: string) {
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Enter the comment title.");
  const no = nextNo(p.comments.map((c) => c.comment_no), "COM");
  const c: Comment = {
    id: uuid(), comment_no: no, title: v.title.trim(), body: v.body || null, category: v.category || "Requirement", priority: v.priority ?? "NORMAL", status: "OPEN",
    critical: !!v.critical, resolution: null, responsible_name: v.responsibleName || null, phase: null, created_at: now(),
    history: [{ at: now(), entry: "Logged", from_status: null, to_status: "OPEN", by }],
  };
  p.comments.push(c);
  if (v.on) link(p, { type: "COMMENT", id: c.id }, v.on, "RAISED_ON");
  return `${no} ${c.title}`;
}

export function moveComment(p: Project, id: string, to: Comment["status"], entry: string, resolution: string | null, by: string) {
  const c = p.comments.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Comment not found.");
  if (!FLOW[c.status].includes(to)) throw new DomainError("INVALID_TRANSITION", `A ${c.status.toLowerCase()} comment cannot move to ${to.toLowerCase()}.`);
  if (to === "RESOLVED" && !(resolution ?? c.resolution)) throw new DomainError("VALIDATION", "Describe the resolution before resolving.");
  c.history.push({ at: now(), entry: entry || `${c.status} → ${to}${to === "VERIFIED" ? " (self-verified on mobile)" : ""}`, from_status: c.status, to_status: to, by });
  c.status = to;
  if (resolution) c.resolution = resolution;
  return `${c.comment_no} → ${to.toLowerCase()}`;
}

export function addCommentNote(p: Project, id: string, entry: string, by: string) {
  const c = p.comments.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Comment not found.");
  if (!entry.trim()) throw new DomainError("VALIDATION", "Write a note.");
  c.history.push({ at: now(), entry: entry.trim(), from_status: null, to_status: null, by });
  return `${c.comment_no} note`;
}

// ---------------------------------------------------------------- risks & issues
export function addRisk(p: Project, v: { title: string; category?: string; likelihood?: Risk["likelihood"]; severity?: Risk["severity"]; mitigation?: string | null; responsibleName?: string | null; dueDate?: string | null }) {
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Describe the risk.");
  const no = nextNo(p.risks.map((r) => r.risk_no), "RSK");
  p.risks.push({
    id: uuid(), risk_no: no, title: v.title.trim(), description: null, category: v.category ?? "TECHNICAL", likelihood: v.likelihood ?? "MEDIUM", severity: v.severity ?? "MEDIUM",
    mitigation: v.mitigation || null, responsible_name: v.responsibleName || null, due_date: v.dueDate || null, status: "OPEN", realised_issue_id: null,
  });
  return `${no} ${v.title}`;
}
export function setRiskStatus(p: Project, id: string, status: "OPEN" | "MITIGATED" | "CLOSED") {
  const r = p.risks.find((x) => x.id === id);
  if (!r) throw new DomainError("NOT_FOUND", "Risk not found.");
  if (r.status === "REALISED") throw new DomainError("INVALID_TRANSITION", "A realised risk is managed through its issue.");
  r.status = status;
  return `${r.risk_no} ${status.toLowerCase()}`;
}
export function realiseRisk(p: Project, id: string, note: string) {
  const r = p.risks.find((x) => x.id === id);
  if (!r) throw new DomainError("NOT_FOUND", "Risk not found.");
  if (r.status === "REALISED" || r.status === "CLOSED") throw new DomainError("INVALID_TRANSITION", `A ${r.status.toLowerCase()} risk cannot be realised.`);
  addIssue(p, { title: `${r.risk_no} realised: ${r.title}`, description: note, issueType: "risk_realised", severity: r.severity.toLowerCase() as "medium" });
  const issue = p.issues.at(-1)!;
  r.status = "REALISED";
  r.realised_issue_id = issue.id;
  link(p, { type: "ISSUE", id: issue.id }, { type: "RISK", id: r.id }, "GENERATED_BY");
  return `${r.risk_no} realised → ${issue.issue_no}`;
}
export function addIssue(p: Project, v: { title: string; description?: string | null; issueType?: string; severity?: "low" | "medium" | "high" | "critical"; responsibleName?: string | null; dueDate?: string | null }) {
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Describe the issue.");
  const no = nextNo(p.issues.map((i) => i.issue_no), "ISS");
  p.issues.push({
    id: uuid(), issue_no: no, issue_type: v.issueType ?? "general", title: v.title.trim(), description: v.description || null, severity: v.severity ?? "medium", status: "open",
    responsible_name: v.responsibleName || null, due_date: v.dueDate || null, resolution: null, created_at: now(), closed_at: null,
  });
  return `${no} ${v.title}`;
}
export function closeIssue(p: Project, id: string, resolution: string) {
  const i = p.issues.find((x) => x.id === id);
  if (!i) throw new DomainError("NOT_FOUND", "Issue not found.");
  if (!resolution.trim()) throw new DomainError("VALIDATION", "Describe the resolution.");
  if (i.status === "closed") throw new DomainError("INVALID_TRANSITION", "This issue is already closed.");
  if (["submittal_mismatch", "electrical_interface", "controls_interface", "coordination", "design_review"].includes(i.issue_type)) {
    throw new DomainError("VERIFICATION_REQUIRED", "Engineering issues close through their verification workflow in the HVAC app.");
  }
  i.status = "closed";
  i.resolution = resolution.trim();
  i.closed_at = now();
  return `${i.issue_no} closed`;
}

// ---------------------------------------------------------------- changes
export function addContractChange(p: Project, v: { changeType: string; title: string; reason: string; description?: string | null; costEffect?: number | null; scheduleEffectDays?: number | null; documentId?: string | null }) {
  if (!v.title.trim() || !v.reason.trim()) throw new DomainError("VALIDATION", "A change needs a title and a reason.");
  if (!["contract_amendment", "variation", "client_instruction", "purchase_order", "supplemental_agreement", "scope_change", "other"].includes(v.changeType)) throw new DomainError("VALIDATION", "Choose the change type.");
  if (v.scheduleEffectDays != null && !Number.isInteger(v.scheduleEffectDays)) throw new DomainError("VALIDATION", "Schedule effect is a whole number of days.");
  const no = nextNo(p.changes.map((c) => c.change_no), "CHG");
  const c: Change = {
    id: uuid(), change_no: no, change_class: "contractual", change_type: v.changeType, title: v.title.trim(), reason: v.reason.trim(), description: v.description || null,
    cost_effect: v.costEffect ?? null, schedule_effect_days: v.scheduleEffectDays ?? null, document_id: v.documentId || null, status: "pending_approval",
    initiated_at: now(), decided_at: null, decision_note: null,
  };
  p.changes.push(c);
  if (c.document_id) link(p, { type: "CHANGE_RECORD", id: c.id }, { type: "DOCUMENT", id: c.document_id }, "GENERATED_BY");
  return `${no} ${c.title}`;
}
export function decideChange(p: Project, id: string, decision: "approved" | "rejected", note: string) {
  const c = p.changes.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Change not found.");
  if (c.change_class !== "contractual") throw new DomainError("INVALID_TRANSITION", "Engineering changes are resolved through their impacts (HVAC app).");
  if (c.status !== "pending_approval") throw new DomainError("INVALID_TRANSITION", `This change is ${c.status.replace(/_/g, " ")}.`);
  c.status = decision;
  c.decided_at = now();
  c.decision_note = note || null;
  return `${c.change_no} ${decision}`;
}

// ---------------------------------------------------------------- documents & assets
export function addDocument(p: Project, v: { title: string; category?: string; version?: string | null; docDate?: string | null; location?: string | null }) {
  if (!v.title.trim()) throw new DomainError("VALIDATION", "Enter the document title.");
  const no = nextNo(p.documents.map((d) => d.doc_no), "DOC");
  p.documents.push({ id: uuid(), doc_no: no, category: v.category ?? "Other", title: v.title.trim(), version: v.version || null, doc_date: v.docDate || null, location: v.location || null, file_name: null, extracted_text: null, notes: null });
  return `${no} ${v.title}`;
}
export function setDocumentText(p: Project, id: string, text: string, fileName: string) {
  const d = p.documents.find((x) => x.id === id);
  if (!d) throw new DomainError("NOT_FOUND", "Document not found.");
  if (!text.trim()) throw new DomainError("VALIDATION", "The file has no readable text.");
  d.extracted_text = text;
  d.file_name = fileName;
  d.location ??= fileName;
  return `${d.doc_no} text from ${fileName}`;
}
export function addAsset(p: Project, v: { name: string; serialOrTag?: string | null; location?: string | null; status?: "IN_STOCK" | "DEPLOYED" | "MAINTENANCE" | "DECOMMISSIONED" }) {
  if (!v.name.trim()) throw new DomainError("VALIDATION", "Enter the asset name.");
  const no = nextNo(p.assets.map((a) => a.asset_no), "AST");
  p.assets.push({ id: uuid(), asset_no: no, name: v.name.trim(), serial_or_tag: v.serialOrTag || null, location: v.location || null, status: v.status ?? "IN_STOCK" });
  return `${no} ${v.name}`;
}
