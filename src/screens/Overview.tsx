import { useStore } from "../lib/store";
import { href } from "../lib/router";
import type { Project } from "../lib/model";
import { Badge, Card, Row, fmt, money } from "../ui/ui";
import { formatArea, placeName } from "../ui/forms";
import { getPlan } from "../lib/domain/plan";
import { templateOf } from "../lib/seed";

export function Overview({ p }: { p: Project; params?: string[] }) {
  const lib = useStore((s) => s.library);
  const label = (set: string, k: string | null) => lib.options[set]?.find((o) => o.value_key === (k ?? "").toUpperCase())?.label ?? k;
  const d = p.definition;
  const plan = getPlan(p);
  const t = templateOf(lib, p);
  const next =
    d.status !== "confirmed"
      ? { to: `/p/${p.id}/definition`, text: "Complete and confirm the project definition." }
      : p.stages.length === 0
        ? { to: `/p/${p.id}/stages`, text: "Set up the stages." }
        : !t.workPackages.length && !p.deliverables.length
          ? { to: `/p/${p.id}/plan`, text: `Add milestones and ${t.terms.deliverables.toLowerCase()}, then set the baseline.` }
          : t.workPackages.length && !p.estimates.some((e) => e.status === "ACCEPTED")
          ? { to: `/p/${p.id}/estimate`, text: "Calculate the estimate, generate the plan and accept it as the baseline." }
          : { to: `/p/${p.id}/progress`, text: "Record progress with a progress report." };
  return (
    <div className="space-y-4">
      <a href={href(next.to)} className="block rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900 ring-1 ring-blue-200">Next: {next.text} ›</a>
      <Card title="Project">
        <Row k="Client" v={p.client_name} />
        <Row k="Template" v={t.name} />
        {t.features.scopeModel && <Row k="Building type" v={label("project_type", p.project_type)} />}
        {t.features.scopeModel && <Row k="Our scope" v={label("scope_model", p.delivery_model)} />}
        <Row k="Location" v={placeName(p)} />
        {t.features.permit && <Row k="Permit authority" v={p.permit_authority} />}
        {t.features.size && <Row k="Floor area" v={formatArea(p.gross_floor_area_m2, p.unit_system)} />}
        {t.drivers.filter((d) => !d.fromProjectArea).map((d) => <Row key={d.key} k={d.label} v={`${p.drivers[d.key] ?? d.default} ${d.unit}`} />)}
        <Row k="Currency" v={p.currency} />
      </Card>
      <Card title="Definition" actions={d.status === "confirmed" ? <Badge tone="green">confirmed {fmt(d.confirmed_at)}</Badge> : <Badge tone="amber">draft</Badge>}>
        <Row k="Objective" v={d.objective} />
        <Row k={t.scheduling === "backward" ? t.anchorLabel : "Target dates"} v={t.scheduling === "backward" ? d.target_finish : d.target_start || d.target_finish ? `${d.target_start ?? "?"} → ${d.target_finish ?? "?"}` : null} />
        <Row k="Budget limit" v={d.budget_limit == null ? null : money(d.budget_limit, p.currency)} />
      </Card>
      <Card title="Plan">
        <Row k="Progress" v={`${Math.round(plan.project.progress_percent)} %`} />
        <Row k="Deliverables done" v={`${plan.project.done_count} / ${plan.project.deliverable_count}`} />
        <Row k="Forecast finish" v={plan.project.forecast_finish} />
        <Row k="Budget" v={money(plan.project.budget, p.currency)} />
      </Card>
      <Card title="Recent activity">
        <ul className="space-y-1 text-sm">
          {p.audit.slice(0, 8).map((a, i) => <li key={i}><span className="text-xs text-slate-500">{fmt(a.at)}</span> {a.summary}</li>)}
        </ul>
      </Card>
    </div>
  );
}
