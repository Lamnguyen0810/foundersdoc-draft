import { NextRequest, NextResponse, after } from "next/server";
import { signStore } from "@/lib/sign/store";
import { hashToken, signedPdf, tokenCanSee } from "@/lib/sign/service";
import { downloadStep } from "@/lib/sign/slack";
import { adminEmail } from "@/lib/sign/http";
import { signAccount } from "@/lib/sign/account";
import type { SignStore } from "@/lib/sign/store";

/**
 * GET /api/sign/file?e=<envelope id>&t=<token>[&signed=1][&doc=1][&download=1]
 * doc=1: the signed document on its own (e.g. just the certificate), no audit trail page.
 * The original PDF, or the signed one (signatures stamped on their lines + audit
 * trail). Allowed for a signer on that envelope (by their link) or an admin.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "Not available." }, { status: 503 });
  const q = req.nextUrl.searchParams;
  const envelopeId = q.get("e") ?? "";
  const token = q.get("t") ?? "";
  /* a signer (their link), a Founders Doc admin, or the account that sent it (FD Sign for everyone, SQL 119) */
  const owner = token ? false : await isOwner(store, envelopeId);
  const allowed = token ? await tokenCanSee(store, token, envelopeId) : owner || Boolean(await adminEmail());
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const env = await store.envelope(envelopeId);
  if (!env) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const wantSigned = q.get("signed") === "1";
  const docOnly = wantSigned && q.get("doc") === "1";
  const bytes = wantSigned ? await signedPdf(store, envelopeId, { audit: !docOnly, origin: req.nextUrl.origin }) : await store.original(envelopeId);
  if (!bytes) return NextResponse.json({ error: "Not found." }, { status: 404 });
  /* 0233: a download (not a preview) tells #fdai-signing who took a copy; after the answer, so it never slows the file */
  if (q.get("download") === "1" && (token || owner)) {
    after(async () => {
      let by: Parameters<typeof downloadStep>[2] = { kind: "sender" };
      if (token) {
        const mine = (await store.signersByToken(hashToken(token)).catch(() => [])).find((m) => m.envelope_id === envelopeId);
        by = mine ? { kind: "signer", position: mine.position } : { kind: "copy" };
      }
      await downloadStep(store, envelopeId, by, wantSigned).catch(() => undefined);
    });
  }
  const name = `${wantSigned ? (env.status === "completed" ? "Signed - " : "In progress - ") : ""}${env.title}${docOnly ? "" : wantSigned ? " (with audit trail)" : ""}`.replace(/[^\w .()-]+/g, "_").slice(0, 120) + ".pdf";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

async function isOwner(store: SignStore, envelopeId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(envelopeId)) return false;
  const [me, o] = await Promise.all([signAccount().catch(() => null), store.ownerOf(envelopeId).catch(() => null)]);
  return Boolean(me && o && o.owner_id === me.id);
}
