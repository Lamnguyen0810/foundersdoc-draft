/**
 * POST /api/termsheet — answers in, a term sheet out.
 *
 * Not a stream: the letter is assembled, not written, and the model's part
 * takes a few seconds for a few hundred tokens. One credit, taken before
 * the model is called and handed back on every path that yields no draft.
 */

import { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import { FAIR_USE_REACHED, attachDraft, currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";
import { cleanAnswers, cleanParties, prepareTermSheet } from "@/lib/termsheet/server";
import { DOCUMENT_TITLES } from "@/lib/termsheet/data/master";
import { applyDefaults, unanswered } from "@/lib/termsheet/conditions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { answers?: unknown; parties?: unknown; documentTitle?: unknown };
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
  const parties = cleanParties(body.parties);
  const documentTitle =
    typeof body.documentTitle === "string" && DOCUMENT_TITLES.includes(body.documentTitle.toUpperCase())
      ? body.documentTitle.toUpperCase()
      : undefined;

  /* A question the person skipped takes its usual answer (the questionnaire's
     default); only one with no default can be missing. */
  const missing = unanswered(applyDefaults(answers));
  if (missing.length > 0) {
    return Response.json({ error: `Please answer: ${missing.map((q) => q.text).join(" · ")}` }, { status: 400 });
  }
  if (parties.length < 2) {
    return Response.json({ error: "Both parties are needed before the term sheet can be prepared." }, { status: 400 });
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
    const out = await prepareTermSheet({ answers, parties, documentTitle }, user?.id ?? "local");

    if (out.kind === "ask" || out.kind === "questions") {
      await refundCredit(spendId, "term sheet: questions before drafting");
      return Response.json(out);
    }
    if (out.kind === "stopped") {
      await refundCredit(spendId, "term sheet: stopped by the playbook");
      return Response.json(out);
    }
    if (out.draftId) await attachDraft(spendId, out.draftId);
    const creditsLeft = await currentBalance();
    return Response.json({ ...out, usage: undefined, creditsLeft });
  } catch (err) {
    console.error("[/api/termsheet] failed:", err);
    await refundCredit(spendId, "term sheet: error");
    return Response.json({ error: "Something went wrong preparing the term sheet. Your credit has not been used." }, { status: 500 });
  }
}
