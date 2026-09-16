/**
 * The questions a user answers before the first draft — `doc_types.fields`
 * and `doc_types.groups` — and the draft of them that is not live yet.
 *
 * Three modes, one shape:
 *   save     — write {fields, groups} to `draft`. The form does not change.
 *   publish  — write them to `fields` and `groups`, which the form reads,
 *              and clear the draft. This is the only mode users notice.
 *   discard  — clear the draft; the editor goes back to what is live.
 *
 * Saved whole, as one payload, because the order is part of the meaning: the
 * form renders the steps in `groups` order and the questions in `fields`
 * order, and a partial update could not express "move this one up". Every
 * question and step is validated before anything is written: a half-saved
 * form is worse than an unsaved one.
 *
 * The row's own admin-write policy is what authorises the change; this route
 * checks first so the answer is a clean 404 rather than a policy error.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["text", "textarea", "select", "number", "date"]);

interface FieldIn {
  key?: unknown; label?: unknown; type?: unknown; required?: unknown;
  options?: unknown; help?: unknown; placeholder?: unknown; defaultValue?: unknown; group?: unknown;
}
interface GroupIn { name?: unknown; title?: unknown; question?: unknown }

type Mode = "save" | "publish" | "discard";

export async function PUT(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string; fields?: FieldIn[]; groups?: GroupIn[]; mode?: Mode;
  };
  const slug = String(body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Which document type?" }, { status: 400 });
  const mode: Mode = body.mode === "save" || body.mode === "discard" ? body.mode : "publish";

  const supabase = await createClient();

  if (mode === "discard") {
    const { data, error } = await supabase
      .from("doc_types")
      .update({ draft: null, draft_saved_at: null })
      .eq("slug", slug)
      .select("slug")
      .maybeSingle();
    if (error) return NextResponse.json({ error: explain(error.message) }, { status: 400 });
    if (!data) return NextResponse.json({ error: "No such document type." }, { status: 404 });
    return NextResponse.json({ ok: true, mode });
  }

  if (!Array.isArray(body.fields)) return NextResponse.json({ error: "No questions." }, { status: 400 });

  /* ── the questions ── */
  const seen = new Set<string>();
  const fields: { key: string; label: string; type: string; required: boolean; group: string; options?: string[]; help?: string; placeholder?: string; defaultValue?: string }[] = [];
  for (const [i, f] of body.fields.entries()) {
    const key = String(f.key ?? "").trim();
    const label = String(f.label ?? "").trim();
    const type = String(f.type ?? "text");
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) {
      return NextResponse.json({ error: `Question ${i + 1}: the key must be lower-case letters, digits and underscores.` }, { status: 400 });
    }
    if (seen.has(key)) return NextResponse.json({ error: `Two questions share the key "${key}".` }, { status: 400 });
    seen.add(key);
    if (!label) return NextResponse.json({ error: `Question ${i + 1} has no label.` }, { status: 400 });
    if (!TYPES.has(type)) return NextResponse.json({ error: `Question ${i + 1}: unknown type "${type}".` }, { status: 400 });
    const options = Array.isArray(f.options)
      ? f.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (type === "select" && (!options || options.length < 2)) {
      return NextResponse.json({ error: `"${label}" is a choice but has fewer than two options.` }, { status: 400 });
    }
    fields.push({
      key,
      label,
      type,
      required: Boolean(f.required),
      ...(options && type === "select" ? { options } : {}),
      ...(f.help ? { help: String(f.help).trim() } : {}),
      ...(f.placeholder ? { placeholder: String(f.placeholder).trim() } : {}),
      ...(f.defaultValue !== undefined && f.defaultValue !== "" ? { defaultValue: String(f.defaultValue) } : {}),
      group: String(f.group ?? "").trim() || "Details",
    });
  }

  /* ── the steps ──
     Every group a question names must be a step, and a step must be named
     once. A step with no questions is allowed while editing — the admin may
     be about to add them — but not published, since the form would show an
     empty page. */
  const groupsIn = Array.isArray(body.groups) ? body.groups : [];
  const names = new Set<string>();
  const groups: { name: string; title: string; question: string }[] = [];
  for (const [i, g] of groupsIn.entries()) {
    const name = String(g.name ?? "").trim();
    if (!name) return NextResponse.json({ error: `Step ${i + 1} has no name.` }, { status: 400 });
    if (names.has(name)) return NextResponse.json({ error: `Two steps share the name "${name}".` }, { status: 400 });
    names.add(name);
    groups.push({
      name,
      title: String(g.title ?? "").trim() || name,
      question: String(g.question ?? "").trim() || name,
    });
  }
  for (const f of fields) {
    if (!names.has(f.group)) {
      names.add(f.group);
      groups.push({ name: f.group, title: f.group, question: f.group });
    }
  }
  if (mode === "publish") {
    const empty = groups.filter((g) => !fields.some((f) => f.group === g.name));
    if (empty.length > 0) {
      return NextResponse.json(
        { error: `The step "${empty[0].title}" has no questions. Add one or remove the step before publishing.` },
        { status: 400 },
      );
    }
    if (fields.length === 0) return NextResponse.json({ error: "A form needs at least one question." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch =
    mode === "save"
      ? { draft: { fields, groups }, draft_saved_at: now }
      : { fields, groups, published_at: now, draft: null, draft_saved_at: null };

  let { data, error } = await supabase.from("doc_types").update(patch).eq("slug", slug).select("slug").maybeSingle();

  /* Before 017 there is no draft and no step order: a publish still writes
     the questions, as it always did; a save has nowhere to go and says so. */
  if (error && /draft|groups|published_at/.test(error.message)) {
    if (mode === "save") {
      return NextResponse.json({ error: "Saving a draft needs supabase/017_question_steps.sql to be run first. Publish still works." }, { status: 400 });
    }
    ({ data, error } = await supabase.from("doc_types").update({ fields }).eq("slug", slug).select("slug").maybeSingle());
  }

  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No such document type." }, { status: 404 });
  return NextResponse.json({ ok: true, mode, count: fields.length, steps: groups.length, at: now });
}

function explain(message: string): string {
  if (/draft|groups|published_at/.test(message)) return "Run supabase/017_question_steps.sql first.";
  return "Could not save the questions.";
}
