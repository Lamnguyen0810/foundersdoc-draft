import "server-only";
import { createClient } from "./supabase/server";
import { DEFAULT_SETTINGS, DETAIL_LEVEL, normaliseSettings, prefillAnswers, type UserSettings } from "./settings";

/** The signed-in person's settings, or the defaults when none are saved. */
export async function loadSettings(): Promise<{ settings: UserSettings; tableMissing: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("company,use_company,ai,updated_at")
      .maybeSingle();
    if (error) return { settings: DEFAULT_SETTINGS, tableMissing: /user_settings/.test(error.message) };
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
