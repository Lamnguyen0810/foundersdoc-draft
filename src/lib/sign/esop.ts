import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * FD Sign <- ESOP dashboard: everything needed to make a vesting's Option
 * Certificates without typing. An APPROVED vesting (guard rail: Approve on
 * the dashboard first) already has each active holder's running certificate
 * number; the holder rows have the legal name, ID number, nationality and
 * grant date (filled from the Letter of Grant), and the company row has the
 * director and share class. In simulation (esop_companies.email_override)
 * every email goes to that FD address instead of the real one.
 */

export interface EsopRun {
  ref: string; // B8-T2
  batch: number;
  tranche: number;
  vestDate: string | null; // 1 Dec 2026
  approvedAt: string;
  approvedBy: string | null;
}

export interface EsopPrepHolder {
  id: string;
  name: string; // dashboard short name
  legalName: string;
  email: string | null; // real
  sendTo: string | null; // where emails go (simulation address when on)
  idNo: string;
  nationality: string;
  grantDate: string; // "24 October 2023"
  options: number;
  certificateNo: number | null;
  hasLetter: boolean;
}

export interface EsopPrep {
  ref: string;
  batch: number;
  tranche: number;
  vestDate: string | null;
  approved: boolean;
  simulation: string | null; // the override address, when on
  company: { name: string; regNo: string; director: string; shareClass: string; contactName: string; contactEmail: string | null; sendTo: string | null };
  holders: EsopPrepHolder[];
  leavers: string[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : "";
};
const shortDate = (iso: string | null) => {
  const l = longDate(iso);
  return l ? l.replace(/^(\d+) (\w{3})\w* (\d+)$/, "$1 $2 $3") : null;
};
/** "24 October 2023" -> "2023-10-24" (null if not a date) */
export function isoFromLong(s: string): string | null {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const vestOf = (start: string | null, tranche: number) => {
  if (!start) return null;
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + tranche);
  return d.toISOString().slice(0, 10);
};
const REF = /^B(\d{1,3})-T(\d{1,2})$/;

export interface EsopSource {
  runs(): Promise<EsopRun[]>;
  prepare(ref: string): Promise<EsopPrep | null>;
  letter(holderId: string): Promise<Uint8Array | null>;
  saveHolder(holderId: string, v: { legal_name?: string; id_no?: string; nationality?: string; grant_date?: string | null }, by: string): Promise<void>;
}

export function esopSource(): EsopSource | null {
  if (!isSupabaseConfigured()) return memorySource();
  if (!isAdminClientConfigured()) return null;
  return supabaseSource();
}

function supabaseSource(): EsopSource {
  const db = supabaseAdmin();
  const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  type Company = { id: string; name: string; legal_name: string | null; reg_no: string | null; director_name: string | null; share_class: string | null; contact_name: string | null; contact_email: string | null; email_override: string | null };
  const company = async () =>
    must(await db.from("esop_companies").select("id, name, legal_name, reg_no, director_name, share_class, contact_name, contact_email, email_override").eq("slug", "hitpay").maybeSingle()) as Company | null;

  return {
    async runs() {
      const c = await company();
      if (!c) return [];
      const runs = (must(await db.from("esop_tranche_runs").select("ref, approved_at, approved_by").eq("company_id", c.id).order("approved_at", { ascending: false }).limit(40)) ?? []) as Array<{ ref: string; approved_at: string; approved_by: string | null }>;
      const batches = (must(await db.from("esop_batches").select("batch, vesting_start").eq("company_id", c.id)) ?? []) as Array<{ batch: number; vesting_start: string | null }>;
      return runs
        .map((r) => {
          const m = REF.exec(r.ref);
          if (!m) return null;
          const batch = Number(m[1]);
          const tranche = Number(m[2]);
          const start = batches.find((b) => b.batch === batch)?.vesting_start ?? null;
          return { ref: r.ref, batch, tranche, vestDate: shortDate(vestOf(start, tranche)), approvedAt: r.approved_at, approvedBy: r.approved_by };
        })
        .filter((x): x is EsopRun => !!x);
    },
    async prepare(ref) {
      const m = REF.exec(ref);
      const c = await company();
      if (!m || !c) return null;
      const batch = Number(m[1]);
      const tranche = Number(m[2]);
      const b = must(await db.from("esop_batches").select("vesting_start").eq("company_id", c.id).eq("batch", batch).maybeSingle()) as { vesting_start: string | null } | null;
      const run = must(await db.from("esop_tranche_runs").select("ref").eq("company_id", c.id).eq("ref", ref).maybeSingle());
      type Row = { id: string; name: string; legal_name: string | null; email: string | null; id_no: string | null; nationality: string | null; grant_date: string | null; options_per_tranche: number; status: string };
      const rows = (must(await db.from("esop_holders").select("id, name, legal_name, email, id_no, nationality, grant_date, options_per_tranche, status").eq("company_id", c.id).eq("batch", batch).order("name")) ?? []) as Row[];
      const certs = (must(await db.from("esop_certificates").select("holder_id, number").eq("company_id", c.id).eq("ref", ref)) ?? []) as Array<{ holder_id: string; number: number }>;
      const ids = rows.map((r) => r.id);
      const letters = ids.length ? ((must(await db.from("esop_documents").select("holder_id").eq("kind", "letter_of_grant").in("holder_id", ids)) ?? []) as Array<{ holder_id: string }>) : [];
      const sim = c.email_override?.trim() || null;
      return {
        ref,
        batch,
        tranche,
        vestDate: shortDate(vestOf(b?.vesting_start ?? null, tranche)),
        approved: !!run,
        simulation: sim,
        company: {
          name: c.legal_name?.trim() || c.name,
          regNo: c.reg_no ?? "",
          director: c.director_name ?? "",
          shareClass: c.share_class ?? "Class B",
          contactName: c.contact_name ?? "",
          contactEmail: c.contact_email,
          sendTo: sim ?? c.contact_email,
        },
        holders: rows
          .filter((r) => r.status === "Active")
          .map((r) => ({
            id: r.id,
            name: r.name,
            legalName: r.legal_name?.trim() || r.name,
            email: r.email,
            sendTo: sim ?? r.email,
            idNo: r.id_no ?? "",
            nationality: r.nationality ?? "",
            grantDate: longDate(r.grant_date),
            options: r.options_per_tranche,
            certificateNo: certs.find((x) => x.holder_id === r.id)?.number ?? null,
            hasLetter: letters.some((l) => l.holder_id === r.id),
          })),
        leavers: rows.filter((r) => r.status !== "Active").map((r) => r.name),
      };
    },
    async letter(holderId) {
      const d = must(await db.from("esop_documents").select("path").eq("holder_id", holderId).eq("kind", "letter_of_grant").order("uploaded_at", { ascending: false }).limit(1).maybeSingle()) as { path: string } | null;
      if (!d) return null;
      const f = await db.storage.from("esop-docs").download(d.path);
      if (f.error || !f.data) throw new Error(f.error?.message ?? "letter not found");
      return new Uint8Array(await f.data.arrayBuffer());
    },
    async saveHolder(holderId, v, by) {
      const patch: Record<string, unknown> = { updated_by: by, updated_at: new Date().toISOString() };
      if (v.legal_name !== undefined) patch.legal_name = v.legal_name || null;
      if (v.id_no !== undefined) patch.id_no = v.id_no || null;
      if (v.nationality !== undefined) patch.nationality = v.nationality || null;
      if (v.grant_date !== undefined) patch.grant_date = v.grant_date;
      must(await db.from("esop_holders").update(patch).eq("id", holderId));
    },
  };
}

/* local preview: a specimen company so the flow can be tried without Supabase */
function memorySource(): EsopSource {
  const sim = "administrator@foundersdoc.com";
  const holders: EsopPrepHolder[] = [
    { id: "00000000-0000-0000-0000-0000000000a1", name: "Specimen Holder One", legalName: "Specimen Holder One", email: "one@specimen.example", sendTo: sim, idNo: "TEST-0001", nationality: "Singapore citizenship", grantDate: "1 December 2024", options: 4400, certificateNo: 47, hasLetter: false },
    { id: "00000000-0000-0000-0000-0000000000a2", name: "Specimen Holder Two", legalName: "Specimen Holder Two", email: "two@specimen.example", sendTo: sim, idNo: "", nationality: "", grantDate: "", options: 2200, certificateNo: 48, hasLetter: false },
    { id: "00000000-0000-0000-0000-0000000000a3", name: "Specimen Holder Three", legalName: "Hà Văn Specimen", email: "three@specimen.example", sendTo: sim, idNo: "TEST-0003", nationality: "Vietnamese citizenship", grantDate: "1 December 2024", options: 4400, certificateNo: 49, hasLetter: false },
  ];
  return {
    async runs() {
      return [{ ref: "B8-T2", batch: 8, tranche: 2, vestDate: "1 Dec 2026", approvedAt: new Date().toISOString(), approvedBy: "Preview" }];
    },
    async prepare(ref) {
      if (ref !== "B8-T2") return null;
      return {
        ref,
        batch: 8,
        tranche: 2,
        vestDate: "1 Dec 2026",
        approved: true,
        simulation: sim,
        company: { name: "Specimen Company Pte. Ltd.", regNo: "000000000X", director: "Specimen Director", shareClass: "Class B", contactName: "Specimen Director", contactEmail: "director@specimen.example", sendTo: sim },
        holders: holders.map((h) => ({ ...h })),
        leavers: ["Specimen Leaver"],
      };
    },
    async letter() {
      return null;
    },
    async saveHolder() {},
  };
}
