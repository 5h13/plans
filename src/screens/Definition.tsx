import { mutate, useStore } from "../lib/store";
import type { Definition as Def, Project } from "../lib/model";
import * as D from "../lib/domain/project";
import { Badge, Button, Card, Field, PageTitle, fmt, inputCls, useCommand } from "../ui/ui";
import { templateOf } from "../lib/seed";
import { areaM2, formData, IdentityFields, LocationFields, SizeFields } from "../ui/forms";


export function Definition({ p }: { p: Project; params?: string[] }) {
  const lib = useStore((s) => s.library);
  const save = useCommand();
  const conf = useCommand();
  const crit = useCommand();
  const codes = useCommand();
  const det = useCommand();
  const d = p.definition;
  const t = templateOf(lib, p);
  const SECTIONS = t.sections;
  const code = (id: string) => lib.codes.find((c) => c.id === id);
  const catLabel = (k: string) => t.criteriaCategories.find((o) => o.value_key === k)?.label ?? k;
  return (
    <div className="space-y-4">
      <PageTitle title="Project definition" sub="The plan and estimate are generated from this. Editing it later returns it to draft." actions={d.status === "confirmed" ? <Badge tone="green">confirmed {fmt(d.confirmed_at)}</Badge> : <Badge tone="amber">draft</Badge>} />
      <Card title="What the project must achieve">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            const f = formData(e);
            const v: Partial<Def> = {};
            for (const s of SECTIONS) (v as Record<string, unknown>)[s.key] = f.opt(s.key);
            v.target_start = f.opt("target_start");
            v.target_finish = f.opt("target_finish");
            v.budget_limit = f.num("budget_limit");
            v.schedule_notes = f.opt("schedule_notes");
            v.budget_notes = f.opt("budget_notes");
            void save.run(() => mutate(p.id, (x) => D.saveDefinition(x, v), "definition.updated"), "Saved.");
          }}
        >
          {SECTIONS.map((s) => (
            <Field key={s.key} label={s.label} hint={s.prompt}>
              <textarea name={s.key} rows={s.key === "objective" ? 2 : 3} defaultValue={(d[s.key] as string | null) ?? ""} className={inputCls} />
            </Field>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.scheduling === "backward" ? "Planning starts" : "Target start"}><input type="date" name="target_start" defaultValue={d.target_start ?? ""} className={inputCls} /></Field>
            <Field label={t.scheduling === "backward" ? t.anchorLabel : "Target finish"}><input type="date" name="target_finish" defaultValue={d.target_finish ?? ""} className={inputCls} /></Field>
          </div>
          <Field label={`Budget limit (${p.currency})`}><input name="budget_limit" inputMode="decimal" defaultValue={d.budget_limit ?? ""} className={inputCls} /></Field>
          {d.budget_notes && <p className="text-xs text-amber-800">{d.budget_notes}</p>}
          <Field label="Schedule constraints"><textarea name="schedule_notes" rows={2} defaultValue={d.schedule_notes ?? ""} className={inputCls} /></Field>
          <Field label="Budget constraints"><textarea name="budget_notes" rows={2} defaultValue={d.budget_notes ?? ""} className={inputCls} /></Field>
          {save.message}
          <Button type="submit" className="w-full">Save definition</Button>
        </form>
      </Card>

      <Card title="Confirm">
        {d.status === "confirmed" ? (
          <p className="text-sm text-slate-700">Confirmed. Editing any section returns the definition to draft.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Objective and scope are required to confirm.</p>
            {conf.message}
            <Button variant="approve" className="w-full" onClick={() => void conf.run(() => mutate(p.id, (x) => D.confirmDefinition(x), "definition.confirmed"), "Definition confirmed.")}>Confirm definition</Button>
          </div>
        )}
      </Card>

      <Card title={t.criteriaLabel}>
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {p.criteria.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="block text-xs text-slate-500">{catLabel(c.category)}</span>{c.criterion}: <strong>{c.value_text} {c.unit}</strong>{c.source && <span className="text-xs text-slate-500"> · {c.source}</span>}</span>
              <button className="text-xs text-red-700" onClick={() => void crit.run(() => mutate(p.id, (x) => D.removeCriterion(x, c.id)))}>Remove</button>
            </li>
          ))}
          {!p.criteria.length && <li className="py-2 text-slate-500">None yet.</li>}
        </ul>
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            const f = formData(e);
            void crit.run(async () => {
              await mutate(p.id, (x) => D.addCriterion(x, { category: f.s("category"), criterion: f.s("criterion"), value_text: f.s("value_text"), unit: f.s("unit"), source: f.s("source") }));
              f.form.reset();
            }, "Criterion added.");
          }}
        >
          <div className="col-span-2"><select name="category" className={inputCls}>{t.criteriaCategories.map((o) => <option key={o.value_key} value={o.value_key}>{o.label}</option>)}</select></div>
          <div className="col-span-2"><input name="criterion" placeholder="What, e.g. Guest dietary needs / Office dry-bulb" className={inputCls} /></div>
          <input name="value_text" placeholder="Value" className={inputCls} />
          <input name="unit" placeholder="Unit" className={inputCls} />
          <div className="col-span-2"><input name="source" placeholder="Source, e.g. client brief" className={inputCls} /></div>
          <div className="col-span-2">{crit.message}</div>
          <Button type="submit" variant="secondary" className="col-span-2">Add criterion</Button>
        </form>
      </Card>

      {t.features.codes && <Card title="Codes and standards">
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {p.codeBasis.map((b) => (
            <li key={b.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span><span className="font-medium">{code(b.code_source_id)?.short_name ?? "?"}</span> {b.basis_role === "statutory" ? <Badge tone="violet">permit</Badge> : b.basis_role === "design" ? <Badge tone="blue">design</Badge> : <Badge>reference</Badge>}</span>
                <button className="text-xs text-red-700" onClick={() => void codes.run(() => mutate(p.id, (x) => D.removeCodeBasis(x, b.id)))}>Remove</button>
              </div>
              <form className="mt-1 flex gap-2" onSubmit={(e) => { const f = formData(e); void codes.run(() => mutate(p.id, (x) => D.setEdition(x, b.id, f.s("edition"))), "Edition saved."); }}>
                <input name="edition" defaultValue={b.adopted_edition ?? ""} placeholder="Edition — to confirm" className={`${inputCls} py-1`} />
                <Button type="submit" variant="secondary">Save</Button>
              </form>
            </li>
          ))}
        </ul>
        <form className="space-y-2" onSubmit={(e) => { const f = formData(e); void codes.run(() => mutate(p.id, (x) => D.addCodeBasis(x, { codeSourceId: f.s("code"), basisRole: f.s("role") as "design" })), "Added."); }}>
          <select name="code" className={inputCls}>{lib.codes.filter((c) => !p.codeBasis.some((b) => b.code_source_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.short_name} — {c.title}</option>)}</select>
          <select name="role" className={inputCls}><option value="design">Design standard</option><option value="statutory">Permit (statutory)</option><option value="reference">Reference only</option></select>
          {codes.message}
          <Button type="submit" variant="secondary" className="w-full">Add to code basis</Button>
        </form>
      </Card>}

      <Card title={t.features.size ? "Project details, location and size" : "Project details"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            const f = formData(e);
            void det.run(() => mutate(p.id, (x) => D.updateDetails(x, {
              name: f.s("name"), client_name: f.opt("clientName"), project_type: f.s("projectType") || p.project_type, delivery_model: f.opt("deliveryModel"), region: f.opt("region"), province: f.opt("province"),
              city_municipality: f.opt("cityMunicipality"), barangay: f.opt("barangay"), site_address: f.opt("siteAddress"), permit_authority: f.opt("permitAuthority"),
              ...(t.features.size ? { gross_floor_area_m2: areaM2(f.num("area"), f.s("areaUnit")), floors_above_grade: f.num("floorsAboveGrade"), floors_below_grade: f.num("floorsBelowGrade") } : {}),
            })), "Details saved.");
          }}
        >
          <IdentityFields p={p} types={lib.options.project_type} scopes={lib.options.scope_model} engineering={t.features.scopeModel} />
          {t.features.location && <LocationFields p={p} regions={lib.options.ph_region} permit={t.features.permit} />}
          {t.features.size && <SizeFields p={p} unitSystem={p.unit_system} />}
          {det.message}
          <Button type="submit" variant="secondary" className="w-full">Save details</Button>
        </form>
      </Card>
    </div>
  );
}
