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

/** Does this look like a question to us rather than an answer to ours? */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  return /^(what('?s| is| are| does| do| happens| if)|why\b|how (do|does|long|much|many|is)|explain|help\b|i don'?t (understand|know what)|not sure what|meaning of|define|tell me about|can you explain)/i.test(
    t,
  );
}

/** Said about the question on screen, not about the law in general. */
function aboutThisQuestion(text: string): boolean {
  return /\b(this( question)?|that|it)\b.*\b(mean|means|meaning|for)\b|\bwhy (do|are) you ask|\bwhat (do|should) i (put|write|answer|choose|pick)|\bi don'?t understand\b|\bnot sure\b|\bwhich (one|option) should\b/i.test(
    text,
  );
}

interface Entry {
  words: RegExp;
  answer: string;
}

/* The terms the NDA form and its drafts use. Plain English, general. */
const GLOSSARY: Entry[] = [
  {
    words: /\b(mutual|one[- ]?way|unilateral|bilateral|direction)\b/i,
    answer:
      "Mutual means both sides share confidential information and both must protect it. One-way means only one side discloses: choose \"we disclose\" if you are sharing your information, or \"we receive\" if the other side is sharing theirs. If in doubt and both sides will share anything sensitive, pick Mutual.",
  },
  {
    words: /\bresidual/i,
    answer:
      "A residuals clause lets the receiving side use general ideas and know-how its people remember after seeing your information, as long as they did not keep copies. It favours the receiver, so the usual answer is No unless you are the one receiving and the other side has agreed to it.",
  },
  {
    words: /\btrade secrets?\b|\bfor ever\b|\bforever\b/i,
    answer:
      "Trade secrets (a formula, source code, a customer list with real value) can stay protected for as long as they remain secret, instead of for a fixed number of years. Saying Yes keeps that longer protection for trade secrets while the rest of the information follows the normal period.",
  },
  {
    words: /\bsurviv|after (it|the agreement) ends|how long .*(secret|confidential)|confidentiality period/i,
    answer:
      "There are two clocks. The agreement's term is how long the parties may exchange information under it. The survival period is how long the confidentiality duty lasts after that ends. Two years' term and three years' survival are common starting points; longer suits more sensitive information.",
  },
  {
    words: /\bterm\b(?! ?sheet)|how long does the agreement last|\bduration\b/i,
    answer:
      "The term is how long the NDA stays open for new information to be shared under it, usually one to three years. Information already shared stays protected for the survival period after the term ends.",
  },
  {
    words: /\bpurpose\b|working on together/i,
    answer:
      "The Purpose is the reason the information is being shared, for example \"to evaluate a possible distribution partnership\". It matters because the other side may use your information only for that purpose, so a specific description protects you better than a vague one.",
  },
  {
    words: /\bconfidential information\b|what (kind of )?information|information categor/i,
    answer:
      "List the types of information you expect to share, such as pricing, customer lists, financials, product plans or source code. The NDA defines what is protected using this, so naming the real categories avoids arguments later about whether something was covered.",
  },
  {
    words: /\b(poach|non[- ]?solicit|solicit|staff|employees)\b/i,
    answer:
      "A non-solicitation clause stops the other side from recruiting your employees for a set time, often 12 months. It is optional and goes beyond confidentiality, so include it only if you are worried about losing staff through the relationship.",
  },
  {
    words: /\bnon[- ]?compete|compet/i,
    answer:
      "FD AI never adds a non-compete to an NDA. Restricting someone from competing is a different, heavily scrutinised kind of clause; if you need one, book a consultation with a Founders Doc lawyer.",
  },
  {
    words: /\b(governing law|jurisdiction|which law|courts?)\b/i,
    answer:
      "Governing law is the country whose law decides what the NDA means; the courts named are where a dispute would be heard. Pick the place where you are based or where the other side can most easily be held to account.",
  },
  {
    words: /\b(comprehensive|comprehensiveness|how long should|length|detail(ed)?|concise|standard|thorough|maximum)\b/i,
    answer:
      "Comprehensiveness sets how full the first NDA is, from a short, plain version to a detailed one with fuller definitions and procedures. It changes the level of detail, not the commercial position. Standard suits most early conversations.",
  },
  {
    words: /\bskip|later|to confirm\b|don'?t know yet/i,
    answer:
      "You can skip any question. Anything skipped comes back in the draft as [[TO CONFIRM]], so nothing is invented, and you can tap it in the list on the right to answer it later.",
  },
  {
    words: /\b(go back|change (my|an) answer|edit (my|an) answer|wrong answer|made a mistake)\b/i,
    answer:
      "Tap any question in the list on the right to answer it again. Your other answers are kept, and you come back to where you were.",
  },
  {
    words: /\b(upload|existing (nda|document)|attach|my own (nda|document))\b/i,
    answer:
      "At the last step you can attach an existing NDA or term sheet (Word, PDF or text). FD AI works from it and keeps your answers where they differ. You can also press + beside the message box at any time.",
  },
  {
    words: /\b(lawyer|review|advice|legal advice|safe to sign|binding)\b/i,
    answer:
      "FD AI prepares a first draft from the firm's playbook; it is not legal advice about your situation. Have it reviewed before you sign. If you want a Founders Doc lawyer to look at it, book a consultation from the FD Consult page.",
  },
  {
    words: /\b(cost|price|pay|credit|free|charge)\b/i,
    answer:
      "Each new draft uses one credit, and your balance is shown in the side panel. You are charged only when a draft is produced; if something fails, the credit is returned. Plans and top-ups are on the Billing page.",
  },
  {
    words: /\b(word|docx|download|pdf|export)\b/i,
    answer:
      "When the draft is ready you can edit it on screen and download it as a Word document.",
  },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/** What the form says about one question, as a sentence or two. */
function describeField(f: Field): string {
  const bits: string[] = [];
  if (f.help) bits.push(stripHtml(f.help));
  if (f.type === "select" && f.options?.length) bits.push(`The choices are: ${f.options.join("; ")}.`);
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
    const parts = [glossHit?.answer, own].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  const hit = GLOSSARY.find((g) => g.words.test(t));
  if (hit) return hit.answer;

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
