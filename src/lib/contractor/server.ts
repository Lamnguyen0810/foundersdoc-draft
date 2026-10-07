import "server-only";

/**
 * The contractor agreement, end to end, on the server: check the answers,
 * run the rules, assemble the agreement from the master and save it. The
 * employment server.ts, for a different master — and without the AI step:
 * the contractor agreement is pure assembly, so no model is called and
 * nothing is logged to usage_log.
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
import { MASTER_LOADED, MASTER_VERSION, TIER_LABEL } from "./data/master";
import { applyDefaults } from "./questions";
import type { AiFields, Answers, Company, Contractor, DraftStatus, Engagement, Flag } from "./types";

export const CONTRACTOR_SLUG = "contractor";

/** What the user reads if the master is ever switched off. */
export const PENDING_MESSAGE =
  "Your answers are saved. The Contractor Agreement is in Beta: our lawyers are finalising the master wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge.";

/** What the user reads when a red flag stops the draft. */
export const STOP_MESSAGE =
  "Your answers are saved, but FD AI has not issued the agreement: one of the points below needs a lawyer before it is signed. Founders Doc has been told and will be in touch. No credit has been used.";

export interface ContractorRequest {
  answers: Answers;
  company: Company;
  contractor: Contractor;
  engagement: Engagement;
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
    if (!/^C\d+[a-z]?$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 400);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => (x as string).trim().slice(0, 300)).filter(Boolean).slice(0, 8);
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
  const c = fields<Company>(raw, ["name", "reg_no", "address", "signatory_name", "signatory_designation", "signatory_email"]);
  return { ...c, name: c.name ?? "" };
}

export function cleanContractor(raw: unknown): Contractor {
  const c = fields<Contractor>(raw, ["name", "reg_no", "address", "id_no", "email", "signatory_name"]);
  return { ...c, name: c.name ?? "" };
}

export function cleanEngagement(raw: unknown): Engagement {
  const e = fields<Engagement>(raw, ["services", "fee", "fee_basis", "payment_terms", "start_date", "schedule", "location", "benefits"], 1200);
  const basis = (["month", "hour", "day", "project", "milestone"] as const).find((b) => b === e.fee_basis);
  return { ...e, services: e.services ?? "", fee_basis: basis };
}

export function draftTitle(contractor: Contractor, engagement: Engagement): string {
  const who = str(contractor.name);
  const what = str(engagement.services).split(/[\n.]/)[0].slice(0, 60);
  return tidyTypedName(`Contractor Agreement${who ? ` — ${who}` : ""}${what ? ` (${what})` : ""}`) || "Contractor Agreement";
}

export function fileName(title: string, version: number): string {
  const base = title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Contractor-Agreement";
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

export async function prepareContractor(req: ContractorRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const dateIso = toIso(todaySingapore());
  const rules = ruleChecks(answers, req.engagement);
  const flags: Flag[] = [...rules.flags];
  const title = draftTitle(req.contractor, req.engagement);

  if (!MASTER_LOADED) {
    flags.push({
      level: "red",
      scenario: "CT11",
      reason: "The FD Master Contractor Agreement is not loaded into FD AI yet. The answers are saved; a lawyer prepares the draft from the master by hand.",
    });
    for (const f of flags) f.title = titleFor(f);
    const draftId = await persist({ userId, req: { ...req, answers }, assembled: null, status: "stopped", flags, title, dateIso });
    return { kind: "stopped", message: PENDING_MESSAGE, draftId, flags, pending: true };
  }

  const assembled = assemble({ answers, company: req.company, contractor: req.contractor, engagement: req.engagement, ai: null, date: dateIso });
  flags.push(...assembled.flags);
  const unique = dedupe(flags);
  for (const f of unique) f.title = titleFor(f);
  const status: DraftStatus = unique.some((f) => f.level === "red") ? "stopped" : "draft";
  const draftId = await persist({ userId, req: { ...req, answers }, assembled, status, flags: unique, title, dateIso });

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
export function savedAnswers(req: ContractorRequest, dateIso: string): Record<string, unknown> {
  return {
    ...req.answers,
    _company: req.company,
    _contractor: req.contractor,
    _engagement: req.engagement,
    _date: dateIso,
    _engine: "assembly",
    _master: MASTER_VERSION,
  };
}

async function persist(input: {
  userId: string;
  req: ContractorRequest;
  assembled: Assembled | null;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  dateIso: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", CONTRACTOR_SLUG).maybeSingle();
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
      console.error("[contractor] could not save draft:", error?.message);
      return null;
    }
    if (text && input.assembled) {
      const { error: vErr } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        user_id: input.userId,
        version_number: 1,
        detail_level: 3,
        file_name: fileName(input.title, 1),
        instruction: `Assembled from the answers on ${formatDate(todaySingapore())} (contractor master ${MASTER_VERSION}, ${TIER_LABEL[input.assembled.tier]} version).`,
        output: text,
      });
      if (vErr) console.error("[contractor] could not save version 1:", vErr.message);
    }
    return draft.id as string;
  } catch (err) {
    console.error("[contractor] persist failed:", err);
    return null;
  }
}
