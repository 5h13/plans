/**
 * Reads a contract or project definition document into plain text, on the device.
 * Word (.docx) through jszip, PDF through pdf.js (bundled, loaded only when needed), text as is.
 */
import { docxText } from "../../shared/compare/text";
import { DomainError } from "../util";

export interface ReadResult { text: string; kind: "docx" | "pdf" | "text"; pages?: number }

export const ACCEPT = ".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function readDocument(name: string, data: ArrayBuffer): Promise<ReadResult> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return { text: await docxText(data), kind: "docx" };
  if (lower.endsWith(".pdf")) return pdfText(data);
  if (/\.(txt|md|text|csv)$/.test(lower)) return { text: new TextDecoder().decode(data), kind: "text" };
  if (lower.endsWith(".doc")) throw new DomainError("UNSUPPORTED_FILE", "Old Word (.doc) files can't be read. Save it as .docx (Word: File → Save As) or PDF first.");
  throw new DomainError("UNSUPPORTED_FILE", "Use a Word (.docx), PDF or text file.");
}

/** PDF text, page by page; lines rebuilt from the text positions so headings stay on their own line. */
async function pdfText(data: ArrayBuffer): Promise<ReadResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: Array<{ y: number; x: number; s: string }> = [];
    for (const it of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
      if (it.str === undefined || !it.transform) continue;
      lines.push({ x: it.transform[4], y: Math.round(it.transform[5]), s: it.str });
    }
    const byY = new Map<number, Array<{ x: number; s: string }>>();
    for (const l of lines) {
      const key = [...byY.keys()].find((k) => Math.abs(k - l.y) <= 2) ?? l.y;
      (byY.get(key) ?? byY.set(key, []).get(key)!).push(l);
    }
    const text = [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, xs]) => xs.sort((a, b) => a.x - b.x).map((x) => x.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    pages.push(text);
  }
  const text = pages.join("\n");
  if (!text.trim()) throw new DomainError("NO_TEXT", "This PDF has no text layer (it is probably a scan). Use the Word file, or run it through OCR first.");
  return { text, kind: "pdf", pages: doc.numPages };
}
