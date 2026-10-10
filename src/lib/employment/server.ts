import "server-only";

/**
 * The employment agreement, end to end, on the server: check the answers,
 * run the rules, ask the AI for its two jobs, assemble the letter from the
 * master and save it. The API routes are thin wrappers around this — the
 * term sheet's server.ts, for a different master.
 *
 *   🔴 stop   → nothing drafted; saved as `stopped` so Slack hears and a
 *               lawyer follows up; the credit goes back
 *   🟡 flag   → drafted as normal; listed beside the letter for the
 *               person's own lawyer
 *   🟢        → drafted, saved as `draft`
 */

import { createClient } from "@/lib/supabase/server";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { tidyTypedName } from "@/lib/draft-name";
import { formatDate, todaySingapore, toIso } from "../termsheet/format";
import { blocksToHtml, blocksToText, wordCount } from "../termsheet/render";
import { aiStep, EMPLOYMENT_SLUG, STOP_MESSAGE, type AiUsage } from "./ai";
import { assemble, type Assembled } from "./assemble";
import { ruleChecks, titleFor } from "./checks";
import { MASTER_VERSION } from "./data/master";
import { builtInGuide, mergeGuide, type LawGuide } from "./guide";
import { applyDefaults } from "./questions";
import type { AiFields, Answers, DraftStatus, Employee, Employer, Flag, Job } from "./types";

export interface EmploymentRequest {
  answers: Answers;
  employer: Employer;
  employee: Employee;
  job: Job;
  /** The law guide the person saw, as the browser sent it. Used only for
   *  flags, merged over the firm's own table (whose figures win). */
  guide?: unknown;
}

export type PrepareOutcome =
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
    if (!/^(E\d+[a-z]?|M\d+)$/.test(k)) continue;
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

export function cleanEmployer(raw: unknown): Employer {
  const e = fields<Employer>(raw, ["name", "reg_no", "address", "signatory_name", "signatory_designation", "signatory_email"]);
  return { ...e, name: e.name ?? "" };
}

export function cleanEmployee(raw: unknown): Employee {
  const e = fields<Employee>(raw, ["name", "address", "id_no", "email"]);
  return { ...e, name: e.name ?? "" };
}

export function cleanJob(raw: unknown): Job {
  const j = fields<Job>(raw, ["position", "salary", "salary_period", "pay_day", "start_date", "work_location", "work_arrangement", "travel", "working_hours", "leave_days"]);
  const arrangement = j.work_arrangement === "office" || j.work_arrangement === "hybrid" || j.work_arrangement === "remote" ? j.work_arrangement : undefined;
  return { ...j, position: j.position ?? "", salary_period: j.salary_period === "year" ? "year" : "month", work_arrangement: arrangement };
}

export function cleanAi(raw: unknown): AiFields | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    dismissal_grounds: Array.isArray(r.dismissal_grounds) ? (r.dismissal_grounds as unknown[]).map((x) => str(x).slice(0, 400)).filter(Boolean).slice(0, 8) : [],
  };
}

export function draftTitle(employee: Employee, job: Job): string {
  const who = str(employee.name);
  const role = str(job.position);
  return tidyTypedName(`Employment Agreement${who ? ` — ${who}` : ""}${role ? ` (${role})` : ""}`) || "Employment Agreement";
}

export function fileName(title: string, version: number): string {
  const base = title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Employment-Agreement";
  return `${base}-V${version}.docx`;
}

