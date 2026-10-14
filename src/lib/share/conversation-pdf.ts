/**
 * "Share": the drafting conversation as a PDF, built in the browser.
 *
 * Everything shared is already on the person's screen — their answers, the
 * conversation with FD AI and the points to fill in or check — so nothing is
 * sent to the server to make the file. pdf-lib is loaded only when Share is
 * pressed. The font is Geist (public/fonts, SIL Open Font License), embedded
 * so names with accents (Nguyễn) and the [●] blanks print as they appear.
 *
 * On a phone the file goes to the share sheet (WhatsApp, email …); on a
 * computer it is downloaded.
 */

export interface ShareTurn {
  who: "fd" | "me";
  text: string;
  label?: string;
  skipped?: boolean;
}

export interface ShareInput {
  /** "Loan Agreement". */
  docLabel: string;
  /** The draft's name, or "New loan agreement". */
  title: string;
  turns: ShareTurn[];
  answers?: { label: string; value: string }[];
  points?: { title: string; detail?: string }[];
}

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const INK = hex("#161616");
const MUTED = hex("#6b6b6b");
const RULE = hex("#e4e4e4");
const GOLD = hex("#f3bf4b");
const GOLD_DEEP = hex("#8a5b00");
const GOLD_TINT = hex("#fff6dd");
const GREY = hex("#f4f4f5");

const A4: [number, number] = [595.28, 841.89];
const M = 48; // page margin
const FOOT = 34; // space kept for the footer

export function fileNameFor(title: string): string {
  const plain = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"));
  const base = plain.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "FD-AI";
  return `${base}-conversation.pdf`;
}

