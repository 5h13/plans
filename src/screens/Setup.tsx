import { updateLibrary } from "../lib/store";
import { now } from "../lib/util";
import { go } from "../lib/router";
import { Button, Card, Field, inputCls, useCommand } from "../ui/ui";
import { formData } from "../ui/forms";
import { DomainError } from "../lib/util";

export function Setup() {
  const cmd = useCommand();
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome to 5H13 Plans</h1>
        <p className="mt-1 text-slate-600">Everything stays on this device and works offline. Back it up by exporting projects (Settings → Export).</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          const { s } = formData(e);
          void cmd.run(async () => {
            if (!s("ownerName")) throw new DomainError("VALIDATION", "Enter your name.");
            await updateLibrary((l) => {
              l.settings = {
                ownerName: s("ownerName"), ownerTitle: s("ownerTitle") || undefined, unitSystem: s("unitSystem") === "si" ? "si" : "us_customary",
                currency: (s("currency") || "PHP").toUpperCase(), countryCode: "PH", hoursPerDay: 8, daysPerWeek: 5, workingDaysPerMonth: 21, createdAt: now(),
              };
            });
            go("/");
          });
        }}
      >
        <Card title="You">
          <div className="space-y-3">
            <Field label="Your name"><input name="ownerName" className={inputCls} placeholder="e.g. Fred Santiago" /></Field>
            <Field label="Job title (optional)"><input name="ownerTitle" className={inputCls} /></Field>
          </div>
        </Card>
        <Card title="Defaults for new projects">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Units">
              <select name="unitSystem" defaultValue="us_customary" className={inputCls}>
                <option value="us_customary">US customary (ft, lb)</option>
                <option value="si">SI (m, kg)</option>
              </select>
            </Field>
            <Field label="Currency"><input name="currency" defaultValue="PHP" maxLength={3} className={inputCls} /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">Working time: 8 h/day, 5 days/week, 21 working days/month — change later in Settings.</p>
        </Card>
        {cmd.message}
        <Button type="submit" className="w-full">Start</Button>
      </form>
    </div>
  );
}
