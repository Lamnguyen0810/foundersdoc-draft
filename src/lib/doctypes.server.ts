import "server-only";
import { DOC_TYPES, EXAMPLES_BY_SLUG, type DocType, type Field, type Group } from "./doctypes";
import { documentLook, type DocumentLook } from "./playbook";
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
  /** 'chat' or 'assembly' (048). Absent before that migration. */
  engine?: string | null;
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
 *   party_details   — "Party details required in your jurisdiction": unclear,
 *                     and the form is not tied to a set of jurisdictions; the
 *                     names are the party details (053 removes it for good).
 *
 * Party-name labels are also normalised below so older Supabase field JSON
 * cannot bring back the former UEN wording.
 */
const RETIRED_FIELD_KEYS = new Set(["our_client", "party_a_address", "party_b_address", "party_details"]);

/**
 * Retired from the NDA only (054), by the firm's decision:
 *   non_solicit  — "Stop them poaching your staff?": the NDA covers
 *                  confidentiality only and never has a non-solicit.
 *   jurisdiction — "Which country's law?": the NDA is not tied to a
 *                  country; the governing law is left for the user to fill.
 *   residuals, trade_secret_tail — "Let them use what they remember?" and
 *                  "Protect trade secrets for ever?" (060): taken out; the
 *                  survival period can now be Perpetual instead.
 */
const RETIRED_NDA_KEYS = new Set(["non_solicit", "jurisdiction", "residuals", "trade_secret_tail"]);

/** Every retired question key for one document type — for the admin
 *  Questions editor, so it shows the form exactly as the drafting screen
 *  asks it. */
export function retiredFieldKeys(slug: string): Set<string> {
  return new Set([...RETIRED_FIELD_KEYS, ...(slug === "nda" ? RETIRED_NDA_KEYS : [])]);
}

/** A step's wording as the drafting screen shows it (054). */
export function tidyStepQuestion(q: string): string {
  if (typeof q !== "string") return q;
  /* 056: the parties step now has a box for other details. */
  if (q.trim() === "Who are the parties? Just provide each person’s or organisation’s name.") {
    return "Who are the parties? Their names are enough — add any other details (an address, a registration number, who will sign) in the box below if you want them in the NDA.";
  }
  return q.replace("sensible Singapore defaults", "sensible defaults");
}

function fromRow(row: DocTypeRow): DocType {
  const rowExamples = row.examples ?? [];
  const fields = (row.fields ?? [])
    .filter((f) => !RETIRED_FIELD_KEYS.has(f.key))
    .filter((f) => row.slug !== "nda" || !RETIRED_NDA_KEYS.has(f.key))
    /* 057/058: the box under the party names shows a short hint, not an
       example that read as if it were already filled in. */
    .map((f) =>
      row.slug === "nda" && f.key === "party_extra" && (!f.placeholder || /^e\.g\./i.test(f.placeholder))
        ? { ...f, placeholder: "Provide more information about the parties for the draft (optional)" }
        : f,
    )
    .map((field) => {
      if (row.slug !== "nda") return field;
      if (field.key === "party_a") {
        return {
          ...field,
          label: "Your name or organisation name",
          placeholder: "Meridian Logistics",
        };
      }
      /* 060: clearer wording, before the SQL that stores it is run. */
      if (field.key === "ip_assignment") {
        return { ...field, label: "Do you own the rights to anything created using the information you provide?" };
      }
      if (field.key === "survival_years") {
        return { ...field, label: "How long must information stay confidential after the agreement ends? (years)" };
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
  /* 056: the optional box for other party details. Added here when the
     database form predates it, so the question appears before the SQL is
     run; after it, the database copy (which an admin may have reworded) is
     the one used. */
  if (row.slug === "nda" && !fields.some((f) => f.key === "party_extra")) {
    const extra = DOC_TYPES.find((d) => d.slug === "nda")?.fields.find((f) => f.key === "party_extra");
    const at = fields.findIndex((f) => f.key === "party_b");
    if (extra && at >= 0) fields.splice(at + 1, 0, extra);
  }
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
  if ((row.fields ?? []).some((f) => retiredFieldKeys(row.slug).has(f.key))) {
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
    ? row.groups
        .filter((g): g is Group => Boolean(g) && typeof g.name === "string" && g.name.trim().length > 0)
        /* The NDA is no longer tied to Singapore (054). */
        .map((g) => ({ ...g, question: tidyStepQuestion(g.question) }))
    : [];

  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    fields,
    groups: groups.length > 0 ? groups : undefined,
    systemPrompt,
    examples: rowExamples.length > 0 ? rowExamples : (EXAMPLES_BY_SLUG[row.slug] ?? []),
    engine: row.engine === "assembly" ? "assembly" : "chat",
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
      .select("slug,label,description,fields,groups,system_prompt,examples,engine")
      .eq("is_active", true)
      .order("label");
    /* `engine` arrives with 048. Before it, every type is drafted by chat. */
    if (res.error && /engine/.test(res.error.message)) {
      res = await supabase
        .from("doc_types")
        .select("slug,label,description,fields,groups,system_prompt,examples")
        .eq("is_active", true)
        .order("label");
    }
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

    /* ── AND THE LESSONS ──────────────────────────────────────────────────
       Feedback the firm turned into rules (045). Missing RPC: none. */
    await Promise.all(
      docTypes.map(async (docType) => {
        const { data: rows, error: lErr } = await supabase.rpc("lessons_for", { p_slug: docType.slug });
        if (lErr) {
          if (!/lessons_for/.test(lErr.message)) {
            console.error(`[doctypes] could not read the lessons for "${docType.slug}":`, lErr.message);
          }
          return;
        }
        const lessons = ((rows ?? []) as { rule: string }[]).map((r) => r.rule.trim()).filter(Boolean);
        if (lessons.length > 0) docType.lessons = lessons;
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

/**
 * The catalogue as the BROWSER may have it.
 *
 * The screen needs the questions and the labels. It does not need the
 * system prompt, the firm's worked examples or the playbook — and with
 * /draft open to visitors, anything in the page's React payload is on a
 * public page. So those three are blanked before the catalogue leaves the
 * server; /api/generate reads them for itself. The look of the page — face
 * and size, read from the playbook — travels as two small values per type.
 */
export function forTheBrowser(docTypes: DocType[]): {
  docTypes: DocType[];
  looks: Record<string, DocumentLook>;
} {
  return {
    docTypes: docTypes.map((d) => ({
      slug: d.slug,
      label: d.label,
      description: d.description,
      fields: d.fields,
      groups: d.groups,
      systemPrompt: "",
      examples: [],
      engine: d.engine,
    })),
    looks: Object.fromEntries(
      docTypes.map((d) => {
        const rules = d.playbook ?? [];
        const own = rules.filter((r) => r.title !== "Firm-wide playbook").map((r) => r.text);
        const firm = rules.filter((r) => r.title === "Firm-wide playbook").map((r) => r.text);
        return [d.slug, documentLook([...own, ...firm])];
      }),
    ),
  };
}
