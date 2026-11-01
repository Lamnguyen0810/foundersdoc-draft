/**
 * Bulk upload (FD admin): which holder and which column a PDF belongs to,
 * read from its file name, e.g.
 *   "HitPay_l_ESOP_Letter_of_Grant_Signed_Dated_Ha_Van_Thao.pdf" -> Thao, Letter of Grant
 *   "Ban_Korh_Wong_I_Option_Certificate_Tranche_2.pdf"           -> Ban Korh Wong, certificate, T2
 *   "HitPay_I_ESOP_Option_Certificate_[Jovelle_Palapal].pdf"     -> Jovelle, certificate
 * A holder matches when EVERY word of their name (or legal name) is a whole
 * word of the file name; the holder with most matching words wins, and a tie
 * is left for a person to pick. Pure functions, no React.
 */
import type { DocKind, EsopHolder } from "./vesting";

const NOISE = new Set(["hitpay", "esop", "option", "options", "certificate", "certificates", "letter", "of", "grant", "signed", "dated", "tranche", "pdf", "l", "i", "copy", "final", "docusign"]);

export function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export interface FileMatch {
  holderId: string | null;
  kind: DocKind | null;
  tranche: number | null;
  why: string; // shown when nothing matched
}

export function matchFile(fileName: string, holders: Pick<EsopHolder, "id" | "name" | "legal_name">[]): FileMatch {
  const w = words(fileName);
  const set = new Set(w);
  const joined = w.join(" ");
  const kind: DocKind | null = /letter of grant|\blog\b/.test(joined) ? "letter_of_grant" : /certificate|\bcert\b/.test(joined) ? "certificate" : null;
  const t = /tranche (\d{1,2})|\bt(\d)\b/.exec(joined);
  const tranche = t ? Number(t[1] ?? t[2]) : null;

  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const h of holders) {
    for (const n of [h.name, h.legal_name ?? ""]) {
      const nw = words(n).filter((x) => !NOISE.has(x));
      if (!nw.length || !nw.every((x) => set.has(x))) continue;
      if (!best || nw.length > best.score) {
        best = { id: h.id, score: nw.length };
        tie = false;
      } else if (nw.length === best.score && best.id !== h.id) tie = true;
    }
  }
  if (!best) return { holderId: null, kind, tranche, why: "no holder name found in the file name" };
  if (tie) return { holderId: null, kind, tranche, why: "matches more than one holder" };
  return { holderId: best.id, kind, tranche, why: "" };
}
