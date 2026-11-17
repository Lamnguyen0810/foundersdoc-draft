import "server-only";

/**
 * The loan agreement, end to end, on the server: check the
 * answers, run the rules, assemble the agreement and save it. The
 * investment agreement's server.ts, for a Borrower and one or more Lenders — the wording is assembled from the master, and FD AI then reviews the answers for points for the user's lawyer (lib/ai/review.ts), logged to usage_log.
 *
 * Should the master ever be switched off (MASTER_LOADED false), every
 * request ends the same honest way: the answers and the flags are saved as
 * a `stopped` draft so Slack hears and a lawyer sends the draft by hand,
 * and no credit is taken.
 */

import { createClient } from "@/lib/supabase/server";
import { aiReview, logReviewUsage } from "@/lib/ai/review";
import { tidyTypedName } from "@/lib/draft-name";
import { formatDate, todaySingapore, toIso } from "../termsheet/format";
import { blocksToHtml, blocksToText, wordCount } from "../termsheet/render";
import { assemble, type Assembled, type Tidied } from "./assemble";
import { ruleChecks, titleFor } from "./checks";
import { MASTER_LOADED, MASTER_VERSION } from "./data/master";
import { QUESTION_ID, applyDefaults, questionsFor, withLendersTotal } from "./questions";
import { tidyTyped } from "./tidy";
import type { Answers, Bank, DraftStatus, Flag, LoanParties, Party, PartyKind, Rep } from "./types";

export type AiFields = Record<string, never>;

export const LOAN_SLUG = "loan";

/** What the user reads if the master is ever switched off. */
export const PENDING_MESSAGE =
  "Your answers are saved. The Loan Agreement is in Beta: our lawyers are finalising the wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge.";

/** What the user reads when a red flag stops the draft. */
export const STOP_MESSAGE =
  "Your answers are saved, but FD AI has not issued the agreement: one of the points below needs a lawyer before it is signed. Founders Doc has been told and will be in touch. No credit has been used.";

