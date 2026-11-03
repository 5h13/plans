import { useState, type ReactNode } from "react";
import type { Comment, EntityType, Risk } from "../lib/model";
import { getState, mutate } from "../lib/store";
import { go, href, useQuery } from "../lib/router";
import { compareTexts, docxText } from "../shared/compare/text";
import {
  COMMENT_NEXT, addAsset, addComment, addCommentNote, addContractChange, addDocument, addIssue, addRisk, closeIssue, decideChange, labelOf, linksOf, moveComment, realiseRisk, setDocumentText, setRiskStatus,
} from "../lib/domain/registers";
import { Badge, Button, Card, Empty, Field, PageTitle, Row, fmt, inputCls, money, useCommand, type Tone } from "../ui/ui";
import { formData } from "../ui/forms";
import { MenuList } from "./ProjectShell";
import type { ScreenProps } from "./registry";

const by = () => getState().library.settings?.ownerName ?? "me";
const C_TONE: Record<Comment["status"], Tone> = { OPEN: "amber", IN_PROGRESS: "blue", RESOLVED: "violet", VERIFIED: "green", CLOSED: "slate", DEFERRED: "slate" };
const SEV_TONE: Record<string, Tone> = { LOW: "slate", MEDIUM: "amber", HIGH: "red", CRITICAL: "red", low: "slate", medium: "amber", high: "red", critical: "red" };

function Back({ p, to = "registers", label = "Registers" }: { p: { id: string }; to?: string; label?: string }) {
  return <a href={href(`/p/${p.id}/${to}`)} className="text-sm text-blue-700">‹ {label}</a>;
}

