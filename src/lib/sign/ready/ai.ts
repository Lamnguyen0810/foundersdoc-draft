import "server-only";
import { generateDraft } from "@/lib/ai/provider";
import type { Issue, ReadDoc } from "./rules";

/**
 * FD Sign signing-ready check (0201): the AI's part.
 *
 * The rules (rules.ts) catch what has a clear pattern. The AI reads the text for
 * what doesn't: party names spelt differently, dates that don't agree, terms used
 * but never defined, a schedule that is only a heading, wording left from another
 * deal. Its findings are never blockers (the playbook: false blockers teach people
 * to click past them), and every one must quote the document word for word: a
 * quote we can't find in the text is dropped, so the AI can't invent problems.
 *
 * Never throws: a model that is down or slow simply adds nothing, and the
 * checklist result still stands.
 */

const TIMEOUT_MS = 25_000;
const MAX_CHARS = 36_000;
const ALLOWED = new Set(["ST-002", "ST-004", "ST-009", "ST-010", "ST-011", "PH-008", "PH-009", "AN-005", "AI-001"]);

export interface AiResult {
  issues: Issue[];
  used: boolean;
  model?: string;
}

/** The text with page/paragraph marks, start and end kept when it is long (the end has the signature blocks). */
function textFor(doc: ReadDoc): string {
  const out = doc.lines.map((l) => `${l.page ? `[p${l.page}]` : `[para ${l.para}]`} ${l.text}`).join("\n");
  if (out.length <= MAX_CHARS) return out;
  return `${out.slice(0, MAX_CHARS * 0.7)}\n[… middle of the document left out …]\n${out.slice(-MAX_CHARS * 0.3)}`;
}

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

export async function aiIssues(doc: ReadDoc, already: Issue[]): Promise<AiResult> {
  if (!doc.meta.hasText || doc.lines.length < 5) return { issues: [], used: false };
  const system = [
    "You check whether a contract is ready to be signed (an execution version) for a law firm's e-signing service.",
    "You get the document text with [p3] page or [para 12] paragraph marks, and the problems a checklist has already found.",
    "Find ONLY problems that would make it wrong to sign this version as it is, which the checklist missed:",
    "- ST-010 the same party named differently (e.g. a company name or number that does not match elsewhere)",
    "- ST-011 dates that contradict each other (e.g. two different effective dates)",
    "- ST-009 a capitalised term used as a definition but never defined",
    "- ST-002 a schedule or annex that is only a heading, or says it is to be attached",
    "- ST-004 a signature block missing who signs or for which party",
    "- PH-008 alternative wording left for the parties to choose",
    "- PH-009 a party's details left incomplete (company number, address)",
    "- AN-005 a comment or note to the drafter left in the text",
    "- AI-001 anything else that clearly shows the document is not final",
    "Do not repeat the checklist's findings. Do not give legal advice or comment on whether terms are fair. If nothing is wrong, return no issues.",
    'Return ONE JSON object and nothing else: {"issues":[{"code":"ST-010","title":"short plain-English problem, max 90 chars","quote":"the exact words from the document, copied character for character, max 160 chars","where":"p3 or para 12","severity":"warning" or "advisory","action":"what to do, max 120 chars"}]}',
    "At most 8 issues. The quote must be copied exactly from the text, or the issue is discarded.",
  ].join("\n");
  const found = already.slice(0, 40).map((i) => `${i.code} ${i.where}: ${i.title}`).join("\n") || "(nothing)";
  const user = `CHECKLIST ALREADY FOUND:\n${found}\n\nDOCUMENT:\n${textFor(doc)}\n\nCheck it now.`;
  try {
    const res = await generateDraft({ system, user, maxTokens: 1400, temperature: 0, cacheKey: "fdsign:ready", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const t = res.text;
    let parsed: { issues?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    } catch {
      return { issues: [], used: true, model: res.model };
    }
    const hay = norm(doc.lines.map((l) => l.text).join(" "));
    const issues: Issue[] = [];
    for (const r of (parsed.issues ?? []).slice(0, 8)) {
      const code = String(r.code ?? "").toUpperCase();
      const quote = String(r.quote ?? "").slice(0, 200);
      const title = String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!ALLOWED.has(code) || !title || quote.trim().length < 4 || !hay.includes(norm(quote))) continue;
      const w = String(r.where ?? "");
      const pm = /p(?:age)?\s*(\d+)/i.exec(w);
      const am = /para(?:graph)?\s*(\d+)/i.exec(w);
      const line = doc.lines.find((l) => norm(l.text).includes(norm(quote).slice(0, 40)));
      const page = line?.page ?? (pm ? Number(pm[1]) : null);
      const p = line?.para ?? (am ? Number(am[1]) : 0);
      issues.push({
        code,
        category: "ai",
        severity: r.severity === "advisory" ? "advisory" : "warning",
        title,
        evidence: quote,
        where: page ? `Page ${page}` : p ? `Paragraph ${p}` : "Whole file",
        order: (page ?? 0) * 100000 + (line ? doc.lines.indexOf(line) : 99999),
        action: String(r.action ?? "Check this before signing.").slice(0, 160),
        source: "ai",
      });
    }
    return { issues, used: true, model: res.model };
  } catch (e) {
    console.error("[fd-sign check] AI part failed; checklist only:", e instanceof Error ? e.message : e);
    return { issues: [], used: false };
  }
}
