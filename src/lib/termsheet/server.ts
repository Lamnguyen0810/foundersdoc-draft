import "server-only";

/**
 * The term sheet, end to end, on the server: check the answers, ask the AI
 * for its few fields, assemble the letter, decide whether a lawyer must see
 * it first, and save it. The API routes are thin wrappers around this.
 *
 * Playbook §8 decides the status:
 *   🔴 stop   → nothing drafted; saved as `stopped` so Slack hears and a
 *               lawyer follows up
 *   ❓ ask     → nothing drafted yet; the questions go back to the user
 *   🟡 flag   → drafted as normal; the flag is listed beside the letter for
 *               the lawyer who reviews it before signing (the client's own)
 *   🟢        → drafted, saved as `draft`
 */

import { createClient } from "@/lib/supabase/server";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { tidyTypedName } from "@/lib/draft-name";
import { aiStep, STOP_MESSAGE, TERM_SLUG, type AiUsage } from "./ai";
import { assemble, type Assembled } from "./assemble";
import { ruleChecks, titleFor } from "./checks";
import { applyDefaults, type Answers } from "./conditions";
import { formatDate, todaySingapore, toIso } from "./format";
import { blocksToHtml, blocksToText, wordCount } from "./render";
import type { AiFields, DraftStatus, Flag, KeyTerm, Party, TermSheetInput } from "./types";

export interface TermSheetRequest {
  answers: Answers;
  parties: Party[];
  documentTitle?: string;
}

export type PrepareOutcome =
  | { kind: "ask"; questions: Flag[] }
  | { kind: "questions"; questions: string[] }
  | { kind: "stopped"; message: string; draftId: string | null }
  | {
      kind: "drafted";
      status: DraftStatus;
      draftId: string | null;
      title: string;
      html: string;
      text: string;
      flags: Flag[];
      ai: AiFields;
      keyTerms: KeyTerm[];
      missing: string[];
      words: number;
      usage: AiUsage | null;
    };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** What the browser sent, made safe: strings trimmed, arrays kept, nothing else. */
export function cleanAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(Q\d+[a-z]?(_[a-z_]+)?|_project_subject)$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 2000);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => (x as string).trim().slice(0, 500)).filter(Boolean).slice(0, 12);
  }
  return out;
}

export function cleanParties(raw: unknown): Party[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).map((p) => {
    const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const s = (k: string) => str(r[k]).slice(0, 400);
    return {
      kind: r.kind === "individual" ? "individual" : "company",
      name: s("name"),
      entity_type: s("entity_type") || undefined,
      jurisdiction: s("jurisdiction") || undefined,
      reg_no: s("reg_no") || undefined,
      id_type: s("id_type") || undefined,
      id_no: s("id_no") || undefined,
      address: s("address"),
      role: s("role") || undefined,
      contact_name: s("contact_name") || undefined,
      contact_title: s("contact_title") || undefined,
      salutation: s("salutation") || undefined,
      listed_or_regulated: r.listed_or_regulated === true,
    } satisfies Party;
  });
}

export function cleanAi(raw: unknown): AiFields | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => str(r[k]).slice(0, 600);
  const keyTerms = Array.isArray(r.key_terms)
    ? (r.key_terms as Record<string, unknown>[])
        .map((t) => ({ heading: str(t.heading).slice(0, 60), text: str(t.text).slice(0, 600), source: str(t.source).slice(0, 12) }))
        .filter((t) => t.heading && t.text)
        .slice(0, 12)
    : undefined;
  return {
    transaction_title: s("transaction_title"),
    transaction_description: s("transaction_description"),
    structure: s("structure"),
    subject_matter: s("subject_matter") || undefined,
    costs_allocation: s("costs_allocation") || undefined,
    key_terms: keyTerms,
    conditions_other: Array.isArray(r.conditions_other) ? (r.conditions_other as unknown[]).map(str).filter(Boolean).slice(0, 8) : undefined,
  };
}

export function draftTitle(parties: Party[], dealLabel: string): string {
  const short = (n: string) => n.replace(/\b(Pte\.?|Ltd\.?|Limited|Inc\.?|LLC|Pty|Plc|GmbH)\b\.?/gi, "").replace(/\s+/g, " ").trim();
  const names = parties.slice(0, 2).map((p) => short(p.name)).filter(Boolean);
  return tidyTypedName(`Term Sheet (${dealLabel})${names.length ? ` — ${names.join(" & ")}` : ""}`) || "Term Sheet";
}

/** The status the playbook gives a draft with these flags. */
export function statusFor(flags: Flag[], missing: string[]): DraftStatus {
  /* 🔴 is not drafted. 🟡 is marked for the person's own lawyer and holds
     nothing back: the firm reads the playbook's "lawyer review" as the
     review a client gets before signing, not a queue at FD. A blank the
     assembler could not fill shows as [●] in the letter, for them to fill. */
  void missing;
  if (flags.some((f) => f.level === "red")) return "stopped";
  return "draft";
}

