import { NextRequest, NextResponse } from "next/server";
import { applyImport, errorJson, guard, OpError } from "@/lib/onpoint/server";
import { readXlsx } from "@/lib/onpoint/xlsx";
import { derive } from "@/lib/onpoint/derive";
import { sgToday } from "@/lib/onpoint/dates";

/**
 * POST /api/onpoint/import (multipart, field "files"): OnPoint's Excel sheets → clients, contacts and deadlines.
 * The sheets are read here and never kept; only what is worked out from them is stored (0267).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const m = await guard("edit");
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, 6);
    if (!files.length) throw new OpError("Choose an .xlsx file.");
    const results = [];
    for (const f of files) {
      if (!/\.xlsx$/i.test(f.name)) throw new OpError(`${f.name}: only .xlsx files can be read. In Excel: File → Save As → Excel Workbook.`);
      if (f.size > 8 * 1024 * 1024) throw new OpError(`${f.name} is larger than 8 MB.`);
      let sheets;
      try {
        sheets = readXlsx(Buffer.from(await f.arrayBuffer()));
      } catch {
        throw new OpError(`${f.name} could not be read as an Excel file.`);
      }
      const label = f.name.replace(/\.xlsx$/i, "").replace(/_/g, " ");
      const d = derive(label, sheets, sgToday());
      try {
        results.push({ file: f.name, ...(await applyImport(m, f.name, d)) });
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
