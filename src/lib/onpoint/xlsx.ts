import { inflateRawSync } from "node:zlib";

/**
 * A small, dependency-free .xlsx reader (OnPoint's Excel sources, 0267).
 *
 * An .xlsx file is a zip of XML parts. We read only what the import needs: the sheet names, every cell's
 * value (text, number, true/false) and whether a number is formatted as a date (then it comes back as
 * "YYYY-MM-DD"). Formulas come back as their last saved value. No macros, no external links, nothing run.
 * Server-side only; files are limited in size before they get here.
 */

export type Cell = string | number | boolean | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

const MAX_FILES = 400;
const MAX_UNZIPPED = 60 * 1024 * 1024;

function unzip(buf: Buffer): Map<string, Buffer> {
  /* find the end of the central directory (from the end, past an optional comment) */
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not an xlsx file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_FILES) throw new Error("too many parts");
  const out = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("broken zip");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(name)) continue;
    total += usize;
    if (total > MAX_UNZIPPED) throw new Error("file too large");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("broken zip");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }) : Buffer.alloc(0));
  }
  return out;
}

const unesc = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** the text of an <si> or <is>: every <t>, joined (rich text has several) */
const textOf = (xml: string) => unesc([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** "B12" → 1 (zero-based column) */
function colOf(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel's serial day (1900 system) → "YYYY-MM-DD" */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);

export function readXlsx(buf: Buffer): Sheet[] {
  const parts = unzip(buf);
  const wb = parts.get("xl/workbook.xml")?.toString("utf8");
  if (!wb) throw new Error("not an xlsx file");
  const rels = parts.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", (attr(m[0], "Target") ?? "").replace(/^\/?xl\//, "")]));

  const shared = [...(parts.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  /* which cell styles are dates */
  const styles = parts.get("xl/styles.xml")?.toString("utf8") ?? "";
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], "numFmtId")), unesc(attr(m[0], "formatCode") ?? "")]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const isDateStyle = [...xfs.matchAll(/<xf\b[^>]*\/?>/g)].map((m) => {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    if (BUILTIN_DATE.has(id)) return true;
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "").toLowerCase();
    return /[dmy]/.test(code) && !/^[#0.,%]+$/.test(code);
  });

  const out: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(attr(m[0], "name") ?? "Sheet");
    const rid = attr(m[0], "r:id") ?? "";
    const xml = parts.get(`xl/${target.get(rid) ?? ""}`)?.toString("utf8");
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNo = Number(attr(r[0], "r") ?? rows.length + 1) - 1;
      const row: Cell[] = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const head = `<c${c[1]}>`;
        const ref = attr(head, "r") ?? "";
        const t = attr(head, "t");
        const s = Number(attr(head, "s") ?? 0);
        const inner = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val: Cell = null;
        if (t === "s") val = v != null ? (shared[Number(v)] ?? null) : null;
        else if (t === "inlineStr") val = textOf(inner);
        else if (t === "str" || t === "e") val = v != null ? unesc(v) : null;
        else if (t === "b") val = v === "1";
        else if (v != null && v !== "") {
          const num = Number(v);
          val = isDateStyle[s] ? (serialToIso(num) ?? num) : num;
        }
        if (typeof val === "string") val = val.trim() || null;
        row[ref ? colOf(ref) : row.length] = val;
      }
      rows[rowNo] = Array.from(row, (x) => x ?? null);
    }
    out.push({ name, rows: Array.from(rows, (x) => x ?? []) });
  }
  return out;
}
