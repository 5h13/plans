/**
 * Optional AI pass (Claude) for reading contracts (ADR-034). Off by default. It runs only when the
 * owner turns it on and adds their own API key, and only when online. It returns the same proposal
 * shapes as the offline reader, so the review screens and rules are identical. If it fails, the
 * offline result stands.
 */
import type { ProjectTemplate, Settings } from "../model";
import { DomainError } from "../util";
import type { Extraction, Proposal, ProposalKey } from "./extract";
import type { ChangeProposal } from "./revision";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
type Ai = NonNullable<Settings["ai"]>;
const MAX_CHARS = 120_000;

export const aiReady = (s: Settings | null | undefined): s is Settings & { ai: Ai } => !!s?.ai?.enabled && !!s.ai.apiKey;

async function ask(ai: Ai, system: string, user: string, maxTokens = 4096): Promise<string> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new DomainError("OFFLINE", "AI reading needs an internet connection. The offline reading is shown instead.");
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: ai.model || DEFAULT_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
  } catch {
    throw new DomainError("AI_UNREACHABLE", "Couldn't reach the AI service. The offline reading is shown instead.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = /invalid x-api-key|authentication/i.test(body) ? "The API key was refused." : res.status === 429 ? "The AI service is busy (rate limit). Try again shortly." : `The AI service answered ${res.status}.`;
    throw new DomainError("AI_ERROR", `${msg} The offline reading is shown instead.`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

const json = <T,>(s: string): T => {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const body = (m ? m[1] : s).trim();
  const start = body.search(/[[{]/);
  try { return JSON.parse(body.slice(start)); } catch { throw new DomainError("AI_ERROR", "The AI answer couldn't be read. The offline reading is shown instead."); }
};

export async function testKey(ai: Ai) {
  await ask(ai, "Reply with OK.", "Ping", 5);
}

const FIELDS: Record<string, string> = {
  "project.name": "Project or event name", "project.client_name": "Client / owner (the party paying)", "project.site_address": "Site, venue or address", "project.currency": "ISO currency code of the contract price",
  "definition.objective": "What the project must achieve", "definition.scope": "Scope: what is included", "definition.exclusions": "What is excluded",
  "definition.assumptions": "Assumptions and clarifications", "definition.client_requirements": "Client requirements / must-haves", "definition.performance_criteria": "Performance or technical criteria",
  "definition.site_conditions": "Site or venue conditions", "definition.interfaces_summary": "Interfaces with others", "definition.acceptance_criteria": "Acceptance, testing, handover",
  "definition.schedule_notes": "Schedule terms (durations, milestones, penalties)", "definition.budget_notes": "Payment terms",
  "definition.budget_limit": "Total contract price or budget as a plain number", "definition.target_start": "Start date YYYY-MM-DD", "definition.target_finish": "Completion or event date YYYY-MM-DD",
};

/** Definition, parties, price, dates, template and drivers from a contract. */
export async function aiExtract(ai: Ai, text: string, templates: ProjectTemplate[]): Promise<Partial<Extraction> & { proposals: Proposal[] }> {
  const drivers = templates.flatMap((t) => t.drivers.map((d) => `driver.${d.key} (${t.key}): ${d.label} in ${d.unit}`));
  const system = `You read contracts and project definition documents for a project manager and extract the facts that set up the project. Answer only with JSON. Quote, don't invent: if a fact is not in the document, leave it out. For each field give "value" and "source" (a short exact quote from the document).`;
  const user = `Template keys: ${templates.map((t) => `${t.key} (${t.name})`).join("; ")}.
Fields: ${Object.entries(FIELDS).map(([k, v]) => `${k}: ${v}`).join("; ")}.
Driver fields: ${drivers.join("; ")}.
Return {"templateKey": "...", "fields": {"<field key>": {"value": "...", "source": "..."}}}

Document:
${text.slice(0, MAX_CHARS)}`;
  const r = json<{ templateKey?: string; fields?: Record<string, { value: unknown; source?: string }> }>(await ask(ai, system, user));
  const proposals: Proposal[] = Object.entries(r.fields ?? {})
    .filter(([k, v]) => (k in FIELDS || k.startsWith("driver.")) && v && v.value != null && String(v.value).trim())
    .map(([k, v]) => ({ key: k as ProposalKey, label: FIELDS[k] ?? k.replace("driver.", ""), value: String(v.value).trim(), source: v.source ? `“${v.source}”` : "AI", confidence: "medium", by: "ai" }));
  const templateKey = templates.some((t) => t.key === r.templateKey) ? r.templateKey : undefined;
  return { proposals, templateKey };
}

/** Clause-level change records between two versions of a contract. */
export async function aiProposeChanges(ai: Ai, before: string, after: string): Promise<ChangeProposal[]> {
  const system = `You compare two versions of a contract for a project manager and list each substantive change as a change record. Ignore formatting, numbering and typo fixes. Answer only with JSON.`;
  const user = `Return {"changes": [{"clause": "clause heading", "title": "short title", "changeType": one of contract_amendment|variation|client_instruction|purchase_order|supplemental_agreement|scope_change|other, "kind": changed|added|removed, "before": "old text (exact)", "after": "new text (exact)", "costEffect": number or null (change in contract price, + increase), "scheduleEffectDays": integer or null (+ later)}]}

PREVIOUS VERSION:
${before.slice(0, MAX_CHARS / 2)}

REVISED VERSION:
${after.slice(0, MAX_CHARS / 2)}`;
  const r = json<{ changes?: Array<Partial<ChangeProposal>> }>(await ask(ai, system, user, 8192));
  const TYPES = ["contract_amendment", "variation", "client_instruction", "purchase_order", "supplemental_agreement", "scope_change", "other"];
  return (r.changes ?? []).filter((c) => c.title || c.clause).map((c, i) => ({
    id: `ai-${i + 1}`, clause: c.clause ?? "", title: (c.title ?? c.clause ?? "Change").slice(0, 120),
    changeType: (TYPES.includes(c.changeType as string) ? c.changeType : "contract_amendment") as ChangeProposal["changeType"],
    before: c.before ?? "", after: c.after ?? "", kind: (["changed", "added", "removed"].includes(c.kind as string) ? c.kind : "changed") as ChangeProposal["kind"],
    costEffect: typeof c.costEffect === "number" && c.costEffect !== 0 ? c.costEffect : null,
    scheduleEffectDays: typeof c.scheduleEffectDays === "number" && c.scheduleEffectDays !== 0 ? Math.round(c.scheduleEffectDays) : null, by: "ai",
  }));
}
