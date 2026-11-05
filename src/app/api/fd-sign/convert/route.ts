import { NextRequest, NextResponse } from "next/server";
import { signAccount } from "@/lib/sign/account";
import { wordToBlocks } from "@/lib/sign/word";
import { blocksPdf } from "@/lib/sign/draft-pdf";
import { signFonts } from "@/lib/sign/certificate";

/**
 * POST /api/fd-sign/convert — a Word file (.docx, ≤ 10 MB) as a PDF to sign (0191).
 * multipart/form-data "file". Returns the PDF; the "x-fds-word" header (base64url JSON)
 * says how many pages and what was not kept (images, table layout).
 * Free and in-house: nothing leaves Founders Doc, and nothing is stored here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await signAccount())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Add the Word file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "The file is over 10 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  /* .docx is a zip ("PK"); the old .doc format is not */
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return NextResponse.json({ error: /\.doc$/i.test(file.name) ? "This is the old Word format (.doc). In Word choose File → Save as → .docx or PDF, then upload that." : "Please upload a Word file (.docx) or a PDF." }, { status: 415 });
  }
  try {
    const { blocks, warnings } = await wordToBlocks(bytes);
    if (!blocks.some((b) => b.text.trim().length > 1 || b.cols?.some((c) => c.some((l) => l.trim())))) return NextResponse.json({ error: "This Word file looks empty, or its text couldn't be read." }, { status: 422 });
    const title = file.name.replace(/\.docx$/i, "").slice(0, 200) || "Document";
    const fonts = await signFonts(req.nextUrl.origin).catch(() => null);
    const out = await blocksPdf({ title, blocks, fonts });
    const meta = Buffer.from(JSON.stringify({ title, pages: out.pages, warnings })).toString("base64url");
    return new NextResponse(Buffer.from(out.pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "x-fds-word": meta } });
  } catch (e) {
    console.error("[fd-sign] word convert failed:", e);
    return NextResponse.json({ error: "This Word file couldn't be read. Save it as PDF in Word, then upload the PDF." }, { status: 422 });
  }
}
