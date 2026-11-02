import { NextRequest, NextResponse } from "next/server";
import { signStore } from "@/lib/sign/store";
import { createSend, type DocInput } from "@/lib/sign/service";
import type { SignField } from "@/lib/sign/store";
import { adminEmail, who } from "@/lib/sign/http";
import { isHookConfigured } from "@/lib/sign/notify";
import { codeRequired } from "@/lib/sign/code";

/**
 * POST /api/sign/envelopes — Founders Doc admins send documents for signing.
 * multipart/form-data: "meta" (JSON) + "file0", "file1", … (PDFs, ≤ 10 MB each)
 *   meta = { batch: boolean, message?: string,
 *            docs: [{ title, holderId?, tranche?, signers: [{ name, email, role }],
 *                     fields?: [{ position, kind: signature|date|name, page, x, y, w, h }] }] }
 *   fields = the boxes on the signature lines (fractions of the page, from top-left)
 * Returns the signing links (also emailed through Zapier when SIGN_HOOK_URL is set).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 10 * 1024 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KINDS = new Set(["signature", "date", "name"]);
const frac = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

function parseFields(raw: unknown, signerCount: number): SignField[] {
  if (!Array.isArray(raw)) return [];
  const out: SignField[] = [];
  for (const f of raw.slice(0, 100) as Array<Record<string, unknown>>) {
    if (!f || typeof f !== "object") continue;
    const position = Number(f.position);
    const page = Number(f.page);
    const kind = String(f.kind ?? "signature");
    if (!Number.isInteger(position) || position < 1 || position > signerCount) continue;
    if (!Number.isInteger(page) || page < 1 || page > 500 || !KINDS.has(kind)) continue;
    if (![f.x, f.y, f.w, f.h].every(frac) || (f.w as number) <= 0 || (f.h as number) <= 0) continue;
    const x = f.x as number, y = f.y as number;
    const w = Math.min(f.w as number, 1 - x), h = Math.min(f.h as number, 1 - y);
    if (w <= 0.005 || h <= 0.005) continue;
    out.push({ position, kind: kind as SignField["kind"], page, x, y, w, h });
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const admin = await adminEmail();
  if (!admin) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const store = signStore();
  if (store === "no-secret-key") return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel, so FD Sign cannot store documents yet." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the form with the files." }, { status: 400 });
  }
  let meta: { batch?: unknown; message?: unknown; docs?: unknown };
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return NextResponse.json({ error: "Bad form." }, { status: 400 });
  }
  const docsIn = Array.isArray(meta.docs) ? meta.docs : [];
  if (!docsIn.length || docsIn.length > 30) return NextResponse.json({ error: "Add 1 to 30 documents." }, { status: 400 });

  const docs: DocInput[] = [];
  for (let i = 0; i < docsIn.length; i++) {
    const d = docsIn[i] as Record<string, unknown>;
    const file = form.get(`file${i}`);
    if (!(file instanceof File)) return NextResponse.json({ error: `Document ${i + 1}: no file.` }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: `${file.name} is over 10 MB.` }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: `${file.name} is not a PDF.` }, { status: 400 });
    const signersIn = Array.isArray(d.signers) ? (d.signers as Array<Record<string, unknown>>) : [];
    const signers = signersIn
      .map((s) => ({ name: String(s.name ?? "").trim().slice(0, 160), email: String(s.email ?? "").trim().toLowerCase(), role: String(s.role ?? "Signer").trim().slice(0, 80) || "Signer" }))
      .filter((s) => s.name || s.email);
    if (!signers.length || signers.length > 10) return NextResponse.json({ error: `${file.name}: add 1 to 10 signers.` }, { status: 400 });
    const bad = signers.find((s) => !s.name || !EMAIL.test(s.email));
    if (bad) return NextResponse.json({ error: `${file.name}: every signer needs a name and a valid email.` }, { status: 400 });
    const holderId = typeof d.holderId === "string" && UUID.test(d.holderId) ? d.holderId : null;
    const tranche = Number.isInteger(d.tranche) && (d.tranche as number) >= 1 && (d.tranche as number) <= 10 ? (d.tranche as number) : null;
    docs.push({
      title: String(d.title ?? "").trim().slice(0, 200) || file.name.replace(/\.pdf$/i, ""),
      fileName: file.name.slice(0, 200),
      bytes,
      esopHolderId: holderId,
      esopTranche: tranche,
      signers,
      fields: parseFields(d.fields, signers.length),
    });
  }

  if (docs.some((d) => d.fields.length) && !(await store.boxesReady()))
    return NextResponse.json({ error: "The signature boxes can't be saved yet: run supabase/113_fd_sign_fields.sql in Supabase, then press Send again." }, { status: 503 });

  if (codeRequired(store) && !(await store.codesReady()))
    return NextResponse.json({ error: "Signers must confirm an email code before signing, but that isn't set up yet: run supabase/114_fd_sign_codes.sql in Supabase, then press Send again." }, { status: 503 });

  try {
    const res = await createSend(store, {
      docs,
      batch: meta.batch === true,
      message: typeof meta.message === "string" && meta.message.trim() ? meta.message.trim().slice(0, 2000) : null,
      createdBy: admin,
      origin: req.nextUrl.origin,
      who: who(req),
    });
    return NextResponse.json({ ok: true, hook: isHookConfigured(), ...res });
  } catch (e) {
    console.error("[sign] send failed:", e);
    const m = e instanceof Error ? e.message : "";
    if (/sign_envelopes|relation/.test(m)) return NextResponse.json({ error: "FD Sign is not set up yet: run supabase/112_fd_sign.sql." }, { status: 503 });
    if (/parse|PDF|encrypt/i.test(m)) return NextResponse.json({ error: "One of the files could not be read as a PDF." }, { status: 400 });
    return NextResponse.json({ error: "Could not send for signing." }, { status: 500 });
  }
}
