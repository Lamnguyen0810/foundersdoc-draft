import "server-only";
import { generateDraft } from "./ai/provider";
import { supabaseAdmin } from "./supabase/admin";
import { FIRM_WIDE } from "./playbook";

/**
 * The drafter learns from a piece of feedback.
 *
 * ── WHAT HAPPENS ────────────────────────────────────────────────────────────
 * A lawyer says what is wrong — from the Feedback button or in Slack. The
 * comment is put to the model with the draft it was about, the document
 * type, the live playbook and the rules already learnt, and the model is
 * asked for ONE precise rule in the firm's terms, or to say that the comment
 * is not a correction. A rule goes live at once (supabase/046 learn_lesson)
 * and Slack is told what was learnt; a non-correction is left for a person
 * with the model's reason.
 *
 * ── WHY THE DRAFT IS SHOWN ──────────────────────────────────────────────────
 * "Compelled Disclosure doesn't sound right" is only a rule once the model
 * can see that clause 4 is headed Compelled Disclosure and that the firm's
 * precedents say Required Disclosure. Without the draft the rule would be
 * a paraphrase of the complaint; with it, it is an instruction.
 *
 * ── WHAT IT MAY NOT DO ──────────────────────────────────────────────────────
 * Change a guardrail. The rule is a drafting rule — wording, structure,
 * emphasis, which clauses, how long — never "invent a registration number"
 * or "drop the four exceptions". The system prompt says so, and the
 * guardrails in lib/prompt.ts sit above lessons in any case.
 */

const MAX_DRAFT_CHARS = 24_000;
const MAX_PLAYBOOK_CHARS = 12_000;

interface FeedbackRow {
  id: string;
  draft_id: string | null;
  doc_type_slug: string | null;
  user_email: string | null;
  excerpt: string | null;
  message: string;
  status: string;
}

export interface LearnResult {
  learnt: boolean;
  rule?: string;
  scope?: string;
  reason?: string;
}

const SYSTEM = `You maintain the drafting rules of a law firm's document generator.

A lawyer at the firm has given feedback on a generated draft. Your job is to turn that feedback into ONE rule the generator will follow on every later draft, or to say that the feedback is not a correction.

Answer with JSON only, no prose, in this exact shape:
{"correction": true, "scope": "<document type slug or *>", "rule": "<one instruction, imperative, at most 60 words>", "reason": "<one short line>"}
or
{"correction": false, "reason": "<one short line: why no rule — e.g. praise, a question, unclear, already a rule>"}

RULES FOR THE RULE
- Write it as an instruction the generator can obey without seeing this conversation: name the clause, the term, the wording, the position. Prefer "Head clause 4 'Required Disclosure', never 'Compelled Disclosure'" to "fix the disclosure clause".
- Generalise only as far as the feedback supports. A complaint about one term is a rule about that term, not about all terms.
- Scope: the document type's slug when the feedback is about that kind of document; "*" only when it plainly applies to every document (spelling, a house term, a general habit).
- If the feedback quotes or points at a passage of the draft, read the draft and be specific about what should change.
- Never write a rule that invents facts, removes a legal protection, adds a non-compete, or contradicts a hard rule. If the feedback asks for that, answer correction:false and say why.
- If the same instruction is already in the playbook or the rules learnt, answer correction:false with reason "already a rule".
- British spelling.`;

function trim(s: string | null | undefined, max: number): string {
  const v = (s ?? "").trim();
  return v.length > max ? `${v.slice(0, max)}\n[…truncated]` : v;
}

