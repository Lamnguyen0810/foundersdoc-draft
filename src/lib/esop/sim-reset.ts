import "server-only";

/**
 * Who sees the "Reset simulation" button on the ESOP dashboard (SQL 116):
 * Rachel (both accounts) and Lam's test account, nobody else, not even other
 * Founders Doc admins or the client. Change the list with ESOP_RESET_EMAILS in
 * Vercel (comma separated) without a code change.
 */
const DEFAULT = ["rachel.wong@foundersdoc.com", "rwonglmg@outlook.com", "nguyenhoanglam.first@gmail.com"];

export function resetEmails(): string[] {
  const env = process.env.ESOP_RESET_EMAILS?.trim();
  const list = env ? env.split(",") : DEFAULT;
  return list.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
}

export function canResetSimulation(email: string | null | undefined): boolean {
  return !!email && resetEmails().includes(email.trim().toLowerCase());
}
