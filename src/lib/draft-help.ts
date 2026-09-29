/**
 * Questions typed into the drafting chat, answered without leaving it.
 *
 * Someone halfway through the form types "what does residuals mean?" rather
 * than an answer. Before this, that sentence was saved as their answer. Now
 * it is recognised as a question and answered: first from what the form
 * already says about itself (the current question's help, every question's
 * label and help) and a short glossary of the terms an NDA form uses — free,
 * instant, and the same for a visitor as for a customer. Only what that
 * cannot answer goes to the model, and only for someone signed in (see
 * /api/ask). Nothing here is legal advice, and the answers say so where it
 * matters.
 */

import type { Field } from "./doctypes";
import { DETAIL_LABELS } from "./detail";
import { PERPETUAL, SKIP_LABEL, SOURCE_ATTACH, explainDirection, optionLabel } from "./explain";

/** Does this look like a question to us rather than an answer to ours? */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  return /^(what('?s| is| are| does| do| happens| if| about)|why\b|who\b|when\b|where\b|which\b|how\b|(can|could|would|should|will|do|does|did|is|are|am) (i|you|we|it|this|that|they|there)\b|explain|help\b|i don'?t (understand|know what)|not sure what|meaning of|define|tell me|give me|write me|show me)/i.test(
    t,
  );
}

/** Greetings, thanks and the like: answered kindly, never saved as an answer. */
export function smallTalk(text: string, docLabel: string): string | null {
  const t = text.trim().toLowerCase().replace(/[!.,\s]+$/g, "");
  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)( there)?( fd( ai)?)?$/.test(t)) {
    return `Hello! I’m here to help you draft your ${docLabel}. Answer the question below, or ask me about anything on the form.`;
  }
  if (/^(thanks|thank you|thx|cheers|great|ok(ay)?|cool|nice|got it|perfect)( (so much|a lot|fd( ai)?))?$/.test(t)) {
    return "You’re welcome. Carry on with the question below whenever you’re ready.";
  }
  return null;
}