export interface LoanRequest extends LoanParties {
  answers: Answers;
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

const KINDS: PartyKind[] = ["individual", "company"];

export function cleanParty(raw: unknown): Party {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = fields<Party>(r, ["name", "id_no", "nationality", "jurisdiction", "address", "email", "signatory_name", "signatory_title", "amount"], 600);
  return { ...p, name: p.name ?? "", kind: KINDS.find((k) => k === r.kind) ?? "individual" };
}

export const MAX_LENDERS = 10;

/** The parties as the browser sent them, made safe. */
export function cleanParties(body: Record<string, unknown>): LoanParties {
  const lenders = (Array.isArray(body.lenders) ? body.lenders : []).slice(0, MAX_LENDERS).map(cleanParty);
  return {
    borrower: cleanParty(body.borrower),
    lenders: lenders.length ? lenders : [cleanParty({})],
    rep: fields<Rep>(body.rep, ["name", "address", "email"], 600),
    company: { ...cleanParty(body.company), kind: "company" },
    bank: fields<Bank>(body.bank, ["bank", "account_name", "account_no", "swift", "bank_address"], 300),
  };
}

export function draftTitle(answers: Answers, borrower: Party, lenders: Party[]): string {
  /* Named after the other side: the user's own name is on every one of theirs. */
  const first = str(lenders[0]?.name);
  const other = str(answers.LN1) === "borrower" ? (lenders.length > 1 && first ? `${first} and others` : first) : str(borrower.name);
  return tidyTypedName(`Loan Agreement${other ? ` — ${other}` : ""}`) || "Loan Agreement";
}

export function fileName(title: string, version: number): string {
  const base = title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Loan-Agreement";
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

export async function prepareLoan(req: LoanRequest, userId: string): Promise<PrepareOutcome> {
  /* With several Lenders the amount lent is their total (0240). */
  const answers = applyDefaults(withLendersTotal(req.answers, req.lenders));
  const dateIso = toIso(todaySingapore());
  const rules = ruleChecks(answers, req);
  const flags: Flag[] = [...rules.flags];

  /* FD AI reviews the answers for points the user's lawyer should check. It
     never touches the master wording; if the model is down the agreement is
     drafted from the rules alone (lib/ai/review.ts). */
  /* At the same time FD AI puts what the user typed (the purpose, the security
     and so on) into contract wording — those phrases only; if that fails they
     go in as typed (lib/loan/tidy.ts). */
  const [review, tidied] = await Promise.all([
    aiReview({ slug: LOAN_SLUG, docName: "Loan Agreement", questions: questionsFor(answers), answers, already: flags }),
    MASTER_LOADED ? tidyTyped(answers) : Promise.resolve({ tidy: {} as Tidied, usage: null }),
  ]);
  flags.push(...review.flags);
  const title = draftTitle(answers, req.borrower, req.lenders);

  if (!MASTER_LOADED) {
    flags.push({
      level: "red",
      scenario: "LN0",
      reason: "The Loan Agreement wording is not loaded into FD AI. The answers are saved; a lawyer prepares the draft by hand.",
    });
    for (const f of flags) f.title = titleFor(f);
    const draftId = await persist({ userId, req: { ...req, answers }, assembled: null, status: "stopped", flags, title, dateIso });
    await logReviewUsage(userId, draftId, review.usage);
    return { kind: "stopped", message: PENDING_MESSAGE, draftId, flags, pending: true };
  }

  const assembled = assemble({ ...req, answers, date: dateIso, tidy: tidied.tidy });
  flags.push(...assembled.flags);
  /* What was reworded, beside the words as typed, so nothing changes unseen. */
  const typedAs: Record<keyof Tidied, [string, string]> = {
    purpose: ["LN7", "The purpose"],
    drawdown_date: ["LN8a", "The drawdown date"],
    security_desc: ["LN14a", "The security"],
    pledged_shares: ["LN14b", "The pledged shares"],
    financial_periods: ["LN17a", "The financial statements"],
    next_round: ["LN17b", "The next round"],
  };
  for (const [k, v] of Object.entries(tidied.tidy) as [keyof Tidied, string][]) {
    const [q, label] = typedAs[k];
    flags.push({ level: "green", scenario: "LN22", title: "Reworded by FD AI", reason: `${label}: you typed “${str(answers[q])}”; the agreement says “${v}”.`, user_message: `${label}: you typed “${str(answers[q])}”. I have written it as “${v}”. Change it in the document if that is not what you meant.`, field: q });
  }
  const unique = dedupe(flags);
  for (const f of unique) f.title = titleFor(f);
  const status: DraftStatus = unique.some((f) => f.level === "red") ? "stopped" : "draft";
  const draftId = await persist({ userId, req: { ...req, answers }, assembled, status, flags: unique, title, dateIso, tidy: tidied.tidy });
  await logReviewUsage(userId, draftId, review.usage);
  await logReviewUsage(userId, draftId, tidied.usage);

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
export function savedAnswers(req: LoanRequest, dateIso: string, tidy: Tidied = {}): Record<string, unknown> {
  return {
    ...req.answers,
    ...(Object.keys(tidy).length ? { _tidy: tidy } : {}),
    _borrower: req.borrower,
    _lenders: req.lenders,
    _rep: req.rep,
    _company: req.company,
    _bank: req.bank,
    _date: dateIso,
    _engine: "assembly",
    _master: MASTER_VERSION,
  };
}

async function persist(input: {
  userId: string;
  req: LoanRequest;
  assembled: Assembled | null;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  dateIso: string;
  tidy?: Tidied;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", LOAN_SLUG).maybeSingle();
    const text = input.assembled ? blocksToText(input.assembled.blocks) : null;
    const html = input.assembled ? blocksToHtml(input.assembled.blocks) : null;
    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: savedAnswers(input.req, input.dateIso, input.tidy),
        source_text: null,
        output: text,
        output_html: html,
        status: input.status,
        flags: input.flags,
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[loan] could not save draft:", error?.message);
      return null;
    }
    if (text && input.assembled) {
      const { error: vErr } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        user_id: input.userId,
        version_number: 1,
        detail_level: 3,
        file_name: fileName(input.title, 1),
        instruction: `Assembled from the answers on ${formatDate(todaySingapore())} (Loan ${MASTER_VERSION}, Beta).`,
        output: text,
      });
      if (vErr) console.error("[loan] could not save version 1:", vErr.message);
    }
    return draft.id as string;
  } catch (err) {
    console.error("[loan] persist failed:", err);
    return null;
  }
}