/** Say each point once: the rules and the AI can both spot the same thing. */
function dedupe(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = f.scenario === "AI" || f.scenario === "LAW" || f.scenario === "OTHER" ? `${f.scenario}:${f.field}:${f.reason}` : f.scenario;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function prepareEmployment(req: EmploymentRequest, userId: string): Promise<PrepareOutcome> {
  const answers = applyDefaults(req.answers);
  const dateIso = toIso(todaySingapore());

  const guide: LawGuide = mergeGuide(builtInGuide(answers), req.guide, "ai");
  const rules = ruleChecks(answers, req.job, guide);
  const { result: ai, usage } = await aiStep({ answers, job: req.job, ruleFlags: rules.flags });
  const flags: Flag[] = [...rules.flags];

  if (ai?.stop) {
    flags.push({ level: "red", scenario: ai.stop.scenario, reason: ai.stop.reason });
    const draftId = await persist({ userId, req: { ...req, answers }, ai: null, assembled: null, status: "stopped", flags, title: draftTitle(req.employee, req.job), usage, dateIso });
    return { kind: "stopped", message: STOP_MESSAGE, draftId };
  }

  let aiFields: AiFields = {};
  if (ai) {
    aiFields = ai.fields;
    const aboutUs = (f: Flag) => /\b(playbook|system prompt|output contract|json)\b/i.test(f.reason);
    for (const f of ai.flags) if (aboutUs(f)) console.warn("[employment] AI flag about itself:", f.reason);
    flags.push(...ai.flags.filter((f) => !aboutUs(f)));
  } else {
    flags.push({
      level: "yellow",
      scenario: "AI",
      title: "Local law not checked",
      reason: "FD AI could not check this contract against the local employment law this time; have the notice, probation, leave and restriction terms checked against the law where the employee works.",
    });
  }

  const assembled = assemble({ answers, employer: req.employer, employee: req.employee, job: req.job, ai: aiFields, date: dateIso });
  flags.push(...assembled.flags);
  const unique = dedupe(flags);
  for (const f of unique) f.title = titleFor(f);
  const status: DraftStatus = unique.some((f) => f.level === "red") ? "stopped" : "draft";
  const title = draftTitle(req.employee, req.job);
  const draftId = await persist({ userId, req: { ...req, answers }, ai: aiFields, assembled, status, flags: unique, title, usage, dateIso });

  return {
    kind: "drafted",
    status,
    draftId,
    title,
    html: blocksToHtml(assembled.blocks),
    text: blocksToText(assembled.blocks),
    flags: unique,
    ai: { dismissal_grounds: assembled.dismissalGrounds },
    missing: assembled.missing,
    words: wordCount(assembled.blocks),
    usage,
  };
}

/** The answers as saved: the questionnaire plus what the assembler needs to
 *  draw the same letter again. */
export function savedAnswers(req: EmploymentRequest, ai: AiFields | null, dateIso: string): Record<string, unknown> {
  return {
    ...req.answers,
    _employer: req.employer,
    _employee: req.employee,
    _job: req.job,
    _ai: ai,
    _guide: req.guide && typeof req.guide === "object" ? mergeGuide(builtInGuide(req.answers), req.guide, "ai") : null,
    _date: dateIso,
    _engine: "assembly",
    _master: MASTER_VERSION,
  };
}

async function persist(input: {
  userId: string;
  req: EmploymentRequest;
  ai: AiFields | null;
  assembled: Assembled | null;
  status: DraftStatus;
  flags: Flag[];
  title: string;
  usage: AiUsage | null;
  dateIso: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase.from("doc_types").select("id").eq("slug", EMPLOYMENT_SLUG).maybeSingle();
    const text = input.assembled ? blocksToText(input.assembled.blocks) : null;
    const html = input.assembled ? blocksToHtml(input.assembled.blocks) : null;
    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: savedAnswers(input.req, input.ai, input.dateIso),
        source_text: null,
        output: text,
        output_html: html,
        status: input.status,
        flags: input.flags,
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[employment] could not save draft:", error?.message);
      return null;
    }
    if (text) {
      const { error: vErr } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        user_id: input.userId,
        version_number: 1,
        detail_level: 3,
        file_name: fileName(input.title, 1),
        instruction: `Assembled from the answers on ${formatDate(todaySingapore())} (employment master ${MASTER_VERSION}).`,
        output: text,
      });
      if (vErr) console.error("[employment] could not save version 1:", vErr.message);
    }
    if (input.usage) {
      const price = priceFor(input.usage.model);
      const { error: uErr } = await supabase.from("usage_log").insert({
        kind: "draft",
        user_id: input.userId,
        draft_id: draft.id,
        provider: input.usage.provider,
        model: input.usage.model,
        input_tokens: input.usage.inputTokens,
        output_tokens: input.usage.outputTokens,
        cost_usd: costUsd(price, input.usage.inputTokens, input.usage.outputTokens),
        paid_benchmark_usd: costUsd(PAID_BENCHMARK, input.usage.inputTokens, input.usage.outputTokens),
      });
      if (uErr) console.error("[employment] could not log usage:", uErr.message);
    }
    return draft.id as string;
  } catch (err) {
    console.error("[employment] persist failed:", err);
    return null;
  }
}

/**
 * The same letter again with the dismissal reasons as the user confirmed or
 * edited them. Free — no model call. The scenario flags the draft was saved
 * with are kept; the assembler's own are refreshed.
 */
export async function reassemble(
  row: { id: string; answers: Record<string, unknown>; status: string; flags: Flag[] | null; title: string | null },
  ai: AiFields,
): Promise<{ html: string; text: string; flags: Flag[]; status: DraftStatus; ai: AiFields } | null> {
  const saved = row.answers ?? {};
  const req: EmploymentRequest = {
    answers: cleanAnswers(saved),
    employer: cleanEmployer(saved._employer),
    employee: cleanEmployee(saved._employee),
    job: cleanJob(saved._job),
  };
  const dateIso = str(saved._date) || toIso(todaySingapore());
  /* The person's own words are the reasons now: the assembler checks the AI
     only against what was typed, so edited reasons are taken as typed. */
  const answers = { ...req.answers, E4d: ai.dismissal_grounds ?? [] };
  const assembled = assemble({ ...req, answers, ai: null, date: dateIso });
  const kept = (row.flags ?? []).filter((f) => f.scenario !== "AI" && f.scenario !== "EM3" && f.scenario !== "EM4");
  const flags = dedupe([...kept, ...assembled.flags]);
  for (const f of flags) f.title = titleFor(f);
  const status: DraftStatus = row.status === "stopped" ? "stopped" : row.status === "final" ? "final" : "draft";
  const text = blocksToText(assembled.blocks);
  const html = blocksToHtml(assembled.blocks);
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("drafts")
      .update({ answers: { ...saved, E4d: answers.E4d, _ai: ai }, output: text, output_html: html, status, flags })
      .eq("id", row.id);
    if (error) {
      console.error("[employment] could not save re-assembly:", error.message);
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
      file_name: fileName(row.title ?? "Employment Agreement", n),
      instruction: "The dismissal reasons were confirmed or edited and the letter re-assembled.",
      output: text,
    });
  } catch (err) {
    console.error("[employment] re-assembly failed:", err);
    return null;
  }
  return { html, text, flags, status, ai: { dismissal_grounds: assembled.dismissalGrounds } };
}
