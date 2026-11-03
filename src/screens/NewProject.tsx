import { useState, type ReactNode } from "react";
import { getState, putProject, useStore } from "../lib/store";
import { newProject } from "../lib/domain/project";
import { go } from "../lib/router";
import { Button, Card, Field, PageTitle, inputCls, useCommand } from "../ui/ui";
import { areaM2, formData, IdentityFields, LocationFields, SizeFields } from "../ui/forms";

export function NewProject() {
  const lib = useStore((s) => s.library);
  const s = lib.settings!;
  const cmd = useCommand();
  const [key, setKey] = useState<string | null>(null);
  const t = lib.templates.find((x) => x.key === key) ?? null;
  let n = 0;
  const step = (title: string, children: ReactNode, hint?: string) => (
    <Card title={<span><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-blue-700 text-xs text-white">{++n}</span>{title}</span>}>
      {hint && <p className="mb-3 text-sm text-slate-600">{hint}</p>}
      {children}
    </Card>
  );
  if (!t) {
    return (
      <div className="space-y-3 p-4">
        <PageTitle title="New project" sub="What kind of project is it? The template sets the questions, stages and starter plan. You can change everything afterwards." />
        <ul className="space-y-2">
          {lib.templates.map((x) => (
            <li key={x.key}>
              <button onClick={() => setKey(x.key)} className="block w-full rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-sm active:bg-slate-50">
                <span className="block font-medium">{x.name}</span>
                <span className="block text-sm text-slate-600">{x.description}</span>
                <span className="mt-1 block text-xs text-slate-500">{x.stages.length} stages · {x.workPackages.length ? `${x.workPackages.length} starter ${x.terms.deliverables.toLowerCase()}` : "plan by hand"} · {x.scheduling === "backward" ? `backward from the ${x.anchorLabel.toLowerCase()}` : "forward from the start"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4">
      <button onClick={() => setKey(null)} className="text-sm text-blue-700">‹ Templates</button>
      <PageTitle title={`New project · ${t.name}`} sub="Next you'll define what it must achieve; the plan is generated from that." />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          const f = formData(e);
          void cmd.run(async () => {
            const p = newProject(getState().library, Object.values(getState().projects), {
              templateKey: t.key, projectNo: f.s("projectNo"), name: f.s("name"), clientName: f.opt("clientName"), projectType: f.s("projectType") || t.key.toUpperCase(), deliveryModel: f.opt("deliveryModel"),
              region: f.opt("region"), province: f.opt("province"), cityMunicipality: f.opt("cityMunicipality"), barangay: f.opt("barangay"),
              siteAddress: f.opt("siteAddress"), permitAuthority: f.opt("permitAuthority"),
              grossFloorAreaM2: t.features.size ? areaM2(f.num("area"), f.s("areaUnit")) : null, floorsAboveGrade: f.num("floorsAboveGrade"), floorsBelowGrade: f.num("floorsBelowGrade"),
              unitSystem: f.s("unitSystem") === "si" ? "si" : "us_customary", currency: f.s("currency"), codeBasis: f.fd.getAll("codeBasis").map(String),
              drivers: Object.fromEntries(t.drivers.filter((d) => !d.fromProjectArea).map((d) => [d.key, f.num(`driver_${d.key}`) ?? d.default])),
              anchor: f.opt("anchor"),
            });
            await putProject(p);
            go(`/p/${p.id}/definition`);
          });
        }}
      >
        {step("Project and client", <IdentityFields types={lib.options.project_type} scopes={lib.options.scope_model} withNumber engineering={t.features.scopeModel} />)}
        {step(t.anchorLabel, (
          <Field label={t.anchorLabel} hint={t.scheduling === "backward" ? "Everything is planned backward from this date." : "You can change it later."}>
            <input type="date" name="anchor" className={inputCls} />
          </Field>
        ))}
        {t.drivers.some((d) => !d.fromProjectArea) && step("Size of the job", (
          <div className="grid grid-cols-2 gap-3">
            {t.drivers.filter((d) => !d.fromProjectArea).map((d) => (
              <Field key={d.key} label={`${d.label} (${d.unit})`}><input name={`driver_${d.key}`} inputMode="decimal" defaultValue={d.default} className={inputCls} /></Field>
            ))}
          </div>
        ), "These drive the starter estimate.")}
        {t.features.location && step("Location", <LocationFields regions={lib.options.ph_region} permit={t.features.permit} />, "Philippine projects: region, province, city or municipality, barangay.")}
        {t.features.size && step("Size", <SizeFields unitSystem={s.unitSystem} />)}
        {step(t.features.size ? "Units and currency" : "Currency", (
          <div className="grid grid-cols-2 gap-3">
            {t.features.size && <Field label="Units"><select name="unitSystem" defaultValue={s.unitSystem} className={inputCls}><option value="us_customary">US customary</option><option value="si">SI</option></select></Field>}
            <Field label="Currency"><input name="currency" defaultValue={s.currency} maxLength={3} className={inputCls} /></Field>
          </div>
        ))}
        {t.features.codes && step("Code basis", (
          <div className="space-y-3">
            {(["statutory", "design"] as const).map((role) => (
              <div key={role}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{role === "statutory" ? "Permits (statutory)" : "Design standards"}</div>
                {lib.codes.filter((c) => (c.defaultRole ?? "design") === role && (role === "statutory" || c.source_type !== "law")).map((c) => (
                  <label key={c.id} className="flex items-start gap-2 py-1 text-sm">
                    <input type="checkbox" name="codeBasis" value={c.id} defaultChecked={!!c.defaultRole} className="mt-1 h-4 w-4" />
                    <span><span className="font-medium">{c.short_name}</span> <span className="text-slate-500">{c.title}</span></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ), "Philippine law for permits; US standards for design. Editions are confirmed on the definition page.")}
        {cmd.message}
        <Button type="submit" className="w-full">Create project</Button>
      </form>
    </div>
  );
}
