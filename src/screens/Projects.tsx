import { useStore } from "../lib/store";
import { href } from "../lib/router";
import { Badge, Card, Empty, PageTitle } from "../ui/ui";
import { formatArea, placeName } from "../ui/forms";

export function Projects() {
  const templates = useStore((s) => s.library.templates);
  const map = useStore((s) => s.projects);
  const projects = Object.values(map).sort((a, b) => a.project_no.localeCompare(b.project_no));
  const owner = useStore((s) => s.library.settings?.ownerName);
  return (
    <div className="space-y-4 p-4">
      <PageTitle
        title="Projects"
        sub={`On this device · ${owner ?? ""}`}
        actions={
          <div className="flex gap-2">
            <a href={href("/import")} className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300">Import</a>
            <a href={href("/new")} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white">New</a>
          </div>
        }
      />
      {projects.length === 0 ? (
        <Card><Empty>No projects yet. Start one from a template — wedding, install job, app, or anything — or import a project file.</Empty></Card>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <a href={href(`/p/${p.id}`)} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{p.project_no}</span>
                  {p.definition.status === "confirmed" ? <Badge tone="green">defined</Badge> : <Badge tone="amber">draft</Badge>}
                </div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{[templates.find((t) => t.key === p.template_key)?.name, p.client_name, placeName(p), p.gross_floor_area_m2 ? formatArea(p.gross_floor_area_m2, p.unit_system) : null].filter((x) => x && x !== "—").join(" · ")}</div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
