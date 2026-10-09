import "server-only";

/**
 * The co-founder agreement, end to end, on the server: check the answers,
 * run the rules, and — once the master is loaded — assemble the agreement
 * and save it. The contractor server.ts as it was in its Beta (083).
 *
 * Until the FD Master Co-Founders Agreement is loaded (data/master.ts),
 * every request ends the same honest way: the answers and the flags are
 * saved as a `stopped` draft so Slack hears and a lawyer sends the draft by
 * hand, and no credit is taken. The screen says so.
 */

import { createClient } from "@/lib/supabase/server";
import { tidyTypedName } from "@/lib/draft-name";
import { todaySingapore, toIso } from "../termsheet/format";
import { ruleChecks, titleFor } from "./checks";
import { MASTER_LOADED, MASTER_VERSION } from "./data/master";
import { QUESTION_ID, applyDefaults, founderCount } from "./questions";
import type { AiFields, Answers, Company, DraftStatus, Flag, Founder, Holding } from "./types";

export const COFOUNDER_SLUG = "cofounder";

/** What the user reads when the master is not loaded yet. */
export const PENDING_MESSAGE =
  "Your answers are saved. The Co-Founder Agreement is in Beta: our lawyers are finalising the master wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge.";

export interface CofounderRequest {
  answers: Answers;
  company: Company;
  founders: Founder[];
  holdings: Holding[];
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
    if (!QUESTION_ID.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 400);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => (x as string).trim().slice(0, 400)).filter(Boolean).slice(0, 12);
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
  const c = fields<Company>(raw, ["name", "reg_no", "address", "business"], 600);
  return { ...c, name: c.name ?? "" };
}

/** As many co-founders as F1 says, no more; each with a name or nothing. */
export function cleanFounders(raw: unknown, count: number): Founder[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, count).map((f) => {
    const c = fields<Founder>(f, ["name", "id_no", "nationality", "address", "email", "title", "role"]);
    return { ...c, name: c.name ?? "" };
  });
}

export function cleanHoldings(raw: unknown): Holding[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .slice(0, 12)
    .map((h) => {
      const c = fields<Holding>(h, ["name", "role", "percent"], 120);
      return { ...c, name: c.name ?? "", percent: c.percent ?? "" };
    })
    .filter((h) => h.name || h.percent);
}

export function draftTitle(company: Company, founders: Founder[]): string {
  const co = str(company.name);
  const who = founders.map((f) => str(f.name).split(/\s+/)[0]).filter(Boolean).slice(0, 3).join(", ");
  return tidyTypedName(`Co-Founder Agreement${co ? ` — ${co}` : who ? ` — ${who}` : ""}`) || "Co-Founder Agreement";
}

export async function prepareCofounder(req: CofounderRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const founders = req.founders.slice(0, founderCount(answers));
  const dateIso = toIso(todaySingapore());
  const rules = ruleChecks(answers, founders, req.holdings);
  const flags: Flag[] = [...rules.flags];

  if (!MASTER_LOADED) {
    flags.push({
      level: "red",
      scenario: "CF15",
      reason: "The FD Master Co-Founders Agreement is not loaded into FD AI yet. The answers are saved; a lawyer prepares the draft from the master by hand.",
    });
    for (const f of flags) f.title = titleFor(f);
    const draftId = await persist({ userId, req: { ...req, answers, founders }, status: "stopped", flags, title: draftTitle(req.company, founders), dateIso });
    return { kind: "stopped", message: PENDING_MESSAGE, draftId, flags, pending: true };
  }

  /* Reached only once data/master.ts carries the master and an assemble.ts
     exists for it — the contractor assembler, for this master. */
  throw new Error("cofounder: master marked loaded but no assembler is wired");
}

/** The answers as saved: the questionnaire plus what the assembler needs to
 *  draw the same agreement again. */
export function savedAnswers(req: CofounderRequest, dateIso: string): Record<string, unknown> {
  return {
    ...req.answers,
    _company: req.company,
    _founders: req.founders,
    _holdings: req.holdings,
    _date: dateIso,
    _engine: "assembly",
    _master: MASTER_VERSION,
  };
}

async function persist(input: {
  userId: string;
  req: CofounderRequest;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  dateIso: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", COFOUNDER_SLUG).maybeSingle();
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
      console.error("[cofounder] could not save draft:", error?.message);
      return null;
    }
    return draft.id as string;
  } catch (err) {
    console.error("[cofounder] persist failed:", err);
    return null;
  }
}
