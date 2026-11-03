import { useState } from "react";
import { mutate, updateLibrary, useStore } from "../lib/store";
import { href } from "../lib/router";
import { templateOf } from "../lib/seed";
import {
  acceptAsBaseline, calculateEstimate, driversOf, generatePlan, mhSummary, previewSchedule, recordActual, setDrivers, setFactor, setForecast, setRate, setReferenceArea, setStaffing,
  setWorkPackage, staffingOf,
} from "../lib/domain/estimate";
import { saveRevision } from "../lib/domain/revisions";
import type { ProjectTemplate } from "../lib/model";
import { Badge, Button, Card, Empty, Field, PageTitle, Row, inputCls, money, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import { PlanSubNav } from "./PlanScreens";
import type { ScreenProps } from "./registry";

const hrs = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const num = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

export function EstimateScreen({ p }: ScreenProps) {
  const lib = useStore((s) => s.library);
  const t = templateOf(lib, p);
  const cmd = useCommand();
  const act = useCommand();
  const staffing = staffingOf(p, lib);
  const drivers = driversOf(p, t);
  const current = [...p.estimates].reverse().find((e) => e.status !== "SUPERSEDED");
  const generated = current ? p.deliverables.some((d) => d.source_estimate_id === current.id) : false;
  const sch = current ? previewSchedule(current) : null;
  const roleLabel = (k: string) => t.roles.find((r) => r.role_key === k)?.label ?? k;
  const backward = t.scheduling === "backward";
  if (!t.workPackages.length) {
    return (
      <div className="space-y-4">
        <PlanSubNav id={p.id} at="estimate" />
        <PageTitle title="Estimate" sub={t.name} />
        <Card><Empty>The {t.name} template has no starter work. Add milestones and {t.terms.deliverables.toLowerCase()} with their budgets on the <a className="text-blue-700" href={href(`/p/${p.id}/plan`)}>Plan</a> page, then set the baseline on the Schedule page.</Empty></Card>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PlanSubNav id={p.id} at="estimate" />
      <PageTitle title="Estimate" sub={`${t.name} template · ${backward ? "planned backward from the event date" : "planned forward from the start date"}`} actions={<a href={href("/library")} className="text-sm text-blue-700">Library ›</a>} />

      <Card title="Calculate">
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          const values = Object.fromEntries(t.drivers.map((d) => [d.key, f.num(`driver_${d.key}`)]));
          const factors = Object.fromEntries(t.factorSets.map((s) => [s.set, f.s(`factor_${s.set}`)]));
          void cmd.run(async () => {
            if (t.drivers.length) await mutate(p.id, (x, l) => setDrivers(x, l, values), "drivers.set");
            return mutate(p.id, (x, l) => calculateEstimate(x, l, { factors, anchor: f.opt("anchor"), note: f.opt("note") }), "estimate.calculated");
          });
        }}>
          {t.drivers.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {t.drivers.map((d) => (
                <Field key={d.key} label={`${d.label} (${d.unit})`}><input name={`driver_${d.key}`} inputMode="decimal" defaultValue={Math.round(drivers[d.key] * 100) / 100} className={inputCls} /></Field>
              ))}
            </div>
          )}
          {t.factorSets.map((s) => (
            <Field key={s.set} label={s.label}>
              <select name={`factor_${s.set}`} defaultValue={current?.inputs.factors[s.set]?.key ?? s.values.find((x) => x.is_default)?.key} className={inputCls}>
                {s.values.map((x) => <option key={x.key} value={x.key}>{x.label} (×{x.factor})</option>)}
              </select>
            </Field>
          ))}
          <Field label={t.anchorLabel}><input type="date" name="anchor" defaultValue={(backward ? p.definition.target_finish : p.definition.target_start) ?? ""} className={inputCls} /></Field>
          <Field label="Note"><input name="note" className={inputCls} /></Field>
          <Button type="submit">{current ? "Recalculate" : "Calculate"}</Button>
          {cmd.message}
        </form>
      </Card>

      <Card title="Team">
        <p className="mb-2 text-xs text-slate-500">{lib.settings?.hoursPerDay} h/day{t.calendar === "working" ? ` · ${lib.settings?.daysPerWeek} days/week` : " · every day"}. A work item takes as long as its slowest role.</p>
        <ul className="space-y-2">
          {t.roles.map((r) => (
            <li key={r.role_key}>
              <form className="flex items-center gap-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => setStaffing(x, r.role_key, f.num("people") ?? 0, (f.num("alloc") ?? 0) / 100), "staffing.set")); }}>
                <span className="w-24 shrink-0 text-sm">{r.label}</span>
                <input name="people" aria-label={`${r.label} people`} inputMode="decimal" defaultValue={staffing[r.role_key].people} className={`${inputCls} w-16`} />
                <span className="text-xs text-slate-500">×</span>
                <input name="alloc" aria-label={`${r.label} allocation`} inputMode="decimal" defaultValue={Math.round(staffing[r.role_key].allocation * 100)} className={`${inputCls} w-16`} />
                <span className="text-xs text-slate-500">%</span>
                <Button type="submit" variant="ghost" className="px-2">Set</Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      {current && (
        <Card title={`${current.estimate_no} · ${hrs(current.totals.totalMh)} h`} actions={<Badge tone={current.status === "ACCEPTED" ? "green" : "amber"}>{current.status.toLowerCase()}</Badge>}>
          {Object.keys(current.inputs.drivers).length > 0 && <Row k="Drivers" v={t.drivers.map((d) => `${d.label} ${num(current.inputs.drivers[d.key] ?? 0)} ${d.unit}`).join(" · ")} />}
          {Object.keys(current.inputs.factors).length > 0 && <Row k="Factors" v={Object.values(current.inputs.factors).map((f) => `${f.label} ×${f.factor}`).join(" · ")} />}
          <Row k="Labour" v={current.totals.laborCost == null ? `not priced — no rate for ${current.totals.missingRates.map(roleLabel).join(", ")}` : money(current.totals.laborCost, current.inputs.currency)} />
          <Row k="Purchases and vendors" v={money(current.totals.otherCost, current.inputs.currency)} />
          <Row k="Total" v={current.totals.cost == null ? `${money(current.totals.otherCost, current.inputs.currency)} + labour` : money(current.totals.cost, current.inputs.currency)} />
          {p.definition.budget_limit != null && current.totals.cost != null && current.totals.cost > p.definition.budget_limit && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">Over the budget limit of {money(p.definition.budget_limit, p.currency)}.</p>
          )}
          <h3 className="mt-3 text-xs font-semibold uppercase text-slate-500">Hours by role</h3>
          {Object.entries(current.totals.byRole).map(([r, h]) => <Row key={r} k={roleLabel(r)} v={`${hrs(h)} h`} />)}
          <h3 className="mt-3 text-xs font-semibold uppercase text-slate-500">{t.terms.deliverables}{sch?.ok ? " · dates" : ""}</h3>
          {sch && !sch.ok && <p className="text-sm text-red-700">{sch.error}</p>}
          {sch?.ok && (() => {
            const late = Object.entries(sch.dates).filter(([, d]) => d.start < new Date().toISOString().slice(0, 10)).map(([k]) => current.inputs.workPackages.find((w) => w.wp_key === k)?.name ?? k);
            return late.length && current.status === "DRAFT" ? <p className="my-1 rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">Already behind on day one: {late.join(", ")} should have started before today. Start them now, or move the date in the library or the {t.anchorLabel.toLowerCase()}.</p> : null;
          })()}
          {current.inputs.workPackages.filter((w) => current.totals.byPackage[w.wp_key] || current.totals.costByPackage[w.wp_key]).map((w) => (
            <Row key={w.wp_key} k={w.name} v={<span>
              {current.totals.byPackage[w.wp_key] ? `${hrs(current.totals.byPackage[w.wp_key])} h` : ""}
              {current.totals.costByPackage[w.wp_key] ? `${current.totals.byPackage[w.wp_key] ? " · " : ""}${money(current.totals.costByPackage[w.wp_key], current.inputs.currency)}` : ""}
              {sch?.ok && sch.dates[w.wp_key] ? <span className="block text-xs text-slate-500">{sch.dates[w.wp_key].start} → {sch.dates[w.wp_key].finish}</span> : null}
            </span>} />
          ))}
          {current.costLines.length > 0 && (
            <details className="mt-2 text-sm"><summary className="text-slate-700">Cost lines ({current.costLines.length})</summary>
              <ul className="mt-1 space-y-0.5 text-xs">{current.costLines.map((c, i) => <li key={i}>{c.label}: {num(c.qty)} {c.unit} × {num(c.unit_cost)} = <strong>{money(c.amount, current.inputs.currency)}</strong></li>)}</ul>
            </details>
          )}
          <div className="mt-3 space-y-2">
            {current.status === "DRAFT" && !generated && <Button className="w-full" onClick={() => void act.run(() => mutate(p.id, (x, l) => generatePlan(x, l, current.id), "plan.generated"))}>Generate plan</Button>}
            {current.status === "DRAFT" && generated && (
              <form className="space-y-2" onSubmit={(e) => {
                const f = formData(e);
                void act.run(async () => {
                  await mutate(p.id, (x) => acceptAsBaseline(x, current.id), "estimate.accepted");
                  const rev = await saveRevision(p.id, f.s("note") || `Baseline — ${current.estimate_no}`);
                  return `${current.estimate_no} accepted as baseline (revision ${rev.revision_no})`;
                });
              }}>
                <input name="note" placeholder="Approval note" className={inputCls} />
                <Button type="submit" variant="approve" className="w-full">Accept as baseline (self-approved)</Button>
              </form>
            )}
            {generated && <a className="block text-center text-sm text-blue-700" href={href(`/p/${p.id}/plan`)}>Open the plan ›</a>}
            {act.message}
          </div>
        </Card>
      )}
      <Effort p={p} t={t} />
    </div>
  );
}

function Effort({ p, t }: { p: ScreenProps["p"]; t: ProjectTemplate }) {
  const cmd = useCommand();
  const s = mhSummary(p);
  const wpName = (k: string) => t.workPackages.find((w) => w.wp_key === k)?.name ?? k;
  const roleLabel = (k: string) => t.roles.find((r) => r.role_key === k)?.label ?? k;
  if (!s.accepted && !p.mhActuals.length) return null;
  return (
    <Card title="Hours worked">
      <div className="mb-3 grid grid-cols-4 gap-1 text-center text-xs">
        {([["Planned", s.totals.planned], ["Forecast", s.totals.forecast], ["Worked", s.totals.actual_initial], ["Rework", s.totals.actual_iteration]] as const).map(([l, v]) => (
          <div key={l} className="rounded bg-slate-50 py-1.5"><div className="text-sm font-semibold tabular-nums">{Math.round(v)}</div>{l}</div>
        ))}
      </div>
      <form className="space-y-2" onSubmit={(e) => {
        const f = formData(e);
        void cmd.run(() => mutate(p.id, (x) => recordActual(x, { wpKey: f.s("wp"), roleKey: f.s("role"), kind: f.s("kind") as "INITIAL", hours: f.num("hours"), workDate: f.opt("date"), note: f.opt("note") }), "mh.actual"));
      }}>
        <div className="grid grid-cols-2 gap-2">
          <select name="wp" aria-label="Work package" className={inputCls}>{t.workPackages.map((w) => <option key={w.wp_key} value={w.wp_key}>{w.name}</option>)}</select>
          <select name="role" aria-label="Role" className={inputCls}>{t.roles.map((r) => <option key={r.role_key} value={r.role_key}>{r.label}</option>)}</select>
          <select name="kind" aria-label="Kind" className={inputCls}><option value="INITIAL">Work</option><option value="ITERATION">Rework</option></select>
          <input name="hours" aria-label="Hours" inputMode="decimal" placeholder="Hours" className={inputCls} />
          <input type="date" name="date" aria-label="Date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
          <input name="note" placeholder="Note" className={inputCls} />
        </div>
        <Button type="submit">Record hours</Button>
        {cmd.message}
      </form>
      {s.rows.length > 0 && (
        <details className="mt-3"><summary className="text-sm text-slate-700">By work item and role</summary>
          <ul className="mt-2 space-y-2">
            {s.rows.map((r) => (
              <li key={`${r.wp_key}|${r.role_key}`} className="text-xs">
                <div className="font-medium">{wpName(r.wp_key)} · {roleLabel(r.role_key)}</div>
                <form className="mt-0.5 flex items-center gap-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => setForecast(x, r.wp_key, r.role_key, f.num("fc")), "mh.forecast")); }}>
                  <span className="text-slate-600">plan {hrs(r.planned)} · worked {hrs(r.actual_initial)} + {hrs(r.actual_iteration)} rework · forecast</span>
                  <input name="fc" aria-label="Forecast" defaultValue={Math.round(r.forecast * 10) / 10} inputMode="decimal" className="w-16 rounded border border-slate-300 px-1 py-0.5" />
                  <button className="text-blue-700">set</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- library (app-level): templates
export function LibraryScreen() {
  const lib = useStore((s) => s.library);
  const [key, setKey] = useState(lib.templates[1]?.key ?? lib.templates[0].key);
  const cmd = useCommand();
  const t = lib.templates.find((x) => x.key === key) ?? lib.templates[0];
  const save = (fn: (l: typeof lib) => void, msg: string) => cmd.run(() => updateLibrary(fn), msg);
  const roleLabel = (k: string) => t.roles.find((r) => r.role_key === k)?.label ?? k;
  const driverLabel = (k: string) => t.drivers.find((d) => d.key === k)?.label.toLowerCase() ?? k;
  return (
    <div className="space-y-4 p-4">
      <a href="#/" className="text-sm text-blue-700">‹ Projects</a>
      <PageTitle title="Library" sub="Project templates on this device. New estimates use these values; earlier estimates keep the values they were made with." />
      <select aria-label="Template" value={key} onChange={(e) => setKey(e.target.value)} className={inputCls}>
        {lib.templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
      </select>
      <p className="text-sm text-slate-600">{t.description}</p>
      {cmd.message}
      {t.method === "area_scaled" && (
        <Card title="Reference area">
          <form className="flex gap-2" onSubmit={(e) => { const f = formData(e); const v = f.num("ref"); void save((l) => setReferenceArea(l, t.key, v ?? 0), "Reference area saved."); }}>
            <input name="ref" inputMode="decimal" defaultValue={t.referenceArea} className={inputCls} /><span className="self-center text-sm">m²</span><Button type="submit" variant="secondary">Save</Button>
          </form>
        </Card>
      )}
      <Card title={`Hourly rates (${lib.settings?.currency ?? ""})`}>
        <p className="mb-2 text-xs text-slate-500">Leave blank when not decided yet; labour then shows as not priced.</p>
        {t.roles.map((r) => (
          <form key={r.role_key} className="mb-2 flex items-center gap-2" onSubmit={(e) => { const f = formData(e); const v = f.num("rate"); void save((l) => setRate(l, t.key, r.role_key, v), `${r.label} rate saved.`); }}>
            <span className="w-28 shrink-0 text-sm">{r.label}</span>
            <input name="rate" aria-label={`${r.label} rate`} inputMode="decimal" defaultValue={r.hourly_rate ?? ""} className={inputCls} />
            <Button type="submit" variant="ghost" className="px-2">Save</Button>
          </form>
        ))}
      </Card>
      {t.factorSets.length > 0 && (
        <Card title="Factors">
          {t.factorSets.map((set) => (
            <div key={set.set} className="mb-3">
              <h3 className="text-xs font-semibold uppercase text-slate-500">{set.label}</h3>
              {set.values.map((v) => (
                <form key={v.key} className="mt-1 flex items-center gap-2" onSubmit={(e) => { const x = formData(e); const n = x.num("f"); void save((l) => setFactor(l, t.key, set.set, v.key, n ?? 0), `${v.label} factor saved.`); }}>
                  <span className="min-w-0 flex-1 truncate text-sm">{v.label}</span>
                  <input name="f" aria-label={`${v.label} factor`} inputMode="decimal" defaultValue={v.factor} className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                  <Button type="submit" variant="ghost" className="px-2">Save</Button>
                </form>
              ))}
            </div>
          ))}
        </Card>
      )}
      <Card title="Starter work">
        {t.workPackages.length === 0 ? <Empty>This template has no starter work.</Empty> : [...t.workPackages].sort((a, b) => a.sequence - b.sequence).map((w) => (
          <details key={w.wp_key} className="border-b border-slate-100 py-2 last:border-0">
            <summary className="text-sm">{w.name} <span className="text-xs text-slate-500">· {w.stage_key ? t.stages.find((s) => s.stage_key === w.stage_key)?.name : "—"}</span></summary>
            <form className="mt-2 space-y-2" onSubmit={(e) => {
              const f = formData(e);
              void save((l) => setWorkPackage(l, t.key, w.wp_key, {
                exponent: t.method === "area_scaled" ? f.num("exp") : null, minDays: f.num("minDays"), finishBeforeAnchorDays: t.scheduling === "backward" ? f.num("before") : null,
                effort: w.effort.map((_, i) => ({ base: f.num(`eb${i}`) ?? 0, rate: f.num(`er${i}`) })),
                costs: w.costs.map((_, i) => ({ base: f.num(`cb${i}`) ?? 0, rate: f.num(`cr${i}`), unitCost: f.num(`cu${i}`) ?? 0 })),
              }), `${w.name} saved.`);
            }}>
              <div className="grid grid-cols-2 gap-2">
                {t.method === "area_scaled" && <Field label="Exponent"><input name="exp" inputMode="decimal" defaultValue={w.exponent ?? 1} className={inputCls} /></Field>}
                <Field label="Minimum days"><input name="minDays" inputMode="decimal" defaultValue={w.minDays ?? 0} className={inputCls} /></Field>
                {t.scheduling === "backward" && <Field label={`Finish days before ${t.anchorLabel.toLowerCase()}`}><input name="before" inputMode="numeric" defaultValue={w.finishBeforeAnchorDays ?? 0} className={inputCls} /></Field>}
              </div>
              {w.effort.map((e, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <Field label={`${roleLabel(e.role)}: hours`}><input name={`eb${i}`} inputMode="decimal" defaultValue={e.base} className={inputCls} /></Field>
                  {e.per && <Field label={`+ hours per ${driverLabel(e.per.driver)}`}><input name={`er${i}`} inputMode="decimal" defaultValue={e.per.rate} className={inputCls} /></Field>}
                </div>
              ))}
              {w.costs.map((c, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Field label={`${c.label}: qty`}><input name={`cb${i}`} inputMode="decimal" defaultValue={c.base} className={inputCls} /></Field>
                  {c.per ? <Field label={`+ per ${driverLabel(c.per.driver)}`}><input name={`cr${i}`} inputMode="decimal" defaultValue={c.per.rate} className={inputCls} /></Field> : <span />}
                  <Field label={`Price / ${c.unit}`}><input name={`cu${i}`} inputMode="decimal" defaultValue={c.unitCost} className={inputCls} /></Field>
                </div>
              ))}
              <Button type="submit" variant="secondary" className="w-full">Save {w.name}</Button>
            </form>
          </details>
        ))}
      </Card>
    </div>
  );
}
