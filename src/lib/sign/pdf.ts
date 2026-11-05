import "server-only";
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Envelope, SignEvent, SignField, Signer } from "./store";

/**
 * The signed PDF: the original pages with each signature stamped into its
 * box ON THE LINE (113: boxes placed by Founders Doc, drag-and-resize), then
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
  reminded: "Reminder sent",
  code_sent: "Email code sent",
  code_verified: "Email code confirmed",
  code_locked: "Code locked after 5 wrong tries",
  voided: "Request cancelled by Founders Doc",
  copy_sent: "Signed copy sent (CC)",
};

function wrap(text: string, font: PDFFont, size: number, width: number, t: (s: string) => string = pdfText): string[] {
  const out: string[] = [];
  for (const para of t(text).split("\n")) {
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
  fields?: SignField[];
  /** false = the signed document only (e.g. the certificate), without the audit trail page */
  audit?: boolean;
  /** fonts with full accents (Liberation Sans / Serif Italic); without them, the standard fonts drop accents */
  fontBytes?: { regular: Uint8Array; bold: Uint8Array; script: Uint8Array } | null;
}): Promise<Uint8Array> {
  const { envelope, signers, pngs, events } = input;
  const fields = input.fields ?? [];
  const doc = await PDFDocument.load(input.original, { ignoreEncryption: true });
  const fb = input.fontBytes;
  if (fb) doc.registerFontkit(fontkit);
  const font = fb ? await doc.embedFont(fb.regular, { subset: true }) : await doc.embedFont(StandardFonts.Helvetica);
  const bold = fb ? await doc.embedFont(fb.bold, { subset: true }) : await doc.embedFont(StandardFonts.HelveticaBold);
  const script = fb ? await doc.embedFont(fb.script, { subset: true }) : await doc.embedFont(StandardFonts.TimesRomanItalic);
  /* with full fonts keep accents (e.g. Vietnamese names); otherwise reduce to what the standard fonts can draw */
  const T = fb ? (v: string) => v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "") : pdfText;
  const first = doc.getPage(0);
  const { width: W, height: H } = first.getSize();
  const M = 56;
  const ink = rgb(0.06, 0.06, 0.06);
  const grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.84, 0.84, 0.82);
  const gold = rgb(0.95, 0.75, 0.29);

  const footer = (p: PDFPage, label: string) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: line });
    p.drawText(T(`FD Sign by Founders Doc  ·  ${label}  ·  Envelope ${envelope.id}`), { x: M, y: 26, size: 7.5, font, color: grey });
  };
  const header = (p: PDFPage, title: string) => {
    p.drawRectangle({ x: M, y: H - M - 4, width: 46, height: 18, color: rgb(0.09, 0.09, 0.09) });
    p.drawText("FD SIGN", { x: M + 6, y: H - M + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    p.drawText(T(title), { x: M, y: H - M - 34, size: 18, font: bold, color: ink });
    p.drawText(T(envelope.title), { x: M, y: H - M - 52, size: 10, font, color: grey });
    p.drawRectangle({ x: M, y: H - M - 62, width: 40, height: 2.5, color: gold });
    return H - M - 86;
  };

  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  for (const s of signers) {
    const png = pngs.get(s.id);
    if (s.status === "signed" && s.signature_kind === "draw" && png) images.set(s.id, await doc.embedPng(png));
  }
  const blue = rgb(0.05, 0.1, 0.35);
  const pageCount = doc.getPageCount();

  /* A signature fitted into a rectangle (PDF points, bottom-left origin). */
  const drawSignature = (p: PDFPage, s: Signer, x: number, y: number, w: number, h: number) => {
    const img = images.get(s.id);
    if (img) {
      const scale = Math.min(w / img.width, h / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      p.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
    } else {
      const text = T(s.typed_name || s.name);
      let size = Math.min(h * 0.72, 30);
      while (size > 6 && script.widthOfTextAtSize(text, size) > w) size -= 0.5;
      p.drawText(text, { x: x + (w - script.widthOfTextAtSize(text, size)) / 2, y: y + (h - size) / 2 + size * 0.22, size, font: script, color: blue });
    }
  };
  const drawLineText = (p: PDFPage, text: string, x: number, y: number, w: number, h: number) => {
    const t = T(text);
    let size = Math.min(h * 0.6, 11);
    while (size > 5 && font.widthOfTextAtSize(t, size) > w) size -= 0.5;
    p.drawText(t, { x, y: y + (h - size) / 2 + size * 0.2, size, font, color: ink });
  };

  /* ── stamp each signed box on its page ──────────────────────────────── */
  const placed = new Set<number>();
  for (const f of fields) {
    const s = signers.find((x) => x.position === f.position);
    if (!s || s.status !== "signed" || f.page < 1 || f.page > pageCount) continue;
    const p = doc.getPage(f.page - 1);
    const { width: pw, height: ph } = p.getSize();
    const x = f.x * pw;
    const w = f.w * pw;
    const h = f.h * ph;
    const y = ph - (f.y + f.h) * ph;
    if (f.kind === "signature") {
      drawSignature(p, s, x, y, w, h);
      placed.add(s.position);
    } else if (f.kind === "date") {
      drawLineText(p, sgt(s.signed_at).replace(/, \d\d:\d\d:\d\d SGT$/, ""), x, y, w, h);
    } else if (f.kind === "initials") {
      /* initials from the name they signed with, in the signature style */
      const ini = T(s.typed_name || s.name)
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase())
        .join("")
        .slice(0, 4);
      let size = Math.min(h * 0.72, 24);
      while (size > 6 && script.widthOfTextAtSize(ini, size) > w) size -= 0.5;
      p.drawText(ini, { x: x + (w - script.widthOfTextAtSize(ini, size)) / 2, y: y + (h - size) / 2 + size * 0.22, size, font: script, color: blue });
    } else if (f.kind === "text") {
      if (f.value) drawLineText(p, f.value, x, y, w, h);
    } else if (f.kind === "checkbox") {
      const sq = Math.min(w, h);
      const bx = x + (w - sq) / 2, by = y + (h - sq) / 2;
      p.drawRectangle({ x: bx, y: by, width: sq, height: sq, borderColor: grey, borderWidth: 0.6 });
      if (f.value === "yes") {
        const t = Math.max(0.9, sq * 0.12);
        p.drawLine({ start: { x: bx + sq * 0.2, y: by + sq * 0.52 }, end: { x: bx + sq * 0.42, y: by + sq * 0.26 }, thickness: t, color: blue });
        p.drawLine({ start: { x: bx + sq * 0.42, y: by + sq * 0.26 }, end: { x: bx + sq * 0.82, y: by + sq * 0.8 }, thickness: t, color: blue });
      }
    } else {
      drawLineText(p, s.name, x, y, w, h);
    }
  }

  if (input.audit === false) return doc.save();

  /* ── audit trail ──────────────────────────────────────────────────── */
  let page = doc.addPage([W, H]);
  let y = header(page, "Audit trail");
  const facts: Array<[string, string]> = [
    ["Document", envelope.file_name],
    ["Envelope ID", envelope.id],
    ["Original SHA-256", envelope.original_sha256],
    ["Pages in original", String(envelope.page_count ?? "-")],
    ["Sent", sgt(envelope.created_at)],
    ["Completed", sgt(envelope.completed_at)],
    ["Status", envelope.status === "completed" ? "Completed - all parties signed" : "In progress"],
    [
      "How signed",
      events.some((e) => e.event === "code_verified")
        ? "Each signer opened a private link sent to their email, confirmed a one-time code sent to that email, agreed to sign electronically, and signed (s 8 Electronic Transactions Act 2010, Singapore). Signatures are on the document's signature lines."
        : "Each signer opened a private link, agreed to sign electronically, and signed (s 8 Electronic Transactions Act 2010, Singapore). Signatures are on the document's signature lines.",
    ],
  ];
  for (const [k, v] of facts) {
    page.drawText(T(k), { x: M, y, size: 8.5, font: bold, color: grey });
    const lines = wrap(v, font, 9, W - 2 * M - 120, T);
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
    page.drawText(T(sgt(e.at)), { x: cols[0], y, size: 8, font, color: ink });
    page.drawText(T(EVENT_TEXT[e.event] ?? e.event).slice(0, 48), { x: cols[1], y, size: 8, font, color: ink });
    page.drawText(T(who ? `${who.name} (${who.role})` : e.detail ?? "Founders Doc").slice(0, 34), { x: cols[2], y, size: 8, font, color: ink });
    page.drawText(T(e.ip ?? "-").slice(0, 40), { x: cols[3], y, size: 8, font, color: ink });
    if (e.user_agent) {
      y -= 10;
      page.drawText(T(e.user_agent).slice(0, 140), { x: cols[1], y, size: 6.5, font, color: grey });
    }
    y -= 15;
  }
  /* Anyone who signed but had no box on the document: their signature here. */
  const unplaced = signers.filter((s) => s.status === "signed" && !placed.has(s.position));
  if (unplaced.length) {
    y -= 10;
    if (y < 150) {
      footer(page, "Audit trail");
      page = doc.addPage([W, H]);
      y = header(page, "Audit trail (continued)");
    }
    page.drawText("Signatures", { x: M, y, size: 9, font: bold, color: grey });
    y -= 12;
    const colW = (W - 2 * M - 24) / 2;
    unplaced.forEach((s, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y -= 84;
      if (col === 0 && y < 110) {
        footer(page, "Audit trail");
        page = doc.addPage([W, H]);
        y = header(page, "Audit trail (continued)");
      }
      const x = M + col * (colW + 24);
      drawSignature(page, s, x, y - 44, Math.min(colW, 220), 40);
      page.drawLine({ start: { x, y: y - 46 }, end: { x: x + Math.min(colW, 220), y: y - 46 }, thickness: 0.6, color: ink });
      page.drawText(T(`${s.name} (${s.role})`), { x, y: y - 58, size: 8.5, font: bold, color: ink });
      page.drawText(T(`Signed ${sgt(s.signed_at)}`), { x, y: y - 70, size: 8, font, color: grey });
    });
  }
  footer(page, "Audit trail");

  return doc.save();
}
