/**
 * One subject line for every ESOP email a client or an option holder receives (0257).
 *
 * Rachel, 20 Nov 2026: the firm and the client first, then what the email is, then the vesting it
 * belongs to, so the whole run sits together in an inbox:
 *
 *   FD x HitPay ESOP: Issuance of Option Certificates for 3 Option Holders | Vesting 1 Dec 2026
 *   FD x HitPay ESOP: Payment for 3 Option Certificates | Vesting 1 Dec 2026
 *   FD x HitPay ESOP: Your Options Have Vested | Vesting 1 Dec 2026
 *   FD x HitPay ESOP: Please Sign 3 Option Certificates | Vesting 1 Dec 2026
 *   FD x HitPay ESOP: Signed Option Certificate | Vesting 1 Dec 2026
 *
 * No names in a subject (they are in the email), and the same words in a simulation and for real.
 * Pure, so it can be tested on its own.
 */

export type EsopMail = "approval" | "payment" | "vested" | "sign" | "signed";

const clean = (c?: string | null) => (c ?? "").replace(/\s*\(test\)\s*/i, "").trim();

/** "FD x HitPay ESOP"; "Founders Doc ESOP" when the company's name is not known. */
export const esopTag = (company?: string | null) => (clean(company) ? `FD x ${clean(company)} ESOP` : "Founders Doc ESOP");

export function esopSubject(kind: EsopMail, p: { company?: string | null; vest_date_text: string; count?: number; reminder?: boolean }): string {
  const n = Math.max(1, Math.floor(p.count ?? 1));
  const what =
    kind === "approval"
      ? `Issuance of Option Certificates for ${n} Option Holder${n === 1 ? "" : "s"}`
      : kind === "payment"
        ? `Payment for ${n} Option Certificate${n === 1 ? "" : "s"}`
        : kind === "vested"
          ? "Your Options Have Vested"
          : kind === "sign"
            ? n === 1
              ? "Please Sign Your Option Certificate"
              : `Please Sign ${n} Option Certificates`
            : "Signed Option Certificate";
  const when = (p.vest_date_text ?? "").trim();
  return `${kind === "sign" && p.reminder ? "Reminder: " : ""}${esopTag(p.company)}: ${what}${when && when !== "–" ? ` | Vesting ${when}` : ""}`;
}
