import { useState } from "react";
import type { Deliverable, Milestone } from "../lib/model";
import { getState, mutate, useStore } from "../lib/store";
import { templateOf } from "../lib/seed";
import { go, href } from "../lib/router";
import { addDeliverable, addMilestone, getPlan, needsDates, planDates, recordProgress, setScheduleBaseline, updateDeliverable, updateMilestone, type MRow } from "../lib/domain/plan";
import { linksOf } from "../lib/domain/registers";
import { Badge, Button, Card, Empty, Field, PageTitle, Pct, Row, Variance, inputCls, money, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import type { ScreenProps } from "./registry";

const MS_TONE: Record<Milestone["status"], "slate" | "blue" | "green" | "amber" | "red"> = { NOT_STARTED: "slate", IN_PROGRESS: "blue", COMPLETE: "green", ON_HOLD: "amber", CANCELLED: "red" };

function SubNav({ id, at }: { id: string; at: string }) {
  const items: Array<[string, string]> = [["plan", "Plan"], ["schedule", "Schedule"], ["stages", "Stages"], ["estimate", "Estimate"]];
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm">
      {items.map(([k, l]) => (
        <a key={k} href={href(`/p/${id}/${k}`)} className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center ${at === k ? "bg-slate-200 font-medium text-slate-900 shadow-sm" : "text-slate-600"}`}>{l}</a>
      ))}
    </div>
  );
}
export { SubNav as PlanSubNav };

function DeliverableRow({ pid, d }: { pid: string; d: MRow["deliverables"][number] }) {
  return (
    <li>
      <a href={href(`/p/${pid}/deliverable/${d.id}`)} className="flex items-center justify-between gap-3 px-4 py-2.5 active:bg-slate-50">
        <span className="min-w-0">
          <span className="block truncate text-sm"><span className="font-mono text-xs text-slate-500">{d.code}</span> {d.title}</span>
          <span className="block text-xs text-slate-500">{d.planned_finish ? `finish ${d.forecast_finish ?? d.planned_finish}` : "no dates"}{d.responsible_name ? ` · ${d.responsible_name}` : ""}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5"><Pct value={d.progress_percent} /><Variance days={d.variance_days} /></span>
      </a>
    </li>
  );
}

export function PlanScreen({ p }: ScreenProps) {
  const lib = useStore((s) => s.library);
  const terms = templateOf(lib, p).terms;
  const plan = getPlan(p);
  const [adding, setAdding] = useState<"" | "milestone" | "deliverable">("");
  const cmd = useCommand();
  const pr = plan.project;
  return (
    <div className="space-y-4">
      <SubNav id={p.id} at="plan" />
      <PageTitle title="Plan" sub={`${pr.done_count}/${pr.deliverable_count} ${terms.deliverables.toLowerCase()} done · forecast ${pr.forecast_finish ?? "—"}`} />
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xl font-semibold tabular-nums">{Math.round(pr.progress_percent)}%</div><div className="text-xs text-slate-500">progress</div></div>
          <div><div className="text-sm font-semibold"><Variance days={pr.variance_days} /></div><div className="text-xs text-slate-500">vs baseline</div></div>
          <div><div className="text-sm font-semibold tabular-nums">{money(pr.budget, p.currency)}</div><div className="text-xs text-slate-500">budget</div></div>
        </div>
      </Card>
      {plan.milestones.length === 0 && plan.unassigned.length === 0 && (
        <Card><Empty>No plan yet. Generate one from the <a className="text-blue-700" href={href(`/p/${p.id}/estimate`)}>estimate</a>, or add milestones and {terms.deliverables.toLowerCase()} by hand.</Empty></Card>
      )}
      {plan.milestones.map((m) => (
        <section key={m.id} className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold"><span className="font-mono text-xs text-slate-500">{m.code}</span> {m.name}</div>
              <div className="text-xs text-slate-500">weight {m.weight}{m.gate_critical ? " · gate-critical" : ""} · {m.forecast_finish ?? "no dates"}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <MilestoneStatus pid={p.id} m={m} />
              <Pct value={m.progress_percent} />
            </div>
          </header>
          {m.deliverables.length ? <ul className="divide-y divide-slate-100">{m.deliverables.map((d) => <DeliverableRow key={d.id} pid={p.id} d={d} />)}</ul> : <p className="px-4 py-3 text-xs text-slate-500">Nothing under this milestone yet.</p>}
        </section>
      ))}
      {plan.unassigned.length > 0 && (
        <Card title="Not under a milestone"><ul className="-m-4 divide-y divide-slate-100">{plan.unassigned.map((d) => <DeliverableRow key={d.id} pid={p.id} d={d} />)}</ul></Card>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setAdding(adding === "milestone" ? "" : "milestone")}>+ Milestone</Button>
        <Button variant="secondary" onClick={() => setAdding(adding === "deliverable" ? "" : "deliverable")}>+ {terms.deliverable}</Button>
      </div>
      {adding === "milestone" && (
        <Card title="New milestone">
          <form className="space-y-3" onSubmit={(e) => {
            const f = formData(e);
            void cmd.run(() => mutate(p.id, (x) => addMilestone(x, { name: f.s("name"), phase: f.opt("phase"), weight: f.num("weight"), gateCritical: f.fd.get("gateCritical") === "on" }), "milestone.add")).then((ok) => ok && setAdding(""));
          }}>
            <Field label="Name"><input name="name" required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phase"><input name="phase" className={inputCls} /></Field>
              <Field label="Weight"><input name="weight" inputMode="decimal" defaultValue="10" className={inputCls} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gateCritical" /> Gate-critical</label>
            <Button type="submit">Add milestone</Button>
          </form>
        </Card>
      )}
      {adding === "deliverable" && (
        <Card title={`New ${terms.deliverable.toLowerCase()}`}>
          <DeliverableForm milestones={plan.milestones} onSubmit={(v) => cmd.run(() => mutate(p.id, (x) => addDeliverable(x, v), "deliverable.add")).then((ok) => ok && setAdding(""))} />
        </Card>
      )}
      {cmd.message}
    </div>
  );
}

function MilestoneStatus({ pid, m }: { pid: string; m: Milestone }) {
  return (
    <select aria-label={`${m.code} status`} value={m.status} onChange={(e) => void mutate(pid, (x) => updateMilestone(x, m.id, { status: e.target.value as Milestone["status"] }), "milestone.status")}
      className={`rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${MS_TONE[m.status] === "green" ? "bg-emerald-50 ring-emerald-200" : MS_TONE[m.status] === "blue" ? "bg-blue-50 ring-blue-200" : "bg-slate-50 ring-slate-200"}`}>
      {Object.keys(MS_TONE).map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}
    </select>
  );
}

function DeliverableForm({ milestones, onSubmit }: { milestones: Milestone[]; onSubmit: (v: Parameters<typeof addDeliverable>[1]) => unknown }) {
  const [measure, setMeasure] = useState<"PERCENT" | "QUANTITY">("PERCENT");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      const f = formData(e);
      void onSubmit({ title: f.s("title"), milestoneId: f.opt("milestoneId"), weight: f.num("weight"), budget: f.num("budget"), responsibleName: f.opt("responsible"), plannedStart: f.opt("plannedStart"), plannedFinish: f.opt("plannedFinish"), measurement: measure, quantityUnit: f.opt("quantityUnit"), quantityTotal: f.num("quantityTotal") });
    }}>
      <Field label="Title"><input name="title" required className={inputCls} /></Field>
      <Field label="Milestone">
        <select name="milestoneId" className={inputCls}><option value="">—</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}</select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight"><input name="weight" inputMode="decimal" defaultValue="1" className={inputCls} /></Field>
        <Field label="Budget"><input name="budget" inputMode="decimal" className={inputCls} /></Field>
        <Field label="Planned start"><input type="date" name="plannedStart" className={inputCls} /></Field>
        <Field label="Planned finish"><input type="date" name="plannedFinish" className={inputCls} /></Field>
      </div>
      <Field label="Responsible"><input name="responsible" defaultValue={getState().library.settings?.ownerName ?? ""} className={inputCls} /></Field>
      <Field label="Progress measured by">
        <select value={measure} onChange={(e) => setMeasure(e.target.value as "PERCENT")} className={inputCls}><option value="PERCENT">Percent complete</option><option value="QUANTITY">Quantity (e.g. sheets)</option></select>
      </Field>
      {measure === "QUANTITY" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit"><input name="quantityUnit" placeholder="sheets" className={inputCls} /></Field>
          <Field label="Total"><input name="quantityTotal" inputMode="decimal" className={inputCls} /></Field>
        </div>
      )}
      <Button type="submit">Add deliverable</Button>
    </form>
  );
}

export function ScheduleScreen({ p }: ScreenProps) {
  const plan = getPlan(p);
  const cmd = useCommand();
  const rows = [...plan.milestones.flatMap((m) => m.deliverables), ...plan.unassigned];
  const baselined = rows.some((d) => d.baseline_finish);
  const all = rows.map((d) => d.planned_start).concat(rows.map((d) => d.forecast_finish ?? d.planned_finish)).filter((x): x is string => !!x).sort();
  const t0 = all.length ? Date.parse(all[0]) : 0;
  const t1 = all.length ? Date.parse(all.at(-1)!) : 1;
  const span = Math.max(1, t1 - t0);
  const pos = (d: string | null) => (d ? ((Date.parse(d) - t0) / span) * 100 : null);
  return (
    <div className="space-y-4">
      <SubNav id={p.id} at="schedule" />
      <PageTitle title="Schedule" sub={all.length ? `${all[0]} → ${all.at(-1)}` : "No dates yet"} />
      <DatesNeeded p={p} />
      <Card title="Baseline" actions={baselined ? <Badge tone="green">set</Badge> : <Badge tone="amber">not set</Badge>}>
        <p className="mb-3 text-sm text-slate-600">The baseline is the approved plan that variance is measured against. Setting it copies the planned dates of open work; finished work is baselined on its actual dates (self-approved on mobile).</p>
        <form className="flex gap-2" onSubmit={(e) => {
          const f = formData(e);
          if (baselined && !window.confirm("Replace the current baseline with today's planned dates?")) return;
          void cmd.run(() => mutate(p.id, (x) => setScheduleBaseline(x, f.s("note")), "schedule.baseline"));
        }}>
          <input name="note" placeholder="Approval note" className={inputCls} />
          <Button type="submit" variant="approve">{baselined ? "Re-baseline" : "Set baseline"}</Button>
        </form>
        <div className="mt-2">{cmd.message}</div>
      </Card>
      {rows.length === 0 ? <Card><Empty>No deliverables yet.</Empty></Card> : (
        <Card title="Bars" actions={<span className="text-xs text-slate-500">planned · <span className="text-slate-900">▏</span>baseline finish</span>}>
          <ul className="space-y-2.5">
            {rows.map((d) => {
              const a = pos(d.planned_start ?? d.planned_finish);
              const b = pos(d.forecast_finish ?? d.planned_finish);
              const bl = pos(d.baseline_finish);
              return (
                <li key={d.id}>
                  <a href={href(`/p/${p.id}/deliverable/${d.id}`)} className="block">
                    <div className="flex justify-between gap-2 text-xs"><span className="truncate"><span className="font-mono text-slate-500">{d.code}</span> {d.title}</span><Variance days={d.variance_days} /></div>
                    <div className="relative mt-1 h-3 rounded bg-slate-100">
                      {a !== null && b !== null && (
                        <div className={`absolute top-0 h-3 rounded ${d.variance_days && d.variance_days > 0 ? "bg-red-300" : "bg-blue-300"}`} style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }}>
                          <div className="h-3 rounded bg-blue-700/70" style={{ width: `${d.progress_percent}%` }} />
                        </div>
                      )}
                      {bl !== null && <div className="absolute -top-0.5 h-4 w-0.5 bg-slate-900" style={{ left: `${bl}%` }} />}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Open items without a planned finish block the baseline: list them with date fields so the PM can plan them in one go. */
function DatesNeeded({ p }: { p: ScreenProps["p"] }) {
  const cmd = useCommand();
  const missing = needsDates(p);
  if (!missing.length) return null;
  const ms = (id: string | null) => p.milestones.find((m) => m.id === id);
  return (
    <Card title={`Dates needed (${missing.length})`} actions={<Badge tone="amber">blocks the baseline</Badge>}>
      <p className="mb-3 text-sm text-slate-600">These open items have no planned finish. Plan them here; finished items don't need dates.</p>
      <form onSubmit={(e) => {
        const f = formData(e);
        void cmd.run(() => mutate(p.id, (x) => planDates(x, missing.map((d) => ({ id: d.id, start: f.opt(`s_${d.id}`), finish: f.opt(`f_${d.id}`) }))), "schedule.planned"));
      }}>
        <ul className="space-y-3">
          {missing.map((d) => (
            <li key={d.id}>
              <div className="text-sm"><span className="font-mono text-xs text-slate-500">{d.code}</span> {d.title}</div>
              <div className="text-xs text-slate-500">{ms(d.milestone_id)?.name ?? "No milestone"}{d.actual_start ? ` · started ${d.actual_start}` : ""}{d.progress_percent ? ` · ${Math.round(d.progress_percent)} %` : ""}</div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input type="date" name={`s_${d.id}`} aria-label={`${d.code} planned start`} defaultValue={d.planned_start ?? d.actual_start ?? ""} className={inputCls} />
                <input type="date" name={`f_${d.id}`} aria-label={`${d.code} planned finish`} className={inputCls} />
              </div>
            </li>
          ))}
        </ul>
        <Button type="submit" className="mt-3 w-full">Save dates</Button>
        <div className="mt-2">{cmd.message}</div>
      </form>
    </Card>
  );
}

export function DeliverableScreen({ p, params }: ScreenProps) {
  const d = p.deliverables.find((x) => x.id === params[0]);
  const cmd = useCommand();
  const prog = useCommand();
  if (!d) return <Empty>Deliverable not found.</Empty>;
  const row = getPlan(p).milestones.flatMap((m) => m.deliverables).concat(getPlan(p).unassigned).find((x) => x.id === d.id);
  const links = linksOf(p, "DELIVERABLE", d.id);
  const ms = p.milestones.find((m) => m.id === d.milestone_id);
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/plan`)} className="text-sm text-blue-700">‹ Plan</a>
      <PageTitle title={`${d.code} ${d.title}`} sub={ms ? `${ms.code} ${ms.name}` : "Not under a milestone"} actions={<Badge tone={d.progress_percent >= 100 ? "green" : d.progress_percent > 0 ? "blue" : "slate"}>{d.state.replace(/_/g, " ")}</Badge>} />
      <Card title="Progress">
        <div className="mb-3 flex items-center justify-between"><Pct value={d.progress_percent} /><Variance days={row?.variance_days ?? null} /></div>
        <form className="flex gap-2" onSubmit={(e) => {
          const f = formData(e);
          void prog.run(() => mutate(p.id, (x) => recordProgress(x, d.id, d.measurement === "QUANTITY" ? { quantityDone: f.num("v") } : { percent: f.num("v") }), "deliverable.progress"));
        }}>
          <input key={d.progress_percent} name="v" inputMode="decimal" defaultValue={d.measurement === "QUANTITY" ? d.quantity_done ?? "" : Math.round(d.progress_percent)} className={inputCls} aria-label={d.measurement === "QUANTITY" ? `${d.quantity_unit} done` : "Percent complete"} />
          <span className="self-center whitespace-nowrap text-sm text-slate-500">{d.measurement === "QUANTITY" ? `of ${d.quantity_total} ${d.quantity_unit}` : "%"}</span>
          <Button type="submit">Record</Button>
        </form>
        {d.measurement === "PERCENT" && (
          <div className="mt-2 flex gap-1">
            {[25, 50, 75, 100].map((n) => <Button key={n} variant="secondary" className="flex-1 px-1" onClick={() => void prog.run(() => mutate(p.id, (x) => recordProgress(x, d.id, { percent: n }), "deliverable.progress"))}>{n}%</Button>)}
          </div>
        )}
        <div className="mt-2">{prog.message}</div>
      </Card>
      <Card title="Dates & budget">
        <Row k="Baseline" v={d.baseline_finish ? `${d.baseline_start ?? "?"} → ${d.baseline_finish}` : "not set"} />
        <Row k="Actual" v={d.actual_start ? `${d.actual_start} → ${d.actual_finish ?? "…"}` : "not started"} />
        <form className="mt-3 space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(() => mutate(p.id, (x) => updateDeliverable(x, d.id, {
            title: f.s("title"), milestone_id: f.opt("milestoneId"), responsible_name: f.opt("responsible"), planned_start: f.opt("plannedStart"), planned_finish: f.opt("plannedFinish"),
            forecast_finish: f.opt("forecastFinish"), weight: f.num("weight") ?? 0, budget: f.num("budget") ?? 0, actual_cost: f.num("actualCost") ?? 0,
          } as Partial<Deliverable>), "deliverable.update"));
        }}>
          <Field label="Title"><input name="title" defaultValue={d.title} className={inputCls} /></Field>
          <Field label="Milestone">
            <select name="milestoneId" defaultValue={d.milestone_id ?? ""} className={inputCls}><option value="">—</option>{p.milestones.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}</select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Planned start"><input type="date" name="plannedStart" defaultValue={d.planned_start ?? ""} className={inputCls} /></Field>
            <Field label="Planned finish"><input type="date" name="plannedFinish" defaultValue={d.planned_finish ?? ""} className={inputCls} /></Field>
            <Field label="Forecast finish"><input type="date" name="forecastFinish" defaultValue={d.forecast_finish ?? ""} className={inputCls} /></Field>
            <Field label="Weight"><input name="weight" inputMode="decimal" defaultValue={d.weight} className={inputCls} /></Field>
            <Field label={`Budget (${p.currency})`}><input name="budget" inputMode="decimal" defaultValue={d.budget} className={inputCls} /></Field>
            <Field label={`Actual cost (${p.currency})`}><input name="actualCost" inputMode="decimal" defaultValue={d.actual_cost} className={inputCls} /></Field>
          </div>
          <Field label="Responsible"><input name="responsible" defaultValue={d.responsible_name ?? ""} className={inputCls} /></Field>
          <Button type="submit">Save</Button>
          {cmd.message}
        </form>
      </Card>
      <Card title="Linked records" actions={<a className="text-sm text-blue-700" href={href(`/p/${p.id}/comments?on=DELIVERABLE:${d.id}`)}>+ Comment</a>}>
        {links.length ? <ul className="space-y-1 text-sm">{links.map((l) => <li key={l.id}><Badge>{l.relationship.replace(/_/g, " ").toLowerCase()}</Badge> {l.other_label}</li>)}</ul> : <Empty>No linked comments, issues or changes.</Empty>}
      </Card>
      <Button variant="ghost" onClick={() => go(`/p/${p.id}/schedule`)}>See on schedule ›</Button>
    </div>
  );
}