/** What to say when a question has nothing to do with the document. */
export function offTopicAnswer(docLabel: string, onScreen?: string): string {
  return [
    `That isn’t related to drafting your ${docLabel}, so I can’t help with it here.`,
    "I can explain any question on this form or any term in the document.",
    onScreen ? `When you’re ready, carry on with: “${onScreen}”` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Can what was typed in the message box stand as the answer to the question
 * on screen? Only where there is exactly one place for it to go and it fits:
 * one typed field, a number for a number, or one of the offered choices. A
 * step with several boxes (the deal: purpose AND information) is answered in
 * its own boxes, so a sentence typed below is taken as something said to us,
 * not silently put into the last box.
 */
export function answerFor(text: string, fields: Field[]): { key: string; value: string } | null {
  const t = text.trim();
  if (!t || fields.length !== 1) return null;
  const f = fields[0];
  if (f.type === "number") return /^\d+(\.\d+)?$/.test(t) ? { key: f.key, value: t } : null;
  if (f.type === "select") {
    const hit = (f.options ?? []).find((o) => o.toLowerCase() === t.toLowerCase());
    return hit ? { key: f.key, value: hit } : null;
  }
  if (f.type === "text" || f.type === "textarea") return { key: f.key, value: t };
  return null;
}

/** Said about the question on screen, not about the law in general. */
function aboutThisQuestion(text: string): boolean {
  return /\b(this( question)?|that|it)\b.*\b(mean|means|meaning|for)\b|\bwhy (do|are) you ask|\bwhat (do|should) i (put|write|answer|choose|pick)|\bi don'?t understand\b|\bnot sure\b|\bwhich (one|option) should\b/i.test(
    text,
  );
}

interface Entry {
  words: RegExp;
  /** A sentence, or one built from the form — so that every choice, box
   *  and button it names is spelt exactly as the screen spells it. */
  answer: string | ((ctx: Pick<AskContext, "allFields">) => string);
}

/** A question on the form, by key. */
const fieldOf = (ctx: Pick<AskContext, "allFields">, key: string) => ctx.allFields.find((f) => f.key === key);
const q = (s: string) => `“${s}”`;
/* Words on the drafting screen, as they are written there (DraftChat). */
const GENERATE = "Generate draft";
const DOWNLOAD = "Download Word";

/* The terms the NDA form and its drafts use. Plain British English, general
   information, checked line by line (060). Order matters: the first entry
   whose words match is the answer. */
const GLOSSARY: Entry[] = [
  {
    words: /\b(mutual|one[- ]?way|unilateral|bilateral|direction)\b/i,
    answer: (ctx) => explainDirection(fieldOf(ctx, "nda_direction")),
  },
  {
    words: /\bresidual/i,
    answer:
      "A residuals clause would let the other side use general ideas and know-how its people remember from your information. It favours the side receiving the information, so FD AI’s NDA does not include one.",
  },
  {
    words: /\bperpetual|\btrade secrets?\b|\bfor ever\b|\bforever\b|no time limit/i,
    answer: `${q(PERPETUAL)} means the information must stay confidential with no time limit, even after the agreement ends. It suits trade secrets, such as a formula, source code or a valuable customer list. For most other information, a fixed number of years (two to five is common) is usual.`,
  },
  {
    words: /\bsurviv|after (it|the agreement) ends|how long .*(secret|confidential)|confidentiality period/i,
    answer: `The confidentiality period is how long the information must be kept confidential, counted from the date of the NDA: a number of years or months, or ${q(PERPETUAL)} for no time limit. Two to five years is common.`,
  },
  {
    words: /\bterm\b(?! ?sheet)|how long does the agreement last|\bduration\b/i,
    answer: `The NDA has one period: how long the confidentiality obligations last, counted from the date of the NDA. Type a number and choose ${q("Years")} or ${q("Months")}, or choose ${q(PERPETUAL)} for no time limit. Two to five years is common.`,
  },
  {
    words: /\b(owns?|ownership) (the )?(rights?|ip|work)\b|\bownership\b|intellectual property|\bip\b|rights to/i,
    answer: (ctx) =>
      `This asks whether anything the other side creates using your information (such as a design, a report or software) should belong to you. It is uncommon in an NDA, so choose ${q(optionLabel(fieldOf(ctx, "ip_assignment"), /^no\b/i, "No"))} unless it matters for your deal.`,
  },
  {
    words: /\bpersonal data|data protection|\bpdpa\b|\bgdpr\b/i,
    answer: (ctx) =>
      `Choose ${q(optionLabel(fieldOf(ctx, "personal_data"), /^yes\b/i, "Yes"))} if either side will share information about individuals, such as customer or employee details. A data protection clause is then added to the NDA.`,
  },
  {
    words: /\bpurpose\b|working on together/i,
    answer:
      "The purpose is the reason the information is being shared, for example “to discuss a possible distribution partnership”. The other side may use your information only for this purpose, so a specific description protects you better than a vague one.",
  },
  {
    words: /\bconfidential information\b|what (kind of )?information|information categor/i,
    answer:
      "List the kinds of information you expect to share, such as pricing, customer lists, financial figures, product plans or source code. The NDA uses this to define what is protected, so naming the real categories helps avoid disputes later.",
  },
  {
    words: /\b(party|parties|registration number|uen|address|who will sign|signatory)\b/i,
    answer: (ctx) => {
      const box = fieldOf(ctx, "party_extra")?.label;
      return `The names of the two sides are enough. If you want more in the NDA, such as a registered address, a registration number or the person who will sign, add it in the box under the names${box ? `, ${q(box)}` : ""}. Anything missing is marked in the draft for you to fill in later.`;
    },
  },
  {
    words: /\b(poach|non[- ]?solicit|solicit|staff|employees|hire|hiring)\b/i,
    answer:
      "FD AI’s NDA covers confidentiality only, so it does not include a non-solicitation clause (one that stops the other side hiring your staff or approaching your customers). Whether such a clause can be enforced depends on the country and the facts. If you need one, book a consultation with a Founders Doc lawyer.",
  },
  {
    words: /\bnon[- ]?compete|compet/i,
    answer:
      "FD AI never adds a non-compete clause to an NDA. Stopping someone from competing with you is a different kind of restriction that courts look at closely. If you need one, book a consultation with a Founders Doc lawyer.",
  },
  {
    words: /\b(governing law|jurisdiction|which law|which country|courts?)\b/i,
    answer: (ctx) =>
      `The NDA is not tied to one country. The governing-law clause is left blank for you to fill in: the country whose law applies to the NDA and whose courts would hear a dispute, usually where you are based. If you already know it, write it under ${q(fieldOf(ctx, "special_terms")?.label ?? "Anything else")} and it will be used.`,
  },
  {
    words: /\b(comprehensive|comprehensiveness|how long should|length|detail(ed)?|concise|standard|thorough|maximum)\b/i,
    answer: `Comprehensiveness sets how much detail the first NDA has, from ${q(DETAIL_LABELS[0])} (a short, plain version) to ${q(DETAIL_LABELS[DETAIL_LABELS.length - 1])} (the fullest, with detailed definitions and procedures). It changes the level of detail, not what is agreed. ${q(DETAIL_LABELS[2])} suits most deals.`,
  },
  {
    words: /\bskip|later|to confirm\b|don'?t know yet/i,
    answer: `You can skip any question with ${q(SKIP_LABEL)}. Anything you skip is marked in the draft for you to fill in later, so nothing is made up. You can also tap the question in the Progress list on the right to answer it at any time.`,
  },
  {
    words: /\b(go back|change (my|an) answer|edit (my|an) answer|wrong answer|made a mistake)\b/i,
    answer: "Tap any question in the Progress list on the right to see it or answer it again. Your other answers are kept.",
  },
  {
    words: /\b(upload|existing (nda|document)|attach|my own (nda|document))\b/i,
    answer: `At the step that asks for an existing document, choose ${q(SOURCE_ATTACH)} to attach an NDA or term sheet (Word, PDF or text). FD AI uses it as a starting point and follows your answers wherever they differ. You can also press + beside the message box at any time.`,
  },
  {
    words: /\b(lawyer|review|advice|legal advice|safe to sign|binding)\b/i,
    answer:
      "FD AI prepares a first draft based on the firm’s playbook. It is not legal advice about your situation, so have it reviewed before you sign. If you would like a Founders Doc lawyer to look at it, book a consultation on the FD Consult page.",
  },
  {
    words: /\b(cost|price|pay|credit|free|charge)\b/i,
    answer:
      "Each new draft uses one credit, and your balance is shown in the side panel. A credit is used only when a draft is produced; if something goes wrong, it is returned. Plans and top-ups are under “Credits” in the side panel.",
  },
  {
    words: /\b(word|docx|download|pdf|export)\b/i,
    answer: `When the draft is ready, you can edit it on screen and press ${q(DOWNLOAD)} to get it as a Word document. You can also press ${q(GENERATE)} again after changing an answer.`,
  },
];

function say(e: Entry, ctx: Pick<AskContext, "allFields">): string {
  return typeof e.answer === "function" ? e.answer(ctx) : e.answer;
}

/** Every answer the glossary can give, for this form — for checking that
 *  each choice and button it names is spelt as the screen spells it. */
export function glossaryAnswers(allFields: Field[]): string[] {
  return GLOSSARY.map((e) => say(e, { allFields }));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/** What the form says about one question, as a sentence or two. */
function describeField(f: Field): string {
  const bits: string[] = [];
  if (f.help) bits.push(stripHtml(f.help));
  if (f.type === "select" && f.options?.length) bits.push(`The choices are: ${f.options.map(q).join(", ")}.`);
  if (f.placeholder) bits.push(`For example: ${f.placeholder}`);
  return bits.join(" ");
}

export interface AskContext {
  /** The question on screen now, if any. */
  question?: string;
  fields?: Field[];
  /** Every question on the form, for keyword matches outside the current one. */
  allFields: Field[];
}

/**
 * An answer from what we already know, or null when the model is needed.
 * Order: the current question (when the person is asking about it), then the
 * glossary, then any question on the form whose label shares their key word.
 */
export function answerLocally(text: string, ctx: AskContext): string | null {
  const t = text.trim();
  const current = (ctx.fields ?? []).filter((f) => describeField(f));

  if (aboutThisQuestion(t) && ctx.question) {
    const glossHit = GLOSSARY.find((g) => g.words.test(`${ctx.question} ${(ctx.fields ?? []).map((f) => f.label).join(" ")}`));
    const own = current.map((f) => (current.length > 1 ? `${f.label}: ${describeField(f)}` : describeField(f))).join(" ");
    const parts = [glossHit ? say(glossHit, ctx) : "", own].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  const hit = GLOSSARY.find((g) => g.words.test(t));
  if (hit) return say(hit, ctx);

  /* A key word from their question in a question on the form. */
  const words = (t.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter(
    (w) => !["about", "which", "there", "their", "would", "should", "could", "where", "these", "those", "what's", "question", "answer"].includes(w),
  );
  for (const f of ctx.allFields) {
    const hay = `${f.label} ${f.help ?? ""}`.toLowerCase();
    if (words.some((w) => hay.includes(w)) && describeField(f)) {
      return `On "${f.label}": ${describeField(f)}`;
    }
  }
  return null;
}
