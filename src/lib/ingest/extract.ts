/**
 * Offline reading of a contract or project definition (ADR-034). No AI: sections are found by their
 * headings, facts by patterns (parties, price, dates, durations, quantities). Every finding is a
 * proposal with the text it came from; the project manager accepts or edits each one.
 */
import type { DefinitionTextKey, ProjectTemplate } from "../model";

export interface Section { heading: string; body: string; index: number }
export type Confidence = "high" | "medium" | "low";
export type ProposalKey =
  | `definition.${DefinitionTextKey}`
  | "definition.budget_limit" | "definition.target_start" | "definition.target_finish" | "definition.schedule_notes" | "definition.budget_notes"
  | "project.name" | "project.client_name" | "project.site_address" | "project.currency"
  | `driver.${string}`;
export interface Proposal { key: ProposalKey; label: string; value: string; source: string; confidence: Confidence; by: "rules" | "ai"; alt?: { value: string; source: string } }
export interface Extraction { title: string | null; sections: Section[]; proposals: Proposal[]; templateKey: string; templateScores: Record<string, number> }

// ---------------------------------------------------------------- text structure
const clean = (s: string) => s.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

/** A heading: numbered clause titles ("3. SCOPE OF WORK", "Article IV – Price"), short ALL-CAPS lines, or short lines ending in a colon. */
export function isHeading(line: string): boolean {
  const l = clean(line);
  if (!l || l.length > 90) return false;
  if (/^(article|section|clause|part|schedule|annex|appendix)\s+[\dIVXLC]+[a-z]?\b/i.test(l)) return true;
  if (/^\d{1,2}(\.\d{1,2})?[.)]?\s+[A-Z][^.]{2,70}$/.test(l) && !/[.;]$/.test(l) && l.split(" ").length <= 9) return true;
  const letters = l.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && l.split(" ").length <= 9 && !/\d{3,}/.test(l)) return true;
  if (/^[A-Z][A-Za-z ,'&/()-]{2,60}:$/.test(l)) return true;
  return false;
}
const stripNumber = (h: string) => clean(h).replace(/^(article|section|clause|part)\s+[\dIVXLC]+[a-z]?\s*[.:–—-]?\s*/i, "").replace(/^\d{1,2}(\.\d{1,2})?[.)]?\s+/, "").replace(/:$/, "").trim();

