import { useMemo, useState } from "react";
import { getState, mutate, putProject, useStore } from "../lib/store";
import { go, href } from "../lib/router";
import { ACCEPT, readDocument } from "../lib/ingest/read";
import { driverValues, extractOffline, mergeAi, type Proposal, type ProposalKey } from "../lib/ingest/extract";
import { proposeChanges, type ChangeProposal } from "../lib/ingest/revision";
import { aiExtract, aiProposeChanges, aiReady } from "../lib/ingest/ai";
import { ingestRevision, nextVersion, projectFromDocument, type SourceFile } from "../lib/domain/contract";
import { DomainError } from "../lib/util";
import { Badge, Button, Card, Empty, Field, PageTitle, inputCls, money, useCommand, type Tone } from "../ui/ui";
import { CHANGE_TYPES } from "./RegisterScreens";
import type { ScreenProps } from "./registry";

const CONF_TONE: Record<Proposal["confidence"], Tone> = { high: "green", medium: "blue", low: "amber" };
const LONG = (k: string) => k.startsWith("definition.") && !["definition.budget_limit", "definition.target_start", "definition.target_finish"].includes(k);
const GROUPS: Array<[string, (k: string) => boolean]> = [
  ["Project", (k) => k.startsWith("project.")],
  ["Dates and money", (k) => ["definition.budget_limit", "definition.target_start", "definition.target_finish"].includes(k)],
  ["Size of the job", (k) => k.startsWith("driver.")],
  ["Definition", (k) => LONG(k)],
];

