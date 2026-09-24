/**
 * Feedback typed in Slack.
 *
 * Zapier: Slack "New Message Posted to Channel" (the drafts channel, bot
 * messages off) → Webhooks by Zapier, POST JSON here with the header
 *   x-feedback-secret: <select public.slack_feedback_secret()>
 * and a body of {text, user, link}. Only messages that begin "feedback:" or
 * "fb:" are kept; everything else in the channel is ignored with a 200, so
 * the Zap never errors on ordinary chat.
 *
 * No session: this is Zapier's server, not a browser. The secret is checked
 * here AND in feedback_from_slack(); the route runs with the service key.
 * Public in the middleware for the same reason /api/analytics/weekly is.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { learnFromFeedback } from "@/lib/learn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNAL = /^\s*(feedback|fb)\s*:/i;

function field(body: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = body[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const secret = req.headers.get("x-feedback-secret")?.trim() ?? "";
  if (!secret) return NextResponse.json({ error: "No secret." }, { status: 401 });

  let body: Record<string, unknown>;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    body = ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  } else {
    const form = await req.formData().catch(() => null);
    body = form ? Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
  }

  /* Zapier's Slack trigger names these "text", "user_name" / "user"
     ("real_name" on some accounts) and "permalink". Take whichever came. */
  const text = field(body, "text", "message", "raw_text");
  const who = field(body, "user_name", "user", "real_name", "username", "name");
  const link = field(body, "permalink", "link", "url");

  if (!SIGNAL.test(text)) return NextResponse.json({ ok: true, ignored: true });

  const { data, error } = await supabaseAdmin().rpc("feedback_from_slack", {
    p_secret: secret,
    p_text: text,
    p_who: who || "Slack",
    p_link: link || null,
  });
  if (error) {
    const bad = /bad secret/i.test(error.message);
    if (!bad) console.error("[feedback/slack]", error.message);
    return NextResponse.json({ error: bad ? "Bad secret." : "Could not save." }, { status: bad ? 401 : 500 });
  }
  /* Now learn from it. Awaited, so Zapier's call carries the answer; a
     failure here leaves the feedback queued for a person, never lost. */
  const learnt = await learnFromFeedback(data as string).catch((err: unknown) => {
    console.error("[feedback/slack] learn failed:", err);
    return { learnt: false, reason: "error" };
  });
  return NextResponse.json({ ok: true, id: data as string, ...learnt });
}
