import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { signedPdf, tokenCanSee } from "@/lib/sign/service";
import { adminEmail } from "@/lib/sign/http";

/**
 * GET /api/sign/file?e=<envelope id>&t=<token>[&signed=1][&download=1]
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
  const allowed = token ? await tokenCanSee(store, token, envelopeId) : Boolean(await adminEmail());
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const env = await store.envelope(envelopeId);
  if (!env) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const wantSigned = q.get("signed") === "1";
  const bytes = wantSigned ? await signedPdf(store, envelopeId) : await store.original(envelopeId);
  if (!bytes) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const name = `${wantSigned ? (env.status === "completed" ? "Signed - " : "In progress - ") : ""}${env.title}`.replace(/[^\w .()-]+/g, "_").slice(0, 120) + ".pdf";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