export async function buildConversationPdf(input: ShareInput): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const [regBytes, boldBytes] = await Promise.all(
    ["/fonts/Geist-Regular.ttf", "/fonts/Geist-SemiBold.ttf"].map((u) => fetch(u).then((r) => {
      if (!r.ok) throw new Error(`font ${u}: ${r.status}`);
      return r.arrayBuffer();
    })),
  );

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(regBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  pdf.setTitle(`${input.title} — conversation with FD AI`);
  pdf.setAuthor("FD AI · Founders Doc");
  pdf.setCreator("FD AI (foundersdoc.com)");

  /* Characters the font cannot draw (an emoji, say) become nothing rather
     than a box; tabs and odd spaces become plain spaces. */
  const known = new Set(reg.getCharacterSet());
  const clean = (t: string) =>
    Array.from((t ?? "").normalize("NFC").replace(/[\t   ]/g, " ").replace(/\r/g, ""))
      .map((ch) => (ch === "\n" || known.has(ch.codePointAt(0) ?? 0) ? ch : ch === "✓" ? "•" : ""))
      .join("");

  type Font = typeof reg;
  const wrap = (text: string, font: Font, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      if (!para.trim()) {
        out.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/ +/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= width) {
          line = tryLine;
          continue;
        }
        if (line) out.push(line);
        /* A word longer than the line (a URL) is broken where it must be. */
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      out.push(line);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  };

  let page = pdf.addPage(A4);
  let y = A4[1] - M;
  const color = (c: Rgb) => rgb(c[0], c[1], c[2]);
  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };
  const need = (h: number) => {
    if (y - h < M + FOOT) newPage();
  };
  const text = (t: string, x: number, size: number, font: Font, c: Rgb) => page.drawText(t, { x, y, size, font, color: color(c) });

  /* ── heading ── */
  text("FOUNDERS DOC", M, 9, bold, INK);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  page.drawText(clean(date), { x: A4[0] - M - reg.widthOfTextAtSize(clean(date), 9), y, size: 9, font: reg, color: color(MUTED) });
  y -= 30;
  for (const l of wrap("Conversation with FD AI", bold, 20, A4[0] - 2 * M)) {
    text(l, M, 20, bold, INK);
    y -= 24;
  }
  /* "Loan Agreement — Northwind" already says which document it is. */
  const sub = !input.title || input.title === input.docLabel
    ? input.docLabel
    : input.title.toLowerCase().includes(input.docLabel.toLowerCase())
      ? input.title
      : `${input.docLabel} · ${input.title}`;
  for (const l of wrap(sub, reg, 11, A4[0] - 2 * M)) {
    text(l, M, 11, reg, MUTED);
    y -= 15;
  }
  y -= 6;
  page.drawRectangle({ x: M, y, width: 56, height: 3, color: color(GOLD) });
  y -= 26;

  /* A heading is never left alone at the foot of a page: it needs room for
     what follows it too. */
  const section = (title: string, after = 60) => {
    need(26 + after);
    text(title.toUpperCase(), M, 9, bold, GOLD_DEEP);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: color(RULE) });
    y -= 18;
  };

  /* ── the answers ── */
  const answers = (input.answers ?? []).filter((a) => a.value && a.value.trim());
  if (answers.length) {
    section("Your answers");
    const labelW = 150;
    const valueW = A4[0] - 2 * M - labelW - 12;
    for (const a of answers) {
      const ll = wrap(a.label, reg, 9, labelW);
      const vl = wrap(a.value, reg, 10, valueW);
      const h = Math.max(ll.length * 12, vl.length * 13.5) + 8;
      need(h);
      const top = y;
      ll.forEach((l, i) => page.drawText(l, { x: M, y: top - i * 12, size: 9, font: reg, color: color(MUTED) }));
      vl.forEach((l, i) => page.drawText(l, { x: M + labelW + 12, y: top - i * 13.5, size: 10, font: reg, color: color(INK) }));
      y = top - h;
      page.drawLine({ start: { x: M, y: y + 5 }, end: { x: A4[0] - M, y: y + 5 }, thickness: 0.4, color: color(RULE) });
      y -= 6;
    }
    y -= 10;
  }

  /* ── the conversation ── */
  const turns = input.turns.filter((t) => t.text && t.text.trim());
  if (turns.length) {
    section("Conversation", 70);
    const bubbleW = (A4[0] - 2 * M) * 0.74;
    const pad = 10;
    const lh = 14;
    for (const t of turns) {
      const mine = t.who === "me";
      const head = mine ? (t.label ? t.label.toUpperCase() : "YOU") : "FD AI";
      let lines = wrap(t.text, reg, 10, bubbleW - 2 * pad);
      const x = mine ? A4[0] - M - bubbleW : M;
      /* A long message continues on the next page, a page at a time. */
      let first = true;
      while (lines.length) {
        const room = Math.floor((y - (M + FOOT) - 2 * pad - (first ? 14 : 0)) / lh);
        if (room < 2) {
          newPage();
          continue;
        }
        const chunk = lines.slice(0, room);
        lines = lines.slice(room);
        const h = 2 * pad + (first ? 14 : 0) + chunk.length * lh - 4;
        page.drawRectangle({ x, y: y - h, width: bubbleW, height: h, color: color(mine ? GOLD_TINT : GREY), borderColor: color(mine ? GOLD : RULE), borderWidth: 0.6 });
        let ty = y - pad - 8;
        if (first) {
          page.drawText(head, { x: x + pad, y: ty, size: 7.5, font: bold, color: color(mine ? GOLD_DEEP : MUTED) });
          ty -= 14;
        }
        for (const l of chunk) {
          page.drawText(l, { x: x + pad, y: ty, size: 10, font: reg, color: color(t.skipped ? MUTED : INK) });
          ty -= lh;
        }
        y -= h + 8;
        first = false;
      }
    }
    y -= 6;
  }

  /* ── things to fill in or check ── */
  const points = input.points ?? [];
  if (points.length) {
    section(points.length === 1 ? "One thing to fill in or check" : `${points.length} things to fill in or check`);
    points.forEach((p, i) => {
      const tl = wrap(p.title, bold, 10, A4[0] - 2 * M - 22);
      const dl = p.detail ? wrap(p.detail, reg, 9, A4[0] - 2 * M - 22) : [];
      need(tl.length * 14 + dl.length * 12.5 + 10);
      page.drawCircle({ x: M + 7, y: y + 3.5, size: 7, color: color(GOLD) });
      const n = String(i + 1);
      page.drawText(n, { x: M + 7 - bold.widthOfTextAtSize(n, 7.5) / 2, y: y + 0.8, size: 7.5, font: bold, color: color(INK) });
      for (const l of tl) {
        text(l, M + 22, 10, bold, INK);
        y -= 14;
      }
      for (const l of dl) {
        need(14);
        text(l, M + 22, 9, reg, MUTED);
        y -= 12.5;
      }
      y -= 8;
    });
  }

  /* ── footer on every page ── */
  const pages = pdf.getPages();
  const foot = clean("Shared from FD AI · foundersdoc.com · General information, not legal advice. Have a lawyer check any agreement before it is signed.");
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4[0] - M, y: M + 14 }, thickness: 0.5, color: color(RULE) });
    const footLines = wrap(foot, reg, 7.5, A4[0] - 2 * M - 70);
    footLines.forEach((l, k) => p.drawText(l, { x: M, y: M + 2 - k * 9.5, size: 7.5, font: reg, color: color(MUTED) }));
    const num = `Page ${i + 1} of ${pages.length}`;
    p.drawText(num, { x: A4[0] - M - reg.widthOfTextAtSize(num, 7.5), y: M + 2, size: 7.5, font: reg, color: color(MUTED) });
  });

  return pdf.save();
}

/** Build the PDF and hand it over: the share sheet on a phone, a download elsewhere. */
export async function shareConversation(input: ShareInput): Promise<"shared" | "downloaded" | "cancelled"> {
  const bytes = await buildConversationPdf(input);
  const name = fileNameFor(input.title || input.docLabel);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const file = new File([blob], name, { type: "application/pdf" });
  const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (phone && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${input.title} — conversation with FD AI` });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      /* Share sheet refused it: fall back to a download. */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