export async function learnFromFeedback(feedbackId: string): Promise<LearnResult> {
  const db = supabaseAdmin();

  const { data: fb } = await db
    .from("draft_feedback")
    .select("id,draft_id,doc_type_slug,user_email,excerpt,message,status")
    .eq("id", feedbackId)
    .maybeSingle();
  const feedback = fb as FeedbackRow | null;
  if (!feedback || feedback.status !== "new") return { learnt: false, reason: "not new" };

  /* The draft it was about — by id, or the latest of its kind within two
     days when none was named ("the draft" in a Slack message). */
  let draftText = "";
  let draftLabel = "";
  let assumed = false;
  let slug = feedback.doc_type_slug;
  if (feedback.draft_id) {
    const { data: d } = await db
      .from("drafts")
      .select("output,doc_types(slug,label)")
      .eq("id", feedback.draft_id)
      .maybeSingle();
    const row = d as { output: string | null; doc_types: { slug: string; label: string } | { slug: string; label: string }[] | null } | null;
    const dt = Array.isArray(row?.doc_types) ? row?.doc_types[0] : row?.doc_types;
    draftText = row?.output ?? "";
    draftLabel = dt?.label ?? "";
    slug = slug ?? dt?.slug ?? null;
  } else {
    let typeId: string | null = null;
    if (slug) {
      const { data: t } = await db.from("doc_types").select("id").eq("slug", slug).maybeSingle();
      typeId = (t as { id: string } | null)?.id ?? null;
    }
    let q = db
      .from("drafts")
      .select("output,doc_types(slug,label)")
      .is("deleted_at", null)
      .not("output", "is", null)
      .gte("updated_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(1);
    if (typeId) q = q.eq("doc_type_id", typeId);
    const { data: rows } = await q;
    const row = (rows?.[0] ?? null) as { output: string | null; doc_types: { slug: string; label: string } | { slug: string; label: string }[] | null } | null;
    const dt = Array.isArray(row?.doc_types) ? row?.doc_types[0] : row?.doc_types;
    if (row?.output) {
      draftText = row.output;
      draftLabel = dt?.label ?? "";
      slug = slug ?? dt?.slug ?? null;
      assumed = true;
    }
  }

  const [{ data: playbook }, { data: lessons }, { data: types }] = await Promise.all([
    db.rpc("playbook_for", { p_slug: slug ?? FIRM_WIDE }),
    db.rpc("lessons_for", { p_slug: slug ?? FIRM_WIDE }),
    db.from("doc_types").select("slug,label").eq("is_active", true),
  ]);
  const playbookText = ((playbook ?? []) as { title: string; text: string }[])
    .map((p) => `--- ${p.title} ---\n${p.text}`)
    .join("\n\n");
  const learnt = ((lessons ?? []) as { rule: string }[]).map((l, i) => `${i + 1}. ${l.rule}`).join("\n");
  const catalogue = ((types ?? []) as { slug: string; label: string }[]).map((t) => `${t.slug} = ${t.label}`).join(", ");

  const user = [
    `DOCUMENT TYPES (slug = name): ${catalogue || "nda = Non-Disclosure Agreement"}`,
    `THIS FEEDBACK IS ABOUT: ${slug ? `${slug}${draftLabel ? ` (${draftLabel})` : ""}` : "not stated"}${assumed ? " — the draft below is ASSUMED to be the one meant; say so in the reason if the rule depends on it" : ""}`,
    "",
    `FEEDBACK from ${feedback.user_email ?? "a lawyer"}:`,
    feedback.message,
    ...(feedback.excerpt ? ["", "THE PASSAGE THEY HAD SELECTED:", feedback.excerpt] : []),
    "",
    "THE FIRM'S PLAYBOOK (live):",
    trim(playbookText, MAX_PLAYBOOK_CHARS) || "(none)",
    "",
    "RULES ALREADY LEARNT:",
    learnt || "(none)",
    "",
    "THE DRAFT:",
    trim(draftText, MAX_DRAFT_CHARS) || "(not available)",
  ].join("\n");

  let raw = "";
  try {
    const res = await generateDraft({ system: SYSTEM, user, maxTokens: 400, temperature: 0 });
    raw = res.text;
  } catch (err) {
    console.error("[learn] model call failed:", err);
    return { learnt: false, reason: "model unavailable" };
  }

  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { correction?: boolean; scope?: string; rule?: string; reason?: string } | null = null;
  try {
    parsed = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    await db.rpc("leave_for_a_person", { p_feedback: feedbackId, p_note: "FD AI could not read its own answer; a person should decide." });
    return { learnt: false, reason: "unparseable" };
  }

  if (!parsed.correction || !parsed.rule?.trim()) {
    const reason = (parsed.reason ?? "not a correction").trim().slice(0, 300);
    await db.rpc("leave_for_a_person", { p_feedback: feedbackId, p_note: `FD AI made no rule: ${reason}` });
    return { learnt: false, reason };
  }

  const known = new Set(((types ?? []) as { slug: string }[]).map((t) => t.slug));
  const scope = parsed.scope && known.has(parsed.scope) ? parsed.scope : (slug && known.has(slug) ? slug : FIRM_WIDE);
  const rule = parsed.rule.trim().slice(0, 2000);
  const { error } = await db.rpc("learn_lesson", {
    p_feedback: feedbackId,
    p_scope: scope,
    p_rule: rule,
    p_note: (parsed.reason ?? "").trim().slice(0, 300) || null,
  });
  if (error) {
    console.error("[learn] could not record the rule:", error.message);
    return { learnt: false, reason: "could not save" };
  }
  return { learnt: true, rule, scope, reason: parsed.reason };
}
