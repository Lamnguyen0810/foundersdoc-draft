import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addInvoice, applyInvoiceImport, readPdfInvoice, errorJson, guard, OpError, paymentRun, savePaySchedule, savePayTemplate, sendPayment, setFiling, setInvoiceStatus } from "@/lib/onpoint/server";
import { cleanDays, readCsv, readInvoiceList } from "@/lib/onpoint/payments";
import { noteFile, storeFile } from "@/lib/onpoint/files";
import { readXlsx } from "@/lib/onpoint/xlsx";

/**
 * Payment reminders (0280).
 * POST (multipart, field "file"): one file: a PDF invoice (read into a draft to check) or an invoice list (.xlsx/.csv,
 *   imported). 0286: every file is kept in OnPoint's file folder.
 * POST { action: "add_pdf", items: [{ file_id, file_name, client_name | client_id, email, number, description, amount, due_date }] }
 * POST { action: "add", client_id | client_name, email?, contact_name?, number?, description?, amount, due_date }
 * POST { action: "send_all", invoice_ids, confirm_count, request_id }: the client page's "Send all" (0285)
 * POST { action: "send", invoice_id, request_id }: send one reminder now (to the safety-check inbox for now).
 * POST { action: "template", subject, body } · POST { action: "filing", on } (administrators)
 * POST { action: "schedule", before: [7, 0], after: [3, 10, 30] }: the days of the automatic reminders (0282)
 * POST { action: "auto", on }: automatic reminders on/off (OnPoint administrators, 0287)
 * POST { action: "run" }: Founders Doc, only while emails go to the safety-check inbox: send today's automatic reminders now
 * PATCH { id, status: "paid" | "open" | "cancelled" }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      /* 0286: one file per request (the page sends a batch one by one): a PDF invoice, or an invoice list */
      const m = await guard("edit");
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) throw new OpError("Choose a PDF, Excel or CSV file.");
      if (!/\.(pdf|xlsx|csv)$/i.test(f.name)) throw new OpError(`${f.name}: only PDF invoices, or an Excel (.xlsx) or CSV list, can be read.`);
      if (f.size > 4 * 1024 * 1024) throw new OpError(`${f.name} is larger than 4 MB.`);
      const buf = Buffer.from(await f.arrayBuffer());
      if (/\.pdf$/i.test(f.name)) {
        if (buf.subarray(0, 4).toString("latin1") !== "%PDF") throw new OpError(`${f.name} is not a PDF.`);
        const fileId = await storeFile(m, buf, f.name, "pdf", "application/pdf").catch(() => null);
        const read = await readPdfInvoice(m, buf);
        await noteFile(m, fileId, { details: { table: read.table, rows: read.drafts.length } });
        return NextResponse.json({ ok: true, kind: "pdf", file_id: fileId, file_name: f.name, ...read });
      }
      let sheets;
      try {
        sheets = /\.csv$/i.test(f.name) ? readCsv(buf.toString("utf8"), f.name) : readXlsx(buf);
      } catch {
        throw new OpError(`${f.name} could not be read.`);
      }
      const list = readInvoiceList(sheets, f.name);
      if (!list.sheet) throw new OpError(`${f.name}: no columns for the client, the amount and the due date were found. The first row should name them, e.g. Client, Invoice No, Amount, Due Date, Email.`);
      const fileId = await storeFile(m, buf, f.name, "list", /\.csv$/i.test(f.name) ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").catch(() => null);
      const res = await applyInvoiceImport(m, f.name, list);
      await noteFile(m, fileId, { import_id: res.import_id, details: { invoices: res.invoices, added: res.added, new_clients: res.new_clients, marked_paid: res.marked_paid, skipped: res.skipped.length } });
      return NextResponse.json({ ok: true, kind: "list", file_id: fileId, ...res });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "add") return NextResponse.json({ ok: true, ...(await addInvoice(await guard("edit"), b)) });
    if (b.action === "add_pdf") {
      /* 0286: the PDF invoices the person checked: each one added, and its file linked to it */
      const m = await guard("edit");
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200) as Array<Record<string, unknown>>;
      const results = [];
      for (const it of items) {
        try {
          const r = await addInvoice(m, { ...it, source: `PDF · ${String(it.file_name ?? "").slice(0, 150)}` });
          results.push({ file_id: it.file_id, ok: true, id: r.id });
        } catch (e) {
          results.push({ file_id: it.file_id, ok: false, error: e instanceof OpError ? e.message : "Not added." });
        }
      }
      /* each file points to the (first) invoice it became, and says how many it gave */
      const byFile = new Map<string, string[]>();
      for (const r of results) if (r.ok && typeof r.file_id === "string") byFile.set(r.file_id, [...(byFile.get(r.file_id) ?? []), String(r.id)]);
      for (const [fid, ids] of byFile) await noteFile(m, fid, { invoice_id: ids[0], details: { added: ids.length } });
      return NextResponse.json({ ok: results.every((r) => r.ok), results });
    }
    if (b.action === "send_all") {
      /* 0285: the client page's "Send all": one reminder per invoice, confirmed count */
      const m = await guard("edit");
      const ids = [...new Set((Array.isArray(b.invoice_ids) ? b.invoice_ids : []).map(String))].slice(0, 50);
      if (!ids.length || Number(b.confirm_count) !== ids.length) throw new OpError("The number of reminders changed. Please check and confirm again.", 409);
      const rid = String(b.request_id ?? "").slice(0, 40);
      const results = [];
      for (const id of ids) results.push({ id, ...(await sendPayment(m.ws, id, m.email, `${rid}:${id}`)) });
      return NextResponse.json({ ok: results.every((r) => r.status === "sent"), results });
    }
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
    if (b.action === "auto") {
      /* 0287: automatic reminders on/off, by OnPoint's administrators (the plan and the safety-check inbox still apply) */
      const m = await guard("admin");
      const r = await supabaseAdmin().from("onpoint_workspaces").update({ auto_send: b.on === true, updated_at: new Date().toISOString() }).eq("id", m.ws.id);
      if (r.error) throw new OpError(r.error.message, 500);
      return NextResponse.json({ ok: true, on: b.on === true });
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
