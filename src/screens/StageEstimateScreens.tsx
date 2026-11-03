import { useState } from "react";
import type { EntityType, Stage } from "../lib/model";
import { mutate, useStore } from "../lib/store";
import { href } from "../lib/router";
import {
  acceptException, addCriterion, addStage, applyTemplate, completeStage, getGates, moveStage, reopenStage, setCriterionMet, skipStage, startStage, withdrawException, type GateState,
} from "../lib/domain/stages";
import { templateOf } from "../lib/seed";
import { labelOf } from "../lib/domain/registers";
import { Badge, Button, Card, PageTitle, fmt, inputCls, useCommand, type Tone } from "../ui/ui";
import { formData } from "../ui/forms";
import { PlanSubNav } from "./PlanScreens";
import type { ScreenProps } from "./registry";

const S_TONE: Record<Stage["status"], Tone> = { NOT_STARTED: "slate", ACTIVE: "blue", COMPLETE: "green", SKIPPED: "slate" };
const G_TONE: Record<GateState["status"], Tone> = { READY: "green", BLOCKED: "red", OPEN_ITEMS: "amber" };

// ---------------------------------------------------------------- stages
export function StagesScreen({ p }: ScreenProps) {
  const lib = useStore((s) => s.library);
  const cmd = useCommand();
  const gates = getGates(p);
  const stages = [...p.stages].sort((a, b) => a.sequence - b.sequence);
  if (!stages.length) {
    const t = templateOf(lib, p);
    const optional = t.stages.filter((s) => s.optional);
    return (
      <div className="space-y-4">
        <PlanSubNav id={p.id} at="stages" />
        <PageTitle title="Stages & readiness" sub={`From the ${t.name} template`} />
        <Card title="Set up stages">
          <form className="space-y-3" onSubmit={(e) => {
            const f = formData(e);
            const skip = optional.filter((s) => f.fd.get(`skip_${s.stage_key}`) === "on").map((s) => s.stage_key);
            void cmd.run(() => mutate(p.id, (x, l) => applyTemplate(x, l, skip), "stages.applied"));
          }}>
            <ol className="space-y-1 text-sm">
              {[...t.stages].sort((a, b) => a.sequence - b.sequence).map((s) => (
                <li key={s.stage_key} className="flex items-start justify-between gap-2">
                  <span><span className="font-medium">{s.name}</span><span className="block text-xs text-slate-500">{s.purpose}</span></span>
                  {s.optional && <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" name={`skip_${s.stage_key}`} /> skip</label>}
                </li>
              ))}
            </ol>
            <Button type="submit">Use these stages</Button>
            {cmd.message}
          </form>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PlanSubNav id={p.id} at="stages" />
      <PageTitle title="Stages & readiness" sub="Stages may overlap, be skipped or revisited. Only blocking criteria stop a stage from completing." />
      {cmd.message}
      {stages.map((s, i) => <StageCard key={s.id} p={p} s={s} first={i === 0} last={i === stages.length - 1} gates={gates.filter((g) => g.stage_id === s.id)} run={cmd.run} />)}
      <Card title="Add a stage">
        <form className="space-y-2" onSubmit={(e) => { const f = formData(e); void cmd.run(() => mutate(p.id, (x) => addStage(x, f.s("name"), f.opt("purpose"), f.opt("after")), "stage.add")).then((ok) => ok && f.form.reset()); }}>
          <input name="name" placeholder="Stage name" className={inputCls} />
          <input name="purpose" placeholder="Purpose" className={inputCls} />
          <select name="after" className={inputCls}><option value="">At the end</option>{stages.map((s) => <option key={s.id} value={s.id}>After {s.name}</option>)}</select>
          <Button type="submit" variant="secondary">Add stage</Button>
        </form>
      </Card>
    </div>
  );
}

function StageCard({ p, s, gates, first, last, run }: { p: ScreenProps["p"]; s: Stage; gates: GateState[]; first: boolean; last: boolean; run: ReturnType<typeof useCommand>["run"] }) {
  const [open, setOpen] = useState(s.status === "ACTIVE");
  const [ask, setAsk] = useState<"" | "skip" | "reopen">("");
  const blockers = gates.reduce((t, g) => t + g.blockers, 0);
  const m = (fn: Parameters<typeof mutate>[1], ev: string) => run(() => mutate(p.id, fn, ev));
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{s.name}{s.revisit_count ? <span className="ml-1 text-xs font-normal text-slate-500">revisited ×{s.revisit_count}</span> : null}</span>
          <span className="block truncate text-xs text-slate-500">{s.status === "SKIPPED" ? `skipped: ${s.skipped_reason}` : s.purpose}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={S_TONE[s.status]}>{s.status.replace("_", " ").toLowerCase()}</Badge>
          {gates.length > 0 && <Badge tone={blockers ? "red" : G_TONE[gates[0].status]}>{blockers ? `${blockers} blocking` : gates.every((g) => g.status === "READY") ? "ready" : "open items"}</Badge>}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {s.typical_outputs.length > 0 && <p className="text-xs text-slate-600">Typical outputs: {s.typical_outputs.join(", ")}</p>}
          <div className="flex flex-wrap gap-2">
            {s.status === "NOT_STARTED" && <Button onClick={() => void m((x) => startStage(x, s.id), "stage.start")}>Start</Button>}
            {s.status === "ACTIVE" && <Button variant="approve" onClick={() => void m((x) => completeStage(x, s.id), "stage.complete")}>Complete</Button>}
            {s.status !== "COMPLETE" && s.status !== "SKIPPED" && <Button variant="secondary" onClick={() => setAsk("skip")}>Skip…</Button>}
            {(s.status === "COMPLETE" || s.status === "SKIPPED") && <Button variant="secondary" onClick={() => setAsk("reopen")}>Revisit…</Button>}
            {!first && <Button variant="ghost" onClick={() => void m((x) => moveStage(x, s.id, "up"), "stage.move")}>↑</Button>}
            {!last && <Button variant="ghost" onClick={() => void m((x) => moveStage(x, s.id, "down"), "stage.move")}>↓</Button>}
          </div>
          {ask && (
            <form className="flex gap-2" onSubmit={(e) => { const f = formData(e); void m((x) => (ask === "skip" ? skipStage(x, s.id, f.s("reason")) : reopenStage(x, s.id, f.s("reason"))), `stage.${ask}`).then((ok) => ok && setAsk("")); }}>
              <input name="reason" placeholder={ask === "skip" ? "Why it does not apply" : "Why revisit"} className={inputCls} />
              <Button type="submit">{ask === "skip" ? "Skip" : "Reopen"}</Button>
            </form>
          )}
          {gates.map((g) => <GateBlock key={g.id} p={p} g={g} run={run} />)}
          {s.history.length > 0 && (
            <details className="text-xs text-slate-600"><summary>History ({s.history.length})</summary>
              <ul className="mt-1 space-y-0.5">{s.history.map((h, i) => <li key={i}>{fmt(h.at)} · {h.from?.toLowerCase() ?? "—"} → {h.to.toLowerCase()}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function GateBlock({ p, g, run }: { p: ScreenProps["p"]; g: GateState; run: ReturnType<typeof useCommand>["run"] }) {
  const [adding, setAdding] = useState(false);
  const [excepting, setExcepting] = useState<string | null>(null);
  const m = (fn: Parameters<typeof mutate>[1], ev: string) => run(() => mutate(p.id, fn, ev));
  const sources: Array<{ v: string; l: string }> = [];
  const add = (t: EntityType, xs: Array<{ id: string }>) => xs.forEach((x) => sources.push({ v: `${t}:${x.id}`, l: labelOf(p, t, x.id) }));
  add("DELIVERABLE", p.deliverables); add("MILESTONE", p.milestones); add("COMMENT", p.comments); add("ISSUE", p.issues); add("CHANGE_RECORD", p.changes); add("DOCUMENT", p.documents);
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{g.name}</span>
        <Badge tone={G_TONE[g.status]}>{g.status.replace("_", " ").toLowerCase()}</Badge>
      </div>
      <ul className="space-y-2">
        {g.criteria.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="flex items-start gap-2">
              {c.kind === "MANUAL" ? (
                <input type="checkbox" aria-label={c.title} checked={c.met} className="mt-1 h-4 w-4" onChange={(e) => void m((x) => setCriterionMet(x, c.id, e.target.checked), "readiness.check")} />
              ) : <span className={`mt-0.5 w-4 text-center ${c.is_met ? "text-emerald-700" : "text-slate-400"}`}>{c.is_met ? "✓" : "○"}</span>}
              <span className="min-w-0 flex-1">
                <span className={c.blocking_now ? "font-medium text-red-800" : ""}>{c.title}</span>
                <span className="block text-xs text-slate-500">{c.reason}{c.required ? "" : " · optional"}{c.blocking ? " · blocking" : ""}</span>
                {c.exception && <span className="block text-xs text-amber-800">Exception accepted {fmt(c.exception.accepted_at)}: {c.exception.reason} <button className="underline" onClick={() => void m((x) => withdrawException(x, c.id), "readiness.exception_withdrawn")}>withdraw</button></span>}
                {c.evidence.map((ev, i) => <span key={i} className="block text-xs text-slate-600">Evidence: {ev.description}</span>)}
              </span>
              {!c.is_met && !c.exception && c.blocking && <button className="text-xs text-amber-800 underline" onClick={() => setExcepting(excepting === c.id ? null : c.id)}>exception</button>}
            </div>
            {excepting === c.id && (
              <form className="mt-1 flex gap-2" onSubmit={(e) => { const f = formData(e); void m((x) => acceptException(x, c.id, f.s("reason")), "readiness.exception_accepted").then((ok) => ok && setExcepting(null)); }}>
                <input name="reason" placeholder="Why it is acceptable to proceed" className={inputCls} />
                <Button type="submit" variant="secondary">Accept</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <form className="mt-2 space-y-2" onSubmit={(e) => {
          const f = formData(e);
          const src = f.opt("source");
          const [t, id] = src ? src.split(":") : [];
          void m((x) => addCriterion(x, g.id, { title: f.s("title"), blocking: f.fd.get("blocking") === "on", required: true, source: src ? { type: t as EntityType, id } : null }), "readiness.add").then((ok) => ok && setAdding(false));
        }}>
          <input name="title" placeholder="Criterion" className={inputCls} />
          <select name="source" className={inputCls}><option value="">Checked by hand</option>{sources.map((s) => <option key={s.v} value={s.v}>Done when: {s.l}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="blocking" /> Blocking</label>
          <Button type="submit" variant="secondary">Add criterion</Button>
        </form>
      ) : <button className="mt-2 text-xs text-blue-700" onClick={() => setAdding(true)}>+ criterion</button>}
    </div>
  );
}

