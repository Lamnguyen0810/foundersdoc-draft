import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isThrowaway } from "@/lib/waitlist/disposable";

/**
 * Joining the mailing list — the subscriber list, which is a different thing
 * from the waitlist and from FD AI accounts (see supabase/073).
 *
 * Called by the forms on the static site (public/fd-subscribe.js): the footer
 * on every page, the box at the end of each article, the corner slide-in.
 *
 * Open to anyone — it has to be. Three things keep that from mattering:
 *
 *   The database function is the only way in and it takes an address and a
 *   source word, nothing else. There is no record to shape.
 *
 *   The reply is identical whether the address was new, already on the list,
 *   or opted out. Nobody can use this to check who subscribes to a law firm.
 *
 *   A honeypot: the form carries a field a person never sees and never fills.
 *   A script that fills every field gets a cheerful "ok" and nothing is saved.
 *   Not a wall — the cheap scripts are the only ones a list this size meets.
 *
 * Nothing here waits on Slack. The announcement is queued inside the database
 * (pg_net) and sent after the row is committed.
 */
export const dynamic = "force-dynamic";

const SOURCES = new Set(["Website footer", "Article", "Slide-in"]);

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not available yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  // The honeypot. A person cannot see it; a script fills it. Say yes, save nothing.
  if (str(body.website, 10)) return NextResponse.json({ ok: true });

  const email = str(body.email, 200);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (isThrowaway(email)) {
    return NextResponse.json(
      { error: "That looks like a temporary inbox. Please use an address you will keep." },
      { status: 400 },
    );
  }

  const source = str(body.source, 40);
  const supabase = createClient(supabaseUrl()!, supabasePublishableKey()!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.rpc("subscribe", {
    p_email: email,
    p_source: source && SOURCES.has(source) ? source : "Website",
  });

  if (error) {
    // A missing function means supabase/073_subscriber_list.sql has not been run.
    console.error("[subscribe] failed:", error.code, error.message);
    return NextResponse.json(
      { error: "We could not add you just now. Please try again in a moment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
