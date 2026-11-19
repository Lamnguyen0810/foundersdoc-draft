import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { SignError, remindOurs } from "@/lib/sign/service";
import { adminEmail, who } from "@/lib/sign/http";
import { STALLED_DAYS } from "@/lib/master/figures";

/**
 * POST /api/sign/remind  { "envelopeIds": ["…", "…"] }
 *
 * The master dashboard's "Remind" (0250), Founders Doc admins only: emails the person whose turn
 * it is on Founders Doc's OWN requests again, once they have waited more than 2 days. Several
 * certificates waiting on the same person go in one email.
 *
 * A person's own request is refused (403): it stays theirs to chase. The answer carries counts
 * only, never a signer's name or email, so the master dashboard keeps its rule.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOST = 60;

export async function POST(req: NextRequest) {
  if (!(await adminEmail())) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { envelopeIds?: unknown };
  const ids = Array.isArray(body.envelopeIds) ? body.envelopeIds.map(String) : [];
  if (ids.length === 0 || ids.length > MOST || !ids.every((id) => UUID.test(id))) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    const r = await remindOurs(store, ids, req.nextUrl.origin, who(req), STALLED_DAYS * 86_400_000);
    if (r.people === 0) {
      const s = r.skipped;
      const why = s.recent
        ? "A reminder went out less than an hour ago."
        : s.early
          ? `They have waited less than ${STALLED_DAYS} days.`
          : s.expired
            ? "The signing link has expired. Open the request and send a new link."
            : "Nobody is waiting to sign.";
      return NextResponse.json({ error: why }, { status: 409 });
    }
    return NextResponse.json({ ok: true, people: r.people, documents: r.documents, emailed: r.emailed });
  } catch (e) {
    if (e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sign remind] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not send the reminder." }, { status: 500 });
  }
}
