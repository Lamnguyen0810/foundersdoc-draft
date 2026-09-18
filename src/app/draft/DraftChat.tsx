"use client";

/**
 * FD AI — the drafting workspace.
 *
 * A React implementation of the confirmed Ver_30 design: an opening splash, a
 * document catalogue, then a guided conversation with a live progress pane and
 * a draft view. The markup and class names match the design file exactly, so
 * the appended design layer in globals.css styles this without a single
 * bespoke rule here. If a class looks odd, it is the design's, not an
 * invention — check FDAI_Ver_30_100926.html before renaming anything.
 *
 * THREE THINGS THIS DOES THAT THE PROTOTYPE ONLY MIMED
 *   1. Skip. Every question can be deferred. A skipped answer is stored as the
 *      SKIPPED marker, not as an empty string, so the prompt can tell "asked
 *      and deferred" from "never reached" and place a [[TO CONFIRM]].
 *   2. Draft with what I have. Marks every remaining question skipped and
 *      generates immediately — a real API call, not a canned document.
 *   3. It talks to the real endpoints: /api/generate (streamed), /api/extract
 *      for an uploaded source, /api/export for the Word file.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { stepsFor, type DocType, type Field } from "@/lib/doctypes";
import { track } from "@/lib/track";
import DetailSlider, { DETAIL_LABELS, DETAIL_LENGTHS, toLevel } from "./DetailSlider";
import DocumentEditor from "./DocumentEditor";
import DraftReady from "./DraftReady";
import { SKIPPED } from "@/lib/prompt";

/* ────────────────────────────────────────────────────── the catalogue */

/** id, label, blurb, ready, search terms. Ready is decided by the live
 *  catalogue, not by this table — a row flips to Ready the moment its slug
 *  exists in Supabase, with no code change. */
type CatDoc = [string, string, string, boolean, string];
type CatFolder = [string, CatDoc[]];

const CATALOGUE: CatFolder[] = [
  [
    "Confidentiality",
    [
      [
        "nda",
        "Non-Disclosure Agreement",
        "Keep shared information confidential — mutual or one-way",
        true,
        "nda confidentiality secrecy partner investor vendor",
      ],
    ],
  ],
  [
    "Commercial",
    [
      ["services", "Services Agreement", "Engage or provide services on agreed terms", false, "msa consulting client work"],
      ["terms", "Terms & Conditions", "Terms for your product or website", false, "t&c tos website app saas"],
      ["supply", "Supply Agreement", "Buy or supply goods on standing terms", false, "goods purchase vendor"],
    ],
  ],
  [
    "Company",
    [
      ["sha", "Shareholders’ Agreement", "How founders and investors run the company", false, "sha founders investors board"],
      ["vesting", "Share Vesting Letter", "Vest founder shares over time", false, "cliff equity founders"],
      ["esop", "Employee Share Option Plan", "Grant options to your team", false, "esop options equity staff"],
    ],
  ],
  [
    "People",
    [
      ["employment", "Employment Agreement", "Hire an employee in Singapore", false, "hiring job offer staff"],
      ["contractor", "Contractor Agreement", "Engage a freelancer or consultant", false, "freelancer consultant independent"],
    ],
  ],
  [
    "Fundraising",
    [
      ["safe", "SAFE Note", "Raise early money with a simple agreement", false, "fundraising seed investment convertible"],
      ["term", "Term Sheet", "Key terms for a funding round", false, "fundraising round investors valuation"],
    ],
  ],
];

/* ─────────────────────────────────────────────────────── the questions */

/** Group name → how FD AI asks for it. Keyed by group rather than by index so
 *  adding a field, or a whole group, cannot silently shift every question by
 *  one. An unlisted group falls back to its own name, which reads acceptably. */

/* The five comprehensiveness steps live in DetailSlider now — one list, shared
   with the card beside the finished document, which used to use another. */

const SOURCE_STEP = {
  id: "__source__",
  name: "Existing document",
  question: "Do you have an existing NDA or term sheet I should work from?",
};

export interface Step {
  id: string;
  name: string;
  question: string;
  fields: Field[];
  /** chips: one select, answered by tapping. card: a panel of inputs.
   *  detail: the NDA depth slider. source: the upload question. */
  kind: "chips" | "card" | "detail" | "source";
}

export function buildSteps(docType: DocType): Step[] {
  /* The steps come from stepsFor — the same list the admin editor shows — so
     the order and wording here are the ones the admin published. */
  const steps: Step[] = stepsFor(docType).map(({ group, fields }) => {
    // A lone select is a tap, not a form. That is what makes the first question
    // feel like a conversation rather than a questionnaire.
    const kind: Step["kind"] = fields.length === 1 && fields[0].type === "select" ? "chips" : "card";
    return { id: group.name, name: group.title, question: group.question, fields, kind };
  });
  if (docType.slug === "nda") {
    steps.push({
      id: "__detail__",
      name: "Comprehensiveness",
      question: "How comprehensive and how long should the first NDA be?",
      kind: "detail",
      fields: [{
        key: "_nda_detail_level",
        label: "Comprehensiveness",
        type: "number",
        required: true,
        group: "Comprehensiveness",
        defaultValue: "3",
      }],
    });
  }
  steps.push({ ...SOURCE_STEP, fields: [], kind: "source" });
  return steps;
}

/* ──────────────────────────────────────────────────────────── helpers */

type Status = "done" | "skp" | undefined;

/**
 * What the person said on a step, in the words the chat echoes back.
 *
 * Module-level and pure, because it is needed twice: live, as each question is
 * answered, and again when a saved draft is reopened months later. A copy of
 * this logic in each place would drift, and the drift would show as a reopened
 * conversation that does not match the one the person remembers having.
 */
