import "server-only";
import { DOC_TYPES, EXAMPLES_BY_SLUG, type DocType, type Field, type Group } from "./doctypes";
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
  /** The steps, in the order the admin console published them. */
  groups: Group[] | null;
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
 *   our_client       — which side we act for is implied by the answers.
 *   party_*_address — the streamlined parties step asks for names only.
 *
 * Party-name labels are also normalised below so older Supabase field JSON
 * cannot bring back the former UEN wording.
 */
const RETIRED_FIELD_KEYS = new Set(["our_client", "party_a_address", "party_b_address"]);

function fromRow(row: DocTypeRow): DocType {
  const rowExamples = row.examples ?? [];
  const fields = (row.fields ?? [])
    .filter((f) => !RETIRED_FIELD_KEYS.has(f.key))
    .map((field) => {
      if (row.slug !== "nda") return field;
      if (field.key === "party_a") {
        return {
          ...field,
          label: "Your name or organisation name",
          placeholder: "Meridian Logistics",
        };
      }
      if (field.key === "party_b") {
        return {
          ...field,
          label: "Other party’s name or organisation name",
          placeholder: "Kestrel Analytics",
        };
      }
      return field;
    });
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
  /* ── THE STEPS, AND WHY THIS LINE MATTERS ──────────────────────────────
     `groups` holds the order of the steps and their wording, as published
     from the admin console. The query below has always asked for it; this
     function used to build the DocType without it, so every read handed the
     drafting screen a catalogue with no step order at all. stepsFor() then
     fell back to the order the questions happen to appear in `fields`, which
     is why reordering steps in the console changed nothing for the user: the
     database was right, and the answer was being thrown away on the way out.

     Only well-formed entries are kept. A half-written row cannot take the
     form down; anything unreadable simply falls back to first-appearance
     order, exactly as before. */
  const groups = Array.isArray(row.groups)
    ? row.groups.filter(
        (g): g is Group => Boolean(g) && typeof g.name === "string" && g.name.trim().length > 0,
      )
    : [];

  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    fields,
    groups: groups.length > 0 ? groups : undefined,
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
    /* `groups` — step order and wording — arrives with 017. Until that has
       been run the catalogue is read without it and the steps fall back to
       first-appearance order, exactly as before. */
    let res: { data: DocTypeRow[] | null; error: { message: string } | null } = await supabase
      .from("doc_types")
      .select("slug,label,description,fields,groups,system_prompt,examples")
      .eq("is_active", true)
      .order("label");
    if (res.error && /groups/.test(res.error.message)) {
      const bare = await supabase
        .from("doc_types")
        .select("slug,label,description,fields,system_prompt,examples")
        .eq("is_active", true)
        .order("label");
      /* Without 017 there is no step order to read; first appearance it is. */
      res = {
        data: bare.data ? (bare.data as Omit<DocTypeRow, "groups">[]).map((r) => ({ ...r, groups: null })) : null,
        error: bare.error,
      };
    }
    const { data, error } = res;

    if (error || !data || data.length === 0) {
      if (error) console.error("[doctypes] falling back to built-in catalogue:", error.message);
      return { docTypes: DOC_TYPES, source: "built-in" };
    }
    const docTypes = (data as DocTypeRow[]).map(fromRow);

    /* ── THE EXAMPLES COME FROM THE AI LIBRARY ────────────────────────────
       Worked examples used to be baked into the code. They are rows in
       ai_sources now, managed from the admin console, and only the ones a
       person has reviewed and approved — status 'ready' — are read. The
       RPC is the single opening through the library's admin-only wall: it
       returns title and text for one document type and nothing else.

       If the RPC is not there yet (014_ai_library.sql not run) the code's
       own examples are used, so a draft never goes out with no example just
       because a migration is pending. */
    await Promise.all(
      docTypes.map(async (docType) => {
        const { data: rows, error: exErr } = await supabase.rpc("ai_examples_for", {
          p_slug: docType.slug,
        });
        if (exErr) {
          if (!/ai_examples_for/.test(exErr.message)) {
            console.error(`[doctypes] could not read examples for "${docType.slug}":`, exErr.message);
          }
          return; // keep whatever fromRow chose
        }
        const library = ((rows ?? []) as { title: string; text: string }[]).filter(
          (r) => r.text && r.text.trim().length > 0,
        );
        /* An empty library for a type is a real state — every sample was
           deleted and none uploaded — and it is honoured: the model then
           drafts from the system prompt alone rather than from examples the
           firm has removed. */
        docType.examples = library;
      }),
    );

    /* ── AND THE RULES ────────────────────────────────────────────────────
       The playbook (044): the firm-wide rules and this type's own, live
       versions only. Missing table or RPC — 044 not run yet — means no
       playbook, and the draft goes out as it did before. */
    await Promise.all(
      docTypes.map(async (docType) => {
        const { data: rows, error: pbErr } = await supabase.rpc("playbook_for", { p_slug: docType.slug });
        if (pbErr) {
          if (!/playbook_for/.test(pbErr.message)) {
            console.error(`[doctypes] could not read the playbook for "${docType.slug}":`, pbErr.message);
          }
          return;
        }
        const rules = ((rows ?? []) as { title: string; text: string }[]).filter(
          (r) => r.text && r.text.trim().length > 0,
        );
        if (rules.length > 0) docType.playbook = rules;
      }),
    );

    return { docTypes, source: "database" };
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
