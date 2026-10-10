/**
 * POST /api/employment — answers in, an employment agreement out.
 *
 * The term sheet's route, for the employment master: not a stream (the
 * letter is assembled, not written), one credit taken before the model is
 * called and handed back on every path that yields no draft.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { FAIR_USE_REACHED, attachDraft, currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";
import { cleanAnswers, cleanEmployee, cleanEmployer, cleanJob, prepareEmployment } from "@/lib/employment/server";
import { applyDefaults, unanswered } from "@/lib/employment/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { answers?: unknown; employer?: unknown; employee?: unknown; job?: unknown; guide?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const user = isSupabaseConfigured() ? await getUser() : null;
  if (isSupabaseConfigured() && !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  const answers = cleanAnswers(body.answers);
  const employer = cleanEmployer(body.employer);
  const employee = cleanEmployee(body.employee);
  const job = cleanJob(body.job);

  const missing = unanswered(applyDefaults(answers));
  if (missing.length > 0) {
    return Response.json({ error: `Please answer: ${missing.map((q) => q.text).join(" · ")}` }, { status: 400 });
  }
  if (!employer.name || !employee.name || !job.position) {
    return Response.json({ error: "The employer’s name, the employee’s name and the job title are needed first." }, { status: 400 });
  }

  const spendId = await reserveCredit();
  if (spendId === FAIR_USE_REACHED) {
    return Response.json(
      { error: "You have reached this month's fair-use limit. Nothing has been charged — get in touch and we will raise it.", code: "fair_use" },
      { status: 429 },
    );
  }
  if (!spendId) {
    return Response.json(
      { error: "You have no drafting credits left. Add credits to carry on; past drafts stay available.", code: "no_credits" },
      { status: 402 },
    );
  }

  try {
    const out = await prepareEmployment({ answers, employer, employee, job, guide: body.guide }, user?.id ?? "local");
    if (out.kind === "stopped") {
      await refundCredit(spendId, "employment: stopped by the playbook");
      return Response.json(out);
    }
    if (out.draftId) await attachDraft(spendId, out.draftId);
    const creditsLeft = await currentBalance();
    return Response.json({ ...out, usage: undefined, creditsLeft });
  } catch (err) {
    console.error("[/api/employment] failed:", err);
    await refundCredit(spendId, "employment: error");
    return Response.json({ error: "Something went wrong preparing the contract. Your credit has not been used." }, { status: 500 });
  }
}
