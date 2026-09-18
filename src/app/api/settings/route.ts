/**
 * Save the person's own settings: company profile, whether to use it when
 * drafting, FD AI preferences. One row per person, written whole per
 * section; the row-level policy is what makes it theirs alone.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { EMPTY_COMPANY, normaliseSettings, type CompanyProfile } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    company?: Partial<CompanyProfile>;
    use_company?: unknown;
    ai?: { detail?: unknown; style?: unknown; use_past_drafts?: unknown };
    retain_deleted?: unknown;
    improve_product?: unknown;
  };

  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (body.company && typeof body.company === "object") {
    const company: CompanyProfile = { ...EMPTY_COMPANY };
    for (const k of Object.keys(EMPTY_COMPANY) as (keyof CompanyProfile)[]) {
      const v = body.company[k];
      if (typeof v === "string") company[k] = v.trim().slice(0, 2000);
    }
    if (company.website && !/^https?:\/\//i.test(company.website)) company.website = `https://${company.website}`;
    patch.company = company;
  }
  if (body.use_company !== undefined) patch.use_company = Boolean(body.use_company);
  if (body.ai && typeof body.ai === "object") {
    const d = body.ai.detail;
    const st = body.ai.style;
    /* Written whole, like the company profile above: the browser sends the
       section it is saving, and an unrecognised value falls back to the
       default rather than being stored and puzzled over later. */
    patch.ai = {
      detail: d === "simple" || d === "comprehensive" ? d : "standard",
      style: st === "plain_english" ? "plain_english" : "standard_legal",
      use_past_drafts: Boolean(body.ai.use_past_drafts),
    };
  }
  if (body.retain_deleted !== undefined) patch.retain_deleted = Boolean(body.retain_deleted);
  if (body.improve_product !== undefined) patch.improve_product = Boolean(body.improve_product);
  if (Object.keys(patch).length === 2) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .upsert(patch, { onConflict: "user_id" })
    .select("company,use_company,ai,retain_deleted,improve_product,updated_at")
    .maybeSingle();

  if (error) {
    const missingColumn = /retain_deleted|improve_product/.test(error.message);
    return NextResponse.json(
      {
        error: missingColumn
          ? "This preference needs supabase/032_settings_and_deleted_drafts.sql to be run first."
          : /user_settings/.test(error.message)
            ? "Settings storage is not set up yet — run supabase/018_user_settings.sql."
            : "Could not save.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, settings: normaliseSettings(data) });
}
