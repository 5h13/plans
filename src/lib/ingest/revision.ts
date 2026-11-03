/**
 * A revised contract → proposed change records (ADR-034). Clause by clause: the two texts are
 * compared paragraph by paragraph; changes under the same heading become one proposal with the
 * before and after text, a change type, and the cost and schedule effect when the text shows them.
 */
import { compareTexts, paragraphs } from "../../shared/compare/text";
import { findAmounts, findDates, isHeading } from "./extract";

export interface ChangeProposal {
  id: string;
  clause: string;
  title: string;
  changeType: "contract_amendment" | "variation" | "client_instruction" | "purchase_order" | "supplemental_agreement" | "scope_change" | "other";
  before: string;
  after: string;
  costEffect: number | null;
  scheduleEffectDays: number | null;
  kind: "changed" | "added" | "removed";
  by: "rules" | "ai";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const PRICE_WORDS = /price|sum|amount|fee|cost|total|payment|rate|budget|consideration/i;

function typeFor(clause: string, text: string): ChangeProposal["changeType"] {
  const s = `${clause} ${text}`;
  if (/exclu|scope|works|services|deliverable|feature|additional|omit|delete[ds]? item/i.test(clause)) return "scope_change";
  if (/payment|price|fee|sum|retention|billing/i.test(clause)) return "contract_amendment";
  if (/variation|change order/i.test(s)) return "variation";
  if (/instruct/i.test(s)) return "client_instruction";
  if (/purchase order|\bp\.?o\.?\b/i.test(s)) return "purchase_order";
  return "contract_amendment";
}

/** Net change in money stated in a price context, and change in dates or day counts. */
export function effects(before: string, after: string) {
  const money = (s: string) => findAmounts(s).filter((a) => PRICE_WORDS.test(s.slice(Math.max(0, a.at - 120), a.at + 40))).map((a) => a.amount);
  const mb = money(before), ma = money(after);
  let cost: number | null = null;
  if (mb.length && ma.length && mb.length === ma.length) cost = ma.reduce((s, x) => s + x, 0) - mb.reduce((s, x) => s + x, 0);
  else if (!mb.length && ma.length && !before) cost = ma.reduce((s, x) => s + x, 0);
  else if (mb.length && !ma.length && !after) cost = -mb.reduce((s, x) => s + x, 0);
  let sched: number | null = null;
  const db = findDates(before), da = findDates(after);
  if (db.length && da.length) sched = daysBetween(db.at(-1)!.date, da.at(-1)!.date);
  if (!sched) {
    const days = (s: string) => [...s.matchAll(/(\d{1,4})\s*(?:\(\w+\)\s*)?(?:calendar|working|business)?\s*days?/gi)].map((m) => +m[1]);
    const xb = days(before), xa = days(after);
    if (xb.length && xa.length && xb.length === xa.length) sched = xa.reduce((s, x) => s + x, 0) - xb.reduce((s, x) => s + x, 0);
  }
  return { cost: cost === 0 ? null : cost, sched: sched === 0 ? null : sched };
}

const SMALL = new Set(["and", "of", "for", "the", "to", "in", "on", "a", "an", "or", "by", "with"]);
/** "TIME FOR COMPLETION" → "Time for Completion"; mixed-case headings stay as written. */
export const tidyHeading = (h: string) => (h === h.toUpperCase() && /[A-Z]{3}/.test(h)
  ? h.toLowerCase().split(" ").map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  : h);
const headingOf = (p: string) => tidyHeading(p.replace(/^(article|section|clause|part)\s+[\dIVXLC]+[a-z]?\s*[.:–—-]?\s*/i, "").replace(/^\d{1,2}(\.\d{1,2})?[.)]?\s+/, "").replace(/:$/, "").trim());

/**
 * Rejoins lines that a PDF or a narrow page wrapped mid-sentence, so a PDF and a Word version of the
 * same clause compare as equal. A line continues when it does not end a sentence and the next line
 * is not a heading.
 */
export function reflow(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const out: string[] = [];
  for (const l of lines) {
    if (!l) { out.push(""); continue; }
    const prev = out.length ? out[out.length - 1] : "";
    const joinable = prev && !isHeading(prev) && !isHeading(l) && !/[.:;!?)]$/.test(prev) && !/^([-•*–]|\(?[a-z0-9]{1,3}[.)])\s/i.test(l);
    if (joinable) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out.filter((l, i) => l || out[i - 1]).join("\n");
}
const same = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

export function proposeChanges(beforeText: string, afterText: string): ChangeProposal[] {
  const cmp = compareTexts(reflow(beforeText), reflow(afterText));
  const groups = new Map<string, { clause: string; before: string[]; after: string[]; kinds: Set<string> }>();
  let clause = "General";
  // Walk the comparison in document order, tracking the current clause heading.
  for (const p of cmp.paragraphs) {
    const text = p.after ?? p.before ?? "";
    if (isHeading(text) && p.kind === "same") { clause = headingOf(text); continue; }
    if (isHeading(text) && p.kind !== "same") clause = headingOf(text);
    if (p.kind === "same") continue;
    const g = groups.get(clause) ?? groups.set(clause, { clause, before: [], after: [], kinds: new Set() }).get(clause)!;
    if (p.before && !isHeading(p.before)) g.before.push(p.before);
    if (p.after && !isHeading(p.after)) g.after.push(p.after);
    g.kinds.add(p.kind);
  }
  const out: ChangeProposal[] = [];
  let i = 0;
  for (const g of groups.values()) {
    if (!g.before.length && !g.after.length) continue;
    const before = g.before.join("\n"), after = g.after.join("\n");
    if (same(before, after)) continue; // only wrapping or spacing differs
    const { cost, sched } = effects(before, after);
    const kind: ChangeProposal["kind"] = g.kinds.has("changed") || (g.before.length && g.after.length) ? "changed" : g.after.length ? "added" : "removed";
    const verb = kind === "added" ? "Added" : kind === "removed" ? "Removed" : "Revised";
    out.push({
      id: `rev-${++i}`, clause: g.clause, title: `${verb}: ${g.clause}`.slice(0, 120), changeType: typeFor(g.clause, after || before), before, after,
      costEffect: cost, scheduleEffectDays: sched, kind, by: "rules",
    });
  }
  return out;
}

export { paragraphs };