export const IP_LINE: KeyTerm = {
  heading: "Intellectual Property",
  text: "Each Party keeps its existing intellectual property. Ownership of new intellectual property shall be agreed in the Definitive Agreements",
  source: "S16",
};

/**
 * Everything up to the saved draft. `persist` is false for a re-assembly
 * of an existing draft (the route updates the row itself).
 */
export async function prepareTermSheet(req: TermSheetRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const parties = req.parties;
  const today = todaySingapore();
  const dateIso = toIso(today);

  /* ── the rules first ────────────────────────────────────────────────── */
  const rules = ruleChecks(answers, parties, dateIso);
  if (rules.ask.length > 0) return { kind: "ask", questions: rules.ask };

  /* ── then the AI's few fields ───────────────────────────────────────── */
  const { result: ai, usage } = await aiStep({ answers, parties, addIpLine: rules.addIpLine });
  const flags: Flag[] = [...rules.flags];

  if (ai?.stop) {
    flags.push({ level: "red", scenario: ai.stop.scenario, reason: ai.stop.reason });
    const draftId = await persist({ userId, answers, parties, ai: null, assembled: null, status: "stopped", flags, title: draftTitle(parties, "Stopped"), usage, dateIso });
    return { kind: "stopped", message: STOP_MESSAGE, draftId };
  }
  if (ai && ai.questions_for_user.length > 0) {
    return { kind: "questions", questions: ai.questions_for_user };
  }

  let aiFields: AiFields;
  if (ai) {
    aiFields = { ...ai.fields, key_terms: ai.key_terms, conditions_other: ai.conditions_other };
    /* The client's lawyer sees these. Anything about FD AI itself — its
       playbook, its files — is the firm's business, not theirs, and is
       left out (it is in the server log). */
    const aboutUs = (f: Flag) => /\b(playbook|system prompt|output contract|json)\b/i.test(f.reason);
    for (const f of ai.flags) if (aboutUs(f)) console.warn("[termsheet] AI flag about itself:", f.reason);
    const aiFlags = ai.flags.filter((f) => !aboutUs(f) && f.level !== "green");
    flags.push(...aiFlags.filter((f) => f.level !== "ask"));
    /* An AI "ask" that came with fields anyway is a point for the lawyer, not a stop. */
    for (const f of aiFlags.filter((f) => f.level === "ask")) flags.push({ ...f, level: "yellow" });
  } else {
    aiFields = { transaction_title: "", transaction_description: "", structure: "", key_terms: [] };
    flags.push({ level: "yellow", scenario: "AI", reason: "FD AI could not draft the heading, the nature of the deal (2.1) or the structure (2.3); they are left as blanks to fill in." });
  }
  if (rules.addIpLine && !(aiFields.key_terms ?? []).some((t) => t.source === "S16")) {
    aiFields.key_terms = [...(aiFields.key_terms ?? []), IP_LINE];
  }

  /* ── assemble ───────────────────────────────────────────────────────── */
  const input: TermSheetInput = { answers, parties, ai: aiFields, date: dateIso, documentTitle: req.documentTitle };
  const assembled = assemble(input);
  flags.push(...assembled.flags);
  for (const f of flags) f.title = titleFor(f);
  /* The rules and the AI can both spot the same thing; say it once. */
  const seen = new Set<string>();
  const unique = flags.filter((f) => {
    const k = f.scenario === "OTHER" || f.scenario === "AI" ? `${f.scenario}:${f.field}:${f.reason}` : f.scenario;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  flags.length = 0;
  flags.push(...unique);
  const status = statusFor(flags, assembled.missing);
  const title = draftTitle(parties, assembled.dealLabel);

  const draftId = await persist({ userId, answers, parties, ai: aiFields, assembled, status, flags, title, usage, dateIso, documentTitle: req.documentTitle });

  return {
    kind: "drafted",
    status,
    draftId,
    title,
    html: blocksToHtml(assembled.blocks),
    text: blocksToText(assembled.blocks),
    flags,
    ai: aiFields,
    keyTerms: assembled.keyTerms,
    missing: assembled.missing,
    words: wordCount(assembled.blocks),
    usage,
  };
}

/** The answers as saved: the questionnaire plus what the assembler needs
 *  to draw the same letter again. */
export function savedAnswers(answers: Answers, parties: Party[], ai: AiFields | null, dateIso: string, documentTitle?: string): Record<string, unknown> {
  return { ...answers, _parties: parties, _ai: ai, _date: dateIso, _document_title: documentTitle ?? null, _engine: "assembly", _master: "4.0" };
}

async function persist(input: {
  userId: string;
  answers: Answers;
  parties: Party[];
  ai: AiFields | null;
  assembled: Assembled | null;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  usage: AiUsage | null;
  dateIso: string;
  documentTitle?: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", TERM_SLUG).maybeSingle();
    const text = input.assembled ? blocksToText(input.assembled.blocks) : null;
    const html = input.assembled ? blocksToHtml(input.assembled.blocks) : null;

    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: savedAnswers(input.answers, input.parties, input.ai, input.dateIso, input.documentTitle),
        source_text: null,
        output: text,
        output_html: html,
        status: input.status,
        flags: input.flags,
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[termsheet] could not save draft:", error?.message);
      return null;
    }

    if (text) {
      const { error: vErr } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        user_id: input.userId,
        version_number: 1,
        detail_level: 3,
        file_name: fileName(input.title, 1),
        instruction: `Assembled from the answers on ${formatDate(todaySingapore())} (master v4.0).`,
        output: text,
      });
      if (vErr) console.error("[termsheet] could not save version 1:", vErr.message);
    }

    if (input.usage) {
      const price = priceFor(input.usage.model);
      const { error: uErr } = await supabase.from("usage_log").insert({
        user_id: input.userId,
        draft_id: draft.id,
        provider: input.usage.provider,
        model: input.usage.model,
        input_tokens: input.usage.inputTokens,
        output_tokens: input.usage.outputTokens,
        cost_usd: costUsd(price, input.usage.inputTokens, input.usage.outputTokens),
        paid_benchmark_usd: costUsd(PAID_BENCHMARK, input.usage.inputTokens, input.usage.outputTokens),
      });
      if (uErr) console.error("[termsheet] could not log usage:", uErr.message);
    }
    return draft.id as string;
  } catch (err) {
    console.error("[termsheet] persist failed:", err);
    return null;
  }
}

