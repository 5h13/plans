import { useEffect, useState } from "react";
import type { Project, Revision } from "../lib/model";
import { getRevisions, getState, mutate, putProject, putRevisions, useStore } from "../lib/store";
import { go, href, useQuery } from "../lib/router";
import { approveReport, compareReports, createReport, deleteDraft, reportView, returnReport, setNarrative, submitReport, updateLine } from "../lib/domain/progress";
import { compareSnapshots, saveRevision, snapshotOf } from "../lib/domain/revisions";
import { download, exportFile, fromPwaFile, fromR44, inspect, type ImportPlan } from "../lib/domain/exchange";
import { canonicalJson, sha256, today } from "../lib/util";
import { Badge, Button, Card, Empty, Field, PageTitle, Pct, Row, fmt, inputCls, money, useCommand, type Tone } from "../ui/ui";
import { formData } from "../ui/forms";
import type { ScreenProps } from "./registry";

const R_TONE: Record<string, Tone> = { DRAFT: "slate", SUBMITTED: "blue", RETURNED: "amber", APPROVED: "green" };
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 10) / 10} %`);

// ---------------------------------------------------------------- progress reports
export function ProgressScreen({ p }: ScreenProps) {
  const cmd = useCommand();
  const reports = [...p.progressReports].sort((a, b) => b.period_end.localeCompare(a.period_end));
  const approved = reports.filter((r) => r.status === "APPROVED");
  const last = approved[0];
  const nextStart = last ? new Date(Date.parse(`${last.period_end}T00:00:00Z`) + 864e5).toISOString().slice(0, 10) : p.definition.target_start ?? "";
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div className="space-y-4">
      <PageTitle title="Progress" sub="Report progress by period. Approval applies it to the plan and freezes a checksummed snapshot." />
      {reports.length === 0 ? <Card><Empty>No progress reports yet.</Empty></Card> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {reports.map((r) => (
            <li key={r.id}>
              <a href={href(`/p/${p.id}/report/${r.id}`)} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50">
                <span><span className="block text-sm font-medium">{r.report_no}</span><span className="block text-xs text-slate-500">{r.period_start} → {r.period_end}</span></span>
                <span className="flex flex-col items-end gap-1"><Badge tone={R_TONE[r.status]}>{r.status.toLowerCase()}</Badge><span className="text-xs tabular-nums">{pct(reportView(r).summary.current)}</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <Card title="New report">
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => createReport(x, { periodStart: f.s("start"), periodEnd: f.s("end"), narrative: f.opt("narrative") }), "progress.report_created")).then((ok) => {
            if (ok) { const r = getState().projects[p.id].progressReports.at(-1); if (r) go(`/p/${p.id}/report/${r.id}`); }
          });
        }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start"><input type="date" name="start" defaultValue={nextStart} className={inputCls} /></Field>
            <Field label="Period end"><input type="date" name="end" defaultValue={today()} className={inputCls} /></Field>
          </div>
          <Field label="Narrative"><textarea name="narrative" rows={2} className={inputCls} /></Field>
          <Button type="submit">Start report</Button>
          {cmd.message}
        </form>
      </Card>
      {approved.length >= 2 && (
        <Card title="Compare two approved reports">
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="From report" value={a} onChange={(e) => setA(e.target.value)} className={inputCls}><option value="">From…</option>{approved.map((r) => <option key={r.id} value={r.id}>{r.report_no} ({r.period_end})</option>)}</select>
            <select aria-label="To report" value={b} onChange={(e) => setB(e.target.value)} className={inputCls}><option value="">To…</option>{approved.map((r) => <option key={r.id} value={r.id}>{r.report_no} ({r.period_end})</option>)}</select>
          </div>
          <Button className="mt-2" disabled={!a || !b || a === b} onClick={() => go(`/p/${p.id}/compare?a=${a}&b=${b}`)}>Compare</Button>
        </Card>
      )}
    </div>
  );
}

export function ReportScreen({ p, params }: ScreenProps) {
  const r = p.progressReports.find((x) => x.id === params[0]);
  const cmd = useCommand();
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    if (r?.snapshot && r.snapshot_sha256) void sha256(canonicalJson(r.snapshot)).then((h) => setVerified(h === r.snapshot_sha256));
  }, [r?.snapshot, r?.snapshot_sha256]);
  if (!r) return <Empty>Report not found.</Empty>;
  const { exceptions, summary } = reportView(r);
  const editable = r.status === "DRAFT" || r.status === "RETURNED";
  const approve = () => cmd.run(async () => {
    const draft = structuredClone(p);
    approveReport(draft, r.id);
    const snap = draft.progressReports.find((x) => x.id === r.id)!.snapshot;
    const h = await sha256(canonicalJson(snap));
    return mutate(p.id, (x) => approveReport(x, r.id, () => h), "progress.report_approved");
  });
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/progress`)} className="text-sm text-blue-700">‹ Progress</a>
      <PageTitle title={r.report_no} sub={`${r.period_start} → ${r.period_end}`} actions={<Badge tone={R_TONE[r.status]}>{r.status.toLowerCase()}</Badge>} />
      <Card>
        <div className="grid grid-cols-4 gap-1 text-center text-xs">
          {([["Previous", summary.previous], ["Current", summary.current], ["Period", summary.period], ["Planned", summary.planned]] as const).map(([l, v]) => (
            <div key={l} className="rounded bg-slate-50 py-1.5"><div className="text-sm font-semibold tabular-nums">{pct(v)}</div>{l}</div>
          ))}
        </div>
        {r.returned_note && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">Returned: {r.returned_note}</p>}
        {r.status === "APPROVED" && <p className="mt-2 text-xs text-slate-600">Approved {fmt(r.approved_at)} (self-approved on mobile) · snapshot {verified === null ? "…" : verified ? <span className="text-emerald-700">checksum verified</span> : <span className="text-red-700">checksum MISMATCH</span>} <span className="font-mono">{r.snapshot_sha256?.slice(0, 12)}</span></p>}
      </Card>
      {exceptions.length > 0 && (
        <ul className="space-y-1">{exceptions.map((e, i) => <li key={i} className={`rounded-lg px-3 py-2 text-sm ${e.severity === "BLOCKING" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}><span className="mr-1 font-mono text-xs font-semibold">{e.code}</span>{e.message}</li>)}</ul>
      )}
      <Card title="Deliverables">
        <ul className="-mx-4 -my-2 divide-y divide-slate-100">
          {r.lines.map((l) => (
            <li key={l.deliverable_id} className="px-4 py-2.5">
              <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate"><span className="font-mono text-xs text-slate-500">{l.code}</span> {l.title}</span><Pct value={l.current_pct} /></div>
              <div className="text-xs text-slate-500">previous {pct(l.previous_pct)} · planned {pct(l.planned_pct)}</div>
              {editable ? (
                <form className="mt-1.5 flex gap-2" onSubmit={(e) => {
                  const f = formData(e);
                  void cmd.run(() => mutate(p.id, (x) => updateLine(x, r.id, l.deliverable_id, l.measurement === "QUANTITY" ? { currentQty: f.num("v"), remarks: f.opt("remarks") } : { currentPct: f.num("v"), remarks: f.opt("remarks") }), "progress.line"));
                }}>
                  <input name="v" aria-label={`${l.code} ${l.measurement === "QUANTITY" ? "quantity" : "percent"}`} inputMode="decimal" defaultValue={l.measurement === "QUANTITY" ? l.current_qty ?? 0 : Math.round(l.current_pct * 10) / 10} className={`${inputCls} w-20`} />
                  <input name="remarks" aria-label={`${l.code} remarks`} defaultValue={l.remarks ?? ""} placeholder="Remarks" className={inputCls} />
                  <Button type="submit" variant="secondary" className="px-3">Save</Button>
                </form>
              ) : l.remarks && <p className="text-xs text-slate-600">{l.remarks}</p>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Narrative">
        {editable ? (
          <form className="space-y-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => setNarrative(x, r.id, f.s("narrative")), "progress.narrative")); }}>
            <textarea name="narrative" rows={3} defaultValue={r.narrative ?? ""} className={inputCls} />
            <Button type="submit" variant="secondary">Save narrative</Button>
          </form>
        ) : <p className="whitespace-pre-wrap text-sm">{r.narrative ?? "—"}</p>}
      </Card>
      <div className="space-y-2">
        {editable && <Button className="w-full" onClick={() => void cmd.run(() => mutate(p.id, (x) => submitReport(x, r.id), "progress.report_submitted"))}>Submit</Button>}
        {r.status === "SUBMITTED" && (
          <>
            <Button variant="approve" className="w-full" onClick={() => void approve()}>Approve (self-approved)</Button>
            <form className="flex gap-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => returnReport(x, r.id, f.s("note")), "progress.report_returned")); }}>
              <input name="note" placeholder="What needs to change" className={inputCls} /><Button type="submit" variant="secondary">Return</Button>
            </form>
          </>
        )}
        {r.status !== "APPROVED" && <Button variant="ghost" className="w-full text-red-700" onClick={() => { if (window.confirm(`Delete ${r.report_no}?`)) void cmd.run(() => mutate(p.id, (x) => deleteDraft(x, r.id), "progress.report_deleted")).then((ok) => ok && go(`/p/${p.id}/progress`)); }}>Delete report</Button>}
        {cmd.message}
      </div>
    </div>
  );
}

export function CompareReportsScreen({ p }: ScreenProps) {
  const q = useQuery();
  let c: ReturnType<typeof compareReports>;
  try { c = compareReports(p, q.get("a") ?? "", q.get("b") ?? ""); } catch (e) { return <p className="text-sm text-red-700">{(e as Error).message}</p>; }
  const S: Record<string, Tone> = { ADVANCED: "green", REGRESSED: "red", ADDED: "blue", REMOVED: "slate", UNCHANGED: "slate" };
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/progress`)} className="text-sm text-blue-700">‹ Progress</a>
      <PageTitle title={`${c.from.report_no} → ${c.to.report_no}`} sub={`${c.from.period_end} → ${c.to.period_end}`} />
      <Card title="Project">
        <Row k="Progress" v={`${pct(c.project.from)} → ${pct(c.project.to)} (${c.project.delta >= 0 ? "+" : ""}${pct(c.project.delta)})`} />
        <Row k="Planned at end" v={pct(c.project.plannedTo)} />
        <Row k="Forecast finish" v={`${c.project.forecastFrom ?? "—"} → ${c.project.forecastTo ?? "—"}`} />
      </Card>
      <Card title="Milestones">{c.milestones.map((m) => <Row key={m.code} k={`${m.code} ${m.name}`} v={`${pct(m.from)} → ${pct(m.to)}`} />)}</Card>
      <Card title="Deliverables">
        <ul className="space-y-1.5">{c.deliverables.map((d) => (
          <li key={d.code} className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate"><span className="font-mono text-xs text-slate-500">{d.code}</span> {d.title}</span><span className="flex shrink-0 items-center gap-1 text-xs tabular-nums">{pct(d.from)} → {pct(d.to)} <Badge tone={S[d.status]}>{d.status.toLowerCase()}</Badge></span></li>
        ))}</ul>
      </Card>
      {c.changesAdded.length > 0 && <Card title="Changes approved in between">{c.changesAdded.map((x) => <Row key={x.change_no} k={`${x.change_no} ${x.title}`} v={`${x.cost_effect == null ? "—" : money(x.cost_effect, p.currency)} · ${x.schedule_effect_days ?? 0} d`} />)}</Card>}
    </div>
  );
}

// ---------------------------------------------------------------- revisions
function useRevisions(id: string): [Revision[], () => void] {
  const [revs, setRevs] = useState<Revision[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => { void getRevisions(id).then(setRevs); }, [id, n]);
  return [revs, () => setN((x) => x + 1)];
}

export function RevisionsScreen({ p }: ScreenProps) {
  const [revs, reload] = useRevisions(p.id);
  const cmd = useCommand();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("live");
  const a = revs.find((r) => r.id === from);
  const b = to === "live" ? { snapshot: snapshotOf(p) } : revs.find((r) => r.id === to);
  const diff = a && b ? compareSnapshots(a.snapshot, b.snapshot) : null;
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/more`)} className="text-sm text-blue-700">‹ More</a>
      <PageTitle title="Revisions" sub="Named, hashed snapshots of the project. Compare any two, or a revision with the current data." />
      <Card title="Save a revision">
        <form className="flex gap-2" onSubmit={(e) => { const f = formData(e); void cmd.run(async () => { const r = await saveRevision(p.id, f.s("note")); reload(); f.form.reset(); return `Revision ${r.revision_no} saved`; }); }}>
          <input name="note" placeholder="What this revision is" className={inputCls} /><Button type="submit">Save</Button>
        </form>
        <div className="mt-2">{cmd.message}</div>
      </Card>
      {revs.length === 0 ? <Card><Empty>No revisions yet.</Empty></Card> : (
        <Card title={`Saved (${revs.length})`}>
          <ul className="-my-1 space-y-1.5 text-sm">{[...revs].reverse().map((r) => <li key={r.id}><span className="font-medium">Rev {r.revision_no}</span> · {r.note}<span className="block text-xs text-slate-500">{fmt(r.created_at)} · <span className="font-mono">{r.snapshot_hash.slice(0, 12)}</span></span></li>)}</ul>
        </Card>
      )}
      {revs.length > 0 && (
        <Card title="Compare">
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="From revision" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}><option value="">From…</option>{revs.map((r) => <option key={r.id} value={r.id}>Rev {r.revision_no}</option>)}</select>
            <select aria-label="To revision" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}><option value="live">Current data</option>{revs.map((r) => <option key={r.id} value={r.id}>Rev {r.revision_no}</option>)}</select>
          </div>
          {diff && (
            <div className="mt-3">
              <p className="mb-2 text-sm"><Badge tone="green">{diff.totals.added} added</Badge> <Badge tone="red">{diff.totals.removed} removed</Badge> <Badge tone="amber">{diff.totals.changed} changed</Badge></p>
              {diff.tables.length === 0 ? <p className="text-sm text-slate-500">No differences.</p> : diff.tables.map((t) => (
                <details key={t.table} className="border-t border-slate-100 py-2" open={diff.tables.length <= 3}>
                  <summary className="text-sm font-medium">{t.title} <span className="text-xs text-slate-500">+{t.added} −{t.removed} ~{t.changed}</span></summary>
                  <ul className="mt-1 space-y-1 text-xs">{t.rows.map((r) => (
                    <li key={r.key}><Badge tone={r.kind === "added" ? "green" : r.kind === "removed" ? "red" : "amber"}>{r.kind}</Badge> {r.label}
                      {r.fields.length > 0 && r.kind === "changed" && <ul className="ml-3 text-slate-600">{r.fields.map((f) => <li key={f.field}>{f.field}: {String(JSON.stringify(f.before))} → {String(JSON.stringify(f.after))}</li>)}</ul>}
                    </li>
                  ))}</ul>
                </details>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- export / import
export function ExportScreen({ p }: ScreenProps) {
  const cmd = useCommand();
  const share = async (asFile: boolean) => {
    const file = await exportFile(p, await getRevisions(p.id));
    const name = `${p.project_no}-${today()}.5h13plans.json`;
    const blob = new File([JSON.stringify(file)], name, { type: "application/json" });
    if (!asFile && navigator.canShare?.({ files: [blob] })) { await navigator.share({ files: [blob], title: `${p.project_no} ${p.name}` }); return "Shared."; }
    download(name, file);
    return `Downloaded ${name}`;
  };
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/more`)} className="text-sm text-blue-700">‹ More</a>
      <PageTitle title="Export / share" />
      <Card>
        <p className="mb-3 text-sm text-slate-600">One file with the whole project and its revisions, with a checksum. Open it on another phone (Projects → Import) or in desktop Plans (Import → PWA project file). Also your backup: this app keeps data only on this device.</p>
        <div className="flex flex-col gap-2">
          {typeof navigator !== "undefined" && "share" in navigator && <Button onClick={() => void cmd.run(() => share(false))}>Share…</Button>}
          <Button variant="secondary" onClick={() => void cmd.run(() => share(true))}>Download file</Button>
        </div>
        <div className="mt-2">{cmd.message}</div>
      </Card>
    </div>
  );
}

