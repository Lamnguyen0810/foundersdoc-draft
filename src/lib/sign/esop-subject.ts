import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { esopSubject } from "@/lib/esop/subjects";
import { addYears, fmtDay } from "@/lib/esop/vesting";
import type { Envelope } from "./store";

/**
 * The subject of a signing email when what is being signed is an ESOP option certificate (0257):
 * the same line as the approval, payment and vesting emails of that vesting, e.g.
 *
 *   FD x HitPay ESOP: Please Sign 3 Option Certificates | Vesting 1 Dec 2026
 *   FD x HitPay ESOP: Signed Option Certificate | Vesting 1 Dec 2026
 *
 * null = not an ESOP certificate (or the vesting cannot be read): the caller keeps FD Sign's own
 * subject. Every document in the email must be a certificate, else null. People's own FD Sign
 * requests keep their subjects. 0258: the code email of a certificate carries the line too
 * ("… Your Signing Code 123456 | Vesting …"); any other code email stays "Your FD Sign code: 123456".
 */
export async function certificateSubject(envelopes: Array<Envelope | null>, kind: "sign" | "signed" | "code", reminder = false, code?: string): Promise<string | null> {
  const first = envelopes[0];
  if (!first || envelopes.some((e) => !e?.esop_holder_id || !e.esop_tranche)) return null;
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return null;
  try {
    const db = supabaseAdmin();
    const h = (await db.from("esop_holders").select("batch, company_id").eq("id", first.esop_holder_id!).maybeSingle()).data as { batch: number; company_id: string } | null;
    if (!h) return null;
    const [c, b] = await Promise.all([
      db.from("esop_companies").select("name").eq("id", h.company_id).maybeSingle(),
      db.from("esop_batches").select("vesting_start").eq("company_id", h.company_id).eq("batch", h.batch).maybeSingle(),
    ]);
    const company = (c.data as { name?: string | null } | null)?.name ?? null;
    const start = (b.data as { vesting_start?: string | null } | null)?.vesting_start ?? null;
    if (!company) return null;
    return esopSubject(kind, { company, vest_date_text: start ? fmtDay(addYears(start, first.esop_tranche!)) : "", count: envelopes.length, reminder, ...(code ? { code } : {}) });
  } catch {
    return null;
  }
}
