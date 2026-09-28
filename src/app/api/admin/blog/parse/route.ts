import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cleanHtml, frontMatter, markdownToHtml, readMinutes, slugify, splitArticle, suggestLinks } from "@/lib/blog/html";

/**
 * An article file → its title, summary and body, for the admin to check
 * before publishing. Word (.docx), Markdown (.md), text (.txt) or a web page
 * (.html). Nothing is saved here; the file itself is never kept.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (isSupabaseConfigured() && !(await isAdmin())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose an article file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB." }, { status: 400 });

  const name = file.name || "article";
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  let raw = "";
  let meta: Record<string, string> = {};
  try {
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      /* Images inside the Word file are left out: the photo is uploaded on
         its own, sized for the page. */
      const res = await mammoth.convertToHtml(
        { buffer: buf },
        { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
      );
      raw = res.value;
    } else if (ext === "md" || ext === "markdown" || ext === "txt") {
      const fm = frontMatter(buf.toString("utf8"));
      meta = fm.data;
      raw = markdownToHtml(fm.rest);
    } else if (ext === "html" || ext === "htm") {
      const text = buf.toString("utf8");
      raw = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(text)?.[1] ?? text;
    } else {
      return NextResponse.json(
        { error: "Upload the article as a Word (.docx), Markdown (.md), text (.txt) or web page (.html) file." },
        { status: 400 },
      );
    }
  } catch (err) {
    console.error("[blog] could not read the article:", err);
    return NextResponse.json({ error: "That file could not be read. Is it a valid Word or text file?" }, { status: 400 });
  }

  const { title, deck, summary, body } = splitArticle(cleanHtml(raw));
  if (!body.trim()) return NextResponse.json({ error: "No article text was found in that file." }, { status: 400 });
  const fallbackTitle = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  const finalTitle = title || meta.title || fallbackTitle;
  return NextResponse.json({
    title: finalTitle,
    slug: slugify(meta.slug || finalTitle),
    deck: meta.meta_description || meta.description || deck,
    summary,
    heroAlt: meta.image_alt_text || meta.image_alt || "",
    body,
    readMinutes: readMinutes(body),
    suggestions: suggestLinks(body),
    sourceName: name,
  });
}
