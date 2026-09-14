import { NextRequest } from "next/server";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import fs from "node:fs/promises";
import path from "node:path";
import { LETTERHEAD } from "@/lib/letterhead";
import { splitNotes } from "@/lib/prompt";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const PT = (n: number) => n * 2; // docx sizes are half-points
const FONT = LETTERHEAD.font;

function run(text: string, opts: { b?: boolean; i?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.b,
    italics: opts.i,
    font: FONT,
    size: opts.size ?? PT(LETTERHEAD.bodyPt),
    color: opts.color,
  });
}

/**
 * Turns the plain-text draft into Word paragraphs.
 *
 * The model is told to return numbered clauses as "1." and lettered sub-clauses
 * as "(a)", so those two shapes drive the indentation. Everything else is a
 * justified body paragraph. Deliberately simple: a clever parser that guesses
 * wrong is worse than a plain one a lawyer can fix in ten seconds.
 */
function bodyParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") continue;

    const isHeading = /^\d+\.\s+[A-Z][A-Z0-9 ,;'&\-/()]{2,}$/.test(line.trim());
    const isAllCapsHeading = /^[A-Z][A-Z0-9 ,;'&\-/()]{4,}$/.test(line.trim());
    const isSubClause = /^\d+\.\d+/.test(line.trim());
    const isLettered = /^\([a-z0-9ivx]+\)/.test(line.trim());
    const isSignature = /^(SIGNED|Signed|Name:|Title:|Date:|Signature:|By:|EXECUTED)/.test(
      line.trim(),
    );

    if (isHeading || isAllCapsHeading) {
      out.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [run(line.trim(), { b: true })],
        }),
      );
    } else if (isSubClause) {
      out.push(
        new Paragraph({
          spacing: { after: 140 },
          indent: { left: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: [run(line.trim())],
        }),
      );
    } else if (isLettered) {
      out.push(
        new Paragraph({
          spacing: { after: 140 },
          indent: { left: 720 },
          alignment: AlignmentType.JUSTIFIED,
          children: [run(line.trim())],
        }),
      );
    } else if (isSignature) {
      out.push(new Paragraph({ spacing: { after: 60 }, children: [run(line.trim())] }));
    } else {
      out.push(
        new Paragraph({
          spacing: { after: 160 },
          alignment: AlignmentType.JUSTIFIED,
          children: [run(line.trim())],
        }),
      );
    }
  }

  return out;
}

async function letterheadHeader(): Promise<Header> {
  const children: Paragraph[] = [];

  if (LETTERHEAD.logoFile) {
    try {
      const data = await fs.readFile(path.join(process.cwd(), "public", LETTERHEAD.logoFile));
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 80 },
          children: [
            new ImageRun({
              data,
              type: LETTERHEAD.logoFile.endsWith(".jpg") ? "jpg" : "png",
              transformation: { width: 150, height: 45 },
            }),
          ],
        }),
      );
    } catch {
      // No logo file: fall through to the text header. A missing image must never
      // break a download.
    }
  }

  if (children.length === 0) {
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [run(LETTERHEAD.firmName, { b: true, size: PT(16) })],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [run(LETTERHEAD.tagline, { size: PT(9), color: "666666" })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [
        run([...LETTERHEAD.addressLines, ...LETTERHEAD.contactLines].join("  ·  "), {
          size: PT(8),
          color: "666666",
        }),
      ],
    }),
  );

  return new Header({ children });
}

function footer(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run(`${LETTERHEAD.footer}    `, { size: PT(8), color: "888888" }),
          new TextRun({
            children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
            font: FONT,
            size: PT(8),
            color: "888888",
          }),
        ],
      }),
    ],
  });
}

function safeName(s: string): string {
  return (
    s
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "draft"
  );
}

export async function POST(req: NextRequest) {
  if (isSupabaseConfigured() && !(await getUser())) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  let body: { text?: string; title?: string; fileName?: string; includeNotes?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "There is nothing to export." }, { status: 400 });

  // The drafter's notes are for the lawyer, not the counterparty. Excluded by
  // default so a download can never accidentally send [[TO CONFIRM]] markers out.
  const { body: documentBody, notes } = splitNotes(text);
  const children = bodyParagraphs(documentBody);

  if (body.includeNotes && notes) {
    children.push(
      new Paragraph({
        spacing: { before: 400, after: 120 },
        children: [run("INTERNAL — DRAFTER'S NOTES (delete before sending)", { b: true, color: "B00020" })],
      }),
      ...bodyParagraphs(notes),
    );
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: PT(LETTERHEAD.bodyPt) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 portrait, DXA
            margin: { top: 1440, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        headers: { default: await letterheadHeader() },
        footers: { default: footer() },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const date = new Date().toISOString().slice(0, 10);
  const requestedName = body.fileName?.replace(/\.docx$/i, "");
  const filename = requestedName
    ? `${safeName(requestedName)}.docx`
    : `${safeName(body.title ?? "draft")}-${date}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
