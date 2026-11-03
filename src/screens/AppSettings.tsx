import { resetAll, updateLibrary, useStore } from "../lib/store";
import { Button, Card, Field, PageTitle, inputCls, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import { DomainError } from "../lib/util";

export function AppSettings() {
  const s = useStore((x) => x.library.settings)!;
  const cmd = useCommand();
  const danger = useCommand();
  return (
    <div className="space-y-4 p-4">
      <PageTitle title="Settings" sub="This device's library." />
      <Card title="You and defaults">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            const f = formData(e);
            void cmd.run(async () => {
              const hpd = f.num("hoursPerDay") ?? 8, dpw = f.num("daysPerWeek") ?? 5, wdm = f.num("workingDaysPerMonth") ?? 21;
              if (!(hpd > 0 && hpd <= 24) || !(dpw >= 1 && dpw <= 7) || !(wdm > 0 && wdm <= 31)) throw new DomainError("VALIDATION", "Check the working time values.");
              await updateLibrary((l) => {
                l.settings = { ...l.settings!, ownerName: f.s("ownerName") || l.settings!.ownerName, ownerTitle: f.s("ownerTitle") || undefined, unitSystem: f.s("unitSystem") === "si" ? "si" : "us_customary", currency: (f.s("currency") || "PHP").toUpperCase(), hoursPerDay: hpd, daysPerWeek: dpw, workingDaysPerMonth: wdm };
              });
            }, "Saved.");
          }}
        >
          <Field label="Your name"><input name="ownerName" defaultValue={s.ownerName} className={inputCls} /></Field>
          <Field label="Job title"><input name="ownerTitle" defaultValue={s.ownerTitle ?? ""} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Units"><select name="unitSystem" defaultValue={s.unitSystem} className={inputCls}><option value="us_customary">US customary</option><option value="si">SI</option></select></Field>
            <Field label="Currency"><input name="currency" defaultValue={s.currency} maxLength={3} className={inputCls} /></Field>
            <Field label="Hours per day"><input name="hoursPerDay" defaultValue={s.hoursPerDay} inputMode="decimal" className={inputCls} /></Field>
            <Field label="Days per week"><input name="daysPerWeek" defaultValue={s.daysPerWeek} inputMode="numeric" className={inputCls} /></Field>
            <Field label="Working days per month"><input name="workingDaysPerMonth" defaultValue={s.workingDaysPerMonth} inputMode="decimal" className={inputCls} /></Field>
          </div>
          {cmd.message}
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Card>
      <Card title="Library">
        <a className="text-sm text-blue-700" href="#/library">Estimating library (base MH, exponents, factors, rates) ›</a>
      </Card>
      <Card title="Reset">
        <p className="mb-2 text-sm text-slate-600">Deletes every project and setting on this device. Export projects first if you need them.</p>
        {danger.message}
        <Button variant="danger" onClick={() => { if (window.confirm("Delete everything on this device?")) void danger.run(async () => { await resetAll(); window.location.hash = "#/"; }); }}>Reset app</Button>
      </Card>
      <p className="text-center text-xs text-slate-400">5H13 Plans PWA v{__APP_VERSION__}</p>
    </div>
  );
}
