/**
 * The document's typography, as numbers Word understands.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 * Every value here is a TRANSLATION of a rule in globals.css under
 * `.wd-pages .sheet` — the paginated preview the lawyer edits on screen. The
 * preview is the design; this file is Word's copy of it. When a size, colour
 * or gap changes in the CSS, it changes here in the same commit, or the
 * download stops matching the screen and somebody notices a fortnight later.
 *
 * Nothing in this file is a taste decision. If a number looks odd, find the
 * CSS rule it came from before changing it.
 *
 * ── UNITS ───────────────────────────────────────────────────────────────────
 * docx is fussy: font sizes in HALF-points, distances in TWIPS (1/20 pt),
 * line spacing in 240ths of a line, and border widths in EIGHTHS of a point.
 * The helpers below take points so that the numbers in this file can be
 * compared to the CSS by eye.
 */

/** Points → half-points, for font sizes. */
export const pt = (n: number) => Math.round(n * 2);
/** Points → twips, for indents, spacing and margins. */
export const tw = (n: number) => Math.round(n * 20);
/** A CSS line-height multiplier → docx line spacing (240 = single). */
export const lines = (n: number) => Math.round(n * 240);
/** CSS pixels → points, at the 96dpi the browser assumes. */
const px = (n: number) => n * 0.75;

/* Cambria and Calibri are the preview's first choices and ship with every
   copy of Word. The CSS falls back through Caladea/Georgia and Carlito/Aptos
   for machines without them; Word on such a machine substitutes on its own. */
/* Both faces are the ONE face the playbook names (lib/playbook.ts
   documentLook); these are the fallbacks when it names none. The export
   route overrides them per request. */
export const BODY_FONT = "Times New Roman";
export const HEAD_FONT = "Times New Roman";

/* --doc-ink, --doc-title, --doc-rule, --doc-head, --doc-muted, and the two
   greys written inline in the CSS. Word wants them without the '#'. */
export const INK = "1F1F1F";
/* Title, rule and headings were three blues. They are black now: the app
   adds no colour of its own to a document. */
export const TITLE = INK;
export const RULE = INK;
export const HEAD = INK;
export const MUTED = "595959";
export const NOTE_RULE = "D9D9D9";
export const END_NOTE = "8A8A8A";

/* .wd-pages .sheet.wd-page: 10.5pt, line-height 1.24, padding 64px 72px 72px. */
export const BODY_PT = 12;
export const BODY_LINE = lines(1.24);
export const PAGE = {
  // A4 in twips.
  width: 11906,
  height: 16838,
  margin: { top: tw(px(64)), right: tw(px(72)), bottom: tw(px(72)), left: tw(px(72)) },
} as const;

/* .wd-pages .sheet p: margin 0 0 8pt. */
export const PARA_AFTER = tw(8);

/* .doc-title: Calibri 14pt/1.2 bold, --doc-title, centred, 1.25px --doc-rule
   underneath with 3pt of air, 14pt after. 1.25px is 0.94pt; border sizes are
   in eighths of a point, so 8 (= 1pt) is the nearest Word can draw. */
/* No rule under the title any more; the border is kept as a named shape
   with zero width so the paragraph builder needs no special case. */
export const TITLE_STYLE = {
  size: pt(BODY_PT + 2),
  line: lines(1.2),
  after: tw(14),
  border: { size: 0, color: RULE, space: 0 },
} as const;

/* .doc-date: margin 0 0 10pt. */
export const DATE_AFTER = tw(10);

/* .doc-label: body font, bold, margin 10pt 0 6pt. */
export const LABEL = { before: tw(10), after: tw(6) } as const;

/* .doc-section: Calibri 10.5pt/1.25 bold, --doc-head, margin 12pt 0 2pt. */
export const SECTION = { size: pt(BODY_PT), line: lines(1.25), before: tw(12), after: tw(2) } as const;

/* .doc-party, .doc-recital, .doc-clause: flush left, number inline with .3em
   of air after it, margin 0 0 8pt. The air is a plain space in Word. */
export const CLAUSE_AFTER = tw(8);

/* .doc-subclause: a grid — 1.4em left margin, a 1.9em column for the number,
   the body beside it — margin 0 0 4pt. In Word that is a hanging indent: the
   number sits at the left margin, a tab carries the body to the hanging
   position, and wrapped lines align under the body. 1em is the body size. */
const em = BODY_PT;
export const SUBCLAUSE = {
  left: tw(1.4 * em + 1.9 * em),
  hanging: tw(1.9 * em),
  after: tw(4),
} as const;

/* .placeholder: an inline fill-in rule, min-width 7.5em, ink-coloured
   bottom border. Word has no "underlined gap", so it is underlined
   non-breaking spaces. 7.5em at 10.5pt is 79pt; a Cambria space is about
   2.7pt, so 29 of them. If the lawyer typed into the gap on screen, the text
   is underlined instead. */
/* Written as underscores (6pt each in a 12pt serif): 79pt is 13. */
export const PLACEHOLDER_WIDTH = 13;

/* .doc-notes-title: Calibri 10pt bold, --doc-head, 1px #d9d9d9 rule above
   with 8pt of air, margin 20pt 0 4pt. */
export const NOTES_TITLE = {
  size: pt(10),
  before: tw(20),
  after: tw(4),
  border: { size: 8, color: NOTE_RULE, space: 8 },
} as const;

/* .doc-note: 9.5pt/1.3, --doc-muted, a bullet hung 1.1em into the left
   padding, margin 0 0 5pt. */
export const NOTE = {
  size: pt(9.5),
  line: lines(1.3),
  after: tw(5),
  hanging: tw(1.1 * 9.5),
} as const;

/* .doc-end-note: Calibri 8.5pt, #8a8a8a, centred, margin 22pt 0 0. */
export const END_NOTE_STYLE = { size: pt(8.5), before: tw(22) } as const;

/* .doc-sign: margin 0 0 5pt; .doc-sign-head: margin 18pt 0 10pt; a blank in
   a signature block is 14em wide (.doc-sign .placeholder) — 28 underscores
   at 12pt. */
export const SIGN = { after: tw(5), headBefore: tw(18), headAfter: tw(10), blank: 28 } as const;

/* .wd-ftr: Calibri 8.5pt, #8a8a8a, centred, 30px above the foot of the page. */
export const FOOTER = { font: "Calibri", size: pt(8.5), distance: tw(px(30)) } as const;

/* ── THE FORMAL LAYOUT (0049) ────────────────────────────────────────────────
   The firm's contract layout, from the HitPay one-way NDA template. Each
   number is the Word side of a rule under `.wd-pages.fd-formal` in
   globals.css; change them together. */
export const FORMAL = {
  /* One inch all round (.sheet.wd-page padding:72pt). */
  page: { width: 11906, height: 16838, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  /* The half-inch column the numbers hang in (grid-template-columns:36pt). */
  step: 720,
  /* Signature blocks: two columns 36pt apart (column-gap:36pt), 40pt of
     room to sign above the rule (padding-top:40pt), a .75pt rule. */
  signGap: 720,
  signRoom: tw(40),
  signRule: { size: 6, space: 1 },
  /* Page numbers: 8pt, grey, centred, the footer 0.49in from the foot of
     the page as in the template (.wd-ftr bottom:35pt). */
  footer: { size: pt(8), color: "595959", distance: 708 },
} as const;