function Toggle({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? <Card title={label} actions={<button className="text-sm text-slate-500" onClick={() => setOpen(false)}>Cancel</button>}>{children(() => setOpen(false))}</Card> : <Button variant="secondary" onClick={() => setOpen(true)}>+ {label}</Button>;
}

// ---------------------------------------------------------------- menu
export function RegistersScreen({ p }: ScreenProps) {
  const b = `/p/${p.id}`;
  const openC = p.comments.filter((c) => !["CLOSED", "VERIFIED"].includes(c.status)).length;
  const openR = p.risks.filter((r) => r.status === "OPEN").length;
  const openI = p.issues.filter((i) => i.status === "open").length;
  const pendC = p.changes.filter((c) => c.status === "pending_approval").length;
  return (
    <div className="space-y-4">
      <PageTitle title="Registers" />
      <MenuList items={[
        { to: `${b}/comments`, label: "Comments", sub: `${p.comments.length} logged`, badge: openC ? <Badge tone="amber">{openC} open</Badge> : undefined },
        { to: `${b}/risks`, label: "Risks & issues", sub: `${p.risks.length} risks · ${p.issues.length} issues`, badge: openR + openI ? <Badge tone="amber">{openR + openI} open</Badge> : undefined },
        { to: `${b}/changes`, label: "Changes", sub: `${p.changes.length} recorded`, badge: pendC ? <Badge tone="amber">{pendC} pending</Badge> : undefined },
        { to: `${b}/documents`, label: "Documents & assets", sub: `${p.documents.length} documents · ${p.assets.length} assets` },
      ]} />
    </div>
  );
}

// ---------------------------------------------------------------- comments
function linkTargets(p: ScreenProps["p"]) {
  const out: Array<{ v: string; l: string }> = [];
  const add = (t: EntityType, xs: Array<{ id: string }>) => xs.forEach((x) => out.push({ v: `${t}:${x.id}`, l: labelOf(p, t, x.id) }));
  add("DELIVERABLE", p.deliverables); add("MILESTONE", p.milestones); add("DOCUMENT", p.documents); add("CHANGE_RECORD", p.changes); add("RISK", p.risks); add("ISSUE", p.issues);
  return out;
}

export function CommentsScreen({ p }: ScreenProps) {
  const q = useQuery();
  const preset = q.get("on");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const cmd = useCommand();
  const list = [...p.comments].reverse().filter((c) => filter === "all" || !["CLOSED", "VERIFIED"].includes(c.status));
  const targets = linkTargets(p);
  return (
    <div className="space-y-4">
      <Back p={p} />
      <PageTitle title="Comments" sub="Review comments, requirements and queries, tracked to verification." />
      <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => {
        const f = formData(e);
        const on = f.opt("on");
        const [t, id] = on ? on.split(":") : [];
        void cmd.run(() => mutate(p.id, (x) => addComment(x, { title: f.s("title"), body: f.opt("body"), category: f.s("category"), priority: f.s("priority") as Comment["priority"], critical: f.fd.get("critical") === "on", responsibleName: f.opt("responsible"), on: on ? { type: t as EntityType, id } : undefined }, by()), "comment.add")).then((ok) => { if (ok) { f.form.reset(); if (preset) go(`/p/${p.id}/comments`); } });
      }}>
        <h2 className="text-sm font-semibold">Log a comment</h2>
        <Field label="Comment"><input name="title" required className={inputCls} /></Field>
        <Field label="Details"><textarea name="body" rows={2} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select name="category" className={inputCls}>{["Requirement", "Design review", "Client", "Coordination", "Query", "Other"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Priority"><select name="priority" defaultValue="NORMAL" className={inputCls}>{["LOW", "NORMAL", "HIGH", "CRITICAL"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</select></Field>
        </div>
        <Field label="Raised on"><select name="on" defaultValue={preset ?? ""} className={inputCls}><option value="">— (project)</option>{targets.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
        <Field label="Responsible"><input name="responsible" className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="critical" /> Critical (blocks readiness until verified)</label>
        <Button type="submit">Log comment</Button>
        {cmd.message}
      </form>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(["open", "all"] as const).map((k) => <button key={k} onClick={() => setFilter(k)} className={`flex-1 rounded-md py-1.5 ${filter === k ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{k === "open" ? "Open" : "All"}</button>)}
      </div>
      {list.length === 0 ? <Empty>No comments.</Empty> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {list.map((c) => (
            <li key={c.id}>
              <a href={href(`/p/${p.id}/comment/${c.id}`)} className="flex items-center justify-between gap-3 px-4 py-2.5 active:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm"><span className="font-mono text-xs text-slate-500">{c.comment_no}</span> {c.title}</span>
                  <span className="block text-xs text-slate-500">{c.category}{c.responsible_name ? ` · ${c.responsible_name}` : ""}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <Badge tone={C_TONE[c.status]}>{c.status.replace("_", " ").toLowerCase()}</Badge>
                  {(c.critical || c.priority === "CRITICAL" || c.priority === "HIGH") && <Badge tone="red">{c.critical ? "critical" : c.priority.toLowerCase()}</Badge>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommentScreen({ p, params }: ScreenProps) {
  const c = p.comments.find((x) => x.id === params[0]);
  const cmd = useCommand();
  const [to, setTo] = useState<Comment["status"] | "">("");
  if (!c) return <Empty>Comment not found.</Empty>;
  const links = linksOf(p, "COMMENT", c.id);
  return (
    <div className="space-y-4">
      <Back p={p} to="comments" label="Comments" />
      <PageTitle title={`${c.comment_no} ${c.title}`} sub={`${c.category} · ${c.priority.toLowerCase()} priority${c.critical ? " · critical" : ""}`} actions={<Badge tone={C_TONE[c.status]}>{c.status.replace("_", " ").toLowerCase()}</Badge>} />
      <Card>
        {c.body && <p className="mb-2 whitespace-pre-wrap text-sm">{c.body}</p>}
        <Row k="Responsible" v={c.responsible_name} />
        <Row k="Logged" v={fmt(c.created_at)} />
        <Row k="Resolution" v={c.resolution} />
        <Row k="Raised on" v={links.length ? links.map((l) => l.other_label).join("; ") : "project"} />
      </Card>
      <Card title="Move">
        <div className="flex flex-wrap gap-2">
          {COMMENT_NEXT[c.status].map((s) => <Button key={s} variant={to === s ? "primary" : "secondary"} onClick={() => setTo(s)}>{s.replace("_", " ").toLowerCase()}</Button>)}
        </div>
        {to && (
          <form className="mt-3 space-y-3" onSubmit={(e) => {
            const f = formData(e);
            void cmd.run(() => mutate(p.id, (x) => moveComment(x, c.id, to, f.s("entry"), f.opt("resolution"), by()), "comment.move")).then((ok) => ok && setTo(""));
          }}>
            {to === "RESOLVED" && <Field label="Resolution"><textarea name="resolution" rows={2} defaultValue={c.resolution ?? ""} className={inputCls} /></Field>}
            {to === "VERIFIED" && <p className="text-xs text-slate-500">On mobile you verify your own resolutions; the history records it as self-verified.</p>}
            <Field label="Note (optional)"><input name="entry" className={inputCls} /></Field>
            <Button type="submit" variant={to === "VERIFIED" || to === "CLOSED" ? "approve" : "primary"}>Move to {to.replace("_", " ").toLowerCase()}</Button>
          </form>
        )}
        <div className="mt-2">{cmd.message}</div>
      </Card>
      <Card title="History">
        <ol className="space-y-2 text-sm">
          {[...c.history].reverse().map((h, i) => (
            <li key={i} className="border-l-2 border-slate-200 pl-3">
              <div className="text-xs text-slate-500">{fmt(h.at)} · {h.by}{h.to_status ? ` · → ${h.to_status.toLowerCase()}` : ""}</div>
              <div>{h.entry}</div>
            </li>
          ))}
        </ol>
        <form className="mt-3 flex gap-2" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addCommentNote(x, c.id, f.s("note"), by()), "comment.note")).then((ok) => ok && f.form.reset());
        }}>
          <input name="note" placeholder="Add a note" className={inputCls} />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- risks & issues
export function RisksScreen({ p }: ScreenProps) {
  const cmd = useCommand();
  return (
    <div className="space-y-4">
      <Back p={p} />
      <PageTitle title="Risks & issues" />
      <Card title={`Risks (${p.risks.length})`}>
        {p.risks.length === 0 ? <Empty>No risks recorded.</Empty> : (
          <ul className="-mx-4 -my-2 divide-y divide-slate-100">
            {[...p.risks].reverse().map((r) => <RiskItem key={r.id} pid={p.id} r={r} run={cmd.run} />)}
          </ul>
        )}
      </Card>
      <Toggle label="Risk">{(close) => (
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addRisk(x, { title: f.s("title"), category: f.s("category"), likelihood: f.s("likelihood") as Risk["likelihood"], severity: f.s("severity") as Risk["severity"], mitigation: f.opt("mitigation"), responsibleName: f.opt("responsible"), dueDate: f.opt("due") }), "risk.add")).then((ok) => ok && close());
        }}>
          <Field label="Risk"><input name="title" required className={inputCls} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Category"><select name="category" className={inputCls}>{["TECHNICAL", "SCHEDULE", "COST", "SCOPE", "EXTERNAL"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</select></Field>
            <Field label="Likelihood"><select name="likelihood" defaultValue="MEDIUM" className={inputCls}>{["LOW", "MEDIUM", "HIGH"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</select></Field>
            <Field label="Severity"><select name="severity" defaultValue="MEDIUM" className={inputCls}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</select></Field>
          </div>
          <Field label="Mitigation"><textarea name="mitigation" rows={2} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsible"><input name="responsible" className={inputCls} /></Field>
            <Field label="Due"><input type="date" name="due" className={inputCls} /></Field>
          </div>
          <Button type="submit">Add risk</Button>
        </form>
      )}</Toggle>
      <Card title={`Issues (${p.issues.length})`}>
        {p.issues.length === 0 ? <Empty>No issues.</Empty> : (
          <ul className="-mx-4 -my-2 divide-y divide-slate-100">
            {[...p.issues].reverse().map((i) => (
              <li key={i.id} className="px-4 py-2.5">
                <div className="flex justify-between gap-2">
                  <span className="text-sm"><span className="font-mono text-xs text-slate-500">{i.issue_no}</span> {i.title}</span>
                  <span className="flex shrink-0 gap-1"><Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge><Badge tone={i.status === "open" ? "amber" : "green"}>{i.status}</Badge></span>
                </div>
                {i.description && <p className="text-xs text-slate-600">{i.description}</p>}
                {i.resolution && <p className="text-xs text-emerald-800">Resolution: {i.resolution}</p>}
                {i.status === "open" && (
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => closeIssue(x, i.id, f.s("resolution")), "issue.close")); }}>
                    <input name="resolution" placeholder="Resolution" className={inputCls} />
                    <Button type="submit" variant="approve">Close</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Toggle label="Issue">{(close) => (
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addIssue(x, { title: f.s("title"), description: f.opt("description"), severity: f.s("severity") as "medium", responsibleName: f.opt("responsible"), dueDate: f.opt("due") }), "issue.add")).then((ok) => ok && close());
        }}>
          <Field label="Issue"><input name="title" required className={inputCls} /></Field>
          <Field label="Description"><textarea name="description" rows={2} className={inputCls} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Severity"><select name="severity" defaultValue="medium" className={inputCls}>{["low", "medium", "high", "critical"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Responsible"><input name="responsible" className={inputCls} /></Field>
            <Field label="Due"><input type="date" name="due" className={inputCls} /></Field>
          </div>
          <Button type="submit">Add issue</Button>
        </form>
      )}</Toggle>
      {cmd.message}
    </div>
  );
}

function RiskItem({ pid, r, run }: { pid: string; r: Risk; run: ReturnType<typeof useCommand>["run"] }) {
  const [realising, setRealising] = useState(false);
  return (
    <li className="px-4 py-2.5">
      <div className="flex justify-between gap-2">
        <span className="text-sm"><span className="font-mono text-xs text-slate-500">{r.risk_no}</span> {r.title}</span>
        <span className="flex shrink-0 gap-1"><Badge tone={SEV_TONE[r.severity]}>{r.likelihood[0]}/{r.severity[0]}</Badge><Badge tone={r.status === "OPEN" ? "amber" : r.status === "REALISED" ? "red" : "green"}>{r.status.toLowerCase()}</Badge></span>
      </div>
      <p className="text-xs text-slate-600">{r.category.toLowerCase()}{r.responsible_name ? ` · ${r.responsible_name}` : ""}{r.due_date ? ` · due ${r.due_date}` : ""}</p>
      {r.mitigation && <p className="text-xs text-slate-600">Mitigation: {r.mitigation}</p>}
      {r.status !== "REALISED" && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(["OPEN", "MITIGATED", "CLOSED"] as const).filter((s) => s !== r.status).map((s) => <Button key={s} variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => void run(() => mutate(pid, (x) => setRiskStatus(x, r.id, s), "risk.status"))}>{s.toLowerCase()}</Button>)}
          {r.status !== "CLOSED" && <Button variant="danger" className="min-h-8 px-2 py-1 text-xs" onClick={() => setRealising(!realising)}>Realised…</Button>}
        </div>
      )}
      {realising && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { const f = formData(e); void run(() => mutate(pid, (x) => realiseRisk(x, r.id, f.s("note")), "risk.realise")).then((ok) => ok && setRealising(false)); }}>
          <input name="note" placeholder="What happened?" className={inputCls} />
          <Button type="submit" variant="danger">Raise issue</Button>
        </form>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- changes
/** Same keys as desktop (app.changes contractual change_type). */
export const CHANGE_TYPES: Array<[string, string]> = [
  ["variation", "Variation / change order"], ["client_instruction", "Client instruction"], ["contract_amendment", "Contract amendment"],
  ["scope_change", "Scope change"], ["purchase_order", "Revised purchase order"], ["supplemental_agreement", "Supplemental agreement"], ["other", "Other"],
];
export function ChangesScreen({ p }: ScreenProps) {
  const cmd = useCommand();
  const [deciding, setDeciding] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Back p={p} />
      <PageTitle title="Changes" sub="Contractual changes: scope, fee and schedule. Engineering changes are handled in the HVAC app." />
      {p.changes.length === 0 ? <Card><Empty>No changes recorded.</Empty></Card> : (
        <ul className="space-y-2">
          {[...p.changes].reverse().map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-2">
                <span className="text-sm font-medium"><span className="font-mono text-xs text-slate-500">{c.change_no}</span> {c.title}</span>
                <Badge tone={c.status === "approved" ? "green" : c.status === "rejected" ? "red" : c.status === "pending_approval" ? "amber" : "slate"}>{c.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-600">{c.change_class} · {CHANGE_TYPES.find(([k]) => k === c.change_type)?.[1] ?? c.change_type} · {fmt(c.initiated_at)}</p>
              <p className="mt-1 text-sm">{c.reason}</p>
              <div className="mt-1 flex gap-4 text-xs text-slate-600">
                <span>Cost: {c.cost_effect == null ? "—" : money(c.cost_effect, p.currency)}</span>
                <span>Schedule: {c.schedule_effect_days == null ? "—" : `${c.schedule_effect_days > 0 ? "+" : ""}${c.schedule_effect_days} d`}</span>
                {c.document_id && <span>Doc: {labelOf(p, "DOCUMENT", c.document_id)}</span>}
              </div>
              {c.decision_note && <p className="mt-1 text-xs text-slate-600">Decision: {c.decision_note}</p>}
              {c.status === "pending_approval" && c.change_class === "contractual" && (deciding === c.id ? (
                <form className="mt-2 space-y-2" onSubmit={(e) => {
                  const f = formData(e);
                  const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") as "approved" | "rejected";
                  void cmd.run(() => mutate(p.id, (x) => decideChange(x, c.id, decision, f.s("note")), "change.decide")).then((ok) => ok && setDeciding(null));
                }}>
                  <input name="note" placeholder="Decision note (self-approved on mobile)" className={inputCls} />
                  <div className="flex gap-2">
                    <button type="submit" value="approved" className="min-h-10 flex-1 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white">Approve</button>
                    <button type="submit" value="rejected" className="min-h-10 flex-1 rounded-lg bg-red-700 px-3 text-sm font-medium text-white">Reject</button>
                  </div>
                </form>
              ) : <Button variant="secondary" className="mt-2" onClick={() => setDeciding(c.id)}>Decide…</Button>)}
            </li>
          ))}
        </ul>
      )}
      <Toggle label="Change">{(close) => (
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addContractChange(x, { changeType: f.s("changeType"), title: f.s("title"), reason: f.s("reason"), description: f.opt("description"), costEffect: f.num("cost"), scheduleEffectDays: f.num("days"), documentId: f.opt("documentId") }), "change.add")).then((ok) => ok && close());
        }}>
          <Field label="Title"><input name="title" required className={inputCls} /></Field>
          <Field label="Type"><select name="changeType" className={inputCls}>{CHANGE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Reason"><textarea name="reason" required rows={2} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Cost effect (${p.currency})`}><input name="cost" inputMode="decimal" className={inputCls} /></Field>
            <Field label="Schedule effect (days)"><input name="days" inputMode="numeric" className={inputCls} /></Field>
          </div>
          <Field label="Source document"><select name="documentId" className={inputCls}><option value="">—</option>{p.documents.map((d) => <option key={d.id} value={d.id}>{d.doc_no} {d.title}</option>)}</select></Field>
          <Button type="submit">Record change</Button>
        </form>
      )}</Toggle>
      {cmd.message}
    </div>
  );
}

// ---------------------------------------------------------------- documents & assets
async function readFileText(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) {
    return docxText(await file.arrayBuffer());
  }
  if (/\.(txt|md|csv|json|xml|html?)$/i.test(file.name) || file.type.startsWith("text/")) return file.text();
  throw new Error("Use a Word (.docx) or text file. PDFs: copy the text into a .txt file first.");
}

export function DocumentsScreen({ p }: ScreenProps) {
  const cmd = useCommand();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const withText = p.documents.filter((d) => d.extracted_text);
  return (
    <div className="space-y-4">
      <Back p={p} />
      <PageTitle title="Documents & assets" />
      {p.documents.length === 0 ? <Card><Empty>No documents registered.</Empty></Card> : (
        <ul className="space-y-2">
          {[...p.documents].reverse().map((d) => (
            <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-2">
                <span className="text-sm font-medium"><span className="font-mono text-xs text-slate-500">{d.doc_no}</span> {d.title}</span>
                {d.version && <Badge>v {d.version}</Badge>}
              </div>
              <p className="text-xs text-slate-600">{d.category}{d.doc_date ? ` · ${d.doc_date}` : ""}{d.location ? ` · ${d.location}` : ""}</p>
              <p className="mt-1 text-xs">{d.extracted_text ? <span className="text-emerald-700">Text loaded from {d.file_name} ({d.extracted_text.length.toLocaleString()} chars)</span> : <span className="text-slate-500">No text loaded</span>}</p>
              <label className="mt-2 inline-block cursor-pointer rounded-lg px-3 py-1.5 text-sm text-blue-700 ring-1 ring-slate-300">
                {d.extracted_text ? "Replace text…" : "Load text from file…"}
                <input type="file" accept=".docx,.txt,.md,.csv,text/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void cmd.run(async () => { const text = await readFileText(file); return mutate(p.id, (x) => setDocumentText(x, d.id, text, file.name), "document.text"); });
                }} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <Toggle label="Document">{(close) => (
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addDocument(x, { title: f.s("title"), category: f.s("category"), version: f.opt("version"), docDate: f.opt("docDate"), location: f.opt("location") }), "document.add")).then((ok) => ok && close());
        }}>
          <Field label="Title"><input name="title" required className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select name="category" className={inputCls}>{["Contract", "Specification", "Drawing", "Correspondence", "Minutes", "Report", "Other"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Version"><input name="version" className={inputCls} /></Field>
            <Field label="Date"><input type="date" name="docDate" className={inputCls} /></Field>
            <Field label="Location / link"><input name="location" className={inputCls} /></Field>
          </div>
          <Button type="submit">Register document</Button>
        </form>
      )}</Toggle>
      {cmd.message}

      <Card title="Compare two documents">
        {withText.length < 2 ? <p className="text-sm text-slate-500">Load text into at least two documents to compare them (e.g. contract rev A vs rev B).</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Before" value={a} onChange={(e) => setA(e.target.value)} className={inputCls}><option value="">Before…</option>{withText.map((d) => <option key={d.id} value={d.id}>{d.doc_no} {d.title}</option>)}</select>
              <select aria-label="After" value={b} onChange={(e) => setB(e.target.value)} className={inputCls}><option value="">After…</option>{withText.map((d) => <option key={d.id} value={d.id}>{d.doc_no} {d.title}</option>)}</select>
            </div>
            {a && b && <Comparison before={p.documents.find((d) => d.id === a)!.extracted_text!} after={p.documents.find((d) => d.id === b)!.extracted_text!} />}
          </div>
        )}
      </Card>

      <Card title={`Assets (${p.assets.length})`}>
        {p.assets.length === 0 ? <Empty>No assets.</Empty> : (
          <ul className="-mx-4 -my-2 divide-y divide-slate-100">{p.assets.map((x) => (
            <li key={x.id} className="flex justify-between gap-2 px-4 py-2 text-sm"><span><span className="font-mono text-xs text-slate-500">{x.asset_no}</span> {x.name}{x.serial_or_tag ? ` · ${x.serial_or_tag}` : ""}</span><Badge>{x.status.replace("_", " ").toLowerCase()}</Badge></li>
          ))}</ul>
        )}
      </Card>
      <Toggle label="Asset">{(close) => (
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => addAsset(x, { name: f.s("name"), serialOrTag: f.opt("tag"), location: f.opt("location"), status: f.s("status") as "IN_STOCK" }), "asset.add")).then((ok) => ok && close());
        }}>
          <Field label="Name"><input name="name" required className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serial / tag"><input name="tag" className={inputCls} /></Field>
            <Field label="Location"><input name="location" className={inputCls} /></Field>
          </div>
          <Field label="Status"><select name="status" className={inputCls}>{["IN_STOCK", "DEPLOYED", "MAINTENANCE", "DECOMMISSIONED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select></Field>
          <Button type="submit">Add asset</Button>
        </form>
      )}</Toggle>
    </div>
  );
}

