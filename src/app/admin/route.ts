import { type NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ADMIN_SHELL } from "./shell";

/**
 * The admin workspace.
 *
 * Served as a whole HTML document from a route handler rather than rendered as
 * a React page, for one reason: it keeps FD's design byte-for-byte. Ported into
 * JSX it would drift — a className here, a self-closing tag there — and the
 * next revision of the design would have to be ported again. This way the
 * design file is the source of truth and `scripts/build-admin-shell.mjs` lists
 * every change made to it.
 *
 * ── WHO CAN OPEN IT ─────────────────────────────────────────────────────────
 * `is_admin()` in the database decides, the same function the row-level
 * security policies use. A non-admin who guesses the URL is sent back to the
 * workspace; a signed-out visitor to the sign-in card. The button in the
 * catalogue is a convenience — this is the lock.
 */
export const dynamic = "force-dynamic";

interface WaitRow {
  email: string;
  name: string | null;
  company: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

interface EventRow {
  name: string;
  created_at: string;
  path: string | null;
  country: string | null;
  props: Record<string, unknown> | null;
}

const DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** How many of `rows` fall in the window ending now, `days` long. */
function countIn(rows: { created_at: string }[], days: number, offsetDays = 0): number {
  const end = Date.now() - offsetDays * 86_400_000;
  const start = end - days * 86_400_000;
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t > start && t <= end;
  }).length;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/draft", req.url));
  }

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Fadmin", req.url));
  if (!(await isAdmin())) return NextResponse.redirect(new URL("/draft", req.url));

  const supabase = await createClient();

  // Both reads are bounded: 90 days is the longest range the page offers, and
  // an admin page that pulls an unbounded table gets slower every week.
  const [waitRes, eventRes] = await Promise.all([
    supabase
      .from("waitlist")
      .select("email,name,company,note,status,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("events")
      .select("name,created_at,path,country,props")
      .gte("created_at", since(90))
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const waitlist = (waitRes.data as WaitRow[] | null) ?? [];
  const events = (eventRes.data as EventRow[] | null) ?? [];

  // If the tables are not there yet, the page still opens and says so rather
  // than failing — the migration may simply not have been run.
  const missing: string[] = [];
  if (waitRes.error) missing.push("waitlist (run supabase/005_waitlist.sql)");
  if (eventRes.error) missing.push("events (run supabase/003_events.sql)");

  const signups: Record<string, number> = {};
  const signupsPrev: Record<string, number> = {};
  const funnel: Record<string, { reached: number }> = {};

  for (const [key, days] of Object.entries(DAYS)) {
    signups[key] = countIn(waitlist, days);
    signupsPrev[key] = countIn(waitlist, days, days);
    const reached = events.filter(
      (e) =>
        (e.name === "page_view" && (e.path === "/login" || e.path === "/signup")) ||
        e.name === "launch_fdai_click",
    );
    funnel[key] = { reached: countIn(reached, days) };
  }

  /* The activity feed the design expects: one entry per real thing that
     happened. Waitlist joins first, because they are what the firm cares
     about, then the site events worth naming. Nothing is invented, and a
     quiet week honestly looks quiet. */
  const activity = [
    ...waitlist.slice(0, 120).map((w) => ({
      type: "signup",
      text: `${w.name ? `${w.name} (${w.email})` : w.email} joined the waitlist`,
      meta: [w.company, w.note ? `“${w.note.slice(0, 60)}”` : null].filter(Boolean),
      time: w.created_at,
    })),
    ...events
      .filter((e) => e.name === "consult_click" || e.name === "contact_submit")
      .slice(0, 80)
      .map((e) => ({
        type: "visit",
        text:
          e.name === "consult_click"
            ? "Pressed Book a consultation"
            : "Sent the enquiry form",
        meta: [String(e.props?.source ?? e.path ?? ""), e.country ?? ""].filter(Boolean),
        time: e.created_at,
      })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // "On the site now" = distinct visitors seen in the last five minutes.
  const fiveMinAgo = Date.now() - 5 * 60_000;
  const onSiteNow = new Set(
    events.filter((e) => new Date(e.created_at).getTime() > fiveMinAgo).map((e) => e.path ?? ""),
  ).size;

  const data = {
    waitlist,
    signups,
    signupsPrev,
    funnel,
    activity,
    onSiteNow,
    missing,
    generatedAt: new Date().toISOString(),
  };

  /* Injected as JSON inside a script tag. `<` is escaped so a note someone
     typed into the waitlist form — "</script><script>…" — is data, not code.
     Everything in `waitlist` was typed by a stranger; treat it that way. */
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  const notice = missing.length
    ? `<p class="sample-note" style="border-color:#c2410c;color:#c2410c">Not all tables are set up yet: ${missing
        .map((m) => m.replace(/</g, "&lt;"))
        .join("; ")}. The figures below are incomplete until they are.</p>`
    : "";

  const html = ADMIN_SHELL.replace(
    "<script>",
    `<script>window.FD = ${json};</script>\n${notice ? "" : ""}<script>`,
  ).replace('<p class="sample-note">', `${notice}<p class="sample-note">`);

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never cached, anywhere: it is per-person, admin-only and live.
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
