import type { SignField } from "./store";

/** Signature boxes from a send form (fractions of the page, from the top-left). Shared by the admin and the FD Sign send. */
const KINDS = new Set(["signature", "date", "name"]);
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
    out.push({ position, kind: kind as SignField["kind"], page, x, y, w, h });
  }
  return out;
}
