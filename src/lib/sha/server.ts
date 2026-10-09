import "server-only";

/**
 * The shareholders agreement, end to end, on the server: check the
 * answers, run the rules, assemble the agreement from the master and save
 * it. The contractor server.ts, for the SHA master — pure assembly, so no
 * model is called and nothing is logged to usage_log.
 *
 * Should the master ever be switched off (MASTER_LOADED false), every
 * request ends the same honest way: the answers and the flags are saved as
 * a `stopped` draft so Slack hears and a lawyer sends the draft by hand,
 * and no credit is taken.
 */

import { createClient } from "@/lib/supabase/server";
import { tidyTypedName } from "@/lib/draft-name";
import { formatDate, todaySingapore, toIso } from "../termsheet/format";
import { blocksToHtml, blocksToText, wordCount } from "../termsheet/render";
import { assemble, type Assembled } from "./assemble";
import { ruleChecks, titleFor } from "./checks";
import { MASTER_LOADED, MASTER_VERSION } from "./data/master";
import { QUESTION_ID, applyDefaults, shareholderCount } from "./questions";
import type { AiFields, Answers, Company, DraftStatus, Flag, Shareholder, ShareholderKind } from "./types";

export const SHA_SLUG = "sha";

/** What the user reads if the master is ever switched off. */
export const PENDING_MESSAGE =
  "Your answers are saved. The Shareholders Agreement is in Beta: our lawyers are finalising the master wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge.";

/** What the user reads when a red flag stops the draft. */
export const STOP_MESSAGE =
  "Your answers are saved, but FD AI has not issued the agreement: one of the points below needs a lawyer before it is signed. Founders Doc has been told and will be in touch. No credit has been used.";

export interface ShaRequest {
  answers: Answers;
  company: Company;
  shareholders: Shareholder[];
}

export type PrepareOutcome =
  | { kind: "stopped"; message: string; draftId: string | null; flags: Flag[]; pending?: true }
  | {
      kind: "drafted";
      status: DraftStatus;
      draftId: string | null;
      title: string;
      html: string;
      text: string;
      flags: Flag[];
      ai: AiFields;
      missing: string[];
      words: number;
    };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** What the browser sent, made safe: strings trimmed, arrays kept, nothing else. */
export function cleanAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!QUESTION_ID.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 400);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => (x as string).trim().slice(0, 300)).filter(Boolean).slice(0, 16);
  }
  return out;
}

function fields<T extends object>(raw: unknown, keys: (keyof T)[], max = 300): T {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = str(r[k as string]).slice(0, max);
    if (v) out[k as string] = v;
  }
  return out as unknown as T;
}

export function cleanCompany(raw: unknown): Company {
  const c = fields<Company>(raw, ["name", "reg_no", "address", "business", "signatory_name", "signatory_title", "signatory_email"], 600);
  return { ...c, name: c.name ?? "" };
}

const KINDS: ShareholderKind[] = ["founder", "investor", "other"];

/** As many shareholders as S4 says, no more; one CEO Founder and one Lead Investor at most. */
export function cleanShareholders(raw: unknown, count: number): Shareholder[] {
  const arr = Array.isArray(raw) ? raw : [];
  let ceo = false;
  let lead = false;
  return arr.slice(0, count).map((h) => {
    const r = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
    const c = fields<Shareholder>(r, ["name", "id_no", "address", "email", "capital", "shares", "share_class", "signatory_name", "signatory_title"]);
    const kind = KINDS.find((k) => k === r.kind) ?? "founder";
    const isCeo = kind === "founder" && r.ceo === true && !ceo;
    const isLead = kind === "investor" && r.lead === true && !lead;
    if (isCeo) ceo = true;
    if (isLead) lead = true;
    return { ...c, name: c.name ?? "", kind, ceo: isCeo, lead: isLead, appoints: r.appoints === true };
  });
}

export function draftTitle(company: Company): string {
  const co = str(company.name);
  return tidyTypedName(`Shareholders Agreement${co ? ` — ${co}` : ""}`) || "Shareholders Agreement";
}

export function fileName(title: string, version: number): string {
  const base = title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Shareholders-Agreement";
  return `${base}-V${version}.docx`;
}

/** Say each point once: the rules and the assembler can both spot the same thing. */
function dedupe(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.scenario}:${f.field ?? ""}:${f.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function prepareSha(req: ShaRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const shareholders = req.shareholders.slice(0, shareholderCount(answers));
  const dateIso = toIso(todaySingapore());
  const rules = ruleChecks(answers, shareholders);
  const flags: Flag[] = [...rules.flags];
  const title = draftTitle(req.company);

  if (!MASTER_LOADED) {
    flags.push({
      level: "red",
      scenario: "SH0",
      reason: "The FD Lite Shareholders Agreement master is not loaded into FD AI. The answers are saved; a lawyer prepares the draft from the master by hand.",
    });
    for (const f of flags) f.title = titleFor(f);
    const draftId = await persist({ userId, req: { ...req, answers, shareholders }, assembled: null, status: "stopped", flags, title, dateIso });
    return { kind: "stopped", message: PENDING_MESSAGE, draftId, flags, pending: true };
  }

  const assembled = assemble({ answers, company: req.company, shareholders, ai: null, date: dateIso });
  flags.push(...assembled.flags);
  const unique = dedupe(flags);
  for (const f of unique) f.title = titleFor(f);
  const status: DraftStatus = unique.some((f) => f.level === "red") ? "stopped" : "draft";
  const draftId = await persist({ userId, req: { ...req, answers, shareholders }, assembled, status, flags: unique, title, dateIso });

  if (status === "stopped") {
    return { kind: "stopped", message: STOP_MESSAGE, draftId, flags: unique };
  }
  return {
    kind: "drafted",
    status,
    draftId,
    title,
    html: blocksToHtml(assembled.blocks),
    text: blocksToText(assembled.blocks),
    flags: unique,
    ai: {},
    missing: assembled.missing,
    words: wordCount(assembled.blocks),
  };
}

/** The answers as saved: the questionnaire plus what the assembler needs to
 *  draw the same agreement again. */
export function savedAnswers(req: ShaRequest, dateIso: string): Record<string, unknown> {
  return {
    ...req.answers,
    _company: req.company,
    _shareholders: req.shareholders,
    _date: dateIso,
    _engine: "assembly",
    _master: MASTER_VERSION,
  };
}

async function persist(input: {
  userId: string;
  req: ShaRequest;
  assembled: Assembled | null;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  dateIso: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", SHA_SLUG).maybeSingle();
    const text = input.assembled ? blocksToText(input.assembled.blocks) : null;
    const html = input.assembled ? blocksToHtml(input.assembled.blocks) : null;
    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: savedAnswers(input.req, input.dateIso),
        source_text: null,
        output: text,
        output_html: html,
        status: input.status,
        flags: input.flags,
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[sha] could not save draft:", error?.message);
      return null;
    }
    if (text && input.assembled) {
      const { error: vErr } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        user_id: input.userId,
        version_number: 1,
        detail_level: 3,
        file_name: fileName(input.title, 1),
        instruction: `Assembled from the answers on ${formatDate(todaySingapore())} (SHA master ${MASTER_VERSION}, Complex version).`,
        output: text,
      });
      if (vErr) console.error("[sha] could not save version 1:", vErr.message);
    }
    return draft.id as string;
  } catch (err) {
    console.error("[sha] persist failed:", err);
    return null;
  }
}
