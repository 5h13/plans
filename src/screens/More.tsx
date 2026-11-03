import type { Project } from "../lib/model";
import { Badge } from "../ui/ui";
import { MenuList } from "./ProjectShell";

export function More({ p }: { p: Project; params?: string[] }) {
  const b = `/p/${p.id}`;
  return (
    <div className="space-y-4">
      <MenuList
        items={[
          { to: `${b}/definition`, label: "Definition", sub: "Objective, scope, criteria, codes, location", badge: p.definition.status === "confirmed" ? <Badge tone="green">confirmed</Badge> : <Badge tone="amber">draft</Badge> },
          { to: `${b}/stages`, label: "Stages & readiness", sub: `${p.stages.length} stages` },
          { to: `${b}/estimate`, label: "Estimate", sub: `${p.estimates.length} estimates` },
          { to: `${b}/revisions`, label: "Revisions", sub: "Save and compare project revisions" },
          { to: `${b}/export`, label: "Export / share", sub: "Project file for desktop Plans or another device" },
        ]}
      />
    </div>
  );
}
