/**
 * Generic project snapshot comparison. Works on any project table, so domain apps
 * get revision comparison for their records without extra code.
 */
export type Snapshot = Record<string, Array<Record<string, unknown>>>;

/** Columns that change on every save and carry no business meaning. */
const NOISE = new Set(["updated_at", "row_version", "calculated_at"]);

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface RowChange {
  key: string;
  label: string;
  kind: "added" | "removed" | "changed";
  fields: FieldChange[];
}

export interface TableDiff {
  table: string;
  title: string;
  added: number;
  removed: number;
  changed: number;
  rows: RowChange[];
}

export interface SnapshotDiff {
  tables: TableDiff[];
  totals: { added: number; removed: number; changed: number };
}

const LABEL_KEYS = [
  "project_no", "tag", "code", "drawing_number", "change_no", "issue_no", "defect_code", "submittal_no",
  "requirement_key", "revision_code", "title", "name", "display_name", "interface_key", "input_key",
];

export function rowLabel(row: Record<string, unknown>): string {
  for (const k of LABEL_KEYS) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) {
      if (k === "revision_code" && typeof row.drawing_id === "string") return `revision ${v}`;
      return v;
    }
  }
  if (typeof row.revision_no === "number") return `revision ${row.revision_no}`;
  const id = (row.id ?? row.component_id ?? row.defect_id) as string | undefined;
  return id ? `#${String(id).slice(0, 8)}` : "row";
}

export function rowKey(row: Record<string, unknown>): string {
  if (typeof row.id === "string") return row.id;
  if (typeof row.seq === "number") return `seq:${row.seq}`;
  // Tables keyed by a composite or a foreign key (e.g. component_geometry, zone_spaces).
  const keyCols = ["component_id", "defect_id", "zone_id", "system_id", "space_id", "user_id"].filter((k) => typeof row[k] === "string");
  return keyCols.map((k) => `${k}=${row[k]}`).join("&") || JSON.stringify(row);
}

export function humanizeTable(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const tables = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const out: TableDiff[] = [];
  for (const table of tables) {
    const a = new Map((before[table] ?? []).map((r) => [rowKey(r), r]));
    const b = new Map((after[table] ?? []).map((r) => [rowKey(r), r]));
    const rows: RowChange[] = [];
    for (const [k, r] of b) {
      const prev = a.get(k);
      if (!prev) {
        rows.push({ key: k, label: rowLabel(r), kind: "added", fields: [] });
        continue;
      }
      const fields = Object.keys({ ...prev, ...r })
        .filter((f) => !NOISE.has(f) && !same(prev[f], r[f]))
        .sort()
        .map((f) => ({ field: f, before: prev[f], after: r[f] }));
      if (fields.length) rows.push({ key: k, label: rowLabel(r), kind: "changed", fields });
    }
    for (const [k, r] of a) if (!b.has(k)) rows.push({ key: k, label: rowLabel(r), kind: "removed", fields: [] });
    if (rows.length) {
      out.push({
        table,
        title: humanizeTable(table),
        added: rows.filter((r) => r.kind === "added").length,
        removed: rows.filter((r) => r.kind === "removed").length,
        changed: rows.filter((r) => r.kind === "changed").length,
        rows: rows.sort((x, y) => x.kind.localeCompare(y.kind) || x.label.localeCompare(y.label)),
      });
    }
  }
  return {
    tables: out,
    totals: out.reduce((t, d) => ({ added: t.added + d.added, removed: t.removed + d.removed, changed: t.changed + d.changed }), { added: 0, removed: 0, changed: 0 }),
  };
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}
