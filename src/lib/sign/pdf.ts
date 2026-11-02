import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Envelope, SignEvent, Signer } from "./store";

/**
 * The signed PDF: the original pages, untouched, then
 *   - a SIGNATURE PAGE: each signer's signature (drawn image or typed name),
 *     name, role, email and the time they signed;
 *   - an AUDIT TRAIL page: every event (sent, viewed, signed, completed) with
 *     time, IP and browser, and the SHA-256 fingerprint of the original.
 * Built on request from what is stored, so the signed copy can always be
 * re-made and checked against the original's fingerprint.
 *
 * Standard PDF fonts cover Western European letters only, so other accents
 * are written without them (Hà Văn Thao -> Ha Van Thao) on these two pages.
 */

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Text the standard fonts can draw. */
export function pdfText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

const SGT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
export const sgt = (iso: string | null) => (iso ? `${SGT.format(new Date(iso))} SGT` : "-");

const EVENT_TEXT: Record<string, string> = {
  created: "Document created and sent for signing",
  invited: "Signing link sent",
  viewed: "Opened the document",
  signed: "Signed",
  completed: "All parties signed - completed",
  filed: "Signed copy filed on the ESOP dashboard",
  link: "New signing link issued",
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfText(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildSignedPdf(input: {
  original: Uint8Array;
  envelope: Envelope;
  signers: Signer[];
  pngs: Map<string, Uint8Array>;
  events: SignEvent[];
}): Promise<Uint8Array> {
  const { envelope, signers, pngs, events } = input;
  const doc = await PDFDocument.load(input.original, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const first = doc.getPage(0);
  const { width: W, height: H } = first.getSize();
  const M = 56;
  const ink = rgb(0.06, 0.06, 0.06);
  const grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.84, 0.84, 0.82);
  const gold = rgb(0.95, 0.75, 0.29);

  const footer = (p: PDFPage, label: string) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: line });
    p.drawText(pdfText(`FD Sign by Founders Doc  ·  ${label}  ·  Envelope ${envelope.id}`), { x: M, y: 26, size: 7.5, font, color: grey });
  };
  const header = (p: PDFPage, title: string) => {
    p.drawRectangle({ x: M, y: H - M - 4, width: 46, height: 18, color: rgb(0.09, 0.09, 0.09) });
    p.drawText("FD SIGN", { x: M + 6, y: H - M + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    p.drawText(pdfText(title), { x: M, y: H - M - 34, size: 18, font: bold, color: ink });
    p.drawText(pdfText(envelope.title), { x: M, y: H - M - 52, size: 10, font, color: grey });
    p.drawRectangle({ x: M, y: H - M - 62, width: 40, height: 2.5, color: gold });
    return H - M - 86;
  };

  /* ── signature page ───────────────────────────────────────────────── */
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  for (const s of signers) {
    const png = pngs.get(s.id);
    if (s.status === "signed" && s.signature_kind === "draw" && png) images.set(s.id, await doc.embedPng(png));
  }
  let page = doc.addPage([W, H]);
  let y = header(page, "Signature page");
  const colW = (W - 2 * M - 24) / 2;
  const boxH = 120;
  signers.forEach((s, i) => {
    const col = i % 2;
    if (col === 0 && i > 0) y -= boxH;
    if (col === 0 && y - boxH < 70) {
      footer(page, "Signature page");
      page = doc.addPage([W, H]);
      y = header(page, "Signature page (continued)");
    }
    const x = M + col * (colW + 24);
    const sigY = y - 62;
    page.drawText(pdfText(s.role.toUpperCase()), { x, y, size: 8, font: bold, color: grey });
    const img = images.get(s.id);
    if (img) {
      const scale = Math.min(colW / img.width, 46 / img.height, 1);
      page.drawImage(img, { x, y: sigY + 3, width: img.width * scale, height: img.height * scale });
    } else if (s.status === "signed") {
      page.drawText(pdfText(s.typed_name || s.name), { x, y: sigY + 9, size: 26, font: script, color: rgb(0.05, 0.1, 0.35) });
    } else {
      page.drawText("Not signed yet", { x, y: sigY + 10, size: 11, font, color: grey });
    }
    page.drawLine({ start: { x, y: sigY }, end: { x: x + colW, y: sigY }, thickness: 0.8, color: ink });
    page.drawText(pdfText(s.name), { x, y: sigY - 16, size: 10.5, font: bold, color: ink });
    page.drawText(pdfText(s.email), { x, y: sigY - 30, size: 8.5, font, color: grey });
    page.drawText(pdfText(s.status === "signed" ? `Signed ${sgt(s.signed_at)}` : "Waiting"), { x, y: sigY - 43, size: 8.5, font, color: grey });
  });
  y -= boxH;
  const note = wrap(
    "Each signer opened a private signing link, agreed to sign electronically and signed. " +
      "Electronic signatures: s 8 Electronic Transactions Act 2010 (Singapore). Details of each step are in the audit trail that follows.",
    font,
    8.5,
    W - 2 * M,
  );
  if (y - note.length * 12 < 56) {
    footer(page, "Signature page");
    page = doc.addPage([W, H]);
    y = header(page, "Signature page (continued)");
  }
  note.forEach((l, k) => page.drawText(l, { x: M, y: y - k * 12, size: 8.5, font, color: grey }));
  footer(page, "Signature page");

  /* ── audit trail ──────────────────────────────────────────────────── */
  page = doc.addPage([W, H]);
  y = header(page, "Audit trail");
  const facts: Array<[string, string]> = [
    ["Document", envelope.file_name],
    ["Envelope ID", envelope.id],
    ["Original SHA-256", envelope.original_sha256],
    ["Pages in original", String(envelope.page_count ?? "-")],
    ["Sent", sgt(envelope.created_at)],
    ["Completed", sgt(envelope.completed_at)],
    ["Status", envelope.status === "completed" ? "Completed - all parties signed" : "In progress"],
  ];
  for (const [k, v] of facts) {
    page.drawText(pdfText(k), { x: M, y, size: 8.5, font: bold, color: grey });
    const lines = wrap(v, font, 9, W - 2 * M - 120);
    lines.forEach((l, i) => page.drawText(l, { x: M + 120, y: y - i * 12, size: 9, font, color: ink }));
    y -= 14 + (lines.length - 1) * 12;
  }
  y -= 10;
  const cols = [M, M + 130, M + 330, M + 470];
  const head = ["Time (Singapore)", "Event", "By", "IP address"];
  head.forEach((t, i) => page.drawText(t, { x: cols[i], y, size: 8, font: bold, color: grey }));
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
  y -= 14;
  const byId = new Map(signers.map((s) => [s.id, s]));
  for (const e of events) {
    if (y < 70) {
      footer(page, "Audit trail");
      page = doc.addPage([W, H]);
      y = header(page, "Audit trail (continued)");
    }
    const who = e.signer_id ? byId.get(e.signer_id) : null;
    page.drawText(pdfText(sgt(e.at)), { x: cols[0], y, size: 8, font, color: ink });
    page.drawText(pdfText(EVENT_TEXT[e.event] ?? e.event).slice(0, 48), { x: cols[1], y, size: 8, font, color: ink });
    page.drawText(pdfText(who ? `${who.name} (${who.role})` : e.detail ?? "Founders Doc").slice(0, 34), { x: cols[2], y, size: 8, font, color: ink });
    page.drawText(pdfText(e.ip ?? "-").slice(0, 40), { x: cols[3], y, size: 8, font, color: ink });
    if (e.user_agent) {
      y -= 10;
      page.drawText(pdfText(e.user_agent).slice(0, 140), { x: cols[1], y, size: 6.5, font, color: grey });
    }
    y -= 15;
  }
  footer(page, "Audit trail");

  return doc.save();
}
