import { NextRequest, NextResponse } from "next/server";
import { createSend } from "@/lib/sign/service";
import { parseFields } from "@/lib/sign/fields";
import { who } from "@/lib/sign/http";
import { isHookConfigured } from "@/lib/sign/notify";
import { codeRequired } from "@/lib/sign/code";
import { dailyLimit, startOfDaySgt } from "@/lib/sign/account";
import { NEW_FIELD_KINDS } from "@/lib/sign/store";
import { ctx, fail, UUID } from "../common";

/**
 * POST /api/fd-sign/send — anyone with an FD AI account sends their own PDF for signing.
 * multipart/form-data: "file" (PDF, ≤ 10 MB) + "meta" (JSON):
 *   { title, message?, folderId?, signers: [{ name, email, role? }] (1–10, in signing order),
 *     cc?: [email] (≤ 5), fields: [{ position, kind: signature|date|name, page, x, y, w, h }] }
 * Every signer needs at least one signature box. Signers confirm an email code before signing.
 * Never touches ESOP: no holder link, owner_id set (SQL 119), nothing posted to Slack.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 10 * 1024 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (c instanceof NextResponse) return c;
  const { me, store } = c;

  /* real emails must be able to go out (the signing link and the code travel by email only) */
  if (store.kind !== "memory" && !isHookConfigured()) return NextResponse.json({ error: "Sending is switched off for a moment. Please try again later." }, { status: 503 });
  if (codeRequired(store) && !(await store.codesReady())) return NextResponse.json({ error: "FD Sign is being set up (run supabase/114_fd_sign_codes.sql)." }, { status: 503 });

  const limit = dailyLimit();
  const today = await store.sentSince(me.id, startOfDaySgt());
  if (today >= limit) return NextResponse.json({ error: `You've sent ${limit} requests today, the most for now while FD Sign is free. Please try again tomorrow.` }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the form with the file." }, { status: 400 });
  }
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return NextResponse.json({ error: "Bad form." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Add the document (PDF)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "The file is over 10 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "Please upload a PDF. (Word: save it as PDF first.)" }, { status: 400 });

  const signers = (Array.isArray(meta.signers) ? (meta.signers as Array<Record<string, unknown>>) : [])
    .map((s) => ({
      name: String(s?.name ?? "").trim().slice(0, 160),
      email: String(s?.email ?? "").trim().toLowerCase(),
      role: String(s?.role ?? "").trim().slice(0, 80) || "Signer",
    }))
    .filter((s) => s.name || s.email);
  if (!signers.length || signers.length > 10) return NextResponse.json({ error: "Add 1 to 10 people to sign." }, { status: 400 });
  if (signers.some((s) => !s.name || !EMAIL.test(s.email) || s.email.length > 200)) return NextResponse.json({ error: "Every person needs a name and a valid email." }, { status: 400 });
  if (new Set(signers.map((s) => s.email)).size !== signers.length) return NextResponse.json({ error: "Each person needs their own email address." }, { status: 400 });

  const cc = [...new Set((Array.isArray(meta.cc) ? meta.cc : []).map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
  if (cc.length > 5 || cc.some((e) => !EMAIL.test(e) || e.length > 200)) return NextResponse.json({ error: "Up to 5 valid emails can get a copy." }, { status: 400 });
  if (cc.length && !(await store.viewersReady())) return NextResponse.json({ error: "Copies are being set up (run supabase/115_fd_sign_copies.sql)." }, { status: 503 });

  const fields = parseFields(meta.fields, signers.length);
  const missing = signers.findIndex((_, i) => !fields.some((f) => f.position === i + 1 && f.kind === "signature"));
  if (missing >= 0) return NextResponse.json({ error: `${signers[missing].name} needs a signature box on the document.` }, { status: 400 });
  if (!(await store.boxesReady())) return NextResponse.json({ error: "FD Sign is being set up (run supabase/113_fd_sign_fields.sql)." }, { status: 503 });
  if (fields.some((f) => NEW_FIELD_KINDS.has(f.kind)) && !(await store.fieldsV2Ready()))
    return NextResponse.json({ error: "Initials, text boxes and checkboxes are being set up (run supabase/120_fd_sign_more_fields.sql). Signature, date and name boxes work now." }, { status: 503 });

  let folderId: string | null = null;
  if (typeof meta.folderId === "string" && meta.folderId) {
    if (!UUID.test(meta.folderId) || !(await store.folders(me.id)).some((f) => f.id === meta.folderId)) return NextResponse.json({ error: "That folder doesn't exist." }, { status: 400 });
    folderId = meta.folderId;
  }

  const title = String(meta.title ?? "").trim().slice(0, 200) || file.name.replace(/\.pdf$/i, "").slice(0, 200) || "Document";
  const message = typeof meta.message === "string" && meta.message.trim() ? meta.message.trim().slice(0, 2000) : null;
  try {
    const res = await createSend(store, {
      docs: [{ title, fileName: file.name.slice(0, 200) || "document.pdf", bytes, esopHolderId: null, esopTranche: null, signers, cc, fields }],
      batch: false,
      message,
      createdBy: me.email,
      origin: req.nextUrl.origin,
      who: who(req),
      owner: { id: me.id, email: me.email, name: me.name, folderId },
    });
    const first = res.links[0];
    return NextResponse.json({
      ok: true,
      id: res.envelopeIds[0],
      emailedTo: first?.emailed ? first.name : null,
      /* local preview only (no emails): the link to try the signing page */
      previewLink: store.kind === "memory" ? first?.link : undefined,
      today: today + 1,
      limit,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/parse|PDF|encrypt/i.test(m)) return NextResponse.json({ error: "This PDF could not be read. If it has a password, remove it and try again." }, { status: 400 });
    return fail(e, "send");
  }
}
