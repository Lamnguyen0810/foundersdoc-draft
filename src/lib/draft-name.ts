/**
 * What a draft is called.
 *
 * A list of six rows all reading "Untitled draft" is a list of nothing. The old
 * rule read two answer keys — party_a and party_b — and gave up when either was
 * missing, so every document type published from the admin console with its own
 * field names produced "Untitled draft", every time.
 *
 * Naming now works on the conversation rather than on two hard-coded keys:
 *
 *   1. the name the person typed, if they typed one — nothing beats that;
 *   2. a short name written by the model from the answers, the way a chat names
 *      itself from its first exchange;
 *   3. a name derived from the answers here, with no model involved;
 *   4. the document type and the date.
 *
 * Only (4) is a fallback in the weak sense, and even it says something true.
 * There is no path that ends in "Untitled".
 *
 * Nothing here invents facts. Every candidate is built from what the person
 * actually answered; where they answered nothing, the name says only the
 * document type and the day.
 */

import { SKIPPED } from "./prompt";
import type { DocType, Field } from "./doctypes";
import { generateDraft } from "./ai/provider";

/** Longest name we will store. The rail truncates; the database should not. */
export const MAX_NAME = 80;

/**
 * How long the model gets to answer before we stop waiting and use the name we
 * worked out ourselves. Naming starts at the same moment as the draft and the
 * draft takes far longer, so this ceiling is almost never reached — it exists
 * so a hung naming call cannot hold up saving a document that is already on the
 * person's screen.
 */
const MODEL_BUDGET_MS = 12_000;

/** Fields whose answer names a side of the deal. */
const PARTY_HINT = /(party|parties|counterparty|client|customer|company|supplier|vendor|contractor|landlord|tenant|employer|employee|discloser|recipient|buyer|seller|investor|founder)/i;

/** ...but an address is not a name, and neither is a country. */
const NOT_A_NAME = /(address|jurisdiction|law|country|registered office|postal)/i;

/** Fields whose answer says what the matter is about. */
const SUBJECT_HINT = /(purpose|matter|project|subject|scope|transaction|deal|engagement|about|description)/i;

/**
 * Trim an answer down to the part that reads as a name.
 *
 * "MERIDIAN LOGISTICS PTE. LTD. (UEN 201812345K)" → "Meridian Logistics Pte. Ltd."
 * The bracketed registration number is true and useful in the document and
 * clutter in a list, so it comes off here and nowhere else.
 */
export function tidyName(raw: string): string {
  const withoutBrackets = raw.split("(")[0];
  const collapsed = withoutBrackets.replace(/\s+/g, " ").trim().replace(/[,;:.]+$/, "");
  if (!collapsed) return "";
  // SHOUTED company names are how they appear on ACRA; they are not how anyone
  // wants to read a list of six of them.
  const shouted = collapsed === collapsed.toUpperCase() && /[A-Z]{4}/.test(collapsed);
  if (!shouted) return collapsed;
  return collapsed
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bPte\b/g, "Pte")
    .replace(/\bLtd\b/g, "Ltd")
    .replace(/\bUen\b/g, "UEN");
}

/**
 * The corporate tail, off.
 *
 * "Meridian Logistics Pte. Ltd." and "Kestrel Analytics Pte. Ltd." fill a name
 * with two words that are the same on almost every Singapore company and say
 * nothing about which draft this is. The full legal name is in the document,
 * where it matters; the list needs the part that differs.
 */
const COMPANY_TAIL =
  /[\s,]+(pte\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|pty\.?\s*ltd\.?|sdn\.?\s*bhd\.?|gmbh|s\.?a\.?r\.?l\.?|b\.?v\.?)$/i;

function shortCompany(raw: string): string {
  let name = tidyName(raw);
  // Twice, so "Acme Holdings Pte. Ltd." and "Acme Co. Ltd" both come out clean.
  for (let k = 0; k < 2; k++) {
    const next = name.replace(COMPANY_TAIL, "").trim().replace(/[,;:.]+$/, "");
    if (!next || next === name) break;
    name = next;
  }
  return name;
}

