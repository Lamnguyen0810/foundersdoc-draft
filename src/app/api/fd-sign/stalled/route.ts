import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { activity } from "@/lib/sign/slack";
import { isQuietAccount } from "@/lib/quiet";
import { signStore } from "@/lib/sign/store";
import { remindDaily } from "@/lib/sign/service";

/**
 * GET /api/fd-sign/stalled, once a day (vercel.json, 02:00 UTC = 10am Singapore),
 * 0304: also sends the daily reminders senders asked for (service.remindDaily).
 * with `Authorization: Bearer <CRON_SECRET>`. 0221.
 *
 * "Flag anyone who stops partway": every signer whose turn came more than 2 days ago and
 * who still hasn't signed, as one Slack summary in FD_SIGN_SLACK_CHANNEL, so someone can
 * follow up or send a reminder. People's own requests show only the sender's name and the
 * signer's place (signer 1 of 2), never the title or the signer.
 *
 * 0237 (Rachel, 16 Nov: "Whats this about"):
 *   - Founders Doc's own requests no longer show the title either: ESOP certificate titles
 *     carry the holder's name. An ESOP certificate shows its vesting (ESOP B8-T2 certificate),
 *     anything else "Founders Doc request"; each line links to the request in FD Sign.
 *   - ESOP simulation requests are skipped: a request for a vesting approved in simulation
 *     (esop_tranche_runs.simulation, SQL 116), or sent while the company is in simulation
 *     (esop_companies.email_override). Those emails only ever reach the test inbox.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 2;

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Row = { envelope_id: string; position: number; invited_at: string; viewed_at: string | null };
type Env = {
  id: string;
  status: string;
  owner_email: string | null;
  owner_name: string | null;
  esop_holder_id: string | null;
  esop_tranche: number | null;
  created_at: string;
};
type Holder = { id: string; batch: number; company_id: string };
type Run = { company_id: string; ref: string; approved_at: string; simulation: boolean | null };

const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/^['"]|['"]$/g, "") || "https://foundersdoc.com").replace(/\/+$/, "");

/** ESOP vesting ref per certificate request (B8-T2), and whether it is a simulation. */
async function esopInfo(db: ReturnType<typeof supabaseAdmin>, envs: Env[]): Promise<Map<string, { ref: string; simulation: boolean }>> {
  const out = new Map<string, { ref: string; simulation: boolean }>();
  const es = envs.filter((e) => e.esop_holder_id && e.esop_tranche);
  if (!es.length) return out;
  const h = await db.from("esop_holders").select("id, batch, company_id").in("id", [...new Set(es.map((e) => e.esop_holder_id as string))]);
  const holders = new Map(((h.data ?? []) as Holder[]).map((x) => [x.id, x]));
  const companies = [...new Set([...holders.values()].map((x) => x.company_id))];
  if (!companies.length) return out;
  const [c, r] = await Promise.all([
    db.from("esop_companies").select("id, email_override").in("id", companies),
    db.from("esop_tranche_runs").select("company_id, ref, approved_at, simulation").in("company_id", companies),
  ]);
  const simNow = new Set(((c.data ?? []) as Array<{ id: string; email_override: string | null }>).filter((x) => x.email_override?.trim()).map((x) => x.id));
  const runs = new Map(((r.data ?? []) as Run[]).map((x) => [`${x.company_id}|${x.ref}`, x]));
  for (const e of es) {
    const holder = holders.get(e.esop_holder_id as string);
    if (!holder) continue;
    const ref = `B${holder.batch}-T${e.esop_tranche}`;
    const run = runs.get(`${holder.company_id}|${ref}`);
    const simRun = Boolean(run?.simulation) && Date.parse(e.created_at) >= Date.parse(run!.approved_at) - 60_000;
    out.set(e.id, { ref, simulation: simRun || simNow.has(holder.company_id) });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isAdminClientConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const db = supabaseAdmin();
  /* 0304: first, the daily reminders a sender asked for ("Remind daily until signed") */
  const store = signStore();
  const reminded = store === "no-secret-key" ? 0 : await remindDaily(store, SITE).catch((e) => (console.error("[fd-sign] daily reminders failed:", e), 0));
  const before = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  const s = await db.from("sign_signers").select("envelope_id, position, invited_at, viewed_at").eq("status", "invited").lt("invited_at", before).order("invited_at").limit(200);
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  const rows = (s.data ?? []) as Row[];
  if (!rows.length) return NextResponse.json({ ok: true, stalled: 0, reminded });

  const ids = [...new Set(rows.map((r) => r.envelope_id))];
  const e = await db.from("sign_envelopes").select("id, status, owner_email, owner_name, esop_holder_id, esop_tranche, created_at").in("id", ids);
  if (e.error) return NextResponse.json({ error: e.error.message }, { status: 500 });
  const envs = new Map(((e.data ?? []) as Env[]).map((x) => [x.id, x]));
  const counts = new Map<string, number>();
  for (const id of ids) {
    const c = await db.from("sign_signers").select("id", { count: "exact", head: true }).eq("envelope_id", id);
    counts.set(id, c.count ?? 0);
  }

  const esop = await esopInfo(db, [...envs.values()]).catch(() => new Map<string, { ref: string; simulation: boolean }>());

  const lines: string[] = [];
  let skipped = 0;
  for (const r of rows) {
    const env = envs.get(r.envelope_id);
    if (!env || env.status !== "sent" || isQuietAccount(env.owner_email)) continue;
    const ei = esop.get(env.id);
    if (ei?.simulation) {
      skipped++;
      continue;
    }
    const days = Math.floor((Date.now() - Date.parse(r.invited_at)) / 86_400_000);
    const n = counts.get(r.envelope_id) ?? 1;
    const of = n > 1 ? `signer ${r.position} of ${n}` : "the signer";
    const where = r.viewed_at ? "opened, not signed" : "not opened";
    const whose = env.owner_email
      ? `${(env.owner_name || env.owner_email.split("@")[0]).slice(0, 80)}'s request`
      : `<${SITE}/fd-sign/d/${env.id}|Founders Doc · ${ei ? `ESOP ${ei.ref} certificate` : "request"}>`;
    lines.push(`• ${whose} · ${of} · ${where} · ${days} days`);
  }
  if (!lines.length) return NextResponse.json({ ok: true, stalled: 0, simulation_skipped: skipped });
  const shown = lines.slice(0, 15);
  await activity(`⏸ FD Sign · waiting more than ${DAYS} days (${lines.length}):\n${shown.join("\n")}${lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : ""}`);
  return NextResponse.json({ ok: true, stalled: lines.length, simulation_skipped: skipped });
}
