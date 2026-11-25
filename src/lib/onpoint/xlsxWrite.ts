/**
 * A tiny .xlsx writer for "Export as Excel" (0294, as in the mock-up): one worksheet per table, every cell
 * written as text or a number, never as a formula. Pure apart from the zip library passed in (jszip),
 * so it runs in the browser on click and in tests.
 */

export type Row = Record<string, string | number | null | undefined>;
interface Zip {
  file(name: string, data: string): unknown;
  generateAsync(o: { type: "blob" | "uint8array"; mimeType?: string; compression?: "DEFLATE" }): Promise<unknown>;
}

const esc = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** a sheet name Excel accepts: no []:*?/\, at most 31 characters, unique */
export const sheetName = (n: string, used: Set<string>) => {
  let base = n.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let k = 2;
  const first = base;
  while (used.has(base.toLowerCase())) base = `${first.slice(0, 28)} ${k++}`;
  used.add(base.toLowerCase());
  return base;
};

function sheetXml(rows: Row[]): string {
  const head = rows.length ? Object.keys(rows[0]!) : ["(empty)"];
  const line = (vals: Array<string | number | null | undefined>, r: number) =>
    `<row r="${r}">${vals
      .map((v, i) => {
        const ref = `${col(i)}${r}`;
        if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        const t = v == null ? "" : String(v);
        return t ? `<c r="${ref}" t="inlineStr"${r === 1 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(t)}</t></is></c>` : "";
      })
      .join("")}</row>`;
  const body = [line(head, 1), ...rows.map((x, i) => line(head.map((h) => x[h]), i + 2))].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`;
}

/** { "Deadlines": rows, "Clients": rows, … } → the .xlsx file's bytes (or a Blob in the browser) */
export async function writeXlsx<T>(zip: Zip, tables: Record<string, Row[]>, type: "blob" | "uint8array" = "blob"): Promise<T> {
  const used = new Set<string>();
  const names = Object.keys(tables).map((n) => sheetName(n, used));
  const list = Object.values(tables);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
  );
  list.forEach((rows, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(rows)));
  return (await zip.generateAsync({ type, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" })) as T;
}
