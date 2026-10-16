/**
 * POST /api/ipaa — answers in, an IP assignment agreement out.
 *
 * The convertible loan agreement route, for the IP assignment agreement: one credit is
 * reserved, the agreement is assembled and saved, and the credit is refunded
 * if a red flag stops it (the answers are then saved for the firm to follow
 * up).
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { FAIR_USE_REACHED, attachDraft, currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";
import { cleanAnswers, cleanParty, prepareIpaa } from "@/lib/ipaa/server";
import { MASTER_LOADED } from "@/lib/ipaa/data/master";
import { applyDefaults, unanswered } from "@/lib/ipaa/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { answers?: unknown; creator?: unknown; recipient?: unknown };
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
  const creator = cleanParty(body.creator);
  const recipient = cleanParty(body.recipient);

  const missing = unanswered(filled);
  if (missing.length > 0) {
    return Response.json({ error: `Please answer: ${missing.map((q) => q.text).join(" · ")}` }, { status: 400 });
  }
  /* A creator's template leaves the recipient blank, to fill in for each client. */
  const template = filled.IP1 === "creator" && filled.IP5 === "template";
  const mine = filled.IP1 === "creator" ? creator : recipient;
  if (template ? !mine.name : !creator.name || !recipient.name) {
    return Response.json({ error: template ? "Your name is needed first." : "The names of the Creator and the Recipient are needed first." }, { status: 400 });
  }

  const request = { answers, creator, recipient };

  if (!MASTER_LOADED) {
    try {
      const out = await prepareIpaa(request, user?.id ?? "local");
      return Response.json(out);
    } catch (err) {
      console.error("[/api/ipaa] failed:", err);
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
    const out = await prepareIpaa(request, user?.id ?? "local");
    if (out.kind === "stopped") {
      await refundCredit(spendId, "ipaa: stopped");
      return Response.json(out);
    }
    if (out.draftId) await attachDraft(spendId, out.draftId);
    const creditsLeft = await currentBalance();
    return Response.json({ ...out, creditsLeft });
  } catch (err) {
    console.error("[/api/ipaa] failed:", err);
    await refundCredit(spendId, "ipaa: error");
    return Response.json({ error: "Something went wrong preparing the agreement. Your credit has not been used." }, { status: 500 });
  }
}
