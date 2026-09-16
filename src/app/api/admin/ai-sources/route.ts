/**
 * Upload sample documents into the AI source library.
 *
 * Multipart: one or more `files`, plus `docType`, `jurisdiction`, `folderId`
 * (or "" for unfiled) and `permitted` ("1" when the box was ticked).
 *
 * Text is extracted HERE, on the server, and only the text is stored. The
 * file itself is not kept: what the model needs is the words, and a file on
 * disk would be a second copy of a client document to protect.
 *
 * Every upload lands at status 'needs_review'. Nothing is sent to Gemini on
 * upload; it takes a human review and an approval, and the database refuses
 * to mark a source 'ready' otherwise.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ExtractError, MAX_UPLOAD_BYTES, extractFromBuffer } from "@/lib/extract";
import { scanPrivacy } from "@/lib/ai-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ext(name: string): "pdf" | "docx" | "doc" | "txt" | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const e = (m?.[1] ?? "").toLowerCase();
  return e === "pdf" || e === "docx" || e === "doc" || e === "txt" ? e : null;
}

/**
 * Anything that escapes the per-file handling below — a library that fails to
 * load on the server, an unexpected shape from Supabase — used to become a
 * bare 500, which the dashboard could only report as "Upload failed." The
 * reason belongs on the screen of the person who pressed the button, not
 * only in a log they have to go and find.
 */
export async function POST(req: NextRequest) {
  try {
    return await handleUpload(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-sources] upload crashed:", err);
    return NextResponse.json(
      { error: `The server could not process the upload: ${message}` },
      { status: 500 },
    );
  }
}

async function handleUpload(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const user = await getUser();
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });

  const docType = String(form.get("docType") ?? "").trim();
  const jurisdiction = String(form.get("jurisdiction") ?? "Singapore").trim() || "Singapore";
  const folderId = String(form.get("folderId") ?? "").trim() || null;
  const permitted = String(form.get("permitted") ?? "") === "1";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (!docType) return NextResponse.json({ error: "Choose a document type." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "No files were selected." }, { status: 400 });

  const supabase = await createClient();
  const results: {
    filename: string;
    ok: boolean;
    error?: string;
    flags?: Record<string, number>;
    /* The row as written, minus its text, so the table can show it without a
       second round trip to the server. */
    row?: Record<string, unknown>;
  }[] = [];

  for (const file of files) {
    const e = ext(file.name);
    if (!e) {
      results.push({ filename: file.name, ok: false, error: "Only PDF, Word and text files." });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({ filename: file.name, ok: false, error: "Larger than 10 MB." });
      continue;
    }

    let text = "";
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (e === "txt") {
        text = buffer.toString("utf-8");
      } else {
        const out = await extractFromBuffer(buffer, file.name);
        text = out.text;
        if (out.warning) {
          results.push({ filename: file.name, ok: false, error: out.warning });
          continue;
        }
      }
    } catch (err) {
      results.push({
        filename: file.name,
        ok: false,
        error: err instanceof ExtractError ? err.message : "Could not read this file.",
      });
      continue;
    }

    text = text.replace(/\r\n/g, "\n").trim();
    if (text.length < 200) {
      results.push({ filename: file.name, ok: false, error: "Almost no text in this file — is it a scan?" });
      continue;
    }

    const flags = scanPrivacy(text);
    const title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 200);

    const { data: row, error } = await supabase.from("ai_sources").insert({
      folder_id: folderId,
      doc_type_slug: docType,
      title: title || file.name,
      filename: file.name,
      file_ext: e,
      jurisdiction,
      privacy: "pending",
      privacy_flags: flags,
      status: "needs_review",
      permitted,
      content: text,
      bytes: Buffer.byteLength(text, "utf-8"),
      uploaded_by: user?.id ?? null,
      uploaded_by_email: user?.email ?? null,
    })
      .select(
        "id,folder_id,doc_type_slug,title,filename,file_ext,jurisdiction,version,privacy,privacy_flags,status,permitted,note,bytes,uploaded_by_email,reviewed_at,approved_at,created_at,updated_at",
      )
      .single();

    if (error) {
      console.error("[ai-sources] insert failed:", error.message);
      results.push({
        filename: file.name,
        ok: false,
        error: /doc_types|foreign key/i.test(error.message)
          ? "That document type is not in the catalogue."
          : /ai_sources/.test(error.message)
            ? "The library tables are missing — run supabase/014_ai_library.sql."
            : "Could not save.",
      });
      continue;
    }
    results.push({ filename: file.name, ok: true, flags, row: row ?? undefined });
  }

  const added = results.filter((r) => r.ok).length;
  return NextResponse.json({ added, results });
}
