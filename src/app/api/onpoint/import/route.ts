import { NextRequest, NextResponse } from "next/server";
import { applyImport, errorJson, guard, OpError, undoImport } from "@/lib/onpoint/server";
import { readXlsx, type Sheet } from "@/lib/onpoint/xlsx";
import { dateOfCell, readCsv } from "@/lib/onpoint/payments";
import { derive } from "@/lib/onpoint/derive";
import { noteFile, storeFile } from "@/lib/onpoint/files";
import { sgToday } from "@/lib/onpoint/dates";

/**
 * POST /api/onpoint/import (multipart, field "files"): OnPoint's Excel sheets → clients, contacts and deadlines.
 * 0294: as in the mock-up, a .csv works too (its dates are read as dates); an old .xls is asked to be saved as .xlsx.
 * 0286: the sheet itself is also kept, private, in OnPoint's file folder.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const m = await guard("edit");
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, 6);
    if (!files.length) throw new OpError("Choose an .xlsx or .csv file.");
    const results = [];
    for (const f of files) {
      const csv = /\.csv$/i.test(f.name);
      if (/\.xls$/i.test(f.name)) throw new OpError(`${f.name} is an old Excel file (.xls). In Excel: File → Save As → Excel Workbook (.xlsx), then import that.`);
      if (!csv && !/\.xlsx$/i.test(f.name)) throw new OpError(`${f.name}: only .xlsx and .csv files can be read. In Excel: File → Save As → Excel Workbook.`);
      if (f.size > 8 * 1024 * 1024) throw new OpError(`${f.name} is larger than 8 MB.`);
      let sheets: Sheet[];
      const buf = Buffer.from(await f.arrayBuffer());
      try {
        sheets = csv ? csvSheets(buf.toString("utf8"), f.name) : readXlsx(buf);
      } catch {
        throw new OpError(`${f.name} could not be read as ${csv ? "a CSV" : "an Excel"} file.`);
      }
      const label = f.name.replace(/\.(xlsx|csv)$/i, "").replace(/_/g, " ");
      const d = derive(label, sheets, sgToday());
      try {
        const res = await applyImport(m, f.name, d);
        /* 0286: the sheet is kept in the file folder too */
        const fileId = await storeFile(m, buf, f.name, "sheet", csv ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").catch(() => null);
        await noteFile(m, fileId, { import_id: res.import_id, details: { kinds: res.kinds, clients: res.clients, deadlines: res.deadlines, contacts: res.contacts } });
        results.push({ file: f.name, ...res });
      } catch (e) {
        /* 0275: say which file and why, instead of a bare "not imported" */
        console.error("[onpoint import]", f.name, e);
        throw new OpError(`${f.name} was not imported: ${e instanceof Error ? e.message : "unknown error"}`, e instanceof OpError ? e.status : 500);
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/onpoint/import?id=123: undo an import done by mistake (0282); what it added is removed */
export async function DELETE(req: NextRequest) {
  try {
    const m = await guard("edit");
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) throw new OpError("Which import?");
    return NextResponse.json({ ok: true, ...(await undoImport(m, id)) });
  } catch (e) {
    const { body, status } = errorJson(e);
    return NextResponse.json(body, { status });
  }
}

/** a CSV as one sheet: a cell that reads as a date (31/12/2025, 31 Dec 2025, 2025-12-31) becomes YYYY-MM-DD, as in Excel */
function csvSheets(text: string, name: string): Sheet[] {
  return readCsv(text, name.replace(/\.csv$/i, "")).map((sh) => ({
    name: sh.name,
    rows: sh.rows.map((r) => r.map((c) => {
      const t = typeof c === "string" ? c.trim() : c;
      if (t === "" || t == null) return null;
      return (typeof t === "string" && /\d/.test(t) && /[/\-\s.]/.test(t) && dateOfCell(t)) || t;
    })),
  }));
}