export function fileName(title: string, version: number): string {
  const base = title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Term-Sheet";
  return `${base}-V${version}.docx`;
}

/**
 * The same letter again with the AI's fields as the user confirmed or
 * edited them. The status does not change here: a lawyer's hold is not
 * lifted by an edit, and a green draft does not go yellow for a tidier
 * heading — unless the edit introduces a figure not in the answers, which
 * the assembler flags, and that does hold it.
 */
export async function reassemble(
  row: { id: string; answers: Record<string, unknown>; status: string; flags: Flag[] | null; title: string | null },
  ai: AiFields,
  documentTitle?: string,
): Promise<{ html: string; text: string; flags: Flag[]; status: DraftStatus; keyTerms: KeyTerm[] } | null> {
  const saved = row.answers ?? {};
  const parties = cleanParties(saved._parties);
  const answers = cleanAnswers(saved);
  const dateIso = str(saved._date) || toIso(todaySingapore());
  const title = documentTitle ?? (str(saved._document_title) || undefined);

  const assembled = assemble({ answers, parties, ai, date: dateIso, documentTitle: title });
  /* Keep the scenario flags the draft was saved with; refresh the assembler's own. */
  const kept = (row.flags ?? []).filter((f) => f.scenario !== "AI" && f.scenario !== "S4" && f.scenario !== "S19");
  const flags = [...kept, ...assembled.flags];
  const was = row.status as DraftStatus;
  const fresh = statusFor(flags, assembled.missing);
  /* A draft saved as `held` before the hold was dropped is simply a draft now. */
  const status: DraftStatus = was === "stopped" || fresh === "stopped" ? "stopped" : was === "final" ? "final" : "draft";

  const text = blocksToText(assembled.blocks);
  const html = blocksToHtml(assembled.blocks);
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("drafts")
      .update({
        answers: { ...saved, _ai: ai, _document_title: title ?? null },
        output: text,
        output_html: html,
        status,
        flags,
      })
      .eq("id", row.id);
    if (error) {
      console.error("[termsheet] could not save re-assembly:", error.message);
      return null;
    }
    const { data: last } = await supabase.from("draft_versions").select("version_number").eq("draft_id", row.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    const n = Number((last as { version_number?: number } | null)?.version_number ?? 0) + 1;
    const { data: me } = await supabase.auth.getUser();
    await supabase.from("draft_versions").insert({
      draft_id: row.id,
      user_id: me.user?.id,
      version_number: n,
      detail_level: 3,
      file_name: fileName(row.title ?? "Term Sheet", n),
      instruction: "The AI's fields were confirmed or edited and the letter re-assembled.",
      output: text,
    });
  } catch (err) {
    console.error("[termsheet] re-assembly failed:", err);
    return null;
  }
  return { html, text, flags, status, keyTerms: assembled.keyTerms };
}
