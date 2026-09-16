/**
 * The questions a user answers before the first draft — `doc_types.fields`.
 *
 * Saved whole, as one array, because the order is part of the meaning: the
 * form renders the questions in this order, grouped by `group`, and a partial
 * update could not express "move this one up". The row's own admin-write
 * policy is what authorises the change; this route checks first so the answer
 * is a clean 404 rather than a policy error.
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

export async function PUT(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { slug?: string; fields?: FieldIn[] };
  const slug = String(body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Which document type?" }, { status: 400 });
  if (!Array.isArray(body.fields)) return NextResponse.json({ error: "No questions." }, { status: 400 });

  /* Validate every question before saving any: a half-saved form is worse
     than an unsaved one. */
  const seen = new Set<string>();
  const fields = [];
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doc_types")
    .update({ fields })
    .eq("slug", slug)
    .select("slug")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not save the questions." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No such document type." }, { status: 404 });
  return NextResponse.json({ ok: true, count: fields.length });
}
