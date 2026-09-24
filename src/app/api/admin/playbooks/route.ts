/**
 * The playbook, from the admin dashboard.
 *
 *   GET  ?scope=nda          the live version (with text) and the history
 *   GET  ?id=<uuid>          one version, with its text (to read or restore)
 *   POST multipart or JSON   save a new version and make it live
 *                            { scope, note, content } or { scope, note, file }
 *   PUT  { action:"restore", id } | { action:"retire", scope }
 *
 * Admin only. Every write goes through the SQL functions in 044, which check
 * admin again and keep exactly one version live per scope.
 *
 * ── A FILE BECOMES TEXT HERE ────────────────────────────────────────────────
 * As with the AI library: what the model needs is the words, and a file kept
 * on disk would be a second copy of an internal document to look after. Word
 * and PDF go through the same reader as sample documents; .md and .txt are
 * read as they are.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ExtractError, MAX_UPLOAD_BYTES, extractFromBuffer } from "@/lib/extract";
import { MAX_PLAYBOOK_CHARS, PLAYBOOK_COLUMNS, type PlaybookVersion } from "@/lib/playbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = /^(\*|[a-z0-9_-]{1,64})$/;

function missing(message: string): boolean {
  return /playbooks|save_playbook|restore_playbook|retire_playbook/.test(message) && /does not exist|not find|schema cache/i.test(message);
}

function fail(error: { message: string }, fallback: string, status = 500) {
  console.error("[playbooks]", error.message);
  return NextResponse.json(
    { error: missing(error.message) ? "The playbook table is missing — run supabase/044_playbook.sql." : fallback },
    { status },
  );
}

async function gate() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return null;
}

export async function GET(req: NextRequest) {
  const closed = await gate();
  if (closed) return closed;
  const supabase = await createClient();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("playbooks")
      .select(`${PLAYBOOK_COLUMNS},content`)
      .eq("id", id)
      .maybeSingle();
    if (error) return fail(error, "Could not read that version.");
    if (!data) return NextResponse.json({ error: "No such version." }, { status: 404 });
    return NextResponse.json({ version: data });
  }

  const scope = (req.nextUrl.searchParams.get("scope") ?? "").trim();
  if (!SCOPE.test(scope)) return NextResponse.json({ error: "Which playbook?" }, { status: 400 });

  const [{ data: versions, error: vErr }, { data: live, error: lErr }] = await Promise.all([
    supabase.from("playbooks").select(PLAYBOOK_COLUMNS).eq("scope", scope).order("version", { ascending: false }),
    supabase.from("playbooks").select(`${PLAYBOOK_COLUMNS},content`).eq("scope", scope).eq("live", true).maybeSingle(),
  ]);
  if (vErr) return fail(vErr, "Could not read the playbook.");
  if (lErr) return fail(lErr, "Could not read the playbook.");
  return NextResponse.json({
    live: (live as (PlaybookVersion & { content: string }) | null) ?? null,
    versions: (versions ?? []) as PlaybookVersion[],
  });
}

function ext(name: string): "pdf" | "docx" | "doc" | "txt" | "md" | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const e = (m?.[1] ?? "").toLowerCase();
  return e === "pdf" || e === "docx" || e === "doc" || e === "txt" || e === "md" ? e : null;
}

export async function POST(req: NextRequest) {
  const closed = await gate();
  if (closed) return closed;

  let scope = "";
  let note = "";
  let content = "";
  let filename: string | null = null;

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Expected an upload." }, { status: 400 });
    scope = String(form.get("scope") ?? "").trim();
    note = String(form.get("note") ?? "").trim();
    const pasted = String(form.get("content") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const e = ext(file.name);
      if (e === "doc") {
        return NextResponse.json(
          { error: "This is the old Word format — open it in Word, save it as .docx, and upload that." },
          { status: 400 },
        );
      }
      if (!e) return NextResponse.json({ error: "Only PDF, Word (.docx), Markdown and text files." }, { status: 400 });
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Larger than 10 MB." }, { status: 400 });
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        if (e === "txt" || e === "md") {
          content = buffer.toString("utf-8");
        } else {
          const out = await extractFromBuffer(buffer, file.name);
          if (out.warning) return NextResponse.json({ error: out.warning }, { status: 400 });
          content = out.text;
        }
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof ExtractError ? err.message : "Could not read this file." },
          { status: 400 },
        );
      }
      filename = file.name;
    } else {
      content = pasted;
    }
  } else {
    const body = (await req.json().catch(() => null)) as { scope?: unknown; note?: unknown; content?: unknown } | null;
    scope = typeof body?.scope === "string" ? body.scope.trim() : "";
    note = typeof body?.note === "string" ? body.note.trim() : "";
    content = typeof body?.content === "string" ? body.content : "";
  }

  if (!SCOPE.test(scope)) return NextResponse.json({ error: "Which playbook?" }, { status: 400 });
  content = content.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (content.length < 20) return NextResponse.json({ error: "The playbook is empty." }, { status: 400 });
  if (content.length > MAX_PLAYBOOK_CHARS) {
    return NextResponse.json(
      {
        error: `That is ${content.length.toLocaleString("en-GB")} characters; the playbook is read in full on every draft, so it is capped at ${MAX_PLAYBOOK_CHARS.toLocaleString("en-GB")}. Keep the rules, leave out the commentary.`,
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_playbook", {
    p_scope: scope,
    p_content: content,
    p_filename: filename,
    p_note: note || null,
  });
  if (error) return fail(error, "Could not save the playbook.");
  const row = data as PlaybookVersion & { content: string };
  return NextResponse.json({ ok: true, version: row });
}

export async function PUT(req: NextRequest) {
  const closed = await gate();
  if (closed) return closed;
  const body = (await req.json().catch(() => null)) as { action?: unknown; id?: unknown; scope?: unknown } | null;
  const supabase = await createClient();

  if (body?.action === "restore" && typeof body.id === "string") {
    const { data, error } = await supabase.rpc("restore_playbook", { p_id: body.id });
    if (error) return fail(error, "Could not restore that version.");
    return NextResponse.json({ ok: true, version: data as PlaybookVersion & { content: string } });
  }
  if (body?.action === "retire" && typeof body.scope === "string" && SCOPE.test(body.scope)) {
    const { error } = await supabase.rpc("retire_playbook", { p_scope: body.scope });
    if (error) return fail(error, "Could not switch the playbook off.");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
