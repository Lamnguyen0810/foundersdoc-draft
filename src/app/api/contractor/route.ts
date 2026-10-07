/**
 * POST /api/contractor — answers in, a contractor agreement out.
 *
 * The employment route, for the contractor master. While the master is not
 * loaded (lib/contractor/data/master.ts) no credit is reserved: the answers
 * are saved as a stopped draft and the screen says a lawyer will send it.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { FAIR_USE_REACHED, attachDraft, currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";
import { cleanAnswers, cleanCompany, cleanContractor, cleanEngagement, prepareContractor } from "@/lib/contractor/server";
import { MASTER_LOADED } from "@/lib/contractor/data/master";
import { applyDefaults, unanswered } from "@/lib/contractor/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { answers?: unknown; company?: unknown; contractor?: unknown; engagement?: unknown };
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
  const company = cleanCompany(body.company);
  const contractor = cleanContractor(body.contractor);
  const engagement = cleanEngagement(body.engagement);

  const missing = unanswered(applyDefaults(answers));
  if (missing.length > 0) {
    return Response.json({ error: `Please answer: ${missing.map((q) => q.text).join(" · ")}` }, { status: 400 });
  }
  if (!company.name || !contractor.name || !engagement.services) {
    return Response.json({ error: "The Company’s name, the Contractor’s name and a line on the services are needed first." }, { status: 400 });
  }

  if (!MASTER_LOADED) {
    try {
      const out = await prepareContractor({ answers, company, contractor, engagement }, user?.id ?? "local");
      return Response.json(out);
    } catch (err) {
      console.error("[/api/contractor] failed:", err);
      return Response.json({ error: "Something went wrong saving your answers. Nothing has been charged." }, { status: 500 });
    }
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
    const out = await prepareContractor({ answers, company, contractor, engagement }, user?.id ?? "local");
    if (out.kind === "stopped") {
      await refundCredit(spendId, "contractor: stopped");
      return Response.json(out);
    }
    if (out.draftId) await attachDraft(spendId, out.draftId);
    const creditsLeft = await currentBalance();
    return Response.json({ ...out, creditsLeft });
  } catch (err) {
    console.error("[/api/contractor] failed:", err);
    await refundCredit(spendId, "contractor: error");
    return Response.json({ error: "Something went wrong preparing the agreement. Your credit has not been used." }, { status: 500 });
  }
}
