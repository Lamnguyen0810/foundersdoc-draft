import { NextRequest, NextResponse } from "next/server";
import { addInvoice, applyInvoiceImport, errorJson, guard, OpError, paymentRun, savePaySchedule, savePayTemplate, sendPayment, setFiling, setInvoiceStatus } from "@/lib/onpoint/server";
import { cleanDays, readCsv, readInvoiceList } from "@/lib/onpoint/payments";
import { readXlsx } from "@/lib/onpoint/xlsx";

/**
 * Payment reminders (0280).
 * POST (multipart, field "file"): import an invoice list (.xlsx or .csv; read here, never kept).
 * POST { action: "add", client_id | client_name, email?, contact_name?, number?, description?, amount, due_date }
 * POST { action: "send", invoice_id, request_id }: send one reminder now (to the safety-check inbox for now).
 * POST { action: "template", subject, body } · POST { action: "filing", on } (administrators)
 * POST { action: "schedule", before: [7, 0], after: [3, 10, 30] }: the days of the automatic reminders (0282)
 * POST { action: "run" }: Founders Doc, only while emails go to the safety-check inbox: send today's automatic reminders now
 * PATCH { id, status: "paid" | "open" | "cancelled" }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const m = await guard("edit");
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) throw new OpError("Choose an .xlsx or .csv file.");
      if (!/\.(xlsx|csv)$/i.test(f.name)) throw new OpError(`${f.name}: only .xlsx or .csv files can be read.`);
      if (f.size > 8 * 1024 * 1024) throw new OpError(`${f.name} is larger than 8 MB.`);
      let sheets;
      try {
        const buf = Buffer.from(await f.arrayBuffer());
        sheets = /\.csv$/i.test(f.name) ? readCsv(buf.toString("utf8"), f.name) : readXlsx(buf);
      } catch {
        throw new OpError(`${f.name} could not be read.`);
      }
      const list = readInvoiceList(sheets, f.name);
      if (!list.sheet) throw new OpError(`${f.name}: no columns for the client, the amount and the due date were found. The first row should name them, e.g. Client, Invoice No, Amount, Due Date, Email.`);
      return NextResponse.json({ ok: true, ...(await applyInvoiceImport(m, f.name, list)) });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "add") return NextResponse.json({ ok: true, ...(await addInvoice(await guard("edit"), b)) });
    if (b.action === "send") {
      const m = await guard("edit");
      const r = await sendPayment(m.ws, String(b.invoice_id ?? ""), m.email, String(b.request_id ?? ""));
      return NextResponse.json({ ok: r.status === "sent", ...r }, { status: r.status === "sent" ? 202 : r.status === "duplicate" ? 200 : r.status === "blocked" ? 409 : 502 });
    }
    if (b.action === "template") {
      await savePayTemplate(await guard("edit"), String(b.subject ?? ""), String(b.body ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "schedule") {
      const m = await guard("edit");
      const before = cleanDays(b.before, 0);
      const after = cleanDays(b.after, 1);
      if (!before || !after) throw new OpError("Use whole numbers of days: 0 to 365 before, 1 to 365 after.");
      await savePaySchedule(m, before, after);
      return NextResponse.json({ ok: true, before, after });
    }
    if (b.action === "run") {
      const m = await guard("admin");
      if (!m.founder) throw new OpError("Only Founders Doc can run this.", 403);
      if (!m.ws.test_inbox?.trim()) throw new OpError("Run now only works while emails go to the safety-check inbox, so nothing reaches a client.", 409);
      return NextResponse.json({ ok: true, ...(await paymentRun(m.ws)) });
    }
    if (b.action === "filing") {
      await setFiling(await guard("admin"), b.on === true);
      return NextResponse.json({ ok: true });
    }
    throw new OpError("Unknown action.");
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await guard("edit");
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
    await setInvoiceStatus(m, String(b.id ?? ""), String(b.status ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}
