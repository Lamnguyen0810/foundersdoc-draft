/**
 * POST /api/cofounder — answers in, a co-founder agreement out.
 *
 * The contractor route as it was in its Beta. While the master is not
 * loaded (lib/cofounder/data/master.ts) no credit is reserved: the answers
 * are saved as a stopped draft and the screen says a lawyer will send it.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { FAIR_USE_REACHED, attachDraft, currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";
import { cleanAnswers, cleanCompany, cleanFounders, cleanHoldings, prepareCofounder } from "@/lib/cofounder/server";
import { MASTER_LOADED } from "@/lib/cofounder/data/master";
import { applyDefaults, founderCount, unanswered } from "@/lib/cofounder/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { answers?: unknown; company?: unknown; founders?: unknown; holdings?: unknown };
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
  const filled = applyDefaults(answers);
  const company = cleanCompany(body.company);
  const founders = cleanFounders(body.founders, founderCount(filled));
  const holdings = cleanHoldings(body.holdings);

  const missing = unanswered(filled);
  if (missing.length > 0) {
    return Response.json({ error: `Please answer: ${missing.map((q) => q.text).join(" · ")}` }, { status: 400 });
  }
  if (founders.filter((f) => f.name).length < 2) {
    return Response.json({ error: "At least two co-founders’ names are needed first." }, { status: 400 });
  }

  const request = { answers, company, founders, holdings };

  if (!MASTER_LOADED) {
    try {
      const out = await prepareCofounder(request, user?.id ?? "local");
      return Response.json(out);
    } catch (err) {
      console.error("[/api/cofounder] failed:", err);
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
    const out = await prepareCofounder(request, user?.id ?? "local");
    if (out.kind === "stopped") {
      await refundCredit(spendId, "cofounder: stopped");
      return Response.json(out);
    }
    if (out.draftId) await attachDraft(spendId, out.draftId);
    const creditsLeft = await currentBalance();
    return Response.json({ ...out, creditsLeft });
  } catch (err) {
    console.error("[/api/cofounder] failed:", err);
    await refundCredit(spendId, "cofounder: error");
    return Response.json({ error: "Something went wrong preparing the agreement. Your credit has not been used." }, { status: 500 });
  }
}
