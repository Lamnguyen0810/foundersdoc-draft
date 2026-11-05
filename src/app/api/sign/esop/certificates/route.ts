import { NextRequest, NextResponse } from "next/server";
import { esopSource, isoFromLong } from "@/lib/sign/esop";
import { buildCertificatePdf } from "@/lib/sign/certificate";
import { adminEmail } from "@/lib/sign/http";

/**
 * POST /api/sign/esop/certificates — admin: make the Option Certificates for
 * an approved vesting from the checked values, and (save: true) keep the
 * values on the holders' rows. Returns the PDFs (base64) for FD Sign.
 * { ref, save, nationality: "include" | "omit", rows: [{ holderId, legalName, nationality, idNo, grantDate, options }] }
 * Nationality is not in the Letter of Grant: when it's empty it shows as "[to be confirmed]"
 * (filled in later), or nationality: "omit" leaves it out of the certificates altogether.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TBC = "[to be confirmed]";
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const admin = await adminEmail();
  if (!admin) return NextResponse.json({ error: "Founders Doc admins only." }, { status: 403 });
  const src = esopSource();
  if (!src) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { ref?: string; save?: boolean; nationality?: string; rows?: Array<Record<string, unknown>> };
  const omitNationality = body.nationality === "omit";
  const prep = body.ref ? await src.prepare(body.ref) : null;
  if (!prep) return NextResponse.json({ error: "That vesting was not found." }, { status: 404 });
  if (!prep.approved) return NextResponse.json({ error: `Approve ${prep.ref} on the ESOP dashboard first: approval gives each holder their certificate number.` }, { status: 409 });
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 50) : [];
  if (!rows.length) return NextResponse.json({ error: "Pick at least one holder." }, { status: 400 });

  const files = [];
  for (const r of rows) {
    const h = prep.holders.find((x) => x.id === r.holderId);
    if (!h) return NextResponse.json({ error: "A holder is not in this vesting." }, { status: 400 });
    if (!h.certificateNo) return NextResponse.json({ error: `${h.name} has no certificate number: approve ${prep.ref} again on the dashboard.` }, { status: 409 });
    const v = {
      legalName: clean(r.legalName, 160),
      nationality: clean(r.nationality, 80),
      idNo: clean(r.idNo, 60),
      grantDate: clean(r.grantDate, 40),
      options: Number.parseInt(String(r.options ?? "").replace(/,/g, ""), 10),
    };
    /* nationality is optional: empty = "[to be confirmed]", or left out altogether */
    const typedNationality = v.nationality;
    /* a signed certificate can't be "filled in later": outside a simulation, ask for it or leave it out */
    if (!omitNationality && !typedNationality && !prep.simulation)
      return NextResponse.json({ error: `${h.name}: type the nationality, or choose "Leave it out" for nationality.` }, { status: 400 });
    v.nationality = omitNationality ? "" : typedNationality || TBC;
    const missing = [!v.legalName && "name", !v.idNo && "ID number", !isoFromLong(v.grantDate) && "grant date (e.g. 24 October 2023)", !(v.options > 0) && "options"].filter(Boolean);
    if (missing.length) return NextResponse.json({ error: `${h.name}: fill in ${missing.join(", ")}.` }, { status: 400 });
    /* only real values go back to the dashboard, never the placeholder */
    if (body.save)
      await src.saveHolder(
        h.id,
        { legal_name: v.legalName, id_no: v.idNo, ...(typedNationality && typedNationality !== TBC ? { nationality: typedNationality } : {}), grant_date: isoFromLong(v.grantDate) },
        admin,
      );
    const pdf = await buildCertificatePdf(
      {
        certificateNo: h.certificateNo,
        companyName: prep.company.name,
        companyRegNo: prep.company.regNo,
        holderName: v.legalName,
        nationality: v.nationality,
        idNo: v.idNo,
        options: v.options,
        shareClass: prep.company.shareClass,
        grantDate: v.grantDate,
        directorName: prep.company.director,
      },
      req.nextUrl.origin,
    );
    const title = `${v.legalName} | Option Certificate Tranche ${prep.tranche}`;
    files.push({
      holderId: h.id,
      tranche: prep.tranche,
      title,
      fileName: `${title.replace(/[^\p{L}\p{N} ._-]+/gu, "").replace(/\s+/g, " ")}.pdf`,
      pdf: Buffer.from(pdf).toString("base64"),
      signer: { name: v.legalName, email: h.sendTo ?? "", realEmail: h.email },
    });
  }
  return NextResponse.json({
    ok: true,
    files,
    director: { name: prep.company.director || prep.company.contactName, email: prep.company.sendTo ?? "", realEmail: prep.company.contactEmail },
    simulation: prep.simulation,
  });
}