function FilePicker({ label, onFile, busy }: { label: string; onFile: (f: File) => void; busy: boolean }) {
  return (
    <label className={`block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 text-center ${busy ? "opacity-60" : "active:bg-slate-50"}`}>
      <span className="block text-base font-semibold">{busy ? "Reading…" : label}</span>
      <span className="mt-1 block text-xs text-slate-500">Word (.docx), PDF or text. Read on this device.</span>
      <input type="file" accept={ACCEPT} className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

// ---------------------------------------------------------------- start a project from a document
export function StartFromDocument() {
  const lib = useStore((s) => s.library);
  const cmd = useCommand();
  const aiCmd = useCommand();
  const [file, setFile] = useState<SourceFile | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [templateKey, setTemplateKey] = useState<string>("general");
  const [suggested, setSuggested] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const apply = (ps: Proposal[]) => {
    setProposals(ps);
    setValues(Object.fromEntries(ps.map((p) => [p.key, p.value])));
    setChecked(Object.fromEntries(ps.map((p) => [p.key, p.confidence !== "low" || p.key === "project.name"])));
  };
  const runAi = (f: SourceFile, base: Proposal[]) => {
    const s = getState().library.settings;
    if (!aiReady(s)) return;
    void aiCmd.run(async () => {
      const r = await aiExtract(s.ai, f.text, lib.templates);
      const merged = mergeAi(base, r.proposals);
      apply(merged);
      if (r.templateKey) { setSuggested(r.templateKey); setTemplateKey(r.templateKey); }
      return `AI reading added (${r.proposals.length} facts). Check the marked items.`;
    });
  };
  const onFile = (f: File) => {
    setBusy(true);
    void cmd.run(async () => {
      try {
        const r = await readDocument(f.name, await f.arrayBuffer());
        const src = { name: f.name, text: r.text, kind: r.kind };
        const x = extractOffline(r.text, lib.templates, f.name);
        setFile(src);
        setSuggested(x.templateKey);
        setTemplateKey(x.templateKey);
        apply(x.proposals);
        runAi(src, x.proposals);
        return `Read ${f.name}${r.pages ? ` (${r.pages} pages)` : ""}: ${x.proposals.length} facts found in ${x.sections.filter((s) => s.heading).length} sections.`;
      } finally { setBusy(false); }
    });
  };
  // Drivers belong to the chosen template: re-read them when the template changes.
  const chooseTemplate = (k: string) => {
    setTemplateKey(k);
    const t = lib.templates.find((x) => x.key === k);
    if (!file || !t) return;
    const rest = proposals.filter((p) => !p.key.startsWith("driver."));
    apply([...rest, ...driverValues(file.text, t)]);
  };
  const t = lib.templates.find((x) => x.key === templateKey);
  const missingDrivers = t ? t.drivers.filter((d) => !d.fromProjectArea && !proposals.some((p) => p.key === `driver.${d.key}`)) : [];

  return (
    <div className="space-y-4 p-4">
      <a href="#/new" className="text-sm text-blue-700">‹ New project</a>
      <PageTitle title="Start from a document" sub="Upload the contract or project definition. The project, its definition, dates and budget are proposed from it; you check each item before anything is saved." />
      {!file && <FilePicker label="Choose the contract or definition document" onFile={onFile} busy={busy} />}
      {cmd.message}
      {file && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void cmd.run(async () => {
            const vals: Partial<Record<ProposalKey, string>> = {};
            for (const p of proposals) if (checked[p.key]) vals[p.key] = values[p.key] ?? p.value;
            for (const d of missingDrivers) { const v = String(fd.get(`driver_${d.key}`) ?? ""); if (v) vals[`driver.${d.key}`] = v; }
            if (!vals["project.name"]) vals["project.name"] = String(fd.get("fallbackName") ?? "");
            const p = projectFromDocument(getState().library, Object.values(getState().projects), {
              templateKey, projectNo: String(fd.get("projectNo") ?? ""), category: String(fd.get("category") ?? "Contract"), version: String(fd.get("version") ?? "1"), values: vals, file,
            });
            await putProject(p);
            go(`/p/${p.id}/definition`);
          });
        }}>
          <Card title={file.name} actions={<button type="button" className="text-sm text-slate-500" onClick={() => { setFile(null); setProposals([]); cmd.clear(); }}>Change file</button>}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project number"><input name="projectNo" required className={inputCls} placeholder="e.g. PRJ-2026-014" /></Field>
              <Field label="Document is a">
                <select name="category" defaultValue="Contract" className={inputCls}><option>Contract</option><option value="Project definition">Project definition</option><option value="Proposal">Proposal / quotation</option><option value="Other">Other</option></select>
              </Field>
              <Field label="Version"><input name="version" defaultValue="1" className={inputCls} /></Field>
              <Field label="Template" hint={suggested ? `Suggested: ${lib.templates.find((x) => x.key === suggested)?.name}` : undefined}>
                <select value={templateKey} onChange={(e) => chooseTemplate(e.target.value)} className={inputCls}>{lib.templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
              </Field>
            </div>
            {aiReady(lib.settings) ? (
              <div className="mt-2 text-xs">{aiCmd.busy ? <span className="text-slate-500">AI is reading the document…</span> : aiCmd.message}
                {!aiCmd.busy && <button type="button" className="ml-2 text-blue-700" onClick={() => runAi(file, proposals)}>Read again with AI</button>}</div>
            ) : <p className="mt-2 text-xs text-slate-500">Read on this device. AI reading can be turned on in Settings.</p>}
          </Card>

          {!proposals.some((p) => p.key === "project.name") && (
            <Card title="Project name"><input name="fallbackName" required defaultValue={file.name.replace(/\.[a-z0-9]+$/i, "")} className={inputCls} /></Card>
          )}
          {GROUPS.map(([g, test]) => {
            const ps = proposals.filter((p) => test(p.key));
            if (!ps.length && !(g === "Size of the job" && missingDrivers.length)) return null;
            return (
              <Card key={g} title={g}>
                <ul className="space-y-4">
                  {ps.map((p) => (
                    <li key={p.key}>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" className="h-4 w-4" checked={!!checked[p.key]} onChange={(e) => setChecked({ ...checked, [p.key]: e.target.checked })} />
                        <span className="flex-1">{p.label}</span>
                        <Badge tone={CONF_TONE[p.confidence]}>{p.by === "ai" ? "AI" : p.confidence}</Badge>
                      </label>
                      {LONG(p.key)
                        ? <textarea aria-label={p.label} rows={Math.min(8, Math.max(2, Math.ceil((values[p.key] ?? "").length / 60)))} value={values[p.key] ?? ""} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} className={`${inputCls} mt-1 text-sm`} />
                        : <input aria-label={p.label} type={p.key.endsWith("_start") || p.key.endsWith("_finish") ? "date" : "text"} value={values[p.key] ?? ""} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} className={`${inputCls} mt-1`} />}
                      <p className="mt-1 text-xs text-slate-500">From: {p.source}</p>
                      {p.alt && <p className="mt-0.5 text-xs text-amber-800">{p.by === "ai" ? "Offline reading" : "AI"} found: “{p.alt.value.slice(0, 160)}” <button type="button" className="underline" onClick={() => setValues({ ...values, [p.key]: p.alt!.value })}>use this</button></p>}
                      {p.key === "definition.budget_limit" && values[p.key] && <p className="text-xs text-slate-500">{money(Number(values[p.key]), values["project.currency"] ?? lib.settings?.currency ?? "")}</p>}
                    </li>
                  ))}
                  {g === "Size of the job" && missingDrivers.map((d) => (
                    <li key={d.key}><Field label={`${d.label} (${d.unit}) — not found in the document`}><input name={`driver_${d.key}`} inputMode="decimal" defaultValue={d.default} className={inputCls} /></Field></li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {proposals.length === 0 && <Card><Empty>Nothing could be read automatically. You can still create the project; the document is registered and you fill in the definition by hand.</Empty></Card>}
          {cmd.message}
          <Button type="submit" className="w-full">Create project from this document</Button>
          <p className="text-center text-xs text-slate-500">Only ticked items are used. The document is kept in the project's documents as version 1.</p>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ingest a revised contract
export function ReviseContract({ p, params }: ScreenProps) {
  const lib = useStore((s) => s.library);
  const cmd = useCommand();
  const aiCmd = useCommand();
  const candidates = useMemo(() => p.documents.filter((d) => d.extracted_text).slice().reverse(), [p.documents]);
  const latestContract = candidates.find((d) => /contract/i.test(d.category)) ?? candidates[0];
  const [prevId, setPrevId] = useState(params[0] ?? latestContract?.id ?? "");
  const prev = p.documents.find((d) => d.id === prevId);
  const [file, setFile] = useState<SourceFile | null>(null);
  const [items, setItems] = useState<Array<ChangeProposal & { take: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"rules" | "ai">("rules");

  const load = (ps: ChangeProposal[], by: "rules" | "ai") => { setItems(ps.map((x) => ({ ...x, take: true }))); setSource(by); };
  const runAi = (f: SourceFile) => {
    const s = getState().library.settings;
    if (!aiReady(s) || !prev?.extracted_text) return;
    void aiCmd.run(async () => {
      const ps = await aiProposeChanges(s.ai, prev.extracted_text!, f.text);
      load(ps, "ai");
      return `AI found ${ps.length} change(s).`;
    });
  };
  const onFile = (f: File) => {
    if (!prev?.extracted_text) { void cmd.run(() => { throw new DomainError("VALIDATION", "Choose the document this file revises (it needs its text loaded)."); }); return; }
    setBusy(true);
    void cmd.run(async () => {
      try {
        const r = await readDocument(f.name, await f.arrayBuffer());
        const src = { name: f.name, text: r.text, kind: r.kind };
        const ps = proposeChanges(prev.extracted_text!, r.text);
        setFile(src);
        load(ps, "rules");
        runAi(src);
        return ps.length ? `${ps.length} changed clause(s) found. Check each one before logging.` : "No changes found between the two versions.";
      } finally { setBusy(false); }
    });
  };
  const upd = (i: number, v: Partial<ChangeProposal & { take: boolean }>) => setItems(items.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const taken = items.filter((x) => x.take);

  if (!candidates.length) {
    return (
      <div className="space-y-4">
        <a href={href(`/p/${p.id}/documents`)} className="text-sm text-blue-700">‹ Documents</a>
        <PageTitle title="Revised contract" />
        <Card><Empty>Register the current contract first (Documents → + Document, then load its text), or start the project from the contract.</Empty></Card>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/changes`)} className="text-sm text-blue-700">‹ Changes</a>
      <PageTitle title="Revised contract" sub="Upload the new version. Each changed clause is proposed as a change record; you decide which are logged." />
      <Card title="Revises">
        <select aria-label="Revises" value={prevId} onChange={(e) => { setPrevId(e.target.value); setFile(null); setItems([]); }} className={inputCls}>
          {candidates.map((d) => <option key={d.id} value={d.id}>{d.doc_no} {d.title} · v{d.version ?? "—"}</option>)}
        </select>
      </Card>
      {!file && <FilePicker label="Choose the revised contract" onFile={onFile} busy={busy} />}
      {cmd.message}
      {file && prev && (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void cmd.run(async () => {
            const summary = await mutate(p.id, (x) => ingestRevision(x, { previousId: prev.id, version: String(fd.get("version") ?? ""), file, changes: taken, note: String(fd.get("note") ?? "") || null }), "contract.revised");
            go(`/p/${p.id}/changes`);
            return summary;
          });
        }}>
          <Card title={file.name} actions={<button type="button" className="text-sm text-slate-500" onClick={() => { setFile(null); setItems([]); cmd.clear(); }}>Change file</button>}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New version"><input name="version" required defaultValue={nextVersion(prev.version)} className={inputCls} /></Field>
              <Field label="Note"><input name="note" placeholder="e.g. Client's revision after site visit" className={inputCls} /></Field>
            </div>
            {aiReady(lib.settings) && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">Showing {source === "ai" ? "AI" : "offline"} reading.</span>
                {aiCmd.busy ? <span className="text-slate-500">AI is comparing…</span> : aiCmd.message}
                {!aiCmd.busy && source === "ai" && <button type="button" className="text-blue-700" onClick={() => load(proposeChanges(prev.extracted_text!, file.text), "rules")}>Show offline reading</button>}
                {!aiCmd.busy && source === "rules" && <button type="button" className="text-blue-700" onClick={() => runAi(file)}>Compare with AI</button>}
              </div>
            )}
          </Card>
          {items.length === 0 && <Card><Empty>No changed clauses. You can still register the file as the new version.</Empty></Card>}
          {items.map((x, i) => (
            <Card key={x.id} className={x.take ? "" : "opacity-60"}>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" checked={x.take} onChange={(e) => upd(i, { take: e.target.checked })} />
                <span className="flex-1">{x.clause || "Change"}</span>
                <Badge tone={x.kind === "added" ? "green" : x.kind === "removed" ? "red" : "amber"}>{x.kind}</Badge>
              </label>
              <div className="space-y-2">
                <input aria-label="Change title" value={x.title} onChange={(e) => upd(i, { title: e.target.value })} className={inputCls} />
                <div className="grid grid-cols-3 gap-2">
                  <select aria-label="Type" value={x.changeType} onChange={(e) => upd(i, { changeType: e.target.value as ChangeProposal["changeType"] })} className={`${inputCls} col-span-3`}>
                    {CHANGE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <Field label={`Cost (${p.currency})`}><input aria-label="Cost effect" inputMode="decimal" value={x.costEffect ?? ""} onChange={(e) => upd(i, { costEffect: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls} /></Field>
                  <Field label="Days"><input aria-label="Schedule effect" inputMode="numeric" value={x.scheduleEffectDays ?? ""} onChange={(e) => upd(i, { scheduleEffectDays: e.target.value === "" ? null : Math.round(Number(e.target.value)) })} className={inputCls} /></Field>
                </div>
                {x.before && <p className="rounded bg-red-50 px-2 py-1 text-xs line-through decoration-red-400">{x.before}</p>}
                {x.after && <p className="rounded bg-emerald-50 px-2 py-1 text-xs">{x.after}</p>}
              </div>
            </Card>
          ))}
          {cmd.message}
          <Button type="submit" className="w-full">{taken.length ? `Register version and log ${taken.length} change${taken.length === 1 ? "" : "s"}` : "Register version only"}</Button>
          <p className="text-center text-xs text-slate-500">Changes are logged as pending; approve or reject them on the Changes page. The baseline only moves when you re-baseline.</p>
        </form>
      )}
    </div>
  );
}
