import { resetAll, updateLibrary, useStore } from "../lib/store";
import { Button, Card, Field, PageTitle, inputCls, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import { DomainError } from "../lib/util";
import { DEFAULT_MODEL, testKey } from "../lib/ingest/ai";

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
        <a className="text-sm text-blue-700" href="#/library">Templates and estimating library ›</a>
      </Card>
      <AiSettings />
      <Card title="Reset">
        <p className="mb-2 text-sm text-slate-600">Deletes every project and setting on this device. Export projects first if you need them.</p>
        {danger.message}
        <Button variant="danger" onClick={() => { if (window.confirm("Delete everything on this device?")) void danger.run(async () => { await resetAll(); window.location.hash = "#/"; }); }}>Reset app</Button>
      </Card>
      <p className="text-center text-xs text-slate-400">5H13 Plans PWA v{__APP_VERSION__}</p>
    </div>
  );
}

/** Optional AI reading of contracts. Offline reading always works; AI is an extra pass the owner can turn on. */
function AiSettings() {
  const ai = useStore((x) => x.library.settings?.ai);
  const cmd = useCommand();
  return (
    <Card title="AI reading of documents (optional)">
      <p className="mb-3 text-sm text-slate-600">
        Contracts are always read on this device, without AI. Turn this on to add an AI pass with Claude that reads any layout and describes each revision.
        It needs an internet connection and your own Anthropic API key. When you use it, the document text is sent to Anthropic. The key is stored only on this device.
      </p>
      <form className="space-y-3" onSubmit={(e) => {
        const f = formData(e);
        const enabled = f.fd.get("enabled") === "on";
        const apiKey = f.s("apiKey") || ai?.apiKey || "";
        if (enabled && !apiKey) { void cmd.run(() => { throw new DomainError("VALIDATION", "Add an API key to turn AI reading on."); }); return; }
        void cmd.run(async () => {
          await updateLibrary((l) => { l.settings = { ...l.settings!, ai: { enabled, apiKey, model: f.s("model") || DEFAULT_MODEL } }; });
          return enabled ? "AI reading is on." : "AI reading is off.";
        });
      }}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={!!ai?.enabled} className="h-4 w-4" /> Use AI when reading contracts</label>
        <Field label="Anthropic API key" hint={ai?.apiKey ? `Saved (…${ai.apiKey.slice(-4)}). Leave blank to keep it.` : "From console.anthropic.com → API keys."}>
          <input name="apiKey" type="password" autoComplete="off" placeholder={ai?.apiKey ? "••••••••" : "sk-ant-…"} className={inputCls} />
        </Field>
        <Field label="Model"><input name="model" defaultValue={ai?.model ?? DEFAULT_MODEL} className={inputCls} /></Field>
        {cmd.message}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Save</Button>
          {ai?.apiKey && <Button variant="secondary" onClick={() => void cmd.run(async () => { await testKey(ai); return "The key works."; })}>Test</Button>}
          {ai?.apiKey && <Button variant="ghost" onClick={() => void cmd.run(async () => { await updateLibrary((l) => { l.settings = { ...l.settings!, ai: undefined }; }); return "Key removed from this device."; })}>Remove key</Button>}
        </div>
      </form>
    </Card>
  );
}
