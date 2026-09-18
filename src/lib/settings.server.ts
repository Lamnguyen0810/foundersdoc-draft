import "server-only";
import { createClient } from "./supabase/server";
import { DEFAULT_SETTINGS, DETAIL_LEVEL, normaliseSettings, prefillAnswers, type UserSettings } from "./settings";
import type { PastDraft } from "./prompt";

/** The signed-in person's settings, or the defaults when none are saved. */
export async function loadSettings(): Promise<{ settings: UserSettings; tableMissing: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("company,use_company,ai,retain_deleted,improve_product,updated_at")
      .maybeSingle();
    if (error) {
      /* 032 may not have been run yet. Ask again for the columns that have
         always been there rather than showing a settings page with nothing on
         it — the two new preferences fall back to their defaults. */
      const { data: older } = await supabase
        .from("user_settings")
        .select("company,use_company,ai,updated_at")
        .maybeSingle();
      if (older) return { settings: normaliseSettings(older), tableMissing: false };
      return { settings: DEFAULT_SETTINGS, tableMissing: /user_settings/.test(error.message) };
    }
    return { settings: normaliseSettings(data), tableMissing: false };
  } catch {
    return { settings: DEFAULT_SETTINGS, tableMissing: false };
  }
}

/** What the drafting screen starts a new form with. Null when there is nothing saved. */
export async function loadPrefill(): Promise<{ answers: Record<string, string>; detailLevel: number } | null> {
  const { settings } = await loadSettings();
  const answers = prefillAnswers(settings);
  const detailLevel = DETAIL_LEVEL[settings.ai.detail];
  if (Object.keys(answers).length === 0 && detailLevel === 3) return null;
  return { answers, detailLevel };
}

/**
 * One of the person's own finished documents of this type, to show FD AI as a
 * style reference — only when they have asked for that.
 *
 * The most recent one they marked final, falling back to the most recent of
 * any status: a document somebody bothered to mark final is the better guide
 * to how they want their documents to read, but a person who never uses that
 * button should still get the benefit.
 *
 * Row-level security means this can only ever return their own work.
 */
export async function loadStyleReference(docTypeSlug: string): Promise<PastDraft | null> {
  const { settings } = await loadSettings();
  if (!settings.ai.use_past_drafts) return null;
  try {
    const supabase = await createClient();
    const { data: dt } = await supabase
      .from("doc_types")
      .select("id")
      .eq("slug", docTypeSlug)
      .maybeSingle();
    if (!dt?.id) return null;

    for (const finalOnly of [true, false]) {
      let q = supabase
        .from("drafts")
        .select("title,output")
        .eq("doc_type_id", dt.id)
        .is("deleted_at", null)
        .not("output", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (finalOnly) q = q.eq("status", "final");
      const { data } = await q;
      const row = (data ?? [])[0] as { title: string | null; output: string | null } | undefined;
      if (row?.output && row.output.trim().length > 200) {
        return { title: row.title ?? "an earlier document", text: row.output };
      }
    }
    return null;
  } catch {
    // A style reference is a nicety. Never let it stop a draft.
    return null;
  }
}