export function sections(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(clean);
  const out: Section[] = [];
  let cur: Section = { heading: "", body: "", index: 0 };
  for (const l of lines) {
    if (!l) continue;
    if (isHeading(l)) {
      if (cur.heading || cur.body) out.push(cur);
      cur = { heading: stripNumber(l), body: "", index: out.length };
    } else {
      // "Scope: text on the same line" style
      const m = /^([A-Z][A-Za-z ,'&/()-]{2,40}):\s+(.{3,})$/.exec(l);
      if (m && SECTION_RULES.some((r) => r.re.test(m[1]))) {
        if (cur.heading || cur.body) out.push(cur);
        out.push({ heading: m[1], body: m[2], index: out.length });
        cur = { heading: "", body: "", index: out.length };
        continue;
      }
      cur.body += (cur.body ? "\n" : "") + l;
    }
  }
  if (cur.heading || cur.body) out.push(cur);
  return out.map((s, i) => ({ ...s, index: i }));
}

// ---------------------------------------------------------------- sections → definition fields
const SECTION_RULES: Array<{ key: DefinitionTextKey | "schedule_notes" | "budget_notes"; re: RegExp }> = [
  { key: "exclusions", re: /exclu|not included|out of scope|by others/i },
  { key: "scope", re: /scope|description of (the )?(works|services|project)|the works|services to be|deliverables|work to be performed|features/i },
  { key: "objective", re: /objective|purpose|background|recital|whereas|introduction|overview|goal/i },
  { key: "assumptions", re: /assumption|clarification|basis of (price|quotation|proposal)|qualification/i },
  { key: "client_requirements", re: /client.?s? requirement|owner.?s? requirement|employer.?s? requirement|requirements|must.?haves?|preferences|specification/i },
  { key: "performance_criteria", re: /performance|design (criteria|conditions|basis)|technical (requirement|criteria)|non.?functional/i },
  { key: "operating_conditions", re: /operating|operation hours|occupancy/i },
  { key: "site_conditions", re: /site (condition|information)|existing condition|venue|access to (the )?site/i },
  { key: "interfaces_summary", re: /interface|coordination|integration/i },
  { key: "acceptance_criteria", re: /acceptance|testing|commissioning|handover|hand.?over|definition of done|completion certificate/i },
  { key: "schedule_notes", re: /time for completion|schedule|programme|program of work|timeline|duration|milestone|period of performance|term of (the )?contract/i },
  { key: "budget_notes", re: /payment|contract (price|sum)|price|fees?\b|consideration|compensation|billing|terms of payment/i },
];
const SECTION_LABEL: Record<string, string> = {
  objective: "Objective", scope: "Scope", exclusions: "Exclusions", assumptions: "Assumptions", client_requirements: "Client requirements",
  performance_criteria: "Performance criteria", operating_conditions: "Operating conditions", site_conditions: "Site conditions",
  interfaces_summary: "Interfaces", acceptance_criteria: "Acceptance criteria", schedule_notes: "Schedule constraints", budget_notes: "Budget / payment terms",
  required_capacity: "Required capacity",
};

// ---------------------------------------------------------------- facts
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = MONTHS.map((m) => m.slice(0, 3));
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);

/** Dates in the forms contracts use: 2026-11-03, 3 November 2026, November 3, 2026, 3rd day of November 2026, 03 Nov 2026. */
export function findDates(text: string): Array<{ date: string; at: number; raw: string }> {
  const out: Array<{ date: string; at: number; raw: string }> = [];
  const push = (d: string | null, at: number, raw: string) => d && out.push({ date: d, at, raw });
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(iso(+m[1], +m[2], +m[3]), m.index!, m[0]);
  const mon = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+day\\s+of)?\\s+${mon}\\.?,?\\s+(\\d{4})\\b`, "gi"))) push(iso(+m[3], MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]), m.index!, m[0]);
  for (const m of text.matchAll(new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) push(iso(+m[3], MON.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]), m.index!, m[0]);
  return out.sort((a, b) => a.at - b.at);
}

const CUR = "(PHP|Php|₱|P(?=\\s?\\d)|USD|US\\$|\\$|EUR|€|SGD|S\\$)";
/** Money amounts: "PHP 2,500,000.00", "₱1.2 million", "USD 45,000". */
export function findAmounts(text: string): Array<{ amount: number; currency: string; at: number; raw: string }> {
  const out: Array<{ amount: number; currency: string; at: number; raw: string }> = [];
  for (const m of text.matchAll(new RegExp(`${CUR}\\s?(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d{1,2})?(\\s*(million|m)\\b)?`, "g"))) {
    let n = Number((m[2] + (m[3] ?? "")).replace(/,/g, ""));
    if (m[5]) n *= 1_000_000;
    const c = m[1].toUpperCase();
    const currency = c === "₱" || c === "P" || c === "PHP" ? "PHP" : c === "€" || c === "EUR" ? "EUR" : c === "SGD" || c === "S$" ? "SGD" : "USD";
    if (n > 0) out.push({ amount: n, currency, at: m.index!, raw: m[0] });
  }
  return out;
}

const near = (text: string, at: number, re: RegExp, before = 160, after = 40) => re.test(text.slice(Math.max(0, at - before), at + after));
const snippet = (text: string, at: number, len = 160) => clean(text.slice(Math.max(0, at - 60), at + len)).replace(/\n/g, " ");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const PARTY_ROLES = "Client|Owner|Employer|Customer|Buyer|Principal|Couple";
function parties(text: string): { client?: { name: string; at: number }; title?: { name: string; at: number } } {
  const r: ReturnType<typeof parties> = {};
  const role = new RegExp(`([A-Z][A-Za-z0-9&.,' -]{2,80}?)\\s*,?\\s*\\((?:[^)]{0,60}?)["“'‘]?(?:the\\s+)?["“'‘]?(${PARTY_ROLES})["”'’]?\\)`, "g");
  for (const m of text.matchAll(role)) {
    const name = m[1].split(/\b(?:by and between|between|and|by|with)\s+/i).at(-1)!.replace(/,\s*$/, "").trim();
    if (name.length > 2) { r.client = { name, at: m.index! }; break; }
  }
  if (!r.client) {
    const lab = new RegExp(`^(?:${PARTY_ROLES}|Client name|Prepared for|Bill to)\\s*:\\s*(.{3,80})$`, "im").exec(text);
    if (lab) r.client = { name: clean(lab[1]), at: lab.index };
  }
  const t = /^(?:project(?: name| title)?|re|subject|event)\s*:\s*(.{3,120})$/im.exec(text);
  if (t) r.title = { name: clean(t[1]), at: t.index };
  return r;
}

// ---------------------------------------------------------------- template suggestion
const TEMPLATE_WORDS: Record<string, RegExp[]> = {
  wedding_event: [/wedding/i, /bride|groom|couple/i, /reception/i, /guests?|pax/i, /catering|caterer/i, /venue/i, /event/i, /debut|birthday|party/i],
  hvac_install: [/air.?condition|aircon/i, /split.?type|multi.?split|inverter/i, /refrigerant|copper pip/i, /indoor units?|outdoor units?|condensing/i, /install(ation)?/i, /\bvrf\b|\bvrv\b/i],
  software_app: [/software|application|\bapp\b|mobile app|web app/i, /develop(ment|er)?/i, /features?|user stor/i, /\bapi\b|backend|front.?end|database/i, /deploy|release|sprint/i, /ui|ux|screens?/i],
  engineering_design: [/design (services|consultan)|engineering services|consultancy/i, /drawings|plans and specifications|ifc/i, /mechanical|hvac design|mep/i, /floor area|gross floor|sq\.?\s?m|m²/i, /load calculation|ventilation/i],
};
export function suggestTemplate(text: string, available: string[]): { key: string; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  for (const [k, res] of Object.entries(TEMPLATE_WORDS)) if (available.includes(k)) scores[k] = res.reduce((s, re) => s + (re.test(text) ? 1 : 0), 0);
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { key: best && best[1] >= 2 ? best[0] : available.includes("general") ? "general" : available[0], scores };
}

/** Driver values the template asks for, when the document states them (guests, units, features, floor area…). */
export function driverValues(text: string, t: ProjectTemplate): Proposal[] {
  const out: Proposal[] = [];
  for (const d of t.drivers) {
    const words = `${d.label}|${d.unit}|${d.key.replace(/_/g, " ")}`.toLowerCase().split("|").map((w) => w.replace(/[^a-z² ]/g, "").trim()).filter((w) => w.length > 1);
    const extra = d.key === "GUESTS" ? ["pax", "persons", "people", "attendees"] : d.key === "UNITS" ? ["units", "sets", "indoor units"] : d.key === "AREA" ? ["sq m", "sqm", "square meters", "square metres", "m2", "m²"] : d.unit === "m" ? ["meters", "metres", "linear meters", "lm"] : [];
    const alts = [...new Set([...words, ...extra])].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    if (!alts) continue;
    const m = new RegExp(`\\b(\\d{1,3}(?:,\\d{3})*|\\d+)(?:\\.\\d+)?\\s*(?:no\\.?\\s*of\\s*)?(?:[a-z-]+\\s){0,2}(?:${alts})\\b`, "i").exec(text);
    if (m) out.push({ key: `driver.${d.key}`, label: `${d.label} (${d.unit})`, value: m[1].replace(/,/g, ""), source: snippet(text, m.index), confidence: "medium", by: "rules" });
  }
  return out;
}

// ---------------------------------------------------------------- main
export function extractOffline(text: string, templates: ProjectTemplate[], fileName?: string): Extraction {
  const secs = sections(text);
  const proposals: Proposal[] = [];
  const seen = new Set<string>();
  const add = (p: Proposal) => {
    if (!p.value.trim()) return;
    if (seen.has(p.key)) {
      const prev = proposals.find((x) => x.key === p.key)!;
      if (p.key.startsWith("definition.") && !["definition.budget_limit", "definition.target_start", "definition.target_finish"].includes(p.key)) prev.value += `\n\n${p.value}`;
      return;
    }
    seen.add(p.key);
    proposals.push(p);
  };

  // title and parties
  const firstLines = text.split("\n").map(clean).filter(Boolean).slice(0, 8);
  const pt = parties(text);
  const title = pt.title?.name ?? firstLines.find((l) => l.length > 6 && l.length < 120 && !/^(page|confidential|draft)\b/i.test(l)) ?? fileName?.replace(/\.[a-z0-9]+$/i, "") ?? null;
  if (title) add({ key: "project.name", label: "Project name", value: title, source: pt.title ? snippet(text, pt.title.at) : "First line of the document", confidence: pt.title ? "high" : "low", by: "rules" });
  if (pt.client) add({ key: "project.client_name", label: "Client", value: pt.client.name, source: snippet(text, pt.client.at), confidence: "medium", by: "rules" });
  const loc = /(?:located at|situated at|site address|project site|venue|address|location)\s*[:\-–]?\s*([^\n.;]{6,140})/i.exec(text);
  if (loc) add({ key: "project.site_address", label: "Site / venue", value: clean(loc[1]), source: snippet(text, loc.index), confidence: "medium", by: "rules" });

  // sections → definition text
  for (const s of secs) {
    if (!s.heading || !s.body.trim()) continue;
    const rule = SECTION_RULES.find((r) => r.re.test(s.heading));
    if (!rule) continue;
    add({ key: `definition.${rule.key}` as ProposalKey, label: SECTION_LABEL[rule.key], value: s.body.trim(), source: `Section “${s.heading}”`, confidence: "high", by: "rules" });
  }
  if (!seen.has("definition.objective")) {
    const w = /\b(whereas|the purpose of this|this (agreement|contract|proposal) (is|covers|sets out))\b[^.]{10,300}\./i.exec(text);
    if (w) add({ key: "definition.objective", label: "Objective", value: clean(w[0]), source: snippet(text, w.index), confidence: "low", by: "rules" });
  }

  // price
  const amounts = findAmounts(text);
  const priced = amounts.filter((a) => near(text, a.at, /contract (price|sum|amount)|total (contract |project )?(price|amount|cost|fee)|lump.?sum|consideration|fixed fee|agreed (price|fee)|budget|total of/i));
  const price = (priced.length ? priced : []).sort((a, b) => b.amount - a.amount)[0];
  if (price) {
    add({ key: "definition.budget_limit", label: "Budget limit / contract price", value: String(price.amount), source: snippet(text, price.at), confidence: priced.length ? "high" : "low", by: "rules" });
    add({ key: "project.currency", label: "Currency", value: price.currency, source: price.raw, confidence: "medium", by: "rules" });
  }

  // dates and durations
  const dates = findDates(text);
  const start = dates.find((d) => near(text, d.at, /commenc|start|effective|begin|mobiliz|notice to proceed|signing/i));
  const finish = dates.find((d) => near(text, d.at, /complet|finish|deadline|on or before|no later than|turn.?over|handover|event date|wedding date|go.?live|launch|delivery date|target date/i) && d !== start)
    ?? dates.find((d) => near(text, d.at, /\b(event|wedding|celebration|ceremony)\b/i) && d !== start);
  if (start) add({ key: "definition.target_start", label: "Start", value: start.date, source: snippet(text, start.at), confidence: "medium", by: "rules" });
  if (finish) add({ key: "definition.target_finish", label: "Finish / event date", value: finish.date, source: snippet(text, finish.at), confidence: "medium", by: "rules" });
  const dur = /within\s+(\d{1,4})\s*(?:\(\d+\)\s*)?(calendar|working|business)?\s*days?/i.exec(text) ?? /(\d{1,4})\s*(?:\(\w+\)\s*)?(calendar|working|business)?\s*days?\s+(?:from|after)\s+(?:the\s+)?(?:date of\s+)?(?:signing|notice|commencement|start|receipt)/i.exec(text);
  if (dur && start && !finish) {
    const n = +dur[1];
    const days = dur[2] && /working|business/i.test(dur[2]) ? Math.ceil(n * 7 / 5) : n;
    add({ key: "definition.target_finish", label: "Finish (from duration)", value: addDays(start.date, days), source: snippet(text, dur.index), confidence: "medium", by: "rules" });
  }
  if (dur && !seen.has("definition.schedule_notes")) add({ key: "definition.schedule_notes", label: SECTION_LABEL.schedule_notes, value: clean(text.slice(dur.index, dur.index + 200).split(/\n/)[0]), source: snippet(text, dur.index), confidence: "medium", by: "rules" });

  const { key: templateKey, scores } = suggestTemplate(text, templates.map((t) => t.key));
  const t = templates.find((x) => x.key === templateKey);
  if (t) for (const p of driverValues(text, t)) add(p);
  return { title, sections: secs, proposals, templateKey, templateScores: scores };
}

/** Adds an AI reading to an offline one: missing facts are added; where both found something, a low-confidence offline value gives way, otherwise the AI value is offered as an alternative. */
export function mergeAi(offline: Proposal[], ai: Proposal[]): Proposal[] {
  const out = offline.map((p) => ({ ...p }));
  for (const a of ai) {
    const o = out.find((p) => p.key === a.key);
    if (!o) out.push(a);
    else if (o.value.trim() !== a.value.trim()) {
      if (o.confidence === "low") Object.assign(o, { value: a.value, source: a.source, by: "ai", confidence: "medium", alt: { value: o.value, source: o.source } });
      else o.alt = { value: a.value, source: a.source };
    }
  }
  return out;
}
