import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Server-side text extraction from an uploaded .docx or .pdf.
 *
 * Deliberately text-only: the binary is never stored. The extracted text goes
 * into `drafts.source_text` and nowhere else. That skips a Supabase Storage
 * bucket and its policies, and — more importantly — means no client file sits
 * in cloud storage while the firm is still on a free-tier API key. If you later
 * need the original file kept, add a Storage bucket and a `documents` row; the
 * extraction code here does not change.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ExtractResult {
  text: string;
  chars: number;
  kind: "docx" | "pdf";
  pages?: number;
  /** Set when the file parsed but yielded almost nothing — usually a scanned PDF. */
  warning?: string;
}

export class ExtractError extends Error {}

/** Detects type by magic bytes, not by the filename — an extension is a claim, not a fact. */
function sniff(bytes: Uint8Array): "docx" | "pdf" | "unknown" {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf"; // %PDF
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
    return "docx"; // PK.. — a ZIP, which .docx is
  }
  return "unknown";
}

function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractFromBuffer(buffer: Buffer, filename: string): Promise<ExtractResult> {
  if (buffer.byteLength === 0) throw new ExtractError("That file is empty.");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ExtractError(
      `That file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`,
    );
  }

  const kind = sniff(new Uint8Array(buffer.subarray(0, 8)));
  if (kind === "unknown") {
    throw new ExtractError(
      `"${filename}" is not a Word document or a PDF. FDAI reads .docx and .pdf only — ` +
        `for anything else, paste the text instead.`,
    );
  }

  if (kind === "docx") {
    let text: string;
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = tidy(result.value);
    } catch {
      throw new ExtractError(
        "That Word file could not be read. If it is an old .doc, save it as .docx first.",
      );
    }
    if (text.length < 40) {
      return {
        text,
        chars: text.length,
        kind,
        warning:
          "Almost no text was found. If the document is mostly images or text boxes, paste the relevant wording instead.",
      };
    }
    return { text, chars: text.length, kind };
  }

  // pdf
  let text: string;
  let pages: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const out = await extractText(pdf, { mergePages: true });
    pages = out.totalPages;
    text = tidy(Array.isArray(out.text) ? out.text.join("\n\n") : out.text);
  } catch {
    throw new ExtractError(
      "That PDF could not be read. If it is password-protected, remove the password and try again.",
    );
  }

  if (text.length < 40 * Math.max(pages, 1)) {
    return {
      text,
      chars: text.length,
      kind,
      pages,
      warning:
        "This looks like a scanned PDF — it contains images of text rather than text. " +
        "FDAI cannot read images yet, so please paste the relevant wording instead.",
    };
  }

  return { text, chars: text.length, kind, pages };
}