export function ImportScreen() {
  const projects = useStore((s) => s.projects);
  const cmd = useCommand();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const list = Object.values(projects);
  const finish = async (projectNo: string, replace: boolean) => {
    if (!plan) return;
    if (plan.kind === "pwa") {
      const { project, revisions } = fromPwaFile(plan.file, list, { replace, projectNo });
      await putProject(project);
      if (revisions.length || replace) await putRevisions(project.id, revisions);
      go(`/p/${project.id}`);
      return `${project.project_no} imported`;
    }
    const project: Project = await fromR44(plan.raw, getState().library, list, projectNo);
    await putProject(project);
    go(`/p/${project.id}`);
    return `${project.project_no} imported from r44`;
  };
  return (
    <div className="space-y-4 p-4">
      <a href="#/" className="text-sm text-blue-700">‹ Projects</a>
      <PageTitle title="Import a project" sub="A project file exported from this app, or a 5H13 Plans r44 project backup." />
      <Card>
        <label className="inline-block cursor-pointer rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white">
          Choose file…
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void cmd.run(async () => { setPlan(await inspect(await f.text(), list)); return `Read ${f.name}`; });
          }} />
        </label>
        <div className="mt-2">{cmd.message}</div>
      </Card>
      {plan && (
        <Card title={plan.kind === "pwa" ? "Plans PWA project file" : "5H13 Plans r44 backup"}>
          <ul className="mb-3 space-y-1 text-sm">{plan.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {plan.kind === "pwa" && !plan.checksumOk && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">The checksum does not match: the file was changed after export.</p>}
          {plan.kind === "r44" && plan.alreadyImported && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-sm text-red-800">This backup has already been imported on this device.</p>}
          <form className="space-y-2" onSubmit={(e) => {
            const f = formData(e);
            const submitter = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
            void cmd.run(() => finish(f.s("projectNo"), submitter === "replace"));
          }}>
            <Field label="Project number" hint={plan.kind === "pwa" && plan.existing ? "This project is already on this device. Replace it, or import a copy with a new number." : undefined}>
              <input name="projectNo" defaultValue={plan.kind === "pwa" ? (plan.existing ? `${plan.file.project.project_no}-COPY` : plan.file.project.project_no) : plan.preview.code} className={inputCls} />
            </Field>
            {plan.kind === "pwa" && plan.existing ? (
              <div className="flex gap-2">
                <button type="submit" value="replace" className="min-h-10 flex-1 rounded-lg bg-red-700 px-3 text-sm font-medium text-white">Replace existing</button>
                <button type="submit" value="copy" className="min-h-10 flex-1 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white">Import as copy</button>
              </div>
            ) : <Button type="submit">Import</Button>}
          </form>
        </Card>
      )}
    </div>
  );
}

