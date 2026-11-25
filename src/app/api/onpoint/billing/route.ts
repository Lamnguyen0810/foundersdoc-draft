import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/billing/stripe";
import { billingView, confirmCheckout, portalUrl, setBillingOpen, setupStripe, startCheckout } from "@/lib/onpoint/billing";
import { enquireAddon, errorJson, guard, OpError } from "@/lib/onpoint/server";

/**
 * OnPoint's Billing & plan (0269), administrators only.
 * GET  ?session_id=cs_…  the plan, card and invoices (links a just-finished checkout first)
 * POST { action: "checkout" }  → { url } Stripe's payment page for the monthly plan
 * POST { action: "portal" }    → { url } Stripe's page to update the card and see invoices
 * POST { action: "enquire", note? }  ask about the document drafting & review add-on (0285)
 * POST { action: "setup" }     Founders Doc: create the proposal's prices in Stripe (0281)
 * POST { action: "open", on }  Founders Doc: open card payment (until then: "opening soon", all free)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe's own error messages say what to fix in the Stripe dashboard (and hold no secrets) */
const fromStripe = (e: unknown) =>
  e && typeof e === "object" && "type" in e && String((e as { type: unknown }).type).startsWith("Stripe") ? new OpError(`Stripe: ${(e as { message?: string }).message ?? "request failed"}`, 502) : e;

export async function GET(req: NextRequest) {
  try {
    const m = await guard("admin");
    const sid = req.nextUrl.searchParams.get("session_id");
    const linked = sid ? await confirmCheckout(m, sid) : false;
    return NextResponse.json({ ...(await billingView(m)), linked });
  } catch (e) {
    const { body, status } = errorJson(fromStripe(e));
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const m = await guard("admin");
    const b = (await req.json().catch(() => ({}))) as { action?: string };
    const origin = siteUrl(req.nextUrl.origin);
    if (b.action === "checkout") return NextResponse.json({ url: await startCheckout(m, origin) });
    if (b.action === "portal") return NextResponse.json({ url: await portalUrl(m, origin) });
    if (b.action === "enquire") return NextResponse.json({ ok: true, ...(await enquireAddon(m, String((b as { note?: unknown }).note ?? ""))) });
    if (b.action === "setup") return NextResponse.json({ ok: true, ...(await setupStripe(m)) });
    if (b.action === "open") {
      await setBillingOpen(m, (b as { on?: unknown }).on === true);
      return NextResponse.json({ ok: true });
    }
    throw new OpError("Unknown action.");
  } catch (e) {
    const { body, status } = errorJson(fromStripe(e));
    return NextResponse.json(body, { status });
  }
}
