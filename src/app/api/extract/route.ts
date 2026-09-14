import { NextRequest } from "next/server";
import { ExtractError, MAX_UPLOAD_BYTES, extractFromBuffer } from "@/lib/extract";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (isSupabaseConfigured() && !(await getUser())) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return Response.json({ error: "Malformed upload." }, { status: 400 });
  }

  if (!file) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.` },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractFromBuffer(buffer, file.name);
    return Response.json({ ...result, filename: file.name });
  } catch (err) {
    if (err instanceof ExtractError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error("[/api/extract]", err);
    return Response.json(
      { error: "That file could not be read. Try another, or paste the text instead." },
      { status: 500 },
    );
  }
}
