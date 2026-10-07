import "server-only";

/**
 * The contractor agreement, end to end, on the server: check the answers,
 * run the rules, and — once the master is loaded — assemble the agreement
 * and save it. The employment server.ts, for a different master.
 *
 * Until the FD Master Contractor Agreement is loaded (data/master.ts),
 * every request ends the same honest way: the answers and the flags are
 * saved as a `stopped` draft so Slack hears and a lawyer sends the draft by
 * hand, and no credit is taken. The screen says so.
 */

import { createClient } from "@/lib/supabase/server";
import { tidyTypedName } from "@/lib/draft-name";
import { todaySingapore, toIso } from "../termsheet/format";
import { ruleChecks, titleFor } from "./checks";
import { MASTER_LOADED, MASTER_VERSION } from "./data/master";
import { applyDefaults } from "./questions";
import type { AiFields, Answers, Company, Contractor, DraftStatus, Engagement, Flag } from "./types";

export const CONTRACTOR_SLUG = "contractor";

/** What the user reads when the master is not loaded yet. */
export const PENDING_MESSAGE =
  "Your answers are saved. The Contractor Agreement is in Beta: our lawyers are finalising the master wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge.";

export interface ContractorRequest {
  answers: Answers;
  company: Company;
  contractor: Contractor;
  engagement: Engagement;
}

export type PrepareOutcome =
  | { kind: "stopped"; message: string; draftId: string | null; flags: Flag[]; pending: true }
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

export async function prepareContractor(req: ContractorRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const dateIso = toIso(todaySingapore());
  const rules = ruleChecks(answers, req.engagement);
  const flags: Flag[] = [...rules.flags];

  if (!MASTER_LOADED) {
    flags.push({
      level: "red",
      scenario: "CT11",
      reason: "The FD Master Contractor Agreement is not loaded into FD AI yet. The answers are saved; a lawyer prepares the draft from the master by hand.",
    });
    for (const f of flags) f.title = titleFor(f);
    const draftId = await persist({ userId, req: { ...req, answers }, status: "stopped", flags, title: draftTitle(req.contractor, req.engagement), dateIso });
    return { kind: "stopped", message: PENDING_MESSAGE, draftId, flags, pending: true };
  }

  /* Reached only once data/master.ts carries the master and assemble.ts
     exists for it — the employment assembler, for this master. */
  throw new Error("contractor: master marked loaded but no assembler is wired");
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
  status: DraftStatus;
  flags: Flag[];
  title: string;
  dateIso: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", CONTRACTOR_SLUG).maybeSingle();
    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: savedAnswers(input.req, input.dateIso),
        source_text: null,
        output: null,
        output_html: null,
        status: input.status,
        flags: input.flags,
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[contractor] could not save draft:", error?.message);
      return null;
    }
    return draft.id as string;
  } catch (err) {
    console.error("[contractor] persist failed:", err);
    return null;
  }
}
