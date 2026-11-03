/**
 * Document comparator (spec v1.2 step 7): paragraph-level comparison of two document
 * texts, with word-level changes inside paragraphs that were edited. Used for contract
 * revisions, specifications and any registered document with text.
 */
import JSZip from "jszip";

export type Op = { kind: "same" | "added" | "removed"; text: string };
export type WordOp = { kind: "same" | "added" | "removed"; text: string };
export interface ParagraphChange {
  kind: "same" | "added" | "removed" | "changed";
  before?: string;
  after?: string;
  words?: WordOp[];
}
export interface TextComparison {
  paragraphs: ParagraphChange[];
  counts: { same: number; added: number; removed: number; changed: number };
  similarity: number; // 0–1, share of paragraphs unchanged
}

export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Longest-common-subsequence diff of two token lists. */
export function lcsDiff(a: string[], b: string[], eq: (x: string, y: string) => boolean = (x, y) => x === y): Op[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 25_000_000) throw new RangeError("Documents too large to compare paragraph by paragraph.");
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ kind: "same", text: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

const words = (s: string) => s.split(/(\s+)/).filter((x) => x !== "");

/** Share of words two paragraphs have in common (to pair an edit rather than delete + add). */
function overlap(x: string, y: string): number {
  const ops = lcsDiff(words(x).filter((w) => w.trim()), words(y).filter((w) => w.trim()));
  const same = ops.filter((o) => o.kind === "same").length;
  return (2 * same) / Math.max(1, ops.length + same);
}

export function compareTexts(before: string, after: string): TextComparison {
  const ops = lcsDiff(paragraphs(before), paragraphs(after));
  const out: ParagraphChange[] = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.kind === "same") {
      out.push({ kind: "same", before: o.text, after: o.text });
      continue;
    }
    // A run of removed paragraphs followed by added ones: pair similar ones as edits.
    const removed: string[] = [];
    const added: string[] = [];
    while (k < ops.length && ops[k].kind !== "same") {
      (ops[k].kind === "removed" ? removed : added).push(ops[k].text);
      k++;
    }
    k--;
    const usedAdded = new Set<number>();
    for (const r of removed) {
      let best = -1;
      let score = 0.5;
      added.forEach((a, idx) => {
        if (usedAdded.has(idx)) return;
        const s = overlap(r, a);
        if (s > score) {
          score = s;
          best = idx;
        }
      });
      if (best >= 0) {
        usedAdded.add(best);
        out.push({ kind: "changed", before: r, after: added[best], words: lcsDiff(words(r), words(added[best])) });
      } else out.push({ kind: "removed", before: r });
    }
    added.forEach((a, idx) => {
      if (!usedAdded.has(idx)) out.push({ kind: "added", after: a });
    });
  }
  const counts = { same: 0, added: 0, removed: 0, changed: 0 };
  for (const p of out) counts[p.kind]++;
  const total = out.length || 1;
  return { paragraphs: out, counts, similarity: counts.same / total };
}

/** Text of a .docx (Word) file: paragraphs from word/document.xml, tables row by row. */
export async function docxText(data: Uint8Array | ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a Word document (word/document.xml missing).");
  const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const paras = xml.split(/<\/w:p>/).map((p) =>
    decode(
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
        .map((m) => (m[1] !== undefined ? m[1] : m[0] === "<w:tab/>" ? "\t" : "\n"))
        .join(""),
    ),
  );
  return paras.map((p) => p.trim()).filter(Boolean).join("\n");
}
