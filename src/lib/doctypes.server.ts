import "server-only";
import { DOC_TYPES, EXAMPLES_BY_SLUG, type DocType, type Field } from "./doctypes";
import { isSupabaseConfigured } from "./supabase/config";
import { createClient } from "./supabase/server";

/**
 * The runtime document catalogue.
 *
 * Reads from Supabase `doc_types` when configured, so a lawyer can edit a prompt
 * in the dashboard and see the change on the next draft — no deploy. Falls back
 * to the built-in catalogue when Supabase is absent or the table is empty, which
 * keeps the app runnable offline and on a fresh clone.
 *
 * Worked examples are stitched in from code unless the row carries its own, so a
 * seeded row does not need 8 KB of example text inside it.
 */

interface DocTypeRow {
  slug: string;
  label: string;
  description: string | null;
  fields: Field[] | null;
  system_prompt: string;
  examples: { title: string; text: string }[] | null;
}

/**
 * Questions that have been retired from the product.
 *
 * The database is the source of truth for the catalogue, which is the whole
 * point — a lawyer changes a prompt without a deploy. The cost is that a
 * question deleted in code lives on in `doc_types.fields` until someone re-runs
 * the seed, and until they do it keeps appearing on screen. That is confusing
 * and it wastes the user's time answering something the drafter ignores.
 *
 * So a retired key is filtered out on the way in. Deleting it properly is still
 * the right thing to do (see supabase/002_seed_doctypes.sql), but forgetting to
 * no longer shows a dead question to a lawyer.
 *
 *   our_client — the form now asks for "your company" first, so which side we
 *                act for is implied by the answer rather than asked separately.
 */
const RETIRED_FIELD_KEYS = new Set(["our_client"]);

function fromRow(row: DocTypeRow): DocType {
  const rowExamples = row.examples ?? [];
  const fields = (row.fields ?? []).filter((f) => !RETIRED_FIELD_KEYS.has(f.key));
  const builtIn = DOC_TYPES.find((docType) => docType.slug === row.slug);
  let systemPrompt = row.system_prompt;
  if (
    row.slug === "nda" &&
    builtIn &&
    !systemPrompt.includes("COMPREHENSIVENESS")
  ) {
    const marker = "\n\nCOMPREHENSIVENESS";
    const appendix = builtIn.systemPrompt.slice(builtIn.systemPrompt.indexOf(marker));
    if (appendix) systemPrompt += appendix;
  }
  if ((row.fields ?? []).length !== fields.length) {
    console.warn(
      `[doctypes] "${row.slug}" still lists retired question(s) in Supabase; ignoring them. ` +
        `Re-run supabase/002_seed_doctypes.sql to remove them from the database.`,
    );
  }
  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    fields,
    systemPrompt,
    examples: rowExamples.length > 0 ? rowExamples : (EXAMPLES_BY_SLUG[row.slug] ?? []),
  };
}

export interface CatalogueResult {
  docTypes: DocType[];
  /** "database" or "built-in" — surfaced in the UI so nobody debugs a prompt in the
   *  wrong place. Guessing which one is live wastes more time than anything else here. */
  source: "database" | "built-in";
}

export async function loadDocTypes(): Promise<CatalogueResult> {
  if (!isSupabaseConfigured()) return { docTypes: DOC_TYPES, source: "built-in" };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("doc_types")
      .select("slug,label,description,fields,system_prompt,examples")
      .eq("is_active", true)
      .order("label");

    if (error || !data || data.length === 0) {
      if (error) console.error("[doctypes] falling back to built-in catalogue:", error.message);
      return { docTypes: DOC_TYPES, source: "built-in" };
    }
    return { docTypes: (data as DocTypeRow[]).map(fromRow), source: "database" };
  } catch (err) {
    console.error("[doctypes] falling back to built-in catalogue:", err);
    return { docTypes: DOC_TYPES, source: "built-in" };
  }
}

/** Single doc type by slug, using the same source as loadDocTypes(). */
export async function loadDocType(slug: string): Promise<DocType | undefined> {
  const { docTypes } = await loadDocTypes();
  return docTypes.find((d) => d.slug === slug);
}