export function Comparison({ before, after }: { before: string; after: string }) {
  const [showSame, setShowSame] = useState(false);
  let r: ReturnType<typeof compareTexts>;
  try { r = compareTexts(before, after); } catch (e) { return <p className="text-sm text-red-700">{(e as Error).message}</p>; }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="green">{r.counts.added} added</Badge><Badge tone="red">{r.counts.removed} removed</Badge><Badge tone="amber">{r.counts.changed} changed</Badge><Badge>{r.counts.same} same</Badge>
        <span className="text-slate-500">{Math.round(r.similarity * 100)}% unchanged</span>
        <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> show unchanged</label>
      </div>
      <ol className="space-y-1.5 text-sm">
        {r.paragraphs.filter((x) => showSame || x.kind !== "same").map((x, i) => (
          <li key={i} className={`rounded px-2 py-1 ${x.kind === "added" ? "bg-emerald-50" : x.kind === "removed" ? "bg-red-50 line-through decoration-red-400" : x.kind === "changed" ? "bg-amber-50" : "text-slate-500"}`}>
            {x.kind === "changed" ? x.words!.map((w, j) => <span key={j} className={w.kind === "added" ? "bg-emerald-200" : w.kind === "removed" ? "bg-red-200 line-through" : ""}>{w.text}</span>) : x.after ?? x.before}
          </li>
        ))}
        {r.paragraphs.every((x) => x.kind === "same") && <li className="text-slate-500">The two texts are identical.</li>}
      </ol>
    </div>
  );
}
