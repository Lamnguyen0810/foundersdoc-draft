import type { SignField } from "./store";

/** The most a signer can type in a text box (sign_fields.value allows 500, SQL 120). */
export const TEXT_MAX = 500;

/** Signature boxes from a send form (fractions of the page, from the top-left). Shared by the admin and the FD Sign send. */
const KINDS = new Set(["signature", "date", "name", "initials", "text", "checkbox"]);
const frac = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

export function parseFields(raw: unknown, signerCount: number): SignField[] {
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
    const box: SignField = { position, kind: kind as SignField["kind"], page, x, y, w, h };
    /* text / checkbox: what it asks for, and whether it must be filled in (SQL 120) */
    if (kind === "text" || kind === "checkbox") {
      box.label = String(f.label ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || (kind === "text" ? "Text" : "I agree");
      box.required = f.required === undefined ? kind === "text" : f.required === true;
    }
    out.push(box);
  }
  return out;
}