export function describeStep(s: Step, src: Record<string, string>, attachments: string[]): string {
  if (s.kind === "source") {
    return attachments.length ? `Attached: ${attachments.join(", ")}` : "No — start fresh";
  }
  if (s.kind === "detail") {
    const level = Math.min(5, Math.max(1, Number(src._nda_detail_level) || 3));
    return `${level}/5 · ${DETAIL_LABELS[level - 1]} · ${DETAIL_LENGTHS[level - 1]}`;
  }
  const parts: string[] = [];
  for (const f of s.fields) {
    const v = (src[f.key] ?? "").trim();
    if (!v || v === SKIPPED) continue;
    parts.push(s.kind === "chips" ? v : `${f.label}: ${v}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

interface Msg {
  who: "fd" | "me";
  text: string;
  label?: string;
  skipped?: boolean;
}

/** A turn after the first draft: what was asked for, and what came back. */
export interface FollowTurn {
  who: "me" | "fd";
  text: string;
  version?: number;
  fileName?: string;
  documentText?: string;
  detailLevel?: number;
}

/** One version of the document, as the screen holds it. */
export interface DocVersion {
  documentText: string;
  version: number;
  detailLevel: number;
  fileName: string;
}

/* ── coming back to a draft in progress ───────────────────────────────────
   Leaving the drafting screen for Credits or Usage and pressing Back used to
   land on the empty catalogue: the conversation only ever existed in the
   browser's memory, and a page navigation throws that away. So the session is
   written to this tab's own storage as it goes, and read back when the screen
   opens again.

   Session storage, not local: it belongs to this tab and this sitting. Close
   the tab and it is gone, which is the right lifetime for a half-finished
   draft — and it never leaves the browser.

   ── IT BELONGS TO A PERSON, NOT TO A TAB ───────────────────────────────────
   A tab is not an account. Signing out and signing in as somebody else does
   not close the tab, so a stash written by one person was read straight back
   by the next — which is how a brand-new account opened onto the previous
   account's conversation. On a shared machine that is not an oddity, it is
   one client's draft shown to another.

   So the stash carries whose it is, and a stash that is not yours is not
   yours: it is ignored, and cleared out of storage rather than left sitting
   there. The address is the account's own, already on this screen; nothing
   secret is added to storage that was not there before. */
const STASH_KEY = "fdai.draft-in-progress";
/** Bumped when the shape below changes, so an old one is ignored rather than
 *  half-read into a new screen. Version 3 added `who`; a version-2 stash has
 *  no owner recorded and so cannot be proved to be yours — it is dropped. */
const STASH_VERSION = 3;
/** Older than this and it is not "where I was", it is archaeology. */
const STASH_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Whose stash is this?
 *
 * The signed-in address, lower-cased. "anon" when nobody is signed in, which
 * happens when the app runs without Supabase configured — a sentinel rather
 * than an empty string, so that case keeps its own stash and works like any
 * other instead of silently losing the way back. It cannot collide with a real
 * account: every email has an @ in it and this does not.
 */
export function stashOwner(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase() || "anon";
}

export interface DraftStash {
  v: number;
  at: number;
  /** The account that wrote it. See the note above. */
  who: string;
  slug: string;
  answers: Record<string, string>;
  status: Status[];
  i: number;
  msgs: Msg[];
  name: string;
  sourceText: string;
  attachments: string[];
  output: string;
  draftId: string | null;
  view: "chat" | "draft";
  docOpen: boolean;
  follow: FollowTurn[];
  versions: DocVersion[];
  version: number;
  detail: number;
  skipped: string[];
}

/* Read once per page load and held, so the value cannot change underneath a
   render. The screen decides what to show from it exactly once; everything
   after that is ordinary state. */
let stashOnce: DraftStash | null = null;
let stashRead = false;

function readStash(): DraftStash | null {
  if (stashRead) return stashOnce;
  stashRead = true;
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftStash;
    if (parsed?.v !== STASH_VERSION) return null;
    if (!parsed.slug || Date.now() - (parsed.at ?? 0) > STASH_MAX_AGE_MS) return null;
    /* Whose it is is checked by the screen, which knows who is signed in. This
       only refuses one that does not say — there is no honest way to treat an
       unowned conversation as belonging to whoever opened the tab next. */
    if (typeof parsed.who !== "string" || !parsed.who) return null;
    stashOnce = parsed;
  } catch {
    // Unreadable, or storage refused. Start fresh rather than guess.
    stashOnce = null;
  }
  return stashOnce;
}

/** Nothing subscribes: the stash is read once, at the moment the screen opens. */
function watchStash(): () => void {
  return () => {};
}

function writeStash(stash: DraftStash): void {
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify(stash));
  } catch {
    /* Storage full or turned off. The draft on screen is unaffected; only
       coming back to it is, and that is not worth an error message. */
  }
}

export function clearStash(): void {
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    /* nothing to forget */
  }
  stashOnce = null;
  stashRead = true;
}

export interface RecentDraft {
  id: string;
  title: string;
  when: string;
  /** Which document it is — so a list of six tells you six different things. */
  docLabel?: string;
  /** Kept at the top of the list, above the dated groups. */
  pinned?: boolean;
  /** "Pinned", "Today", "Previous 7 days", "August 2026" — worked out on the
   *  server, in Singapore time, so the two renders agree. */
  heading?: string;
}

/**
 * The list, cut into the sections the rail shows.
 *
 * The rows arrive in the right order already — pinned first, then newest
 * first — so this only has to notice where the heading changes. Pinning a
 * draft in the browser moves it without asking the server again, which is why
 * the sort is repeated here rather than trusted.
 */
export function groupDrafts(list: RecentDraft[]): { heading: string; items: RecentDraft[] }[] {
  const ordered = [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const out: { heading: string; items: RecentDraft[] }[] = [];
  for (const row of ordered) {
    const head = row.pinned ? "Pinned" : (row.heading ?? "Earlier");
    const last = out[out.length - 1];
    if (last && last.heading === head) last.items.push(row);
    else out.push({ heading: head, items: [row] });
  }
  return out;
}

/**
 * A draft that already exists, opened again.
 *
 * The conversation was never stored as a transcript, and it does not need to
 * be: the questions come from the document type, the answers come from the
 * draft, and the revisions come from draft_versions. Everything the person
 * said is on the row already, so reopening replays their conversation rather
 * than recording a second copy of it.
 */
export interface ResumeDraft {
  id: string;
  title: string;
  docTypeSlug: string;
  answers: Record<string, string>;
  sourceText: string | null;
  output: string;
  outputHtml: string | null;
  createdAt: string;
  /** Every version made, oldest first. Version 1 is the original draft. */
  versions: {
    version: number;
    detailLevel: number;
    fileName: string;
    instruction: string | null;
    output: string;
  }[];
}

/**
 * Rebuild the conversation from a saved draft.
 *
 * A step counts as answered when any of its fields carries an answer, as
 * skipped when every one of them carries the skip marker, and as never reached
 * when it carries neither — which is exactly what "Draft with what I have"
 * leaves behind, and it should read that way on the way back in.
 */
export function replayConversation(
  docType: DocType,
  steps: Step[],
  answers: Record<string, string>,
  attachments: string[],
  createdAt: string,
): { msgs: Msg[]; status: Status[] } {
  const opened = new Date(createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const msgs: Msg[] = [
    {
      who: "fd",
      text: `This is the ${docType.label} you started on ${opened}. Here is what you told me, and the document it produced — ask me for a change and I will pick up where we left off.`,
    },
  ];
  const status: Status[] = steps.map(() => undefined);

  steps.forEach((step, k) => {
    if (step.kind === "source") {
      // Only worth replaying when something really was attached.
      if (!attachments.length) return;
      status[k] = "done";
      msgs.push(
        { who: "fd", text: step.question },
        { who: "me", label: step.name, text: describeStep(step, answers, attachments) },
      );
      return;
    }
    const values = step.fields.map((f) => (answers[f.key] ?? "").trim());
    const real = values.filter((v) => v && v !== SKIPPED);
    const skippedAll = values.length > 0 && values.every((v) => v === SKIPPED);
    if (real.length === 0 && !skippedAll) return; // never asked
    status[k] = real.length > 0 ? "done" : "skp";
    msgs.push(
      { who: "fd", text: step.question },
      {
        who: "me",
        label: step.name,
        text: real.length > 0 ? describeStep(step, answers, attachments) : "Skipped for now",
        skipped: real.length === 0,
      },
    );
  });

  return { msgs, status };
}

/**
 * The follow-up turns, rebuilt from the versions that were saved.
 *
 * Version 1 is the draft itself and is announced by the ready card, so it is
 * not a follow-up. Everything after it was a request the person typed and a
 * document that came back, and both halves are on the row.
 */
export function replayRevisions(versions: ResumeDraft["versions"]): FollowTurn[] {
  const out: ReturnType<typeof replayRevisions> = [];
  for (const v of versions) {
    if (v.version <= 1) continue;
    if (v.instruction) out.push({ who: "me", text: v.instruction });
    out.push({
      who: "fd",
      text: `Version ${v.version} is ready.`,
      version: v.version,
      fileName: v.fileName,
      documentText: v.output,
      detailLevel: v.detailLevel,
    });
  }
  return out;
}

function initialAnswers(docType: DocType, prefill?: Prefill | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of docType.fields) out[f.key] = f.defaultValue ?? "";
  /* Settings fill in only the questions this form actually asks, and only
     where the form has no default of its own. */
  for (const f of docType.fields) {
    const v = prefill?.answers[f.key];
    if (v && !out[f.key]) out[f.key] = v;
  }
  if (docType.slug === "nda") out._nda_detail_level = String(prefill?.detailLevel ?? 3);
  return out;
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)) || "FD";
  return letters.toUpperCase();
}

/* ═══════════════════════════════════════════════════════════ component */

/** What the workspace needs to know about credits. Deliberately not the whole
 *  wallet: the rail shows a number and a link, nothing more. */
export interface WalletView {
  credits: number;
  inTrial: boolean;
  /** ISO date the free trial ends, when one is running. */
  trialEndsAt?: string | null;
}

/**
 * What the person's settings offer to a new draft: answers already filled in
 * from their company profile, and the comprehensiveness they prefer. Read on
 * the server from user_settings; the form starts with these instead of blank.
 * They are starting values only — every one is shown and can be changed.
 */
export interface Prefill {
  answers: Record<string, string>;
  detailLevel?: number;
}

export default function DraftChat({
  docTypes,
  presetSlug,
  userEmail,
  recent,
  wallet,
  isAdmin = false,
  prefill,
  resume = null,
}: {
  docTypes: DocType[];
  presetSlug?: string;
  userEmail?: string | null;
  recent?: RecentDraft[];
  wallet?: WalletView | null;
  isAdmin?: boolean;
  prefill?: Prefill | null;
  /** Set when an existing draft was opened from the list. */
  resume?: ResumeDraft | null;
}) {
  const liveSlugs = useMemo(() => new Set(docTypes.map((d) => d.slug)), [docTypes]);

  /* The balance is STATE, not just the server's prop.
     It arrives rendered by the server, but a draft is made client-side, so if
     it stayed a prop the number would sit unchanged until a full page reload —
     credit spent, database correct, screen lying. The generate endpoint returns
     the new figure with the finished draft, and this is where it lands. */
  const [live, setLive] = useState<WalletView | null>(wallet ?? null);

  const spendCredit = useCallback((creditsLeft: number | null) => {
    setLive((w) => {
      if (!w) return w;
      // Prefer the server's figure; fall back to decrementing if it did not send one.
      const next = creditsLeft === null ? Math.max(0, w.credits - 1) : creditsLeft;
      return next === w.credits ? w : { ...w, credits: next };
    });
  }, []);

  // The top of the funnel. Every later number is a fraction of this one, so it
  // is recorded once per arrival — not per render, not per document chosen.
  useEffect(() => {
    track("ai_opened");
  }, []);

  /* A reopened draft goes straight to its conversation: the catalogue is for
     choosing what to draft, and that choice was made weeks ago. */
  const resumeType = resume ? (docTypes.find((d) => d.slug === resume.docTypeSlug) ?? null) : null;

  /* A draft this tab was in the middle of. Read once, so that going to Credits
     and coming back lands where the person left off instead of on the empty
     catalogue. A reopened draft wins: it was asked for by name in the URL. */
  const found = useSyncExternalStore(watchStash, readStash, () => null);

  /* ── AND IT HAS TO BE YOURS ────────────────────────────────────────────
     Derived rather than filtered inside readStash, because who is signed in
     is a prop of this screen and not something module-level storage code can
     know. A stash belonging to somebody else is treated exactly as no stash:
     the catalogue, as a new account should see it. */
  const stash = found && found.who === stashOwner(userEmail) ? found : null;
  const notMine = Boolean(found) && !stash;

  /* Somebody else's conversation, still sitting in this tab's storage. It is
     already not being shown; this takes it out of the browser as well, so it
     cannot come back and is not there to be found. */
  useEffect(() => {
    if (notMine) clearStash();
  }, [notMine]);

  const stashType =
    !resume && stash ? (docTypes.find((d) => d.slug === stash.slug) ?? null) : null;

  /* Which document is open is DERIVED until the person chooses one themselves.
     It cannot be ordinary state seeded once, because the stash is not readable
     on the server and so arrives a render after the first one — state seeded
     from it would always be seeded with nothing, and the draft they were in
     the middle of would never come back. */
  const [picked, setPicked] = useState<{ screen: "select" | "chat"; type: DocType | null } | null>(
    null,
  );
  const opened =
    resumeType ??
    stashType ??
    (presetSlug ? (docTypes.find((d) => d.slug === presetSlug) ?? null) : null);
  const screen: "select" | "chat" = picked ? picked.screen : opened ? "chat" : "select";
  const chosen = picked ? picked.type : opened;

  // Belt and braces: "chat" with nothing chosen would render an empty page, and
  // a blank screen is the one failure a user cannot report usefully. Fall back
  // to the catalogue instead.
  const view = screen === "chat" && chosen ? "chat" : "select";

  if (docTypes.length === 0) {
    return (
      <main className="wrap" style={{ maxWidth: 640, padding: "72px 24px" }}>
        <p className="kicker">FD AI</p>
        <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", marginTop: 10 }}>
          No document types are loaded.
        </h1>
        <p className="sub" style={{ marginTop: 12 }}>
          The catalogue is empty, so there is nothing to draft. If Supabase is connected,
          check that <code>doc_types</code> has at least one row with{" "}
          <code>is_active = true</code> — run <code>supabase/002_seed_doctypes.sql</code>{" "}
          again if in doubt.
        </p>
      </main>
    );
  }

  return (
    <>
      <Intro />
      <div className="fdai-screens">
        {view === "select" && (
          <Catalogue
            liveSlugs={liveSlugs}
            isAdmin={isAdmin}
            wallet={live}
            onPick={(slug) => {
              const d = docTypes.find((x) => x.slug === slug);
              if (!d) return;
              clearStash();
              track("doc_selected", { doc_type: d.slug });
              setPicked({ screen: "chat", type: d });
            }}
          />
        )}
        {view === "chat" && chosen && (
          <Chat
            /* The key carries whether there is a draft to restore, so the one
               render where the stash has not been read yet is replaced rather
               than kept. */
            key={resume ? resume.id : `${chosen.slug}:${stashType === chosen ? "restored" : "new"}`}
            docType={chosen}
            userEmail={userEmail ?? null}
            recent={recent ?? []}
            wallet={live}
            prefill={prefill ?? null}
            resume={resumeType && resume ? resume : null}
            restore={stashType && stashType.slug === chosen.slug ? stash : null}
            onCreditSpent={spendCredit}
            onChangeDocument={() => {
              /* Choosing a different document abandons this one — leaving the
                 old conversation stashed would bring it back on the next
                 visit, over the top of whatever they choose now. */
              clearStash();
              setPicked({ screen: "select", type: null });
            }}
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── opening */

function Intro() {
  const [state, setState] = useState<"in" | "out" | "gone">("in");
  const [fast, setFast] = useState(false);

  // Reduced motion is handled in CSS (`.fd-intro { display:none }`), not here —
  // the design file does it that way and it avoids a hydration mismatch.
  useEffect(() => {
    const t = setTimeout(() => setState("out"), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "out") return;
    const t = setTimeout(() => setState("gone"), fast ? 650 : 1200);
    return () => clearTimeout(t);
  }, [state, fast]);

  if (state === "gone") return null;
  return (
    <div
      className={`fd-intro${state === "out" ? " is-out" : ""}${fast ? " is-fast" : ""}`}
      role="presentation"
      onClick={() => {
        setFast(true);
        setState("out");
      }}
    >
      <div className="in">
        <p className="k">FoundersDoc</p>
        <h2>
          Welcome to <em>FD AI</em>
        </h2>
        <div className="rule" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── catalogue */

const FDEFS = (
  <svg className="fdefs" aria-hidden="true">
    <defs>
      <linearGradient id="fdFbk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7d47e" />
        <stop offset="1" stopColor="#e0a52c" />
      </linearGradient>
      <linearGradient id="fdFfr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbe7b4" />
        <stop offset="1" stopColor="#f3bf4b" />
      </linearGradient>
    </defs>
  </svg>
);

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        d="M3 9.5A4.5 4.5 0 0 1 7.5 5h13.9a4.5 4.5 0 0 1 3.2 1.3l3.6 3.6A4.5 4.5 0 0 0 31.4 11H52.5A4.5 4.5 0 0 1 57 15.5v6H3z"
        fill="url(#fdFbk)"
      />
      <path
        d="M3.2 19h53.6a3 3 0 0 1 2.9 3.8l-4.4 17A4.5 4.5 0 0 1 51 43H6.7a4.5 4.5 0 0 1-4.4-3.4L.3 22.8A3 3 0 0 1 3.2 19z"
        fill="url(#fdFfr)"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        d="M3 9.5A4.5 4.5 0 0 1 7.5 5h13.9a4.5 4.5 0 0 1 3.2 1.3l3.6 3.6A4.5 4.5 0 0 0 31.4 11H52.5A4.5 4.5 0 0 1 57 15.5V39a4.5 4.5 0 0 1-4.5 4.5h-45A4.5 4.5 0 0 1 3 39z"
        fill="url(#fdFbk)"
      />
      <path
        d="M7 14.5h46a4 4 0 0 1 4 4V39a4.5 4.5 0 0 1-4.5 4.5h-45A4.5 4.5 0 0 1 3 39V18.5a4 4 0 0 1 4-4z"
        fill="url(#fdFfr)"
      />
      <path d="M7 14.5h46a4 4 0 0 1 4 4v1.1H3v-1.1a4 4 0 0 1 4-4z" fill="#fff" opacity=".5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        className="sh-face sh-edge"
        d="M17 3.5h17.2L45 14.3V43a1.5 1.5 0 0 1-1.5 1.5h-26A1.5 1.5 0 0 1 16 43V5a1.5 1.5 0 0 1 1-1.5z"
        strokeWidth="1"
      />
      <path className="sh-fold" d="M34.2 3.5L45 14.3h-9.3a1.5 1.5 0 0 1-1.5-1.5z" />
      <rect className="sh-line" x="21" y="21" width="19" height="1.8" rx=".9" />
      <rect className="sh-line" x="21" y="26" width="19" height="1.8" rx=".9" />
      <rect className="sh-line" x="21" y="31" width="13" height="1.8" rx=".9" />
      <rect x="21" y="36" width="9" height="2.4" rx="1.2" fill="#c9962a" />
    </svg>
  );
}

function Catalogue({
  liveSlugs,
  isAdmin,
  wallet,
  onPick,
}: {
  liveSlugs: Set<string>;
  isAdmin: boolean;
  wallet: WalletView | null;
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState(0);
  const [showSoon, setShowSoon] = useState(true);
  const [typed, setTyped] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // A row is draftable only if the running catalogue actually has it.
  const ready = useCallback((d: CatDoc) => d[3] && liveSlugs.has(d[0]), [liveSlugs]);

  useEffect(() => {
    const text = "Choose your starting point.";
    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (reduce) {
        setTyped(text);
        return;
      }
      setTyped(text.slice(0, i));
      if (i < text.length) {
        const c = text.charAt(i);
        i++;
        timer = setTimeout(tick, c === " " ? 54 : c === "." ? 150 : 38);
      }
    };
    // The headline waits for the opening splash to clear before it starts typing.
    timer = setTimeout(tick, reduce ? 0 : 2400);
    return () => clearTimeout(timer);
  }, []);

  const query = q.trim().toLowerCase();
  const visible = (d: CatDoc) => ready(d) || showSoon;
  const hit = (d: CatDoc, g: CatFolder) =>
    `${d[1]} ${d[2]} ${g[0]} ${d[4]}`.toLowerCase().includes(query);
  const readyOf = (g: CatFolder) => g[1].filter(ready).length;

  const totalDocs = CATALOGUE.reduce((t, g) => t + g[1].length, 0);
  const totalReady = CATALOGUE.reduce((t, g) => t + readyOf(g), 0);

  /* ── WHAT "HIDE COMING SOON" HIDES ────────────────────────────────────────
     It used to hide coming-soon DOCUMENTS and leave their folders standing —
     so pressing it emptied four folders and left four rows reading "Coming
     soon" in a list whose whole point was to be shorter. A folder with nothing
     ready in it is a coming-soon folder, and goes with them.

     Folders are carried with their real index because `folder` points into
     CATALOGUE, not into this filtered view; renumbering here would select the
     wrong folder the moment anything is hidden. */
  const folderIndices = CATALOGUE.map((_, i) => i).filter(
    (i) => showSoon || readyOf(CATALOGUE[i]) > 0,
  );
  const hiddenFolders = CATALOGUE.length - folderIndices.length;

  /* Toggling off can hide the folder being looked at. Moving the selection is
     done HERE, in the handler, rather than in an effect that watches showSoon:
     an effect would set state during render and flash the empty folder first. */
  const toggleSoon = () => {
    const next = !showSoon;
    /* Worked out before either setState, not inside the updater: an updater
       has to be pure, and React runs it twice in development to prove it. */
    if (!next && readyOf(CATALOGUE[folder]) === 0) {
      const firstReady = CATALOGUE.findIndex((g) => readyOf(g) > 0);
      if (firstReady >= 0) setFolder(firstReady);
    }
    setShowSoon(next);
  };

  const results: { doc: CatDoc; group: string }[] = [];
  if (query) {
    for (const g of CATALOGUE) {
      for (const d of g[1]) if (visible(d) && hit(d, g)) results.push({ doc: d, group: g[0] });
    }
  }
  const current = CATALOGUE[folder];
  const rows = current[1].filter(visible);

  function row(d: CatDoc, group: string) {
    const rdy = ready(d);
    return (
      <button
        key={d[0]}
        type="button"
        className={`drow${rdy ? "" : " soon"}`}
        disabled={!rdy}
        onClick={() => rdy && onPick(d[0])}
      >
        <span className="ic">
          <FileIcon />
        </span>
        <span className="tx">
          <b>{d[1]}</b>
          <small>
            {d[2]}
            {group ? <i className="in"> · {group}</i> : null}
          </small>
        </span>
        <span className={`pill${rdy ? " rdy" : ""}`}>{rdy ? "Ready" : "Coming soon"}</span>
      </button>
    );
  }

  return (
    <div id="scr-select" className="scr step on fade-in">
      <div className="step-in">
        <div className="crumbs">
          <button type="button">FD AI</button>
          <span className="sep">›</span>
          <b>New draft</b>
        </div>

        <aside className="select-intro">
          <p className="select-k">Document catalogue</p>
          <h2 className="typed">
            <span className="tw">{typed}</span>
            <i className="caret" aria-hidden="true" />
          </h2>
          <p className="sub">Pick a document. FD AI shapes the questions around it.</p>
          <p className="select-tip">Upcoming templates stay listed, marked Coming soon.</p>

          {/* The balance belongs HERE as much as in the workspace rail. This is
              the first screen after signing in, and until now it said nothing
              about credits at all — so the first a person heard of a limit was
              the paywall, after they had answered every question. Telling them
              up front is both fairer and less work to act on. */}
          {wallet && (
            <div className="cat-credits">
              <span className="cat-credits-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="6" rx="8" ry="3" />
                  <path d="M4 6v5c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
                  <path d="M4 11v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" />
                </svg>
              </span>
              <span className="cat-credits-n">{wallet.credits}</span>
              <span className="cat-credits-t">
                <b>{wallet.credits === 1 ? "Credit" : "Credits"}</b>
                <small>
                  {wallet.inTrial && wallet.trialEndsAt
                    ? `Trial ends ${new Date(wallet.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : wallet.credits === 0
                      ? "Add credits to draft again"
                      : "These do not expire"}
                </small>
              </span>
              <a className="cat-credits-a" href={wallet.credits === 0 ? "/billing" : "/usage"}>
                {wallet.credits === 0 ? "Add credits" : "View details"}
                <span aria-hidden="true">&rsaquo;</span>
              </a>
            </div>
          )}

          {/* Admins only, and only ever rendered for them: the button is not
              hidden with CSS, it is absent from the HTML a normal user
              receives. The page behind it checks again on the server, because
              a missing button is a courtesy, not a lock. */}
          {isAdmin && (
            <a className="admin-open" href="/admin">
              <span className="admin-open-ic" aria-hidden="true" />
              <span>
                <b>Admin workspace</b>
                <small>Documents and analytics</small>
              </span>
            </a>
          )}

          <div className="intro-foot">
            <a className="alt-link" href="https://foundersdoc.com/contact">
              Review an agreement
            </a>
            <a className="alt-link" href="https://foundersdoc.com/contact">
              Ask a lawyer
            </a>
          </div>
        </aside>

        <section className="cat">
          <div className="search">
            <input
              ref={searchRef}
              type="search"
              placeholder="Search documents or business needs"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) setQ("");
              }}
            />
          </div>

          <div className="cat-bar">
            <span className="ex-count">
              {query ? (
                <>
                  <b>Search</b> · {results.length} of {totalDocs} documents
                </>
              ) : (
                <>
                  <b>Documents</b> · {folderIndices.length}{" "}
                  {folderIndices.length === 1 ? "folder" : "folders"} · {totalReady} ready to
                  draft{" "}
                  {showSoon ? (
                    <>· {totalDocs - totalReady} coming soon</>
                  ) : hiddenFolders > 0 ? (
                    <>
                      · {hiddenFolders} {hiddenFolders === 1 ? "folder" : "folders"} hidden
                    </>
                  ) : null}
                </>
              )}
            </span>
            <button type="button" className="show-soon" onClick={toggleSoon}>
              {showSoon ? "Hide coming soon" : "Show coming soon"}
            </button>
          </div>

          <div className="exwrap">
            <nav className="flist" aria-label="Document folders">
              {FDEFS}
              {folderIndices.map((gi) => {
                const g = CATALOGUE[gi];
                const matches = g[1].filter((d) => visible(d) && (!query || hit(d, g)));
                const r = readyOf(g);
                const soonN = g[1].length - r;
                const on = !query && gi === folder;
                const dim = query ? matches.length === 0 : r === 0;
                const bits: React.ReactNode[] = [];
                if (r) bits.push(<em key="r">{r} ready</em>);
                if (soonN) bits.push(<span key="s">{bits.length ? " · " : ""}Coming soon</span>);
                return (
                  <button
                    key={g[0]}
                    type="button"
                    className={`frow${on ? " on" : ""}${dim ? " mute" : ""}`}
                    onClick={() => {
                      setFolder(gi);
                      setQ("");
                    }}
                  >
                    <span className="ic">
                      <FolderIcon open={on} />
                    </span>
                    <span className="tx">
                      <b>{g[0]}</b>
                      <small title={g[1].map((d) => d[1]).join(", ")}>
                        {query
                          ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
                          : bits}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>

            <section className="dpanel" aria-live="polite">
              {query ? (
                <>
                  <div className="dp-head">
                    <span>
                      <b>Search results</b>
                      <p>Matches across every folder.</p>
                    </span>
                    <span className="n">
                      {results.length} {results.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  {results.length ? (
                    results.map((r) => row(r.doc, r.group))
                  ) : (
                    <p className="empty">Nothing matches “{q}”. Try another search.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="dp-head">
                    <span>
                      <b>{current[0]}</b>
                      <p>
                        {readyOf(current)
                          ? `Select a document to begin the drafting flow.${
                              current[1].length - readyOf(current)
                                ? " Items marked Coming soon are not draftable yet."
                                : ""
                            }`
                          : rows.length
                            ? "Every template here is still in preparation — listed so you can see what is coming."
                            : "Nothing here is ready to draft yet."}
                      </p>
                    </span>
                    <span className="n">
                      {rows.length} {rows.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  {rows.length ? (
                    rows.map((d) => row(d, ""))
                  ) : (
                    <p className="empty">
                      Upcoming templates are hidden.{" "}
                      <button type="button" className="peek" onClick={() => setShowSoon(true)}>
                        Show coming soon
                      </button>
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

/** How narrow and how wide the rail may be dragged. Narrower than this and the
 *  names are unreadable; wider and the document loses the room it needs. */
const RAIL_MIN = 200;
const RAIL_MAX = 420;
const RAIL_KEY = "fdai.rail-width";

/* The width lives in this browser, not in the database: it is a preference
   about one screen on one machine, and the firm has no use for it. Reading it
   through useSyncExternalStore rather than in an effect is what keeps the
   server's first render and the browser's agreeing — the server has no
   localStorage, so it starts from the design's own width and this arrives
   without a flash of the wrong one. */
function readRailWidth(): number | null {
  try {
    const v = Number(window.localStorage.getItem(RAIL_KEY));
    return Number.isFinite(v) && v >= RAIL_MIN && v <= RAIL_MAX ? v : null;
  } catch {
    // Private browsing, or storage turned off. The default width is fine.
    return null;
  }
}

function watchRailWidth(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Remember it — or forget it, when the person resets the width. */
function saveRailWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(RAIL_KEY);
    else window.localStorage.setItem(RAIL_KEY, String(width));
    /* A tab does not hear its own storage events, and this is the same tab
       that has to redraw. */
    window.dispatchEvent(new StorageEvent("storage", { key: RAIL_KEY }));
  } catch {
    // Not being able to remember it is no reason to refuse to do it.
  }
}

/**
 * The draft's name, in the strip, editable in place.
 *
 * Before the draft exists there is nothing to name and nothing to save it to,
 * so it shows what is being made and is not clickable. Once FD AI has named
 * it, one click turns it into a text box — Enter or clicking away keeps the
 * change, Escape abandons it.
 */
function DraftName({
  name,
  canRename,
  onRename,
  placeholder,
}: {
  name: string;
  canRename: boolean;
  onRename: (next: string) => void;
  placeholder: string;
}) {
  /* The box holds its own text only while it is open, and is filled from the
     current name at the moment it opens. Keeping the two in step with an
     effect instead would overwrite what the person is typing the moment the
     name changed underneath them. */
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  /* Escape unmounts the input, which fires blur on the way out. Without this
     the abandoned text would be saved by the blur handler — the one outcome
     the Escape key must never have. */
  const abandoned = useRef(false);

  if (!canRename || !name) {
    return (
      <span className="dname dname-waiting" title="FD AI names your draft once it is written">
        {name || placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="dname"
        title="Rename this draft"
        onClick={() => {
          abandoned.current = false;
          setText(name);
          setEditing(true);
        }}
      >
        {name}
      </button>
    );
  }

  const finish = () => {
    setEditing(false);
    if (abandoned.current) return;
    onRename(text);
  };

  return (
    <input
      className="dname-input"
      value={text}
      maxLength={80}
      autoFocus
      aria-label="Draft name"
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          abandoned.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════ chat */

function Chat({
  docType,
  userEmail,
  recent,
  wallet,
  prefill,
  resume,
  restore,
  onCreditSpent,
  onChangeDocument,
}: {
  docType: DocType;
  userEmail: string | null;
  recent: RecentDraft[];
  wallet: WalletView | null;
  prefill: Prefill | null;
  resume: ResumeDraft | null;
  /** A draft this tab was part-way through when it navigated away. */
  restore: DraftStash | null;
  onCreditSpent: (creditsLeft: number | null) => void;
  onChangeDocument: () => void;
}) {
  const steps = useMemo(() => buildSteps(docType), [docType]);

  /* Everything below is seeded from the saved draft when one was opened, and
     from a blank form otherwise. It is done in the initialisers rather than in
     an effect so a reopened draft renders complete on its first paint — an
     effect would show an empty conversation for a frame first, which reads as
     the draft having been lost. */
  const replayed = useMemo(
    () =>
      resume
        ? replayConversation(
            docType,
            steps,
            resume.answers,
            resume.sourceText ? ["the document you attached"] : [],
            resume.createdAt,
          )
        : null,
    [resume, docType, steps],
  );

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    resume
      ? { ...initialAnswers(docType, null), ...resume.answers }
      : restore
        ? { ...initialAnswers(docType, null), ...restore.answers }
        : initialAnswers(docType, prefill),
  );
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    replayed
      ? replayed.msgs
      : restore
        ? restore.msgs
        : [
            {
              who: "fd",
              text: `Let’s build your ${docType.label}. I’ll ask ${steps.length} focused questions and carry your answers forward as we go. Skip anything you’re unsure about — you can return to it later.`,
            },
          ],
  );
  const [i, setI] = useState(resume ? steps.length : (restore?.i ?? 0));
  const [status, setStatus] = useState<Status[]>(
    () =>
      replayed?.status ??
      /* Only if it still describes this document type's steps — a published
         change to the questions makes an older list meaningless. */
      (restore && restore.status.length === steps.length ? restore.status : null) ??
      steps.map(() => undefined),
  );
  const [typedAnswer, setTypedAnswer] = useState("");

  // source document
  const [sourceText, setSourceText] = useState(resume?.sourceText ?? restore?.sourceText ?? "");
  /* The file's NAME was never recorded — naming a file names a matter, and the
     rule at the top of lib/events.ts says we do not keep that. So a reopened
     draft can say that something was worked from, but not what it was called. */
  const [attachments, setAttachments] = useState<string[]>(
    resume?.sourceText ? ["the document you attached"] : (restore?.attachments ?? []),
  );
  const [uploading, setUploading] = useState(false);

  // draft
  /* A reopened draft opens on its document, because that is what the person
     came back for. The conversation is right there beside it, and the back
     button returns to the questions. */
  const [view, setView] = useState<"chat" | "draft">(
    resume?.output ? "draft" : (restore?.view ?? "chat"),
  );
  const [output, setOutput] = useState(resume?.output ?? restore?.output ?? "");
  const editorExportRef = useRef<{ html: string; plain: string } | null>(null);
  const captureEditorContent = useCallback((html: string, plain: string) => {
    editorExportRef.current = { html, plain };
  }, []);
  const [busy, setBusy] = useState(false);
  /** Immediate re-entrancy guard for generate(); see the comment there. */
  const generatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /* Out of credits is not an error, it is a state. Rendering it as a red box
     next to "something went wrong" would tell a customer their document broke
     when in fact nothing broke and they simply need to buy more. */
  const [paywalled, setPaywalled] = useState(false);
  /* The saved row this draft belongs to, so edits can be written back. Null
     until the generate endpoint reports it — and it stays null when Supabase
     is not configured, in which case the Save button simply does nothing
     rather than pretending. */
  const [draftId, setDraftId] = useState<string | null>(resume?.id ?? restore?.draftId ?? null);
  const [savedHtml, setSavedHtml] = useState<string | null>(resume?.outputHtml ?? null);
  /* The draft's name, live on screen: written by FD AI when the draft is made,
     and changeable by the person at any time after. */
  const [name, setName] = useState<string>(resume?.title ?? restore?.name ?? "");
  /* The rail's list, held here rather than read straight from the prop, because
     renaming one has to show on the spot rather than on the next page load. */
  const [pastDrafts, setPastDrafts] = useState<RecentDraft[]>(recent);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  /* How wide the rail is. Null means the width the design ships with; a number
     is the person's own choice. The dragged value leads while the pointer is
     down, and what is stored takes over once it is let go. */
  const storedRailWidth = useSyncExternalStore(watchRailWidth, readRailWidth, () => null);
  const [draggedRailWidth, setDraggedRailWidth] = useState<number | null>(null);
  const railWidth = draggedRailWidth ?? storedRailWidth;
  /* Generating lands in the conversation, not in the document: the person has
     just answered six questions and deserves to be told what was done with
     them before being handed a wall of contract. The document opens beside the
     chat when they ask for it — and closing it leaves the chat untouched. */
  const [docOpen, setDocOpen] = useState(restore?.docOpen ?? false);
  const [follow, setFollow] = useState<{
    who: "me" | "fd";
    text: string;
    version?: number;
    fileName?: string;
    documentText?: string;
    detailLevel?: number;
  }[]>(() => (restore ? restore.follow : replayRevisions(resume?.versions ?? [])));
  const [revising, setRevising] = useState(false);
  /** State disables the controls; the ref also closes the same-tick double-click window. */
  const revisingRef = useRef(false);

  /* Every version this draft has had, oldest first — read back from the
     database so reopening a draft that was revised four times shows four
     versions, not one. */
  const savedVersions = useMemo(
    () =>
      (resume?.versions ?? []).map((v) => ({
        documentText: v.output,
        version: v.version,
        detailLevel: v.detailLevel,
        fileName: v.fileName,
      })),
    [resume],
  );
  const latestSaved = savedVersions[savedVersions.length - 1];

  const [ndaDetailLevel, setNdaDetailLevel] = useState(
    latestSaved?.detailLevel ?? restore?.detail ?? 3,
  );
  const [documentVersion, setDocumentVersion] = useState(
    latestSaved?.version ?? restore?.version ?? 1,
  );
  const versionCounterRef = useRef(latestSaved?.version ?? restore?.version ?? 1);
  const [documentVersions, setDocumentVersions] = useState<DocVersion[]>(
    restore && savedVersions.length === 0 ? restore.versions : savedVersions,
  );
  const [skippedLabels, setSkippedLabels] = useState<string[]>(restore?.skipped ?? []);
  const [toast, setToast] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* What the person actually said, for the summary in their own message.
     Built from the same `summarise` the chat uses, so the wording they see
     here is the wording they saw when they answered. */
  const answerSummary = useMemo(
    () =>
      steps
        .map((s, k) => ({ label: s.name, value: status[k] === "done" ? summarise(s) : "" }))
        .filter((a) => a.value && a.value !== "—"),
    // summarise reads the current answers; recomputing per render is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, status, answers, attachments],
  );

  const finished = i >= steps.length;
  const step = finished ? null : steps[i];

  const fileNameFor = useCallback(
    (version: number, detailLevel: number) => {
      const clean = (value: string) =>
        (value === SKIPPED ? "" : value.split("(")[0])
          .replace(/[^a-zA-Z0-9 -]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 28);
      const parties = [clean(answers.party_a ?? ""), clean(answers.party_b ?? "")].filter(Boolean);
      const detailName = DETAIL_LABELS[detailLevel - 1] ?? "Revised";
      return ["NDA", ...parties, `V${version}`, detailName].join("-") + ".docx";
    },
    [answers.party_a, answers.party_b],
  );
  const currentFileName = fileNameFor(documentVersion, ndaDetailLevel);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, i]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── keeping the way back ────────────────────────────────────────────────
     Written as the conversation goes, so that Credits, Usage or Past drafts
     and then Back returns to this screen rather than the empty catalogue.
     Nothing is written for a draft opened from the list: that one has a URL of
     its own, and stashing it would bring it back over the top of a new draft.

     Debounced, because `answers` changes on every keystroke and there is no
     sense serialising the whole conversation forty times a second. */
  useEffect(() => {
    if (resume) return;
    const write = setTimeout(() => {
      writeStash({
        v: STASH_VERSION,
        at: Date.now(),
        who: stashOwner(userEmail),
        slug: docType.slug,
        answers,
        status,
        i,
        msgs,
        name,
        sourceText,
        attachments,
        output,
        draftId,
        view,
        docOpen,
        follow,
        versions: documentVersions,
        version: documentVersion,
        detail: ndaDetailLevel,
        skipped: skippedLabels,
      });
    }, 400);
    return () => clearTimeout(write);
  }, [
    resume,
    userEmail,
    docType.slug,
    answers,
    status,
    i,
    msgs,
    name,
    sourceText,
    attachments,
    output,
    draftId,
    view,
    docOpen,
    follow,
    documentVersions,
    documentVersion,
    ndaDetailLevel,
    skippedLabels,
  ]);

  /* ── where people give up ─────────────────────────────────────────────────
     The most useful number in the whole system is the question people stop at,
     and it is the hardest to collect: by the time it matters the tab is
     closing. So the current position is kept in refs (a listener registered
     once cannot read state that changed after it), and the event goes out on
     `pagehide`/`visibilitychange` — not `beforeunload`, which mobile Safari
     never fires. track() uses sendBeacon, which the browser delivers after the
     page is gone.

     It fires once, and only for someone who started answering and never got a
     draft: leaving after you have your document is success, not abandonment. */
  const progressRef = useRef({ step: 0, total: 0, generated: false, started: false });
  progressRef.current = {
    step: i,
    total: steps.length,
    generated: output.length > 0,
    started: i > 0,
  };

  useEffect(() => {
    let sent = false;
    const leave = () => {
      const p = progressRef.current;
      if (sent || !p.started || p.generated) return;
      sent = true;
      track("draft_abandoned", {
        doc_type: docType.slug,
        step: p.step + 1,
        total_steps: p.total,
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [docType.slug]);

  // Click anywhere else, or press Escape, and the account menu closes — the
  // same behaviour as the nav's dropdowns.
  useEffect(() => {
    if (!acctOpen) return;
    const close = () => setAcctOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  function setAnswer(key: string, v: string) {
    setAnswers((a) => ({ ...a, [key]: v }));
  }

  /** Every required field on this step has something in it. A step with no
   *  required fields is always ready — that is what makes Terms tappable
   *  straight through on its defaults. */
  function ready(s: Step): boolean {
    return s.fields.filter((f) => f.required).every((f) => (answers[f.key] ?? "").trim() !== "");
  }

  /** One line summarising what the user just said, echoed back as their message.
   *  `override` carries a value chosen this very tick — a tapped chip commits on a
   *  timer, so without it the echo is built from the previous render's answers
   *  and reads "—". */
  function summarise(s: Step, override?: Record<string, string>): string {
    return describeStep(s, { ...answers, ...(override ?? {}) }, attachments);
  }

  /** Move on. `skipped` marks every field on this step with the SKIPPED marker
   *  so the prompt knows the difference between deferred and never-asked. */
  const commit = useCallback(
    (skipped: boolean, atIndex?: number, extra?: string) => {
      const idx = atIndex ?? i;
      const s = steps[idx];
      if (!s) return;

      const override: Record<string, string> = {};
      if (!skipped && extra !== undefined && s.fields.length === 1) {
        override[s.fields[0].key] = extra;
      }

      setAnswers((prev) => {
        const next = { ...prev, ...override };
        if (skipped) {
          for (const f of s.fields) if (!(next[f.key] ?? "").trim()) next[f.key] = SKIPPED;
        }
        return next;
      });

      setStatus((prev) => {
        const next = [...prev];
        next[idx] = skipped ? "skp" : "done";
        return next;
      });

      setMsgs((prev) => [
        ...prev,
        { who: "fd", text: s.question },
        {
          who: "me",
          label: s.name,
          text: skipped ? "Skipped for now" : summarise(s, override),
          skipped,
        },
      ]);
      /* The funnel, recorded where the decision actually happens.
         `question_skipped` carries the field KEY, never what was typed — see
         the rule at the top of lib/events.ts. */
      if (idx === 0) track("draft_started", { doc_type: docType.slug, total_steps: steps.length });
      if (skipped) {
        for (const f of s.fields) {
          track("question_skipped", { doc_type: docType.slug, question_key: f.key, step: idx + 1 });
        }
      }

      setTypedAnswer("");
      setI(idx + 1);
    },
    // summarise reads current answers/attachments; recreating the callback each
    // render is cheaper than threading them through and getting a stale echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i, steps, answers, attachments],
  );

  /** Skip everything still outstanding, then draft. */
  function draftWithWhatIHave() {
    const from = i;
    const detailIndex = steps.findIndex((item) => item.kind === "detail");
    const mustChooseDetail = detailIndex >= 0 && status[detailIndex] !== "done";
    const stopAt = mustChooseDetail ? detailIndex : steps.length;

    track("draft_with_what_i_have", {
      doc_type: docType.slug,
      step: from + 1,
      total_steps: steps.length,
      count: Math.max(0, stopAt - from),
    });
    setAnswers((prev) => {
      const next = { ...prev };
      for (let k = from; k < stopAt; k++) {
        for (const f of steps[k].fields) if (!(next[f.key] ?? "").trim()) next[f.key] = SKIPPED;
      }
      return next;
    });
    setStatus((prev) => {
      const next = [...prev];
      for (let k = from; k < stopAt; k++) next[k] = "skp";
      return next;
    });
    setMsgs((prev) => [
      ...prev,
      { who: "me", label: "Drafting now", text: "Draft with what I have", skipped: true },
      {
        who: "fd",
        text: mustChooseDetail
          ? "Before I draft, choose how comprehensive you want the NDA to be."
          : "Drafting from what you’ve given me. Everything you skipped comes back as [[TO CONFIRM]] so nothing is quietly invented.",
      },
    ]);
    setI(stopAt);
    if (!mustChooseDetail) setTimeout(() => void generate(), 40);
  }

  /** Re-open a question that was skipped earlier. */
  function revisit(k: number) {
    setStatus((prev) => {
      const next = [...prev];
      next[k] = undefined;
      return next;
    });
    setAnswers((prev) => {
      const next = { ...prev };
      for (const f of steps[k].fields) if (next[f.key] === SKIPPED) next[f.key] = f.defaultValue ?? "";
      return next;
    });
    setMsgs((prev) => [
      ...prev,
      { who: "fd", text: `Let’s go back to ${steps[k].name.toLowerCase()}.` },
    ]);
    setView("chat");
    setI(k);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const j = (await res.json().catch(() => null)) as
        | { text?: string; error?: string; kind?: string }
        | null;
      if (!res.ok || !j?.text) {
        setError(j?.error ?? "Could not read that file.");
        return;
      }
      setSourceText(j.text);
      /* The file NAME is never recorded — "Project Dragonfly NDA.docx" names a
         matter. Only that an upload happened, roughly how much text, and which
         format it was, which is what tells the firm whether people are sending
         Word or PDF. */
      track("source_uploaded", {
        doc_type: docType.slug,
        words: j.text.trim().split(/\s+/).length,
        ...(j.kind ? { format: j.kind } : {}),
      });
      setAttachments((a) => [...a, file.name]);
      setToast(`Attached ${file.name}`);
      if (step?.kind === "source") commit(false);
    } catch {
      setError("Could not upload that file. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    /* One generation at a time, enforced with a ref rather than the `busy`
       state. The buttons are disabled on `busy`, but React applies state
       asynchronously, so two clicks landing in the same tick both see the old
       value and both get through. Each one reserves its own credit and both
       queue against the same rate limit, making a slow draft slower. A ref
       updates immediately, which is exactly what a guard needs. */
    if (generatingRef.current) return;
    generatingRef.current = true;

    const startedAt = Date.now();
    setFollow([]);
    setDocumentVersions([]);
    setDocumentVersion(1);
    versionCounterRef.current = 1;
    setDocOpen(false);
    setBusy(true);
    setError(null);
    editorExportRef.current = null;
    setOutput("");
    setSkippedLabels([]);
    setView("draft");

    // Read the freshest answers rather than the closure's snapshot: the caller
    // may have marked several fields skipped microseconds ago.
    const payload = await new Promise<Record<string, string>>((resolve) => {
      setAnswers((a) => {
        resolve(a);
        return a;
      });
    });

    const initialDetailLevel = Math.min(
      5,
      Math.max(1, Number(payload._nda_detail_level) || 3),
    ) as 1 | 2 | 3 | 4 | 5;
    setNdaDetailLevel(initialDetailLevel);

    /* ── DON'T SPIN FOREVER ──────────────────────────────────────────────
       If the function is killed by the platform it never closes the stream,
       and fetch simply waits: the page sat on "Working" indefinitely, with no
       error and no way back. The server now sends a line every few seconds
       whether or not it has text yet, so silence really does mean the
       connection is gone. Give up after a spell of it. */
    const STALL_MS = 30_000;
    const giveUp = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(stall);
      stall = setTimeout(() => giveUp.abort(new Error("stalled")), STALL_MS);
    };
    heard();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docTypeSlug: docType.slug,
          answers: payload,
          sourceText,
          detailLevel: initialDetailLevel,
        }),
        signal: giveUp.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;

        if (res.status === 402 || j?.code === "no_credits") {
          track("paywall_hit", { doc_type: docType.slug });
          // Whatever the rail was showing, the true answer is none.
          onCreditSpent(0);
          setPaywalled(true);
          setView("chat");
          return;
        }

        track("draft_failed", { doc_type: docType.slug, reason: `http_${res.status}` });
        setError(j?.error ?? `Request failed (${res.status}).`);
        setView("chat");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        heard();
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let msg: {
            t: string;
            v?: string;
            skipped?: string[];
            creditsLeft?: number | null;
            draftId?: string | null;
            partial?: boolean;
            title?: string;
          };
          try {
            msg = JSON.parse(raw);
          } catch {
            continue;
          }
          if (msg.t === "ping") {
            // Proof of life only; heard() above has already done the work.
            continue;
          }
          if (msg.t === "text" && msg.v) {
            acc += msg.v;
            setOutput(acc);
          } else if (msg.t === "error") {
            /* Come back to the conversation. Without this the drafting pane
               stays up saying "Drafting your document…" while the error sits
               unread on a view nobody is looking at — which reads as the app
               having hung, for as long as the person is willing to wait. The
               HTTP-error branch above has always done this; the streamed-error
               branch did not, and that is the difference between an error and
               an apparent freeze. */
            setError(msg.v ?? "Drafting failed.");
            setView("chat");
          } else if (msg.t === "done") {
            setSkippedLabels(msg.skipped ?? []);
            setDraftId(msg.draftId ?? null);
            /* The name FD AI gave it, on screen the moment the draft exists —
               not on the next page load. */
            if (msg.title) setName(msg.title);
            setSavedHtml(null); // a fresh generation replaces any saved edits
            if (!msg.partial && acc.trim()) {
              setDocumentVersions([{
                documentText: acc,
                version: 1,
                detailLevel: initialDetailLevel,
                fileName: fileNameFor(1, initialDetailLevel),
              }]);
              setDocumentVersion(1);
              setNdaDetailLevel(initialDetailLevel);
              versionCounterRef.current = 1;
            }
            if (msg.partial) {
              /* Cut short. Say so where it cannot be missed, and do not let
                 the credit counter tick down for a document that is not whole. */
              setError(
                "This draft was cut off before it finished, so it is incomplete and nothing was " +
                  "charged. It is here to read, not to send — generate again for a full document.",
              );
            }
            // The credit was spent on the server; reflect it here immediately.
            // A partial draft was refunded, so this puts the number back up.
            onCreditSpent(msg.creditsLeft ?? null);
          }
        }
      }
      /* Seconds-to-draft is the number that decides whether this feels like a
         tool or a wait. Recorded on success only — a failure has its own
         event and would drag the average somewhere meaningless. */
      track("draft_generated", {
        doc_type: docType.slug,
        seconds: (Date.now() - startedAt) / 1000,
        words: acc.trim().split(/\s+/).length,
      });
    } catch {
      if (giveUp.signal.aborted) {
        track("draft_failed", { doc_type: docType.slug, reason: "stalled" });
        setError(
          "The drafting service stopped responding, so this was abandoned rather than left " +
            "spinning. Check the credit count before trying again — if it has not come back, " +
            "that draft was charged for.",
        );
      } else {
        track("draft_failed", { doc_type: docType.slug, reason: "network" });
        setError("Could not reach the drafting service. Check your connection and try again.");
      }
    } finally {
      clearTimeout(stall);
      generatingRef.current = false;
      setBusy(false);
    }
  }

  /**
   * Persist the edited document.
   *
   * The lawyer's HTML goes to `output_html`; `output` — the model's own text —
   * is deliberately left alone, so a later revision still starts from what was
   * generated rather than from someone's half-finished edit.
   */
  const saveDocument = useCallback(
    async (html: string, plain: string) => {
      if (!draftId) {
        // Nothing to save against: no account, or the draft was never stored.
        setSavedHtml(html);
        return;
      }
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outputHtml: html }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not save your changes.");
        throw new Error("save failed");
      }
      setSavedHtml(html);
      setToast("Saved");
      void plain;
    },
    [draftId],
  );

  /**
   * Ask FD AI to change the draft that already exists.
   *
   * The whole revised document comes back and replaces the old one — which is
   * why the editor is keyed on the output's length: a new document must be a
   * new editor, or the pages would still be showing the previous text.
   */
  async function revise(
    instruction: string,
    options?: {
      targetDetailLevel?: 1 | 2 | 3 | 4 | 5;
    },
  ) {
    if (revisingRef.current || generatingRef.current || revising || busy) return;
    revisingRef.current = true;
    setRevising(true);
    setError(null);

    /* ── DON'T SPIN FOREVER ────────────────────────────────────────────────
       Identical to generate(). A killed function never closes its stream, so
       fetch waits indefinitely and the page sits on "Revising…" with no error
       and no way back. The server now sends a line every few seconds whether
       or not it has text, so silence really does mean the connection is gone. */
    const REVISE_STALL_MS = 30_000;
    const giveUp = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(stall);
      stall = setTimeout(() => giveUp.abort(new Error("stalled")), REVISE_STALL_MS);
    };
    heard();
    setPaywalled(false);
    setFollow((f) => [...f, { who: "me", text: instruction }]);

    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: giveUp.signal,
        body: JSON.stringify({
          draftId,
          instruction,
          text: output,
          targetDetailLevel: options?.targetDetailLevel,
          currentDetailLevel: ndaDetailLevel,
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        if (res.status === 402 || j?.code === "no_credits") {
          onCreditSpent(0);
          setPaywalled(true);
          return;
        }
        setError(j?.error ?? "Could not revise the draft.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let failed = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        heard();
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let msg: { t: string; v?: string; charged?: boolean; creditsLeft?: number | null };
          try {
            msg = JSON.parse(raw);
          } catch {
            continue;
          }
          if (msg.t === "ping") {
            // Proof of life only; heard() above has already done the work.
            continue;
          }
          if (msg.t === "retry") {
            acc = "";
            failed = false;
            setError(null);
          } else if (msg.t === "text" && msg.v) acc += msg.v;
          else if (msg.t === "error") {
            failed = true;
            setError(msg.v ?? "Could not revise the draft.");
          } else if (msg.t === "done") {
            if (msg.charged) onCreditSpent(msg.creditsLeft ?? null);
          }
        }
      }

      const normalise = (value: string) => value.replace(/\s+/g, " ").trim();
      const materiallyChanged = (before: string, after: string) => {
        const a = normalise(before).split(" ");
        const b = normalise(after).split(" ");
        const lengthDelta = Math.abs(a.length - b.length) / Math.max(a.length, 1);
        const overlap = Math.min(a.length, b.length);
        let changedAtPosition = Math.abs(a.length - b.length);
        for (let index = 0; index < overlap; index += 1) {
          if (a[index] !== b[index]) changedAtPosition += 1;
        }
        return lengthDelta >= 0.03 || changedAtPosition / Math.max(a.length, b.length, 1) >= 0.06;
      };
      const changed = options?.targetDetailLevel
        ? materiallyChanged(output, acc)
        : normalise(acc) !== normalise(output);
      if (!failed && acc.trim() && changed) {
        const nextVersion = versionCounterRef.current + 1;
        const nextDetailLevel = options?.targetDetailLevel ?? ndaDetailLevel;
        const nextFileName = fileNameFor(nextVersion, nextDetailLevel);
        versionCounterRef.current = nextVersion;
        editorExportRef.current = null;
        setOutput(acc);
        setSavedHtml(null); // the lawyer's edits are superseded by the revision
        if (options?.targetDetailLevel) setNdaDetailLevel(options.targetDetailLevel);
        setDocumentVersion(nextVersion);
        setDocOpen(true);
        setDocumentVersions((versions) => [
          ...versions,
          {
            documentText: acc,
            version: nextVersion,
            detailLevel: nextDetailLevel,
            fileName: nextFileName,
          },
        ]);
        setFollow((f) => [
          ...f,
          {
            who: "fd",
            text: options?.targetDetailLevel
              ? `Version ${nextVersion} is ready. I rewrote the NDA at comprehensiveness level ${options.targetDetailLevel} and updated the document beside the chat.`
              : `Version ${nextVersion} is ready. I revised the NDA following your request and updated the document beside the chat.`,
            version: nextVersion,
            fileName: nextFileName,
            documentText: acc,
            detailLevel: nextDetailLevel,
          },
        ]);
        track("draft_revised", { doc_type: docType.slug });
      } else if (!failed && acc.trim()) {
        setError("The revision did not materially change the document. Please try again.");
      }
    } catch {
      if (giveUp.signal.aborted) {
        setError(
          "The drafting service stopped responding, so the revision was abandoned rather than " +
            "left spinning. Your document is unchanged. Check the credit count before trying " +
            "again — if it has not come back, that revision was charged for.",
        );
      } else {
        setError("Could not reach the drafting service. Check your connection and try again.");
      }
    } finally {
      clearTimeout(stall);
      revisingRef.current = false;
      setRevising(false);
    }
  }

  async function exportDocx(documentText = output, fileName = currentFileName) {
    setExporting(true);
    setError(null);
    try {
      const clean = (v: string) => (v === SKIPPED ? "" : v.split("(")[0].trim());
      const title =
        [answers.party_a, answers.party_b].map((v) => clean(v ?? "")).filter(Boolean).join(" and ") ||
        docType.label;
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: documentText === output ? editorExportRef.current?.plain ?? documentText : documentText,
          html: documentText === output ? editorExportRef.current?.html : undefined,
          title,
          fileName,
          includeNotes: false,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "draft.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      /* The one that counts. A draft nobody downloads did not help anybody,
         so this — not draft_generated — is the denominator for "did it work". */
      track("draft_exported", { doc_type: docType.slug, format: "docx" });
      setToast("Downloading Word file");
    } catch {
      setError("Export failed. Check your connection.");
    } finally {
      setExporting(false);
    }
  }

  /**
   * Rename a draft — this one from the strip, or any of them from the rail.
   *
   * The screen changes first and the database catches up, because a name is
   * the person's own word for their work and it should not flicker while a
   * request is in flight. If the write fails, the old name comes back and they
   * are told: a rename that silently did not happen is discovered weeks later,
   * in a list that has gone back to saying something else.
   *
   * One function for both places, so renaming the draft you are looking at
   * changes the rail too, and renaming it in the rail changes the strip.
   */
  const renameDraft = useCallback(
    async (id: string, next: string) => {
      const tidy = next.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!tidy || !id) return;
      const wasNamed = name;
      const wasList = pastDrafts;
      setPastDrafts((list) => list.map((d) => (d.id === id ? { ...d, title: tidy } : d)));
      if (id === draftId) setName(tidy);
      try {
        const res = await fetch(`/api/drafts/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: tidy }),
        });
        if (!res.ok) throw new Error("rename failed");
        setToast("Renamed");
      } catch {
        setPastDrafts(wasList);
        if (id === draftId) setName(wasNamed);
        setToast("Could not save that name");
      }
    },
    [draftId, name, pastDrafts],
  );

  /**
   * Pin a draft to the top of the list, or let it go back to its date.
   *
   * Written to the database rather than to this browser: it is a fact about
   * the draft, and something pinned on the laptop should be pinned on the
   * desktop too. The row moves at once and the write catches up; if the write
   * fails the row moves back and says so.
   */
  const togglePin = useCallback(
    async (id: string, next: boolean) => {
      const wasList = pastDrafts;
      setPastDrafts((list) => list.map((d) => (d.id === id ? { ...d, pinned: next } : d)));
      try {
        const res = await fetch(`/api/drafts/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pinned: next }),
        });
        if (!res.ok) throw new Error("pin failed");
        setToast(next ? "Pinned" : "Unpinned");
      } catch {
        setPastDrafts(wasList);
        setToast("Could not save that");
      }
    },
    [pastDrafts],
  );

  /** The strip's own rename, for the draft on screen. */
  const rename = useCallback(
    (next: string) => {
      if (!draftId || next.trim() === name) return;
      void renameDraft(draftId, next);
    },
    [draftId, name, renameDraft],
  );

  const dragRail = useCallback((startEvent: React.PointerEvent<HTMLDivElement>) => {
    startEvent.preventDefault();
    const handle = startEvent.currentTarget;
    /* Measured from the rail's own left edge, not the window's: the workspace
       is not always flush with the left of the screen. */
    const left = (handle.offsetParent as HTMLElement | null)?.getBoundingClientRect().left ?? 0;
    handle.setPointerCapture(startEvent.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (e: PointerEvent) => {
      const next = Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, e.clientX - left)));
      setDraggedRailWidth(next);
    };
    const stop = (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const settled = Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, e.clientX - left)));
      setDraggedRailWidth(settled);
      saveRailWidth(settled);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }, []);

  /** The same thing from the keyboard, for anyone not using a mouse. */
  const nudgeRail = useCallback(
    (by: number) => {
      const next = Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, (railWidth ?? 260) + by)));
      setDraggedRailWidth(next);
      saveRailWidth(next);
    },
    [railWidth],
  );

  const answered = status.filter((s) => s === "done").length;
  const skippedCount = status.filter((s) => s === "skp").length;
  const settled = answered + skippedCount;
  const pct = Math.round((settled / steps.length) * 100);

  /* ───────────────────────────────────────────────────── render pieces */

  function stepAnswerUI(s: Step) {
    if (s.kind === "detail") {
      const level = toLevel(answers._nda_detail_level);
      return (
        <>
          <DetailSlider
            value={level}
            onChange={(next) => setAnswer("_nda_detail_level", String(next))}
          />
          <div className="chips">
            <button type="button" className="go" onClick={() => commit(false)}>
              Use this level →
            </button>
          </div>
        </>
      );
    }

    if (s.kind === "chips") {
      const f = s.fields[0];
      return (
        <>
          <div className="chips">
            {(f.options ?? []).map((o) => (
              <button
                key={o}
                type="button"
                className={`chip${answers[f.key] === o ? " on" : ""}`}
                onClick={() => {
                  setAnswer(f.key, o);
                  setTimeout(() => commit(false, i, o), 260);
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="chips">
            <button type="button" className="chip later" onClick={() => commit(true)}>
              Skip for now
            </button>
            {i > 0 && (
              <button type="button" className="chip early" onClick={draftWithWhatIHave}>
                Draft with what I have
              </button>
            )}
          </div>
        </>
      );
    }

    if (s.kind === "source") {
      return (
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Reading…" : "➕ Attach a document"}
          </button>
          <button type="button" className="chip" onClick={() => commit(false)}>
            No — start fresh
          </button>
          <button type="button" className="chip later" onClick={() => commit(true)}>
            Skip for now
          </button>
        </div>
      );
    }

    const isExtra = s.fields.every((f) => !f.required);
    return (
      <>
        <div className={`card${isExtra ? "" : " two"}`}>
          {s.fields.map((f) => (
            <label key={f.key}>
              <span className="field-label">
                {f.label}
                {f.required && <span className="req">*</span>}
              </span>
              {f.type === "select" ? (
                <select
                  className="input"
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                >
                  <option value="">— choose —</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="input"
                  placeholder={f.placeholder}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                />
              ) : (
                <input
                  className="input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  placeholder={f.placeholder}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                />
              )}
              {f.help && <span className="field-help">{f.help}</span>}
            </label>
          ))}
        </div>
        <div className="chips">
          <button
            type="button"
            className="go"
            disabled={!ready(s)}
            onClick={() => commit(false)}
          >
            {isExtra ? "Add this →" : "That’s right →"}
          </button>
          {isExtra ? (
            <button type="button" className="chip" onClick={() => commit(true)}>
              Nothing else
            </button>
          ) : (
            <button type="button" className="chip later" onClick={() => commit(true)}>
              Skip for now
            </button>
          )}
          {i > 0 && (
            <button type="button" className="chip early" onClick={draftWithWhatIHave}>
              Draft with what I have
            </button>
          )}
        </div>
      </>
    );
  }

  const sheetParagraphs = output
    .trim()
    .split(/\n\s*\n/)
    .map((b, k) => {
      const t = b.replace(/\n {8}/g, " ").replace(/\n {4}(?!\()/g, " ").replace(/\n {2}/g, " ");
      const firstLine = t.split("\n")[0];
      let cls = "";
      if (/^[A-Z0-9 .()'"—-]{3,}$/.test(firstLine) && t.length < 40) cls = "h";
      if (/DRAFTER'S NOTES/.test(t)) cls = "h";
      if (/^•/.test(t)) cls = "note";
      return (
        <p key={k} className={cls || undefined}>
          {t}
        </p>
      );
    });

  return (
    <div
      id="scr-chat"
      className={`scr on fade-in${view === "draft" ? " is-draft" : ""}${
        view === "draft" && docOpen ? " doc-open" : ""
      }`}
      /* Only set once the person has chosen a width of their own; until then
         the grid keeps the width the design ships with, which differs between
         the questions and the document. */
      style={railWidth ? ({ "--rail-w": `${railWidth}px` } as React.CSSProperties) : undefined}
    >
      {/* The drag handle, over the seam between the rail and the workspace.
          A separator rather than a button: it has a value, a range, and the
          arrow keys move it, which is what a screen reader announces. */}
      <div
        className="rail-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Width of the sidebar"
        aria-valuenow={railWidth ?? 260}
        aria-valuemin={RAIL_MIN}
        aria-valuemax={RAIL_MAX}
        tabIndex={0}
        onPointerDown={dragRail}
        onDoubleClick={() => {
          setDraggedRailWidth(null);
          saveRailWidth(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            nudgeRail(e.shiftKey ? -40 : -12);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            nudgeRail(e.shiftKey ? 40 : 12);
          }
        }}
        title="Drag to resize · double-click to reset"
      />
      {/* ── the strip ──
          The draft's name, left, where a name belongs. It used to read
          "Non-Disclosure Agreement · Singapore precedent · Focused setup",
          which said three things nobody needed twice — the document type is
          already the whole screen — and left no room for the one thing that
          tells six saved drafts apart. */}
      <div className="strip">
        <span className="dot" />
        <DraftName
          name={name}
          canRename={Boolean(draftId)}
          onRename={rename}
          placeholder={`New ${docType.label.toLowerCase()}`}
        />
        <button type="button" className="chg" onClick={onChangeDocument}>
          Change document
        </button>
      </div>

      {/* ── the conversation ── */}
      <div className="convo">
        <div className="chat" ref={threadRef}>
          <div className="chat-in">
            {msgs.map((m, k) =>
              m.who === "fd" ? (
                <div className="m" key={k}>
                  <div className="av">FD</div>
                  <div>
                    <div className="txt">{m.text}</div>
                    <div className="ans" />
                  </div>
                </div>
              ) : (
                <div className="m me" key={k}>
                  <div className={`txt${m.skipped ? " skipped" : ""}`}>
                    <b>{m.label}</b>
                    {m.text}
                  </div>
                </div>
              ),
            )}

            {step && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">{step.question}</div>
                  <div className="ans">{stepAnswerUI(step)}</div>
                </div>
              </div>
            )}

            {finished && !busy && view === "chat" && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">
                    That’s everything. Ready when you are — you can still change any answer
                    afterwards.
                  </div>
                  <div className="ans">
                    <div className="chips">
                      <button type="button" className="go" onClick={() => void generate()}>
                        Generate draft
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {paywalled && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">
                    <b style={{ fontWeight: 500 }}>You&rsquo;ve used your free documents.</b>
                    <p style={{ margin: "8px 0 0" }}>
                      Your answers are still here — nothing is lost. Add credits and this draft
                      generates straight away.
                    </p>
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--grey-5)" }}>
                      Everything you have already drafted stays yours to read and download.
                    </p>
                    <p style={{ margin: "14px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a className="btn btn-gold" href="/billing">Add credits</a>
                      <a className="btn btn-white" href="/history">Past drafts</a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">{error}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── the composer ── */}
        <div className="composer">
          <div className="box">
            <button
              type="button"
              className="ic"
              title="Attach"
              onClick={() => fileRef.current?.click()}
            >
              +
            </button>
            <textarea
              rows={1}
              placeholder={step ? "Use the options above, or type here" : "Ready to generate"}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (step && typedAnswer.trim()) {
                    const f = step.fields[step.fields.length - 1];
                    if (f) setAnswer(f.key, typedAnswer.trim());
                    commit(false, i, typedAnswer.trim());
                  }
                }
              }}
            />
            <button
              type="button"
              className="ic send"
              title="Send"
              disabled={!step || !typedAnswer.trim()}
              onClick={() => {
                if (!step || !typedAnswer.trim()) return;
                const f = step.fields[step.fields.length - 1];
                if (f) setAnswer(f.key, typedAnswer.trim());
                commit(false, i, typedAnswer.trim());
              }}
            >
              ↑
            </button>
          </div>
          <p className="fine">
            AI-generated first draft — reviewed by a qualified lawyer before use.{" "}
            <a href="https://foundersdoc.com/terms-conditions/">Terms</a>
          </p>
        </div>
      </div>

      {/* ── the draft ── */}
      <div className="dview">
        <DraftReady
          docLabel={docType.label}
          state={busy || !output ? "drafting" : "ready"}
          answers={answerSummary}
          skippedCount={
            skippedLabels.length ||
            docType.fields.filter((field) => answers[field.key] === SKIPPED).length
          }
          docOpen={docOpen}
          busy={busy || revising}
          onOpenDocument={() => setDocOpen(true)}
          onOpenVersion={({ documentText, version, detailLevel }) => {
            editorExportRef.current = null;
            setOutput(documentText);
            setDocumentVersion(version);
            setNdaDetailLevel(detailLevel);
            setSavedHtml(null);
            setDocOpen(true);
          }}
          onAsk={(prompt) => void revise(prompt)}
          fileName={currentFileName}
          initialVersion={documentVersions[0]}
          ndaDetailLevel={ndaDetailLevel}
          error={error}
          paywalled={paywalled}
          onChangeNdaDetailLevel={(level) =>
            void revise(`Rewrite this NDA at comprehensiveness level ${level} of 5.`, {
              targetDetailLevel: level,
            })
          }
          follow={follow}
          conversation={msgs}
        />

        {/* The document is not rendered at all until it exists and the person
            asks for it. Hiding it with CSS would still build seven A4 pages
            from a half-streamed document — and would still let a stray click
            reach a "Download Word" button for a file that is not written yet. */}
        {docOpen && output && !busy && (
        <section className="gen-right">
        <div className="dbar">
          {/* What this line says has to be worth the width it takes. The
              character count went: the bar directly underneath already gives
              the words and the pages, which is what anyone actually reads a
              length in. Comprehensiveness is an NDA setting, so it is shown
              only where it exists rather than reporting a level for a document
              type that was never asked the question. */}
          <span className="dstat">
            <i />
            {busy
              ? "Drafting…"
              : [
                  `Version ${documentVersion}`,
                  docType.slug === "nda" ? `Detail ${ndaDetailLevel}/5` : "",
                  skippedLabels.length ? `${skippedLabels.length} to confirm` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
          <div className="dacts">
            <button type="button" className="dbtn" onClick={() => setView("chat")}>
              Edit answers
            </button>
            <button
              type="button"
              className="dbtn"
              disabled={!output}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sheetRef.current?.innerText ?? output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch {
                  setError("Could not copy. Select the text and copy manually.");
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="dbtn gold"
              disabled={!output || exporting}
              onClick={() => void exportDocx()}
            >
              {exporting ? "Preparing…" : "Download Word"}
            </button>
            {/* A drawn cross, not the multiplication sign: the glyph sat high
                and small in a button the same size as the lettered ones beside
                it, which read as an empty box rather than a way to close. */}
            <button
              type="button"
              className="dbtn d-close"
              aria-label="Close document"
              title="Close document"
              onClick={() => setDocOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
        {/* While the draft is still streaming, show the raw text: the parser
            needs whole blocks and pagination needs a finished document, so
            building pages on every chunk would flicker and mis-split. The
            editor takes over the moment generation finishes. */}
        {busy || revising || !output ? (
          <div className="dscroll">
            <div className="sheet" ref={sheetRef}>
              {output ? sheetParagraphs : <p>{busy ? "Drafting…" : "Nothing drafted yet."}</p>}
            </div>
          </div>
        ) : (
          <DocumentEditor
            key={`${draftId ?? "unsaved"}:v${documentVersion}`}
            text={output}
            savedHtml={savedHtml}
            onContentChange={captureEditorContent}
            onSave={saveDocument}
          />
        )}
        </section>
        )}
      </div>

      {/* ── the rail ── */}
      <aside className="rail" aria-label="FD AI">
        <button type="button" className="sb-new" onClick={onChangeDocument}>
          + New draft
        </button>
        <p className="k">FD AI</p>
        <nav className="nav2">
          <a className="on" onClick={onChangeDocument}>
            <i />
            New draft
          </a>
          <a href="/history">
            <i />
            Past drafts
          </a>
          <a href="/billing">
            <i />
            Credits
          </a>
          <a href="/usage">
            <i />
            Usage
          </a>
        </nav>

        {/* The balance, where it can be seen BEFORE the questions are answered.
            Finding out you have run out only at the moment you press Generate
            — after ten minutes of typing — is the version of this that makes
            people angry. */}
        {wallet && (
          <div className="rail-credits">
            <span>
              {/* Credits, not documents: a revision costs one too, so counting
                  them in documents promises more than the number can pay for. */}
              <b>{wallet.credits}</b> {wallet.credits === 1 ? "credit" : "credits"} left
            </span>
            {wallet.inTrial ? (
              <small>Free week · trial credits expire</small>
            ) : wallet.credits === 0 ? (
              <a href="/billing">Add credits</a>
            ) : (
              <a href="/billing">Add more</a>
            )}
          </div>
        )}
        {pastDrafts.length > 0 && (
          <div className="hist-groups">
            {groupDrafts(pastDrafts).map((group) => (
              <section key={group.heading}>
                <p className="k">{group.heading}</p>
                <div className="hist">
                  {group.items.map((r) =>
                    renamingId === r.id ? (
                      /* Renaming in place. Enter or clicking away keeps it,
                         Escape abandons it — the same three keys as the strip. */
                      <input
                        key={r.id}
                        className="hist-input"
                        defaultValue={r.title}
                        maxLength={80}
                        autoFocus
                        aria-label={`Rename ${r.title}`}
                        onBlur={(e) => {
                          const v = e.currentTarget.value;
                          setRenamingId(null);
                          if (v.trim() && v.trim() !== r.title) void renameDraft(r.id, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.currentTarget.value = r.title;
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <div
                        key={r.id}
                        className={`hist-row${draftId === r.id ? " on" : ""}${
                          r.pinned ? " is-pinned" : ""
                        }`}
                      >
                        <a
                          href={`/draft/${r.id}`}
                          className={draftId === r.id ? "on" : undefined}
                          aria-current={draftId === r.id ? "page" : undefined}
                          title={r.docLabel ? `${r.title} — ${r.docLabel}` : r.title}
                        >
                          {/* The name in a box of its own so it can be cut with
                              an ellipsis. A bare text node in a flex row cannot
                              be — it simply ran past the edge of the rail. */}
                          <span className="hist-name">{r.title}</span>
                          <small>{r.when}</small>
                        </a>
                        <button
                          type="button"
                          className="hist-pin"
                          aria-label={r.pinned ? `Unpin ${r.title}` : `Pin ${r.title}`}
                          aria-pressed={Boolean(r.pinned)}
                          title={r.pinned ? "Unpin" : "Pin to the top"}
                          onClick={() => void togglePin(r.id, !r.pinned)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M14.5 3.5 20.5 9.5M16 4l-1.2 4.2-5 2.2-1.6 1.6 5.8 5.8 1.6-1.6 2.2-5L22 10M9 15l-4.5 4.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.7}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="hist-rename"
                          aria-label={`Rename ${r.title}`}
                          title="Rename"
                          onClick={() => setRenamingId(r.id)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M4 20h4l10-10-4-4L4 16zM14 6l4 4" />
                          </svg>
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="rail-bottom">
          {/* The same account menu as the one in the nav. Two places show who
              is signed in, so both must do the same thing when clicked —
              a chip that looks like a button and does nothing is worse than
              no chip at all. */}
          <div className={`acct-wrap${acctOpen ? " on" : ""}`}>
            {acctOpen && (
              <div className="acct-menu" onClick={() => setAcctOpen(false)}>
                <a href="/history">Past drafts</a>
                <a href="/billing">Credits</a>
                <a href="/usage">Usage</a>
                <a href="/settings">Settings</a>
                <form action="/auth/signout" method="post">
                  <button type="submit">Log out</button>
                </form>
              </div>
            )}
            <button
              type="button"
              className="acct"
              aria-haspopup="true"
              aria-expanded={acctOpen}
              onClick={(e) => {
                e.stopPropagation();
                setAcctOpen((v) => !v);
              }}
            >
              <i>{initials(userEmail ?? "FD")}</i>
              <div>
                {(userEmail ?? "Signed out").split("@")[0]}
                <small>{userEmail ? userEmail.split("@")[1] : "Founders Doc"}</small>
              </div>
              <span className="caret" aria-hidden="true">
                ⌃
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── the progress pane ── */}
      <section className="pane">
        <div className="pane-h">
          Progress<span className="pct">{pct}%</span>
        </div>
        <div className="studio-body">
          <div className="prog-h">
            <b className="cnt">
              {answered} of {steps.length} answered
              {skippedCount ? ` · ${skippedCount} skipped` : ""}
            </b>
            <span className="eta">
              {finished
                ? "Ready to generate"
                : `About ${Math.max(1, Math.ceil((steps.length - settled) * 0.5))} min`}
            </span>
          </div>
          <div className="segs" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
            {steps.map((s, k) => (
              <i key={s.id} className={status[k] ?? (k === i ? "now" : "")} />
            ))}
          </div>
          <div className="notes">
            {steps.map((s, k) => {
              const st = status[k] ?? (k === i ? "now" : "");
              const sm =
                st === "done"
                  ? summarise(s).slice(0, 60)
                  : st === "skp"
                    ? "Skipped — tap to answer"
                    : st === "now"
                      ? "Answering now"
                      : "Not yet";
              return (
                <div
                  key={s.id}
                  className={`inst ${st}`}
                  onClick={() => st === "skp" && revisit(k)}
                >
                  <i>{st === "done" ? "✓" : k + 1}</i>
                  <div>
                    <b>{s.name}</b>
                    <small>{sm}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="studio-foot">
          <button
            type="button"
            className="btn s-gen"
            disabled={busy}
            onClick={() => (view === "draft" ? setView("chat") : void generate())}
          >
            {busy ? "Drafting…" : view === "draft" ? "Edit answers" : "Generate draft"}
          </button>
          <button
            type="button"
            className="btn btn-quiet s-skipall"
            disabled={busy || finished}
            onClick={draftWithWhatIHave}
          >
            Skip the rest and draft
          </button>
          <small>Skipped answers become [[TO CONFIRM]] in the draft</small>
        </div>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      {toast && <div className="fd-toast on">{toast}</div>}
    </div>
  );
}
