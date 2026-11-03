import { useState, type ReactNode } from "react";
import { getState, mutate, updateLibrary, useStore } from "../lib/store";
import { go, href } from "../lib/router";
import type { EffortRule, CostRule, ProjectTemplate, TemplateWorkPackage } from "../lib/model";
import {
  DEFINITION_KEYS, createTemplate, deleteTemplate, importTemplate, keyFrom, resetTemplate, saveTemplate, templateFile, templateFromProject, validateTemplate,
} from "../lib/domain/templates";
import { download } from "../lib/domain/exchange";
import { BUILT_IN_TEMPLATES } from "../lib/templates";
import { Badge, Button, Card, Field, PageTitle, inputCls, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import type { ScreenProps } from "./registry";

const small = "w-full rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-sm";
const narrow = (w: string) => small.replace("w-full", `${w} shrink-0`);
const numOr = (v: string, d: number | undefined = undefined) => (v === "" ? d : Number(v));

// ---------------------------------------------------------------- template list (top of the library)
export function TemplateList() {
  const lib = useStore((s) => s.library);
  const projects = useStore((s) => s.projects);
  const cmd = useCommand();
  const [creating, setCreating] = useState(false);
  const used = (k: string) => Object.values(projects).filter((p) => p.template_key === k).length;
  return (
    <Card title="Project templates" actions={<button className="text-sm text-blue-700" onClick={() => setCreating(!creating)}>+ New</button>}>
      <p className="mb-3 text-xs text-slate-500">A template is the questions, stages, gates, roles, drivers and starter work for a kind of project. Add your own here; no programming needed.</p>
      {creating && (
        <form className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(async () => {
            const t = createTemplate(getState().library, f.s("name"), f.opt("from"));
            await updateLibrary((l) => saveTemplate(l, t));
            go(`/template/${t.key}`);
          });
        }}>
          <Field label="Name"><input name="name" required placeholder="e.g. Kitchen renovation" className={inputCls} /></Field>
          <Field label="Start from"><select name="from" className={inputCls}><option value="">Blank</option>{lib.templates.map((t) => <option key={t.key} value={t.key}>Copy of {t.name}</option>)}</select></Field>
          <Button type="submit">Create and edit</Button>
        </form>
      )}
      <ul className="divide-y divide-slate-100">
        {lib.templates.map((t) => {
          const builtIn = BUILT_IN_TEMPLATES.some((b) => b.key === t.key);
          return (
            <li key={t.key} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <a href={href(`/template/${t.key}`)} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="block text-xs text-slate-500">{t.stages.length} stages · {t.workPackages.length} work items · {used(t.key)} project(s)</span>
                </a>
                {builtIn ? (t.custom ? <Badge tone="amber">edited</Badge> : <Badge>built-in</Badge>) : <Badge tone="blue">yours</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                <a className="text-blue-700" href={href(`/template/${t.key}`)}>Edit</a>
                <button className="text-blue-700" onClick={() => void cmd.run(async () => { const c = createTemplate(getState().library, `${t.name} copy`, t.key); await updateLibrary((l) => saveTemplate(l, c)); go(`/template/${c.key}`); })}>Duplicate</button>
                <button className="text-blue-700" onClick={() => { download(`${t.key}.5h13template.json`, templateFile(t)); }}>Export</button>
                {builtIn
                  ? t.custom && <button className="text-amber-800" onClick={() => { if (window.confirm(`Reset “${t.name}” to the built-in version? Your edits to it are lost.`)) void cmd.run(() => updateLibrary((l) => resetTemplate(l, t.key)), "Reset."); }}>Reset</button>
                  : <button className="text-red-700" onClick={() => { if (window.confirm(`Delete “${t.name}”?`)) void cmd.run(() => updateLibrary((l) => deleteTemplate(l, t.key, Object.values(getState().projects))), "Deleted."); }}>Delete</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <label className="mt-3 inline-block cursor-pointer text-sm text-blue-700">
        Import a template file…
        <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void cmd.run(async () => { const t = importTemplate(getState().library, JSON.parse(await f.text())); await updateLibrary((l) => saveTemplate(l, t)); return `Imported “${t.name}”.`; });
        }} />
      </label>
      <div className="mt-2">{cmd.message}</div>
    </Card>
  );
}

/** Project → More: save this project's plan as a template. */
export function SaveAsTemplate({ p }: ScreenProps) {
  const cmd = useCommand();
  return (
    <div className="space-y-4">
      <a href={href(`/p/${p.id}/more`)} className="text-sm text-blue-700">‹ More</a>
      <PageTitle title="Save as template" sub="Reuse this project's stages, plan items, durations, order and budgets for the next one like it." />
      <Card>
        <form className="space-y-3" onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(async () => {
            const t = templateFromProject(getState().library, getState().projects[p.id], f.s("name"));
            await updateLibrary((l) => saveTemplate(l, t));
            await mutate(p.id, () => `Saved as template “${t.name}”`, "template.saved");
            go(`/template/${t.key}`);
          });
        }}>
          <Field label="Template name"><input name="name" required defaultValue={`${p.name} template`} className={inputCls} /></Field>
          <p className="text-xs text-slate-500">{p.milestones.length} milestones become stages; {p.deliverables.length} plan items become work items. You can edit everything next.</p>
          {cmd.message}
          <Button type="submit" className="w-full">Save as template</Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- editor
function Section({ title, children, hint, open }: { title: string; children: ReactNode; hint?: string; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl border border-slate-200 bg-surface shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{title}</summary>
      <div className="space-y-3 border-t border-slate-100 p-4">{hint && <p className="text-xs text-slate-500">{hint}</p>}{children}</div>
    </details>
  );
}
function Del({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="Remove" onClick={onClick} className="shrink-0 px-2 text-lg leading-none text-red-700">×</button>;
}
function Move({ onUp, onDown }: { onUp?: () => void; onDown?: () => void }) {
  return <span className="flex shrink-0 flex-col text-xs leading-none text-slate-500"><button type="button" disabled={!onUp} onClick={onUp} className="disabled:opacity-30">▲</button><button type="button" disabled={!onDown} onClick={onDown} className="disabled:opacity-30">▼</button></span>;
}
const swap = <T,>(xs: T[], i: number, j: number) => { const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c; };

export function TemplateEditor({ params }: { params: string[] }) {
  const lib = useStore((s) => s.library);
  const original = lib.templates.find((t) => t.key === params[0]);
  const [t, setT] = useState<ProjectTemplate | null>(original ? structuredClone(original) : null);
  const [openWp, setOpenWp] = useState<string | null>(null);
  const cmd = useCommand();
  if (!t) return <div className="p-4"><a href="#/library" className="text-sm text-blue-700">‹ Library</a><p className="mt-4 text-sm">Template not found.</p></div>;
  const set = (v: Partial<ProjectTemplate>) => setT({ ...t, ...v });
  const setWp = (i: number, v: Partial<TemplateWorkPackage>) => set({ workPackages: t.workPackages.map((w, j) => (j === i ? { ...w, ...v } : w)) });
  const errors = validateTemplate(t, lib.templates);
  const backward = t.scheduling === "backward";
  const save = () => void cmd.run(async () => { await updateLibrary((l) => saveTemplate(l, t)); return "Template saved. New projects and estimates use it."; });

  return (
    <div className="space-y-3 p-4 pb-28">
      <a href="#/library" className="text-sm text-blue-700">‹ Library</a>
      <PageTitle title={t.name || "Template"} sub="Changes apply to new projects and new estimates. Existing estimates keep what they were made with." />

      <Section title="Basics" open>
        <Field label="Name"><input value={t.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Field>
        <Field label="Description"><textarea rows={2} value={t.description} onChange={(e) => set({ description: e.target.value })} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Schedule runs"><select value={t.scheduling} onChange={(e) => set({ scheduling: e.target.value as "forward", anchorLabel: e.target.value === "backward" ? "Event date" : "Start date" })} className={inputCls}><option value="forward">Forward from a start date</option><option value="backward">Backward from an event date</option></select></Field>
          <Field label="Days counted"><select value={t.calendar} onChange={(e) => set({ calendar: e.target.value as "working" })} className={inputCls}><option value="working">Working days</option><option value="calendar">Every day</option></select></Field>
          <Field label="Date is called"><input value={t.anchorLabel} onChange={(e) => set({ anchorLabel: e.target.value })} className={inputCls} /></Field>
          <Field label="Hours from"><select value={t.method} onChange={(e) => set({ method: e.target.value as "lines" })} className={inputCls}><option value="lines">Fixed hours + per driver</option><option value="area_scaled">Scaled by floor area</option></select></Field>
          <Field label="Call a plan item"><input value={t.terms.deliverable} onChange={(e) => set({ terms: { ...t.terms, deliverable: e.target.value } })} className={inputCls} /></Field>
          <Field label="Plural"><input value={t.terms.deliverables} onChange={(e) => set({ terms: { ...t.terms, deliverables: e.target.value } })} className={inputCls} /></Field>
          {t.method === "area_scaled" && <Field label="Reference area (m²)"><input inputMode="decimal" value={t.referenceArea ?? ""} onChange={(e) => set({ referenceArea: numOr(e.target.value) })} className={inputCls} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-1 text-sm">
          {([["location", "Location"], ["size", "Floor area & floors"], ["codes", "Codes and standards"], ["permit", "Permit authority"], ["scopeModel", "Building type & our scope"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={t.features[k]} onChange={(e) => set({ features: { ...t.features, [k]: e.target.checked } })} className="h-4 w-4" />{l}</label>
          ))}
        </div>
      </Section>

      <Section title={`Definition questions (${t.sections.length})`} hint="What the project manager is asked when defining a project of this kind.">
        {DEFINITION_KEYS.map(({ key, label }) => {
          const s = t.sections.find((x) => x.key === key);
          return (
            <div key={key} className="rounded-lg bg-slate-50 p-2">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={!!s} onChange={(e) => set({ sections: e.target.checked ? [...t.sections, { key, label, prompt: "" }].sort((a, b) => DEFINITION_KEYS.findIndex((d) => d.key === a.key) - DEFINITION_KEYS.findIndex((d) => d.key === b.key)) : t.sections.filter((x) => x.key !== key) })} />{label}</label>
              {s && <div className="mt-2 grid gap-2"><input aria-label={`${label} label`} value={s.label} onChange={(e) => set({ sections: t.sections.map((x) => (x.key === key ? { ...x, label: e.target.value } : x)) })} className={small} placeholder="Label" /><input aria-label={`${label} prompt`} value={s.prompt} onChange={(e) => set({ sections: t.sections.map((x) => (x.key === key ? { ...x, prompt: e.target.value } : x)) })} className={small} placeholder="Help text" /></div>}
            </div>
          );
        })}
        <Field label="Requirements list is called"><input value={t.criteriaLabel} onChange={(e) => set({ criteriaLabel: e.target.value })} className={inputCls} /></Field>
        <Field label="Requirement categories (one per line)"><textarea rows={4} value={t.criteriaCategories.map((c) => c.label).join("\n")} onChange={(e) => {
          const labels = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
          const taken: string[] = [];
          set({ criteriaCategories: labels.map((l) => { const old = t.criteriaCategories.find((c) => c.label === l); const k = old?.value_key ?? keyFrom(l, taken); taken.push(k); return { value_key: k, label: l }; }) });
        }} className={inputCls} /></Field>
      </Section>

      <Section title={`Drivers (${t.drivers.length})`} hint="Numbers that size the job, e.g. guests, units, rooms, features. Hours and costs can go up per driver.">
        {t.drivers.map((d, i) => (
          <div key={d.key} className="flex items-end gap-2">
            <Field label="Name"><input value={d.label} onChange={(e) => set({ drivers: t.drivers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={small} /></Field>
            <Field label="Unit"><input value={d.unit} onChange={(e) => set({ drivers: t.drivers.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} className={small} /></Field>
            <Field label="Default"><input inputMode="decimal" value={d.default} onChange={(e) => set({ drivers: t.drivers.map((x, j) => (j === i ? { ...x, default: Number(e.target.value) || 0 } : x)) })} className={small} /></Field>
            <Del onClick={() => set({ drivers: t.drivers.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => set({ drivers: [...t.drivers, { key: keyFrom("Driver", t.drivers.map((d) => d.key)), label: "New driver", unit: "items", default: 1 }] })}>+ Driver</Button>
      </Section>

      <Section title={`Roles (${t.roles.length})`} hint="Who does the work. People × allocation sets how fast hours turn into days.">
        {t.roles.map((r, i) => (
          <div key={r.role_key} className="flex items-end gap-2">
            <Field label="Role"><input value={r.label} onChange={(e) => set({ roles: t.roles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={small} /></Field>
            <Field label="People"><input inputMode="decimal" value={r.default_people} onChange={(e) => set({ roles: t.roles.map((x, j) => (j === i ? { ...x, default_people: Number(e.target.value) || 0 } : x)) })} className={small} /></Field>
            <Field label="%"><input inputMode="decimal" value={Math.round(r.default_allocation * 100)} onChange={(e) => set({ roles: t.roles.map((x, j) => (j === i ? { ...x, default_allocation: (Number(e.target.value) || 0) / 100 } : x)) })} className={small} /></Field>
            <Field label="Rate/h"><input inputMode="decimal" value={r.hourly_rate ?? ""} onChange={(e) => set({ roles: t.roles.map((x, j) => (j === i ? { ...x, hourly_rate: e.target.value === "" ? null : Number(e.target.value) } : x)) })} className={small} /></Field>
            <Del onClick={() => set({ roles: t.roles.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => set({ roles: [...t.roles, { role_key: keyFrom("Role", t.roles.map((r) => r.role_key)), label: "New role", hourly_rate: null, default_people: 1, default_allocation: 1 }] })}>+ Role</Button>
      </Section>

      {(t.factorSets.length > 0 || t.method === "area_scaled") && (
        <Section title={`Factors (${t.factorSets.length})`} hint="Multipliers chosen when estimating, e.g. complexity. Every hour is multiplied by the chosen value.">
          {t.factorSets.map((fs, si) => (
            <div key={fs.set} className="rounded-lg bg-slate-50 p-2">
              <div className="flex items-center gap-2"><input value={fs.label} onChange={(e) => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, label: e.target.value } : x)) })} className={small} /><Del onClick={() => set({ factorSets: t.factorSets.filter((_, j) => j !== si) })} /></div>
              {fs.values.map((v, vi) => (
                <div key={v.key} className="mt-1 flex items-center gap-2">
                  <input type="radio" name={`def_${fs.set}`} checked={v.is_default} onChange={() => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, values: x.values.map((y, k) => ({ ...y, is_default: k === vi })) } : x)) })} aria-label="Default" />
                  <input value={v.label} onChange={(e) => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, values: x.values.map((y, k) => (k === vi ? { ...y, label: e.target.value } : y)) } : x)) })} className={small} />
                  <input inputMode="decimal" value={v.factor} onChange={(e) => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, values: x.values.map((y, k) => (k === vi ? { ...y, factor: Number(e.target.value) || 0 } : y)) } : x)) })} className={narrow("w-20")} />
                  <Del onClick={() => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, values: x.values.filter((_, k) => k !== vi) } : x)) })} />
                </div>
              ))}
              <button type="button" className="mt-1 text-xs text-blue-700" onClick={() => set({ factorSets: t.factorSets.map((x, j) => (j === si ? { ...x, values: [...x.values, { key: keyFrom("Value", x.values.map((y) => y.key)), label: "New value", factor: 1, is_default: !x.values.length }] } : x)) })}>+ value</button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => set({ factorSets: [...t.factorSets, { set: keyFrom("Factor", t.factorSets.map((f) => f.set)), label: "New factor", values: [{ key: "NORMAL", label: "Normal", factor: 1, is_default: true }] }] })}>+ Factor</Button>
        </Section>
      )}

      <Section title={`Stages and gates (${t.stages.length})`} hint="Stages are the phases of the project. A gate closes a stage; its blocking checks must be met (or excepted) before the stage completes.">
        {t.stages.map((s, i) => (
          <div key={s.stage_key} className="rounded-lg bg-slate-50 p-2">
            <div className="flex items-center gap-2">
              <Move onUp={i ? () => set({ stages: swap(t.stages, i, i - 1) }) : undefined} onDown={i < t.stages.length - 1 ? () => set({ stages: swap(t.stages, i, i + 1) }) : undefined} />
              <input aria-label="Stage name" value={s.name} onChange={(e) => set({ stages: t.stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={small} />
              <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={s.optional} onChange={(e) => set({ stages: t.stages.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} />optional</label>
              <Del onClick={() => set({ stages: t.stages.filter((_, j) => j !== i), gates: t.gates.filter((g) => g.stage_key !== s.stage_key), workPackages: t.workPackages.map((w) => (w.stage_key === s.stage_key ? { ...w, stage_key: null } : w)) })} />
            </div>
            <input aria-label="Stage purpose" value={s.purpose} placeholder="Purpose" onChange={(e) => set({ stages: t.stages.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)) })} className={`${small} mt-1`} />
            {t.gates.map((g, gi) => g.stage_key !== s.stage_key ? null : (
              <div key={g.gate_key} className="mt-2 rounded border border-slate-200 p-2">
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">Gate</span><input aria-label="Gate name" value={g.name} onChange={(e) => set({ gates: t.gates.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)) })} className={small} /><Del onClick={() => set({ gates: t.gates.filter((_, j) => j !== gi) })} /></div>
                {g.criteria.map((c, ci) => (
                  <div key={ci} className="mt-1 flex items-center gap-2">
                    <input aria-label="Check" value={c.title} disabled={c.kind === "DEFINITION_CONFIRMED"} onChange={(e) => set({ gates: t.gates.map((x, j) => (j === gi ? { ...x, criteria: x.criteria.map((y, k) => (k === ci ? { ...y, title: e.target.value } : y)) } : x)) })} className={small} />
                    <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={c.blocking} onChange={(e) => set({ gates: t.gates.map((x, j) => (j === gi ? { ...x, criteria: x.criteria.map((y, k) => (k === ci ? { ...y, blocking: e.target.checked } : y)) } : x)) })} />blocks</label>
                    <Del onClick={() => set({ gates: t.gates.map((x, j) => (j === gi ? { ...x, criteria: x.criteria.filter((_, k) => k !== ci) } : x)) })} />
                  </div>
                ))}
                <button type="button" className="mt-1 text-xs text-blue-700" onClick={() => set({ gates: t.gates.map((x, j) => (j === gi ? { ...x, criteria: [...x.criteria, { title: "New check", kind: "MANUAL", required: true, blocking: false }] } : x)) })}>+ check</button>
              </div>
            ))}
            <button type="button" className="mt-1 text-xs text-blue-700" onClick={() => set({ gates: [...t.gates, { gate_key: keyFrom(`${s.name} gate`, t.gates.map((g) => g.gate_key)), stage_key: s.stage_key, name: `${s.name} done`, purpose: "", criteria: [] }] })}>+ gate</button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => set({ stages: [...t.stages, { stage_key: keyFrom("Stage", t.stages.map((s) => s.stage_key)), sequence: 0, name: "New stage", purpose: "", typical_outputs: [], optional: false }] })}>+ Stage</Button>
      </Section>

      <Section title={`Starter work (${t.workPackages.length})`} hint={backward ? `Each item finishes a set number of days before the ${t.anchorLabel.toLowerCase()}.` : "Items run in order: each starts after the items it follows have finished."}>
        {t.workPackages.map((w, i) => (
          <div key={w.wp_key} className="rounded-lg bg-slate-50 p-2">
            <div className="flex items-center gap-2">
              <Move onUp={i ? () => set({ workPackages: swap(t.workPackages, i, i - 1) }) : undefined} onDown={i < t.workPackages.length - 1 ? () => set({ workPackages: swap(t.workPackages, i, i + 1) }) : undefined} />
              <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => setOpenWp(openWp === w.wp_key ? null : w.wp_key)}>
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block text-xs text-slate-500">{t.stages.find((s) => s.stage_key === w.stage_key)?.name ?? "no stage"} · {w.effort.length} hour lines · {w.costs.length} cost lines</span>
              </button>
              <Del onClick={() => set({ workPackages: t.workPackages.filter((_, j) => j !== i).map((x) => ({ ...x, predecessors: x.predecessors.filter((p) => p !== w.wp_key) })) })} />
            </div>
            {openWp === w.wp_key && <WorkItem t={t} w={w} onChange={(v) => setWp(i, v)} />}
          </div>
        ))}
        <Button variant="secondary" onClick={() => {
          const k = keyFrom("Work item", t.workPackages.map((x) => x.wp_key));
          set({ workPackages: [...t.workPackages, { wp_key: k, name: "New work item", sequence: 0, stage_key: t.stages[0]?.stage_key ?? null, deliverable_title: null, predecessors: [], effort: [], costs: [], ...(backward ? { finishBeforeAnchorDays: 30 } : {}) }] });
          setOpenWp(k);
        }}>+ Work item</Button>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-ink p-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {errors.length > 0 && <p className="max-h-20 overflow-auto text-xs text-amber-800">{errors.join(" ")}</p>}
          {cmd.message}
          <div className="flex gap-2">
            <Button onClick={save} disabled={errors.length > 0} className="flex-1">Save template</Button>
            <Button variant="secondary" onClick={() => original && setT(structuredClone(original))}>Undo changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkItem({ t, w, onChange }: { t: ProjectTemplate; w: TemplateWorkPackage; onChange: (v: Partial<TemplateWorkPackage>) => void }) {
  const backward = t.scheduling === "backward";
  const setE = (i: number, v: Partial<EffortRule>) => onChange({ effort: w.effort.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  const setC = (i: number, v: Partial<CostRule>) => onChange({ costs: w.costs.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  const perSel = (per: { driver: string; rate: number } | undefined, cb: (p: { driver: string; rate: number } | undefined) => void) => (
    <>
      <select aria-label="Per driver" value={per?.driver ?? ""} onChange={(e) => cb(e.target.value ? { driver: e.target.value, rate: per?.rate ?? 1 } : undefined)} className={small}>
        <option value="">no driver</option>{t.drivers.map((d) => <option key={d.key} value={d.key}>+ per {d.label.toLowerCase()}</option>)}
      </select>
      {per && <input aria-label="Per driver rate" inputMode="decimal" value={per.rate} onChange={(e) => cb({ ...per, rate: Number(e.target.value) || 0 })} className={narrow("w-20")} />}
    </>
  );
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name"><input value={w.name} onChange={(e) => onChange({ name: e.target.value })} className={small} /></Field>
        <Field label={`${t.terms.deliverable} title`}><input value={w.deliverable_title ?? ""} placeholder={w.name} onChange={(e) => onChange({ deliverable_title: e.target.value || null })} className={small} /></Field>
        <Field label="Stage"><select value={w.stage_key ?? ""} onChange={(e) => onChange({ stage_key: e.target.value || null })} className={small}><option value="">—</option>{t.stages.map((s) => <option key={s.stage_key} value={s.stage_key}>{s.name}</option>)}</select></Field>
        <Field label="Minimum days"><input inputMode="decimal" value={w.minDays ?? ""} onChange={(e) => onChange({ minDays: numOr(e.target.value) })} className={small} /></Field>
        <Field label="Fixed days (optional)"><input inputMode="decimal" value={w.fixedDays ?? ""} onChange={(e) => onChange({ fixedDays: numOr(e.target.value) })} className={small} /></Field>
        {backward && <Field label={`Finish days before ${t.anchorLabel.toLowerCase()}`}><input inputMode="numeric" value={w.finishBeforeAnchorDays ?? ""} onChange={(e) => onChange({ finishBeforeAnchorDays: numOr(e.target.value) })} className={small} /></Field>}
        {t.method === "area_scaled" && <Field label="Area exponent"><input inputMode="decimal" value={w.exponent ?? ""} onChange={(e) => onChange({ exponent: numOr(e.target.value) })} className={small} /></Field>}
      </div>
      {!backward && (
        <Field label="Starts after">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {t.workPackages.filter((x) => x.wp_key !== w.wp_key).map((x) => (
              <label key={x.wp_key} className="flex items-center gap-1"><input type="checkbox" checked={w.predecessors.includes(x.wp_key)} onChange={(e) => onChange({ predecessors: e.target.checked ? [...w.predecessors, x.wp_key] : w.predecessors.filter((p) => p !== x.wp_key) })} />{x.name}</label>
            ))}
          </div>
        </Field>
      )}
      <div className="text-xs font-semibold uppercase text-slate-500">Hours</div>
      {w.effort.map((e, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select aria-label="Role" value={e.role} onChange={(x) => setE(i, { role: x.target.value })} className={narrow("w-32")}>{t.roles.map((r) => <option key={r.role_key} value={r.role_key}>{r.label}</option>)}</select>
          <input aria-label="Hours" inputMode="decimal" value={e.base} onChange={(x) => setE(i, { base: Number(x.target.value) || 0 })} className={narrow("w-20")} />
          {perSel(e.per, (per) => setE(i, { per }))}
          <Del onClick={() => onChange({ effort: w.effort.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <button type="button" className="text-xs text-blue-700" disabled={!t.roles.length} onClick={() => onChange({ effort: [...w.effort, { role: t.roles[0].role_key, base: 1 }] })}>+ hours</button>
      <div className="text-xs font-semibold uppercase text-slate-500">Costs</div>
      {w.costs.map((c, i) => (
        <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
          <div className="flex gap-2"><input aria-label="Cost name" value={c.label} onChange={(x) => setC(i, { label: x.target.value })} className={small} /><Del onClick={() => onChange({ costs: w.costs.filter((_, j) => j !== i) })} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Quantity" inputMode="decimal" value={c.base} onChange={(x) => setC(i, { base: Number(x.target.value) || 0 })} className={narrow("w-16")} />
            <input aria-label="Unit" value={c.unit} onChange={(x) => setC(i, { unit: x.target.value })} className={narrow("w-16")} />
            {perSel(c.per, (per) => setC(i, { per }))}
            <span className="text-xs text-slate-500">×</span>
            <input aria-label="Price" inputMode="decimal" value={c.unitCost} onChange={(x) => setC(i, { unitCost: Number(x.target.value) || 0 })} className={narrow("w-28")} />
          </div>
        </div>
      ))}
      <button type="button" className="text-xs text-blue-700" onClick={() => onChange({ costs: [...w.costs, { label: "New cost", unit: "lot", base: 1, unitCost: 0 }] })}>+ cost</button>
    </div>
  );
}
