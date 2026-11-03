import "server-only";
import { pdfLines } from "./pdfjs-node";

/**
 * Read a HitPay Letter of Grant (the ESOP precedent) so the Option
 * Certificate fills itself in. The letter prints each value on the line just
 * above its label ("24 October 2023" over "Date:____"), and the key terms as
 * a table ("Number of Options", "Class of Shares", per-tranche options).
 * Anything not found is left empty for Founders Doc to type; nothing is
 * guessed. Nationality is not in the letter.
 */
export interface LetterFields {
  letterDate: string | null; // "24 October 2023"
  name: string | null; // as printed, e.g. "HÀ VĂN THAO"
  legalName: string | null; // title case, e.g. "Hà Văn Thao"
  idNo: string | null;
  totalOptions: number | null;
  trancheOptions: number[]; // 1st, 2nd, 3rd, 4th tranche
  shareClass: string | null; // "Class B"
  vestingStart: string | null; // "1 November 2023"
  found: string[]; // which fields were read
}

const DATE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
const blankLabel = (t: string) => t.replace(/_+/g, "").trim();

/** Title case that keeps accents: "HÀ VĂN THAO" -> "Hà Văn Thao" (only when the letter is all capitals). */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name.trim();
  return name
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (/^\s+$|^-$/.test(w) ? w : w.charAt(0).toLocaleUpperCase("en") + w.slice(1)))
    .join("")
    .trim();
}

const num = (t: string) => {
  const m = /^\s*([\d,]{1,12})\s*$/.exec(t) ?? /^\s*([\d,]{1,12})\b/.exec(t);
  if (!m) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function readLetterOfGrant(bytes: Uint8Array): Promise<LetterFields> {
  const lines = (await pdfLines(bytes, 3)).map((l) => l.text).filter((t) => !/^DocuSign Envelope ID/i.test(t));
  const f: LetterFields = { letterDate: null, name: null, legalName: null, idNo: null, totalOptions: null, trancheOptions: [], shareClass: null, vestingStart: null, found: [] };

  /* value printed on the label's own line (after the colon) or on the line above it */
  const near = (label: RegExp, ok: (v: string) => boolean): string | null => {
    const i = lines.findIndex((t) => label.test(t));
    if (i < 0) return null;
    const same = blankLabel(lines[i].replace(label, ""));
    if (same && ok(same)) return same;
    for (const j of [i - 1, i + 1]) {
      const v = lines[j] ? blankLabel(lines[j]) : "";
      if (v && ok(v) && !/:\s*$/.test(v)) return v;
    }
    return null;
  };

  const d = near(/^\s*Date\s*:/i, (v) => DATE.test(v));
  if (d) f.letterDate = DATE.exec(d)![0].replace(/(\d)(st|nd|rd|th)/i, "$1");
  const n = near(/^\s*Name\s*:/i, (v) => /\p{L}{2,}/u.test(v) && v.length < 120 && !DATE.test(v));
  if (n) {
    f.name = n;
    f.legalName = titleCase(n);
  }
  const id = near(/^\s*Identification\s+(Number|No\.?)\s*:/i, (v) => /^[A-Z0-9][A-Z0-9 -]{4,30}$/i.test(v));
  if (id) f.idNo = id.replace(/\s+/g, " ");

  const at = (label: RegExp, span = 4, before = 0) => {
    const i = lines.findIndex((t) => label.test(t));
    return i < 0 ? [] : lines.slice(Math.max(0, i - before), i + span + 1);
  };
  for (const t of at(/Number of Options/i)) {
    const v = num(blankLabel(t.replace(/Number of Options/i, "")));
    if (v) {
      f.totalOptions = v;
      break;
    }
  }
  for (const t of at(/Class of Shares/i)) {
    const m = /\bClass\s+([A-Z])\b(?!\s+of)/.exec(t.replace(/Class of Shares/i, ""));
    if (m) {
      f.shareClass = `Class ${m[1]}`;
      break;
    }
  }
  for (const t of at(/Commencement Date/i, 2, 2)) {
    const m = DATE.exec(t);
    if (m) {
      f.vestingStart = m[0];
      break;
    }
  }
  /* per tranche: "____4,400 Options representing …" (the number may sit on its own line just above) */
  for (let i = 0; i < lines.length && f.trancheOptions.length < 10; i++) {
    if (!/Options\s+representing/i.test(lines[i])) continue;
    const inline = /^[^\d]{0,40}?([\d,]{1,12})\s*_*\s*Options\s+representing/i.exec(lines[i]);
    const v = inline ? num(inline[1]) : i > 0 ? num(blankLabel(lines[i - 1])) : null;
    if (v) f.trancheOptions.push(v);
  }

  const keys: Array<[keyof LetterFields, string]> = [
    ["letterDate", "letter date"],
    ["legalName", "name"],
    ["idNo", "ID number"],
    ["totalOptions", "number of options"],
    ["shareClass", "class of shares"],
    ["vestingStart", "vesting start"],
  ];
  f.found = keys.filter(([k]) => f[k] != null).map(([, label]) => label);
  if (f.trancheOptions.length) f.found.push("options per tranche");
  return f;
}
