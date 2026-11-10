import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { signAccount, startOfDaySgt } from "@/lib/sign/account";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { readFile, ReadError } from "@/lib/sign/ready/read";
import { detect, finish } from "@/lib/sign/ready/rules";
import { aiIssues } from "@/lib/sign/ready/ai";
import { locate } from "@/lib/sign/ready/locate";
import { wordToBlocks } from "@/lib/sign/word";
import { blocksPdf } from "@/lib/sign/draft-pdf";
import { signFonts } from "@/lib/sign/certificate";
import type { Line } from "@/lib/sign/ready/rules";

/**
 * POST /api/fd-sign/check   (multipart: file = PDF or .docx, up to 10 MB)
 *
 * FD Sign's signing-ready check (0201): is this document an execution version?
 * The checklist (lib/sign/ready/rules.ts, from the Execution-Readiness Playbook)
 * runs first, then the AI reads for what has no pattern. Answers the verdict and
 * the issues in reading order. The file is read in memory and never stored; the
 * log (SQL 125) keeps only codes, levels and places, never the document's words.
 *
 * 0204: each finding also carries a mark (page + box) so the report shows the whole
 * document with the problems marked on it. A Word file is set as a PDF the same way
 * FD Sign converts it for signing, and that PDF is returned as the preview (base64);
 * a PDF is previewed from the user's own copy in the browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 10 * 1024 * 1024;
const DAILY = 40;

export async function POST(req: NextRequest) {
  const me = await signAccount();
  if (!me) return NextResponse.json({ error: "Please sign in to check a document." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file in the form." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Add a PDF or Word file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "The file is over 10 MB." }, { status: 413 });

  const db = isAdminClientConfigured() ? supabaseAdmin() : null;
  if (db) {
    const today = await db.from("sign_checks").select("id", { count: "exact", head: true }).eq("owner_id", me.id).gte("created_at", startOfDaySgt());
    if (!today.error && (today.count ?? 0) >= DAILY) return NextResponse.json({ error: `You've checked ${DAILY} documents today. Please try again tomorrow.` }, { status: 429 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await readFile(bytes);
  } catch (e) {
    if (e instanceof ReadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[fd-sign check] read failed:", e);
    return NextResponse.json({ error: "This file could not be read. Export it again and retry." }, { status: 400 });
  }
  const rules = detect(doc);
  const stop = rules.verdict === "cannot_process";
  const ai = stop ? { issues: [], used: false as boolean, model: undefined as string | undefined } : await aiIssues(doc, rules.issues);
  const report = finish([...rules.issues, ...ai.issues], rules.expectedBlanks);

  /* 0204: where each finding sits on the page */
  let preview: { pdf: string; pages: number } | null = null;
  let placed: Line[] = doc.lines;
  if (doc.kind === "docx" && !stop) {
    try {
      const { blocks } = await wordToBlocks(bytes);
      const fonts = await signFonts(req.nextUrl.origin).catch(() => null);
      const out = await blocksPdf({ title: file.name.replace(/\.docx$/i, "").slice(0, 200) || "Document", blocks, fonts });
      placed = (await readFile(out.pdf)).lines;
      preview = { pdf: Buffer.from(out.pdf).toString("base64"), pages: out.pages };
    } catch (e) {
      console.error("[fd-sign check] Word preview failed; list only:", e instanceof Error ? e.message : e);
      placed = [];
    }
  }
  const issues = locate(report.issues, placed);
  const hash = createHash("sha256").update(bytes).digest("hex");

  let checkId: string | null = null;
  if (db) {
    const ins = await db
      .from("sign_checks")
      .insert({
        owner_id: me.id,
        owner_email: me.email,
        file_name: file.name.slice(0, 200),
        file_hash: hash,
        file_kind: doc.kind,
        pages: doc.pages,
        verdict: report.verdict,
        counts: report.counts,
        codes: report.issues.map((i) => ({ code: i.code, severity: i.severity, where: i.where, source: i.source })),
        ai_used: ai.used,
        detector: report.detector,
      })
      .select("id")
      .maybeSingle();
    if (ins.error) console.error("[fd-sign check] log failed (run supabase/125?):", ins.error.message);
    checkId = (ins.data as { id?: string } | null)?.id ?? null;
  }

  return NextResponse.json({
    ok: true,
    checkId,
    file: { name: file.name, kind: doc.kind, pages: doc.pages, size: file.size, hash },
    verdict: report.verdict,
    counts: report.counts,
    issues,
    preview,
    ai: { used: ai.used },
    detector: report.detector,
  });
}