/** The answers worth showing, in the order the form asks them. */
function answered(fields: Field[], answers: Record<string, string>): { field: Field; value: string }[] {
  const out: { field: Field; value: string }[] = [];
  for (const f of fields) {
    const raw = (answers[f.key] ?? "").trim();
    if (!raw || raw === SKIPPED) continue;
    out.push({ field: f, value: raw });
  }
  return out;
}

function clip(text: string, limit = MAX_NAME): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  // Cut at a word so the name does not end mid-syllable.
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "") + "…";
}

/** "17 Sept 2026" — the same date format the rest of the site uses. */
function onDate(when: Date): string {
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A name worked out from the answers alone: no model, no network, no waiting.
 *
 * This is what the list shows when the model is not reachable, is not
 * configured, or answers with something unusable — and it is what every draft
 * saved before today gets when the backfill runs.
 */
export function nameFromAnswers(
  docType: Pick<DocType, "label" | "fields">,
  answers: Record<string, string>,
  when: Date = new Date(),
): string {
  const given = answered(docType.fields ?? [], answers);

  const parties = given
    .filter(
      ({ field }) =>
        (PARTY_HINT.test(field.key) || PARTY_HINT.test(field.label)) &&
        !NOT_A_NAME.test(field.key) &&
        !NOT_A_NAME.test(field.label) &&
        field.type !== "select" &&
        field.type !== "number",
    )
    .map(({ value }) => shortCompany(value))
    .filter(Boolean);

  // Two different sides read as a pairing; the same name twice does not.
  const distinct = parties.filter((p, k) => parties.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === k);

  if (distinct.length >= 2) return clip(`${distinct[0]} and ${distinct[1]} — ${docType.label}`);
  if (distinct.length === 1) return clip(`${distinct[0]} — ${docType.label}`);

  // No parties named. What is it about, then?
  const subject = given.find(
    ({ field }) =>
      (SUBJECT_HINT.test(field.key) || SUBJECT_HINT.test(field.label)) &&
      (field.type === "text" || field.type === "textarea"),
  );
  if (subject) {
    // Cut at a word, then tidy the edge: a name ending in a stray comma reads
    // like a sentence someone forgot to finish.
    const words = tidyName(subject.value)
      .split(" ")
      .slice(0, 8)
      .join(" ")
      .replace(/[\s,;:.\u2013-]+$/, "");
    if (words) return clip(`${words} — ${docType.label}`);
  }

  // Nothing was said that could name it. The document type and the day are
  // still true, and still tell the drafts apart.
  return clip(`${docType.label} · ${onDate(when)}`);
}

/**
 * A name for a row that has none, without reading its answers.
 *
 * Lists — the rail, the history page, the admin table — ask for a handful of
 * columns and should not fetch a JSON blob per row just to caption one. The
 * document type and the day it was made are enough to tell drafts apart, and
 * they are true. The migration names the old rows properly; this covers
 * anything that slips past it.
 */
export function nameFallback(docLabel: string | null | undefined, when: string | Date): string {
  const label = (docLabel ?? "").trim() || "Draft";
  const day = (when instanceof Date ? when : new Date(when)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${label} · ${day}`;
}

/** The answers, as the model sees them when asked for a name. */
function digest(docType: Pick<DocType, "label" | "fields">, answers: Record<string, string>): string {
  const lines = answered(docType.fields ?? [], answers).map(
    ({ field, value }) => `${field.label}: ${clip(value, 160)}`,
  );
  let total = 0;
  const kept: string[] = [];
  for (const l of lines) {
    if (total + l.length > 1_500) break;
    kept.push(l);
    total += l.length;
  }
  return kept.join("\n");
}

const NAMING_SYSTEM = [
  "You name documents for a Singapore law firm's drafting tool.",
  "You are given the answers a lawyer gave while setting up a draft.",
  "Reply with a name for that draft and nothing else.",
  "",
  "Rules:",
  "- At most eight words, and no full stop at the end.",
  "- Use the parties' names where they were given, shortened sensibly",
  "  (drop Pte. Ltd., UEN numbers, and registered addresses).",
  "- Say what kind of document it is if it fits.",
  "- Use only what the answers say. Never invent a party, a sum or a date.",
  "- No quotation marks, no markdown, no preamble, no explanation.",
  "",
  'Good: "Meridian and Kestrel mutual NDA"',
  'Good: "Route analytics NDA, one-way"',
  'Bad: "Untitled draft"',
  'Bad: "Here is a suitable name: ..."',
].join("\n");

/** Strip the ways a model dresses up a one-line answer. */
function tidyModelName(raw: string): string {
  let text = raw.split("\n").find((l) => l.trim().length > 0) ?? "";
  text = text.trim();
  text = text.replace(/^(?:name|title)\s*[:—-]\s*/i, "");
  text = text.replace(/^["'“”‘’`*_\s]+|["'“”‘’`*_\s]+$/g, "");
  text = text.replace(/\.$/, "");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Is this a name we would be happy to see in the list?
 *
 * The check is deliberately blunt. A model that answers with a sentence, an
 * apology or the word "Untitled" has not given us a name, and the rule-based
 * one below it is better than a bad one.
 */
function usable(name: string): boolean {
  if (name.length < 3 || name.length > MAX_NAME) return false;
  if (/untitled|^draft$|^document$/i.test(name)) return false;
  if (/^(sure|here|okay|of course|i )/i.test(name)) return false;
  if (name.split(" ").length > 12) return false;
  return true;
}

export interface NamedDraft {
  title: string;
  /** Which of the four routes produced it — recorded so we can tell, later,
   *  whether the model is earning its keep. */
  source: "model" | "answers";
  inputTokens: number;
  outputTokens: number;
}

/**
 * Name the draft, the way a chat names itself.
 *
 * Call this at the same moment generation starts: the draft takes tens of
 * seconds and the name takes one, so the name is ready long before it is
 * needed and costs the person no extra waiting.
 *
 * It never throws and never returns an empty name. If the model is unset,
 * rate-limited, slow or unhelpful, the answer-derived name is used instead —
 * which is why the caller can await this without a timeout of its own.
 */
export async function nameDraft(
  docType: Pick<DocType, "label" | "fields">,
  answers: Record<string, string>,
  opts: { when?: Date; signal?: AbortSignal } = {},
): Promise<NamedDraft> {
  const fallback: NamedDraft = {
    title: nameFromAnswers(docType, answers, opts.when ?? new Date()),
    source: "answers",
    inputTokens: 0,
    outputTokens: 0,
  };

  const body = digest(docType, answers);
  // Nothing was answered, so there is nothing for the model to read either.
  if (!body) return fallback;

  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), MODEL_BUDGET_MS);
  const onOuterAbort = () => giveUp.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const res = await generateDraft({
      system: NAMING_SYSTEM,
      user: `Document type: ${docType.label}\n\nThe answers:\n${body}\n\nThe name:`,
      maxTokens: 32,
      temperature: 0.2,
      signal: giveUp.signal,
    });
    const name = tidyModelName(res.text ?? "");
    if (!usable(name)) return { ...fallback, inputTokens: res.inputTokens, outputTokens: res.outputTokens };
    return {
      title: name,
      source: "model",
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
  } catch {
    /* Naming is the least important thing this request does. A model that is
       down, out of quota or simply slow must cost the person nothing at all:
       they still get their document, and it still has a name. */
    return fallback;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** The name a person typed, made safe to store. Empty means "they cleared it". */
export function tidyTypedName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return clip(raw.replace(/[\r\n\t]+/g, " "), MAX_NAME);
}
