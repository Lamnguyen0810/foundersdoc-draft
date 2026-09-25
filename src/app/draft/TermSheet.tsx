"use client";

/**
 * The term sheet screen.
 *
 * A sibling of DraftChat, not a mode of it: the NDA is a conversation that
 * ends in a model writing a document, and this is a questionnaire that ends
 * in a letter assembled from the firm's master. The two share the page's
 * skeleton — the rail, the conversation, the progress pane, the document
 * beside it — and the same document editor and Word export, so that a
 * person who has drafted an NDA finds nothing new to learn here.
 *
 * What is different, and why:
 *   - the questions branch (questionnaire.json's show_if), so the list of
 *     steps is recomputed from the answers on every change;
 *   - there is a Parties step, because the master needs full legal names,
 *     numbers and addresses, which the NDA flow never asked for;
 *   - the letter appears at once with the AI's few lines beside it for the
 *     person to confirm (playbook §1.10), rather than a stream of text;
 *   - what the playbook flags (§8, 🟡) is marked for the lawyer who reviews
 *     the term sheet before it is signed — the person's own — listed beside
 *     the letter, never written into it. Nothing is held back: the letter
 *     downloads at once. Only a 🔴 stop is not drafted at all.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DocumentEditor from "./DocumentEditor";
import { track } from "@/lib/track";
import { DEFAULT_LOOK, type DocumentLook } from "@/lib/playbook";
import { applyDefaults, questionsFor, rolesFor, type Answers, type Option, type Question } from "@/lib/termsheet/conditions";
import { COUNTRIES, STATES, TOP_COUNTRIES } from "@/lib/termsheet/data/map";
import { INTRO } from "@/lib/termsheet/data/intro";
import { DOCUMENT_TITLES } from "@/lib/termsheet/data/master";
import { normaliseMoney } from "@/lib/termsheet/format";
import type { AiFields, DraftStatus, Flag, KeyTerm, Party } from "@/lib/termsheet/types";

/* ── what the page hands in ───────────────────────────────────────────── */

export interface TermResume {
  id: string;
  title: string;
  answers: Record<string, unknown>;
  output: string;
  outputHtml: string | null;
  status: DraftStatus;
  flags: Flag[];
  reviewNote: string | null;
  createdAt: string;
}

export interface CompanyPrefill {
  name: string;
  uen: string;
  address: string;
  contact: string;
  country: string;
}

export interface TermSheetProps {
  look?: DocumentLook;
  userEmail: string | null;
  guest: boolean;
  wallet: { credits: number; inTrial: boolean; trialEndsAt: string | null } | null;
  isAdmin: boolean;
  company: CompanyPrefill | null;
  resume?: TermResume;
}

type Stage = "intro" | "questions" | "review" | "drafted";

/** A step is a question, or the parties. */
type Step = { kind: "q"; q: Question } | { kind: "parties" };

const PARTIES_AFTER = "Q2";
const HANDOFF_KEY = "fdai.term-handoff";
const STASH_KEY = "fdai.term-in-progress";

const ENTITY_TYPES = [
  "private company limited by shares",
  "private limited company",
  "public company limited by shares",
  "limited liability company",
  "corporation",
  "limited liability partnership",
  "partnership",
  "sole proprietorship",
];

const ID_TYPES = ["NRIC", "passport", "FIN", "national ID card"];

const emptyParty = (kind: Party["kind"] = "company"): Party => ({ kind, name: "", address: "" });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const PARTIES_Q = "Who are the parties? Full legal names, numbers and registered addresses, as they will appear in the letter.";

type Msg = { who: "fd" | "me"; text: string; label?: string; skipped?: boolean };
/** Which steps have been answered or skipped, by step key. */
type Settled = Record<string, "done" | "skp">;

const stepKey = (s: Step) => (s.kind === "parties" ? "parties" : s.q.id);

/** The steps for these answers, in the order they are asked: the parties come straight after Q2. */
function stepsFor(a: Answers): Step[] {
  const out: Step[] = [];
  for (const q of questionsFor(a)) {
    out.push({ kind: "q", q });
    if (q.id === PARTIES_AFTER) out.push({ kind: "parties" });
  }
  return out;
}

/**
 * The name a step goes by — in the list on the right and on the answer
 * bubble — as each NDA step has a name. Short, because the question itself
 * is already in the conversation.
 */
function shortLabel(s: Step, deal: string): string {
  if (s.kind === "parties") return "Parties";
  const byDeal = (m: Record<string, string>) => m[deal] ?? m.default;
  switch (s.q.id) {
    case "Q1": return "Type of deal";
    case "Q2": return "Your side";
    case "Q3": return "The deal in a sentence";
    case "Q4": return byDeal({ investment: "What the investor receives", loan: "Kind of loan", acquisition: "What is being bought", project: "What the project involves", default: "Subject matter" });
    case "Q5": return "Agreements to sign";
    case "Q6a": return "Time to accept";
    case "Q6b": return "When it lapses";
    case "Q7a": return "Governing law";
    case "Q7a_state": return "State or province";
    case "Q7b": return "Disputes";
    case "Q8a": return byDeal({ project: "Contributions agreed", default: "Numbers agreed" });
    case "Q8b": return byDeal({ investment: "Investment amount", loan: "Loan amount", acquisition: "Price", project: "Contributions", default: "Price or value" });
    case "Q8c": return byDeal({ investment: "Valuation", loan: "Interest and term", acquisition: "How the price is set", project: "Revenue and costs", default: "Pricing" });
    case "Q8d": return byDeal({ loan: "Repayment", default: "Payment" });
    case "Q8e": return "Other key terms";
    case "Q9": return "Conditions";
    case "Q10a": return "Signing target";
    case "Q10b": return "Completion date";
    case "Q11": return "Exclusivity";
    case "Q12": return "Confidentiality";
    case "Q13": return "Legal costs";
    default: return s.q.section;
  }
}

/** The heading a step sits under in the list. The questionnaire has two runs
 *  called "Timing"; the second is about signing and closing, and says so. */
function groupOf(s: Step): string {
  if (s.kind === "parties") return "Parties";
  if (s.q.id === "Q10a" || s.q.id === "Q10b") return "Signing and closing";
  return s.q.section;
}

/** What "Skip the rest" cannot answer for anyone: who the parties are, what
 *  the deal is, and which law — there is no usual answer to those. */
const MUST_ASK = new Set(["Q1", "Q2", "parties", "Q3", "Q4", "Q7a", "Q7a_state"]);

/** Which step fixes each question the checks can ask (drafting_scenarios.json). */
const FIX_STEP: Record<string, string> = {
  S5: "parties",
  S12: "parties",
  S17: "Q7a",
  S7: "Q6a",
  S6: "Q8b",
  S15: "Q8c",
  S3: "Q1",
};

/** The usual answer for a skipped question that has no default of its own. */
const SKIP_VALUE: Record<string, unknown> = { Q7b: "recommend", Q8a: "no", Q10b: "unsure", Q5: ["suggest"], Q8e: [] };

function allSettled(a: Answers): Settled {
  const out: Settled = {};
  for (const s of stepsFor(a)) out[stepKey(s)] = "done";
  return out;
}

/** The label shown for an answer, for the conversation and the summary. */
function answerLabel(q: Question, a: Answers): string {
  const v = a[q.id];
  if (v === undefined || v === null || v === "") return "";
  const label = (x: string) => q.options.find((o) => o.value === x)?.label ?? x;
  let text = Array.isArray(v) ? v.filter((x) => x !== "other").map((x) => label(String(x))).join(", ") : label(String(v));
  if (text === "other") text = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text = `by ${text}`;
  const extras = [a[`${q.id}_other`], a[`${q.id}_detail`], a[`${q.id}_amount`]].map(str).filter(Boolean);
  if (q.id === "Q8c" && str(a.Q8c_basis) && str(a.Q8c_basis) !== "unsure") text += ` (${str(a.Q8c_basis)}-money)`;
  return [text, ...extras].filter(Boolean).join(" — ");
}

/* ── the component ────────────────────────────────────────────────────── */

export default function TermSheet({ look = DEFAULT_LOOK, userEmail, guest, wallet, isAdmin, company, resume }: TermSheetProps) {
  const [stage, setStage] = useState<Stage>(resume ? "drafted" : "intro");
  const [learnMore, setLearnMore] = useState(false);
  const [answers, setAnswers] = useState<Answers>(() => (resume ? fromSaved(resume.answers) : {}));
  const [parties, setParties] = useState<Party[]>(() =>
    resume && Array.isArray(resume.answers._parties) ? (resume.answers._parties as Party[]) : [emptyParty(), emptyParty()],
  );
  const [settled, setSettled] = useState<Settled>(() => (resume ? allSettled(fromSaved(resume.answers)) : {}));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typed, setTyped] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [listItems, setListItems] = useState<string[]>([]);
  const [pendingDetail, setPendingDetail] = useState<{ key: string; label: string; q: Question; value: string } | null>(null);
  const [basis, setBasis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Questions to settle before the term sheet can be prepared, each with
     the step that fixes it where there is one. */
  const [asks, setAsks] = useState<{ text: string; step?: string; scenario?: string }[]>([]);
  const [paywalled, setPaywalled] = useState(false);
  const [credits, setCredits] = useState(wallet?.credits ?? null);

  /* the draft */
  const [draftId, setDraftId] = useState<string | null>(resume?.id ?? null);
  const [title, setTitle] = useState(resume?.title ?? "Term Sheet");
  const [html, setHtml] = useState<string | null>(resume?.outputHtml ?? null);
  const [text, setText] = useState(resume?.output ?? "");
  const [status, setStatus] = useState<DraftStatus | "stopped">(resume?.status ?? "draft");
  const [flags, setFlags] = useState<Flag[]>(resume?.flags ?? []);
  const [reviewNote] = useState<string | null>(resume?.reviewNote ?? null);
  const [ai, setAi] = useState<AiFields | null>(() => (resume ? ((resume.answers._ai as AiFields | null) ?? null) : null));
  const [aiEdit, setAiEdit] = useState<AiFields | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [docOpen, setDocOpen] = useState(Boolean(resume?.outputHtml));
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState(1);
  const [documentTitle, setDocumentTitle] = useState<string>(() => str(resume?.answers._document_title) || "TERM SHEET");
  const editorRef = useRef<{ html: string; plain: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /* Feedback to the firm — the firm's own lawyers only, as on the NDA. */
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbExcerpt, setFbExcerpt] = useState("");
  const [fbSending, setFbSending] = useState(false);
  const [fbDone, setFbDone] = useState<string | null>(null);

  /* ── the steps, from the answers ────────────────────────────────────── */
  const steps = useMemo<Step[]>(() => stepsFor(answers), [answers]);

  const deal = str(answers.Q1) || "other";
  const roles = rolesFor(deal);
  /* The question being asked is the first one not yet answered or skipped.
     Branching can add a question behind the ones already settled; it is
     simply asked next. */
  const pending = steps.filter((s) => !settled[stepKey(s)]);
  const step = stage === "questions" ? pending[0] : undefined;
  const finished = pending.length === 0;
  const answered = steps.filter((s) => settled[stepKey(s)] === "done").length;
  const skippedCount = steps.filter((s) => settled[stepKey(s)] === "skp").length;
  const pct = steps.length ? Math.round(((answered + skippedCount) / steps.length) * 100) : 0;

  /* Restore a hand-off (a visitor who signed up mid-flow) or a stash. Read
     after mount, not during render: the server never saw the storage, and a
     first paint that differs from the server's is a hydration error. */
  useEffect(() => {
    if (resume) return;
    const t = setTimeout(() => {
      try {
        const handoff = localStorage.getItem(HANDOFF_KEY);
        const raw = handoff ?? sessionStorage.getItem(STASH_KEY);
        if (!raw) return;
        const s = JSON.parse(raw) as { answers: Answers; parties: Party[]; settled?: Settled; msgs?: Msg[]; stage: Stage };
        /* Nothing answered yet is nothing to restore — and the intro is
           worth reading once. */
        if (!s || !s.answers || Object.keys(s.answers).length === 0) return;
        setAnswers(s.answers);
        setParties(s.parties?.length >= 2 ? s.parties : [emptyParty(), emptyParty()]);
        setSettled(s.settled ?? {});
        setMsgs(Array.isArray(s.msgs) ? s.msgs : []);
        if (handoff && !guest) {
          localStorage.removeItem(HANDOFF_KEY);
          setStage("review");
        } else {
          setStage(s.stage === "intro" ? "questions" : s.stage);
        }
      } catch {
        /* nothing to restore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [resume, guest]);

  useEffect(() => {
    if (resume || stage === "drafted") return;
    try {
      sessionStorage.setItem(STASH_KEY, JSON.stringify({ answers, parties, settled, msgs, stage }));
    } catch {
      /* private mode */
    }
  }, [answers, parties, settled, msgs, stage, resume]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, stage, asks, error]);

  /* ── answering ──────────────────────────────────────────────────────── */

  const resetInput = () => {
    setTyped("");
    setMulti([]);
    setListItems([]);
    setPendingDetail(null);
    setBasis("");
  };

  const say = (...m: Msg[]) => setMsgs((prev) => [...prev, ...m]);

  /** The answers with this one in, and what it makes stale: a new kind of
   *  deal asks again about everything that depended on the old one. */
  function withAnswer(a: Answers, q: Question, value: unknown, extras: Record<string, unknown>): { next: Answers; stale: string[] } {
    const next: Answers = { ...a, [q.id]: value, ...extras };
    const stale: string[] = [];
    const clear = (re: RegExp, ids: string[]) => {
      for (const k of Object.keys(next)) if (re.test(k) && !(k in extras)) delete next[k];
      stale.push(...ids);
    };
    if (q.id === "Q1" && a.Q1 !== undefined && a.Q1 !== value) clear(/^(Q2|Q4|Q5|Q8[b-e])(_|$)/, ["Q2", "Q4", "Q5", "Q8b", "Q8c", "Q8d", "Q8e"]);
    if (q.id === "Q4" && a.Q4 !== undefined && a.Q4 !== value) clear(/^Q5(_|$)/, ["Q5"]);
    return { next, stale };
  }

  /** Answer (or skip) a question: the conversation records it as the NDA's
   *  does, and the next unsettled question comes up. */
  const settle = (q: Question, value: unknown, extras: Record<string, unknown>, skipped: boolean) => {
    setError(null);
    const { next, stale } = withAnswer(answers, q, value, extras);
    if (Object.keys(settled).length === 0) track("draft_started", { doc_type: "term", total_steps: steps.length });
    setAnswers(next);
    setSettled((st) => {
      const n: Settled = { ...st, [q.id]: skipped ? "skp" : "done" };
      for (const k of stale) delete n[k];
      return n;
    });
    say(
      { who: "fd", text: q.text },
      {
        who: "me",
        label: shortLabel({ kind: "q", q }, str(next.Q1) || "other"),
        text: skipped ? "Skipped for now" : answerLabel(q, next) || "None",
        skipped,
      },
    );
    if (q.id === "Q2" && typeof value === "string") prefillMine(value);
    /* Existing shares are bought from someone, and the seller must be a
       party (playbook S12). Ask for them now, not after "Prepare". */
    if (q.id === "Q4" && value === "existing_shares" && !parties.some((p) => /sell/i.test(p.role ?? ""))) {
      setParties((ps) => [...ps, { ...emptyParty(), role: "Seller" }]);
      setSettled((st) => {
        const n2 = { ...st };
        delete n2.parties;
        return n2;
      });
      say({ who: "fd", text: "Existing shares are bought from their current owner, so the seller needs to be a party too. I’ve added a row for them." });
    }
    resetInput();
  };

  const settleParties = () => {
    setSettled((st) => ({ ...st, parties: "done" }));
    say({ who: "fd", text: PARTIES_Q }, { who: "me", label: "Parties", text: parties.map((p) => p.name).filter(Boolean).join(" · ") });
    resetInput();
  };

  /** Go back to an answered or skipped step — from the list on the right,
   *  as on the NDA. */
  /** Go straight to the step that fixes a question from the checks. */
  function fixAsk(ask: { step?: string; scenario?: string }) {
    const s = steps.find((x) => stepKey(x) === ask.step);
    if (!s) return;
    /* The seller of existing shares has to be a party: open the parties
       with a row ready for them. */
    if (ask.scenario === "S12" && !parties.some((p) => /sell/i.test(p.role ?? ""))) {
      setParties((ps) => [...ps, { ...emptyParty(), role: "Seller" }]);
    }
    revisit(s);
  }

  function revisit(s: Step) {
    const k = stepKey(s);
    if (!settled[k] || busy) return;
    setSettled((st) => {
      const n = { ...st };
      delete n[k];
      return n;
    });
    resetInput();
    setAsks([]);
    say({ who: "fd", text: `Let’s go back to ${shortLabel(s, deal).toLowerCase()}.` });
    setStage("questions");
    setDocOpen(false);
  }

  /** The usual answer for everything still open, except what only the
   *  person can say. */
  function skipRest() {
    const a: Answers = { ...answers };
    const st: Settled = { ...settled };
    /* Skipping can change what is asked (no numbers agreed → no amount), so
       the list is read again until it stops changing. */
    for (let pass = 0; pass < 4; pass++) {
      for (const s of stepsFor(a)) {
        const k = stepKey(s);
        if (st[k] || MUST_ASK.has(k) || s.kind !== "q") continue;
        const v = a[k];
        if (v === undefined || v === null || v === "") a[k] = s.q.defaultValue ?? SKIP_VALUE[k] ?? "";
        st[k] = "skp";
      }
    }
    const left = stepsFor(a).filter((s) => !st[stepKey(s)]);
    track("draft_with_what_i_have", { doc_type: "term", count: Object.keys(st).length - Object.keys(settled).length, total_steps: steps.length });
    setAnswers(a);
    setSettled(st);
    resetInput();
    say(
      { who: "me", label: "Skip the rest", text: "Use the usual answers", skipped: true },
      {
        who: "fd",
        text: left.length
          ? `I’ve used the usual answer for the rest. Before I can prepare it, I still need: ${left.map((s) => shortLabel(s, deal).toLowerCase()).join(", ")}.`
          : "I’ve used the usual answer for everything you skipped — you can change any of them from the list on the right.",
      },
    );
    if (left.length === 0) setStage("review");
  }

  /* The person's own side of the letter, from their company profile, the
     moment they say which side they are on. */
  const prefillMine = (side: string) => {
    if (!company) return;
    const mine = side === "recipient" ? 1 : 0;
    setParties((ps) => {
      const p = ps[mine];
      if (!p || p.name) return ps;
      const next = ps.slice();
      next[mine] = {
        ...p,
        kind: "company",
        name: company.name,
        reg_no: company.uen || undefined,
        address: company.address,
        jurisdiction: company.country || "Singapore",
        entity_type: !company.country || company.country === "Singapore" ? "private company limited by shares" : undefined,
      };
      return next;
    });
  };

  const commit = (q: Question, value: unknown, extras: Record<string, unknown> = {}) => settle(q, value, extras, false);

  const skip = (q: Question) => settle(q, q.defaultValue ?? SKIP_VALUE[q.id] ?? "", {}, true);

  /* ── preparing the term sheet ───────────────────────────────────────── */

  async function prepare() {
    if (guest) {
      try {
        localStorage.setItem(HANDOFF_KEY, JSON.stringify({ answers, parties, settled, msgs, stage: "review" }));
      } catch {
        /* the sign-up still works; the answers just do not follow */
      }
      track("signup_gate", { doc_type: "term", reason: "generate" });
      window.location.href = "/signup?from=draft";
      return;
    }
    setBusy(true);
    setError(null);
    setAsks([]);
    try {
      const res = await fetch("/api/termsheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: applyDefaults(answers), parties, documentTitle }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 402) {
        setPaywalled(true);
        track("paywall_hit", { doc_type: "term" });
        return;
      }
      if (!res.ok || !j) {
        setError((j?.error as string) ?? "Something went wrong. Please try again.");
        track("draft_failed", { doc_type: "term" });
        return;
      }
      if (j.kind === "ask") {
        setAsks((j.questions as Flag[]).map((f) => ({ text: f.user_message ?? f.reason, step: FIX_STEP[f.scenario] ?? f.field, scenario: f.scenario })));
        setStage("questions");
        return;
      }
      if (j.kind === "questions") {
        setAsks((j.questions as string[]).map((text) => ({ text })));
        setStage("questions");
        return;
      }
      if (j.kind === "stopped") {
        setStatus("stopped");
        setDraftId((j.draftId as string | null) ?? null);
        setHtml(null);
        setText("");
        setStage("drafted");
        return;
      }
      setDraftId((j.draftId as string | null) ?? null);
      setTitle((j.title as string) ?? "Term Sheet");
      setHtml(j.html as string);
      setText(j.text as string);
      setStatus(j.status as DraftStatus);
      setFlags((j.flags as Flag[]) ?? []);
      setAi((j.ai as AiFields) ?? null);
      setAiEdit(null);
      setVersion(1);
      setDocOpen(true);
      setStage("drafted");
      if (typeof j.creditsLeft === "number") setCredits(j.creditsLeft);
      try {
        sessionStorage.removeItem(STASH_KEY);
      } catch {
        /* fine */
      }
      track("draft_generated", { doc_type: "term", words: Number(j.words ?? 0) });
    } catch {
      setError("Could not reach FD AI. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAi() {
    if (!draftId || !aiEdit) return;
    setSavingAi(true);
    setError(null);
    try {
      const res = await fetch(`/api/termsheet/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ai: aiEdit, documentTitle }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !j) {
        setError((j?.error as string) ?? "Could not save the changes.");
        return;
      }
      setHtml(j.html as string);
      setText(j.text as string);
      setFlags((j.flags as Flag[]) ?? []);
      setStatus(j.status as DraftStatus);
      setAi(aiEdit);
      setAiEdit(null);
      setVersion((v) => v + 1);
      editorRef.current = null;
    } catch {
      setError("Could not save the changes. Check your connection.");
    } finally {
      setSavingAi(false);
    }
  }

  async function saveDocument(editedHtml: string, plain: string) {
    if (!draftId) return;
    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outputHtml: editedHtml, output: plain }),
    });
  }

  async function exportDocx() {
    if (!html || status === "stopped") return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: editorRef.current?.plain ?? text,
          html: editorRef.current?.html ?? html,
          title,
          fileName: `${title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Term-Sheet"}-V${version}.docx`,
          includeNotes: false,
          docTypeSlug: "term",
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
      a.download = match?.[1] ?? "term-sheet.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track("draft_exported", { doc_type: "term", format: "docx" });
    } catch {
      setError("Export failed. Check your connection.");
    } finally {
      setExporting(false);
    }
  }

  function openFeedback() {
    const sel = typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "").trim() : "";
    setFbExcerpt(sel.slice(0, 1500));
    setFbDone(null);
    setFbOpen(true);
  }

  async function sendFeedback() {
    if (fbSending || !fbText.trim()) return;
    setFbSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId, message: fbText.trim(), excerpt: fbExcerpt || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; learnt?: boolean; rule?: string; reason?: string };
      if (!res.ok || !j.ok) {
        setFbDone(j.error ?? "Could not send that. Try again.");
        return;
      }
      track("draft_feedback", { doc_type: "term" });
      setFbText("");
      setFbExcerpt("");
      setFbDone(
        j.learnt && j.rule
          ? `Learnt. From the next term sheet: “${j.rule}” — edit or switch off under Admin → AI files → Feedback & lessons.`
          : `Saved for a person to decide${j.reason ? ` (${j.reason})` : ""} — Admin → AI files → Feedback & lessons.`,
      );
    } finally {
      setFbSending(false);
    }
  }

  const changeAnswers = () => {
    setStage("questions");
    setDocOpen(false);
    say({ who: "fd", text: "Pick any answer in the list on the right to change it, then review and prepare again." });
  };

  /* ── the answer UI for the current step ─────────────────────────────── */

  function chipsFor(q: Question, opts: Option[], onPick: (o: Option) => void) {
    return opts.map((o) => (
      <button
        key={o.value}
        type="button"
        className={`chip${o.recommended ? " rec" : ""}${multi.includes(o.value) ? " on" : ""}`}
        title={o.recommended ? "Usual choice" : undefined}
        onClick={() => onPick(o)}
      >
        {o.label}
        {o.recommended ? " ·" : ""}
      </button>
    ));
  }

  function questionUI(q: Question) {
    /* A detail the last chip asked for: "In instalments (describe)". */
    if (pendingDetail) {
      return (
        <div className="chips">
          <input
            className="input"
            autoFocus
            placeholder={pendingDetail.label}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed.trim()) {
                e.preventDefault();
                finishDetail();
              }
            }}
          />
          <button type="button" className="go" disabled={!typed.trim()} onClick={() => finishDetail()}>
            Continue
          </button>
        </div>
      );
    }

    switch (q.type) {
      case "single_choice":
      case "yes_no":
      case "yes_no_period":
      case "period_or_date":
      case "date":
      case "state_list":
      case "country": {
        let opts = q.options.slice();
        if (q.type === "country") opts = TOP_COUNTRIES.map((c) => ({ value: c, label: c }));
        if (q.type === "state_list") {
          const country = str(answers.Q7a_other) || str(answers.Q7a);
          opts = (STATES[country] ?? []).map((s) => ({ value: s, label: s }));
        }
        const showOther = q.allowOther || q.type === "country" || q.type === "state_list";
        return (
          <>
            <div className="chips">
              {chipsFor(q, opts, (o) => {
                if (o.needs_detail) {
                  setPendingDetail({ key: `${q.id}_detail`, label: "Describe it briefly", q, value: o.value });
                  return;
                }
                if (o.needs_amount) {
                  setPendingDetail({ key: `${q.id}_amount`, label: "The limit, e.g. SGD 15,000", q, value: o.value });
                  return;
                }
                commit(q, o.value);
              })}
              {(q.allowDate || q.type === "date") && (
                <input
                  className="input"
                  type="date"
                  aria-label="Pick a date"
                  onChange={(e) => e.target.value && commit(q, e.target.value)}
                />
              )}
              {showOther && (
                <input
                  className="input"
                  placeholder={q.type === "country" ? "Another country…" : q.type === "state_list" ? "Another state or province…" : q.otherLabel ?? "Other (please type)"}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && typed.trim()) {
                      e.preventDefault();
                      typedOther(q);
                    }
                  }}
                />
              )}
              {showOther && typed.trim() && (
                <button type="button" className="go" onClick={() => typedOther(q)}>
                  Use this
                </button>
              )}
            </div>
            {!q.required && (
              <p className="later">
                <button type="button" className="alt-link" onClick={() => skip(q)}>
                  Skip for now
                </button>
              </p>
            )}
          </>
        );
      }

      case "multi_choice": {
        const opts = q.options;
        return (
          <div className="chips">
            {chipsFor(q, opts, (o) => {
              setMulti((m) => {
                if (o.exclusive) return m.includes(o.value) ? [] : [o.value];
                const without = m.filter((x) => !opts.find((p) => p.value === x)?.exclusive);
                return without.includes(o.value) ? without.filter((x) => x !== o.value) : [...without, o.value];
              });
            })}
            {q.allowOther && (
              <input
                className="input"
                placeholder={q.otherLabel ?? "Other (please type)"}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            )}
            <button
              type="button"
              className="go"
              disabled={multi.length === 0 && !typed.trim()}
              onClick={() => {
                const extras: Record<string, unknown> = {};
                let vals = multi.slice();
                if (typed.trim()) {
                  extras[`${q.id}_other`] = typed.trim();
                  vals = [...vals.filter((v) => v !== "none"), "other"];
                }
                commit(q, vals, extras);
              }}
            >
              {multi.includes("suggest") ? "Suggest for me" : "Done"}
            </button>
          </div>
        );
      }

      case "free_text_list":
        return (
          <div className="chips">
            {listItems.map((l, i) => (
              <button key={i} type="button" className="chip on" title="Remove" onClick={() => setListItems((xs) => xs.filter((_, k) => k !== i))}>
                {l} ×
              </button>
            ))}
            <input
              className="input"
              placeholder={q.placeholder ?? "One term per line"}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && typed.trim()) {
                  e.preventDefault();
                  setListItems((xs) => [...xs, typed.trim()].slice(0, q.maxItems ?? 5));
                  setTyped("");
                }
              }}
            />
            {typed.trim() && (
              <button
                type="button"
                className="go"
                onClick={() => {
                  setListItems((xs) => [...xs, typed.trim()].slice(0, q.maxItems ?? 5));
                  setTyped("");
                }}
              >
                Add
              </button>
            )}
            <button type="button" className="go" onClick={() => commit(q, listItems)}>
              {listItems.length ? "That's all" : "None"}
            </button>
          </div>
        );

      case "amount_with_choice":
        return (
          <div className="chips">
            <input
              className="input"
              placeholder="e.g. USD 10,000,000"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {q.options.map((o) => (
              <button key={o.value} type="button" className={`chip${basis === o.value ? " on" : ""}`} onClick={() => setBasis(o.value)}>
                {o.label}
              </button>
            ))}
            <button
              type="button"
              className="go"
              disabled={!typed.trim() || !basis}
              onClick={() => commit(q, moneyOrText(typed), { Q8c_basis: basis })}
            >
              Continue
            </button>
            {!q.required && (
              <button type="button" className="alt-link" onClick={() => skip(q)}>
                Not agreed yet
              </button>
            )}
          </div>
        );

      case "amount":
      case "rate_and_period":
      case "free_text":
      default:
        return (
          <div className="chips">
            <textarea
              className="input"
              rows={q.type === "free_text" ? 2 : 1}
              maxLength={q.maxLength ?? 300}
              placeholder={q.placeholder ?? ""}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && typed.trim()) {
                  e.preventDefault();
                  commit(q, q.type === "amount" ? moneyOrText(typed) : typed.trim());
                }
              }}
            />
            {q.type === "amount" && typed.trim() && normaliseMoney(typed) && (
              <span className="later">Will read as <b>{normaliseMoney(typed)!.text}</b></span>
            )}
            <button
              type="button"
              className="go"
              disabled={!typed.trim()}
              onClick={() => commit(q, q.type === "amount" ? moneyOrText(typed) : typed.trim())}
            >
              Continue
            </button>
            {!q.required && (
              <button type="button" className="alt-link" onClick={() => skip(q)}>
                Skip for now
              </button>
            )}
          </div>
        );
    }
  }

  function moneyOrText(v: string): string {
    return normaliseMoney(v)?.text ?? v.trim();
  }

  function typedOther(q: Question) {
    const v = typed.trim();
    if (!v) return;
    if (q.type === "country" || q.type === "state_list") {
      commit(q, v, { [`${q.id}_other`]: v });
    } else if (q.id === "Q1") {
      commit(q, "other", { Q1_other: v });
    } else if (q.id === "Q2") {
      /* "Treat as issuer unless the text says otherwise; flag for review." */
      commit(q, /receiv|invited|borrow|sell|rais/i.test(v) ? "recipient" : "issuer", { Q2_other: v });
    } else {
      commit(q, v, { [`${q.id}_other`]: v });
    }
  }

  function finishDetail() {
    if (!pendingDetail || !typed.trim()) return;
    const detail = pendingDetail.key.endsWith("_amount") ? moneyOrText(typed) : typed.trim();
    commit(pendingDetail.q, pendingDetail.value, { [pendingDetail.key]: detail });
  }

  /* ── parties ────────────────────────────────────────────────────────── */

  function partyForm(i: number) {
    const p = parties[i] ?? emptyParty();
    const set = (patch: Partial<Party>) =>
      setParties((ps) => {
        const next = ps.slice();
        while (next.length <= i) next.push(emptyParty());
        next[i] = { ...next[i], ...patch };
        return next;
      });
    const heading = i === 0 ? `Sending the term sheet — the ${roles[0]}` : i === 1 ? `Receiving it — the ${roles[1]}` : p.role || `Party ${i + 1}`;
    return (
      <div className="ts-party" key={i}>
        <div className="ts-party-h">
          <b>{heading}</b>
          <span className="ts-kind">
            <button type="button" className={`chip${p.kind === "company" ? " on" : ""}`} onClick={() => set({ kind: "company" })}>
              Company
            </button>
            <button type="button" className={`chip${p.kind === "individual" ? " on" : ""}`} onClick={() => set({ kind: "individual" })}>
              Individual
            </button>
          </span>
        </div>
        {i >= 2 && (
          <label>
            Role in the deal
            <input className="input" placeholder="e.g. Co-Investor, Founder, Guarantor, Seller" value={p.role ?? ""} onChange={(e) => set({ role: e.target.value })} />
          </label>
        )}
        <label>
          {p.kind === "individual" ? "Full name" : "Full legal name (never a trading name)"}
          <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder={p.kind === "individual" ? "e.g. Tan Wei Ming" : "e.g. Meridian Logistics Pte. Ltd."} />
        </label>
        {p.kind === "company" ? (
          <>
            <div className="ts-row">
              <label>
                Country of incorporation
                <input className="input" list="ts-countries" value={p.jurisdiction ?? ""} onChange={(e) => set({ jurisdiction: e.target.value })} placeholder="Singapore" />
              </label>
              <label>
                Registration number
                <input className="input" value={p.reg_no ?? ""} onChange={(e) => set({ reg_no: e.target.value })} placeholder="e.g. 202012345K" />
              </label>
            </div>
            <label>
              Type of entity
              <input className="input" list="ts-entities" value={p.entity_type ?? ""} onChange={(e) => set({ entity_type: e.target.value })} placeholder="private company limited by shares" />
            </label>
            <label>
              Registered office
              <input className="input" value={p.address} onChange={(e) => set({ address: e.target.value })} placeholder="1 Raffles Place, #20-01, Singapore 048616" />
            </label>
          </>
        ) : (
          <>
            <div className="ts-row">
              <label>
                ID type
                <input className="input" list="ts-idtypes" value={p.id_type ?? ""} onChange={(e) => set({ id_type: e.target.value })} placeholder="NRIC / passport" />
              </label>
              <label>
                ID number
                <input className="input" value={p.id_no ?? ""} onChange={(e) => set({ id_no: e.target.value })} />
              </label>
            </div>
            <label>
              Address
              <input className="input" value={p.address} onChange={(e) => set({ address: e.target.value })} />
            </label>
          </>
        )}
        {i === 1 && (
          <div className="ts-row">
            <label>
              Addressed to (name)
              <input className="input" value={p.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} placeholder="Jane Smith" />
            </label>
            <label>
              Their title
              <input className="input" value={p.contact_title ?? ""} onChange={(e) => set({ contact_title: e.target.value })} placeholder="Chief Executive Officer" />
            </label>
            <label>
              Dear …
              <input className="input" value={p.salutation ?? ""} onChange={(e) => set({ salutation: e.target.value })} placeholder="Jane (blank = Sirs)" />
            </label>
          </div>
        )}
        <label className="ts-check">
          <input type="checkbox" checked={Boolean(p.listed_or_regulated)} onChange={(e) => set({ listed_or_regulated: e.target.checked })} />
          Listed on a stock exchange, or regulated by a financial regulator
        </label>
        {i >= 2 && (
          <button type="button" className="alt-link" onClick={() => setParties((ps) => ps.filter((_, k) => k !== i))}>
            Remove this party
          </button>
        )}
      </div>
    );
  }

  function partiesUI() {
    const ok = partiesComplete(parties);
    return (
      <div className="ts-parties">
        <datalist id="ts-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="ts-entities">{ENTITY_TYPES.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="ts-idtypes">{ID_TYPES.map((c) => <option key={c} value={c} />)}</datalist>
        {parties.map((_, i) => partyForm(i))}
        <div className="chips">
          {parties.length < 6 && (
            <button type="button" className="chip" onClick={() => setParties((ps) => [...ps, emptyParty()])}>
              + Add another party
            </button>
          )}
          <button type="button" className="go" disabled={!ok} onClick={settleParties} title={ok ? undefined : "Every party needs its full name, number and address"}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  /* ── rendering ──────────────────────────────────────────────────────── */

  const summary = steps
    .filter((s): s is { kind: "q"; q: Question } => s.kind === "q")
    .map((s) => ({ id: s.q.id, label: shortLabel(s, deal), value: answerLabel(s.q, answers) }))
    .filter((x) => x.value);

  const yellow = flags.filter((f) => f.level === "yellow" || f.level === "red");
  const infos = flags.filter((f) => f.level === "green" && f.user_message);
  const aiForm = aiEdit ?? ai;

  const isDraft = stage === "drafted";

  return (
    <div className="fdai-screens">
      <div id="scr-chat" className={`scr on fade-in ts-screen${isDraft ? " is-draft" : ""}${isDraft && docOpen && html ? " doc-open" : ""}`}>
        {/* ── the rail ── */}
        <aside className="rail" aria-label="FD AI">
          <Link className="sb-new" href="/draft">
            + New draft
          </Link>
          <p className="k">FD AI</p>
          <nav className="nav2">
            <Link href="/draft">
              <i />
              New draft
            </Link>
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
          {credits !== null && (
            <div className="rail-credits">
              <span>
                <b>{credits}</b> {credits === 1 ? "credit" : "credits"} left
              </span>
              {wallet?.inTrial ? <small>Free week · trial credits expire</small> : <a href="/billing">{credits === 0 ? "Add credits" : "Add more"}</a>}
            </div>
          )}
          <div className="rail-bottom">
            {isAdmin && (
              <a className="rail-admin" href="/admin">
                <span aria-hidden="true" />
                Admin dashboard
              </a>
            )}
            {guest ? (
              <div className="guest-block guest-rail">
                <b>No account needed to start</b>
                <p>Answer the questions now. Create a free account when you press Prepare — your answers come with you.</p>
                <div className="guest-actions">
                  <a className="guest-signup" href="/signup?from=draft">
                    Sign up for free
                  </a>
                  <a className="guest-login" href="/login?from=draft">
                    Log in
                  </a>
                </div>
              </div>
            ) : (
              <div className="acct-wrap">
                <a className="acct" href="/settings">
                  <i>{(userEmail ?? "FD").slice(0, 2).toUpperCase()}</i>
                  <div>
                    {(userEmail ?? "Signed out").split("@")[0]}
                    <small>{userEmail ? userEmail.split("@")[1] : "Founders Doc"}</small>
                  </div>
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* ── the strip ── */}
        <div className="strip">
          <span className="dot" />
          <span className="dname">{isDraft ? title : "New term sheet"}</span>
          <Link className="chg" href="/draft">
            Change document
          </Link>
        </div>

        {/* ── the conversation ── */}
        {!isDraft && (
          <div className="convo">
            <div className="chat" ref={threadRef}>
              <div className="chat-in">
                {/* The intro stays at the top of the conversation, as the first
                    thing FD AI said. "Learn more" carries on in the same voice
                    and the same type — it is more of the message, not a box. */}
                <div className="m">
                  <div className="av">FD</div>
                  <div>
                    <div className="txt ts-intro">
                      <Markdown text={INTRO.short} />
                      {learnMore && (
                        <>
                          <p>{INTRO.learn_more.when_used.replace(/\*/g, "")}</p>
                          <p><b>What is usually binding</b></p>
                          <ul className="ts-list">{INTRO.learn_more.usually_binding.map((x) => <li key={x}>{x}</li>)}</ul>
                          <p><b>What is usually not binding</b></p>
                          <ul className="ts-list">{INTRO.learn_more.usually_not_binding.map((x) => <li key={x}>{x}</li>)}</ul>
                          <p><b>After the term sheet.</b> {INTRO.learn_more.after_the_term_sheet}</p>
                          <p><b>Good to know</b></p>
                          <ul className="ts-list">{INTRO.learn_more.good_to_know.map((x) => <li key={x}>{x}</li>)}</ul>
                        </>
                      )}
                      <p className="ts-disclaimer">{INTRO.disclaimer}</p>
                    </div>
                    <div className="ans">
                      <div className="chips">
                        {stage === "intro" && (
                          <button type="button" className="go" onClick={() => setStage("questions")}>
                            Start
                          </button>
                        )}
                        <button type="button" className="chip" onClick={() => setLearnMore((v) => !v)}>
                          {learnMore ? "Show less" : "Learn more"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {msgs.map((m, k) =>
                  m.who === "fd" ? (
                    <div className="m" key={k}>
                      <div className="av">FD</div>
                      <div>
                        <div className="txt">{m.text}</div>
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

                {stage === "questions" && step && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">
                        {step.kind === "q" ? step.q.text : PARTIES_Q}
                        {step.kind === "q" && step.q.help && <p className="sub">{step.q.help}</p>}
                        {step.kind === "parties" && <p className="sub">The side sending the term sheet is party 1. Your own details are filled in from your profile where you have one.</p>}
                      </div>
                      <div className="ans">{step.kind === "q" ? questionUI(step.q) : partiesUI()}</div>
                    </div>
                  </div>
                )}

                {stage === "questions" && finished && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">That’s everything. Have a look over the answers, then I’ll prepare the term sheet.</div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" onClick={() => setStage("review")}>
                            Review answers
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {stage === "review" && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">
                        <b style={{ fontWeight: 500 }}>Here is what I have.</b>
                        <dl className="cg-answers ts-summary">
                          <div>
                            <dt>Parties</dt>
                            <dd>{parties.map((p, i) => `${i === 0 ? roles[0] : i === 1 ? roles[1] : p.role || "Party"}: ${p.name}`).join(" · ")}</dd>
                          </div>
                          {summary.map((x) => (
                            <div key={x.id}>
                              <dt>{x.label}</dt>
                              <dd>{x.value}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="sub">
                          Title:{" "}
                          {DOCUMENT_TITLES.map((t) => (
                            <button key={t} type="button" className={`chip${documentTitle === t ? " on" : ""}`} onClick={() => setDocumentTitle(t)}>
                              {t.charAt(0) + t.slice(1).toLowerCase()}
                            </button>
                          ))}
                        </p>
                      </div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" disabled={busy} onClick={() => void prepare()}>
                            {busy ? "Preparing…" : guest ? "Sign up and prepare" : "Prepare term sheet"}
                          </button>
                          <button type="button" className="chip" disabled={busy} onClick={changeAnswers}>
                            Change an answer
                          </button>
                        </div>
                        <p className="later">One credit. The letter is assembled from the firm’s master; FD AI drafts only the heading, the nature of the deal, the structure and the key-term lines, which you confirm next.</p>
                      </div>
                    </div>
                  </div>
                )}

                {asks.length > 0 && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">
                        <b style={{ fontWeight: 500 }}>
                          Before I prepare it, {asks.length === 1 ? "one thing to sort out" : "a couple of things to sort out"}:
                        </b>
                        <ul className="cg-checks">{asks.map((q) => <li key={q.text}>{q.text}</li>)}</ul>
                        <p className="sub">Nothing has been charged. Fix it below, and I’ll bring you back here to prepare it.</p>
                      </div>
                      <div className="ans">
                        <div className="chips">
                          {asks
                            .filter((q) => q.step && steps.some((x) => stepKey(x) === q.step))
                            .map((q) => (
                              <button key={`fix-${q.text}`} type="button" className="go" onClick={() => fixAsk(q)}>
                                {q.scenario === "S12" ? "Add the seller" : `Change ${shortLabel(steps.find((x) => stepKey(x) === q.step)!, deal).toLowerCase()}`}
                              </button>
                            ))}
                          <button type="button" className="chip" onClick={() => { setAsks([]); setStage("review"); }}>
                            Review again
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
                        <b style={{ fontWeight: 500 }}>You’ve used your free documents.</b>
                        <p style={{ margin: "8px 0 0" }}>Your answers are still here. Add credits and the term sheet is prepared straight away.</p>
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
            <div className="composer">
              <p className="fine">
                A draft term sheet, assembled from Founders Doc’s master — reviewed by a qualified lawyer before use.{" "}
                <a href="https://foundersdoc.com/terms-conditions/">Terms</a>
              </p>
            </div>
          </div>
        )}

        {/* ── the draft view ── */}
        {isDraft && (
          <div className="dview">
            <section className="gen-left">
              <div className="gen-left-head">
                <div className="gen-left-title">
                  <span className="eyebrow">FD AI</span>
                  <h2>{status === "stopped" ? "This one needs a lawyer" : "Your term sheet is ready"}</h2>
                  <p>
                    {status === "stopped"
                      ? "Nothing has been drafted, and nothing has been charged."
                      : "Read the letter beside this, confirm the lines FD AI drafted, and download it as Word."}
                  </p>
                </div>
                <span className="gen-ready">
                  <i />
                  {status === "stopped" ? "Stopped" : "Ready"}
                </span>
              </div>

              <div className="gen-thread" ref={threadRef}>
                <div className="cg-user cg-summary-wrap">
                  <div className="cg-bubble cg-summary">
                    <div className="cg-summary-head">
                      <b>Your answers</b>
                      <span>Term Sheet</span>
                    </div>
                    <dl className="cg-answers">
                      <div>
                        <dt>Parties</dt>
                        <dd>{parties.map((p) => p.name).filter(Boolean).join(" · ")}</dd>
                      </div>
                      {summary.map((x) => (
                        <div key={x.id}>
                          <dt>{x.label}</dt>
                          <dd>{x.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                <div className="cg-turn">
                  <div className="cg-avatar" aria-hidden="true">FD</div>
                  <div className="cg-msg">
                    {status === "stopped" ? (
                      <>
                        <p>This is a deal a lawyer needs to look at before a term sheet can be prepared, so I haven’t drafted one. Nothing has been charged.</p>
                        <p>
                          If you’d like Founders Doc to help, you can{" "}
                          <a href="/contact">book a consultation</a>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          Here’s your <b>{documentTitle.charAt(0) + documentTitle.slice(1).toLowerCase()}</b>, assembled from the firm’s master.{" "}
                          Nothing in it is invented: every number, date and party comes from your answers.
                        </p>
                        {reviewNote && (
                          <p className="ts-note">
                            <b>A note from Founders Doc:</b> {reviewNote}
                          </p>
                        )}
                        {html && (
                          <button type="button" className="gen-doc-card cg-file" onClick={() => setDocOpen(true)} aria-pressed={docOpen}>
                            <span className="cg-file-ic">▤</span>
                            <span>
                              <b>{title}</b>
                              <small>Version {version} · click to display</small>
                            </span>
                          </button>
                        )}
                        {infos.length > 0 && (
                          <ul className="cg-checks">{infos.map((f, k) => <li key={k}>{f.user_message}</li>)}</ul>
                        )}
                        {yellow.length > 0 && (
                          <>
                            <p>
                              I’ve marked {yellow.length === 1 ? "one point" : `${yellow.length} points`} for whoever reviews it before you sign.
                              They’re not in the letter — worth sending this list with it:
                            </p>
                            <ul className="ts-flags" aria-label="For your lawyer">
                              {yellow.map((f, k) => (
                                <li key={k} className={f.level === "red" ? "red" : ""}>
                                  <b>{f.title ?? "Worth checking"}</b>
                                  <span>{f.reason}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {ai && status !== "stopped" && (
                  <div className="cg-turn">
                    <div className="cg-avatar" aria-hidden="true">FD</div>
                    <div className="cg-msg ts-ai">
                      <p>
                        <b>These are the only lines I wrote.</b> Everything else in the letter is the firm’s approved wording
                        filled in from your answers. Check they say what you agreed.
                      </p>
                      {!aiEdit ? (
                        <>
                          <dl className="ts-ai-lines">
                            <div>
                              <dt>Heading</dt>
                              <dd>{ai.transaction_title || "—"}</dd>
                            </div>
                            <div>
                              <dt>2.1 Nature</dt>
                              <dd>{ai.transaction_description || "—"}</dd>
                            </div>
                            <div>
                              <dt>2.3 Structure</dt>
                              <dd>{ai.structure || "—"}</dd>
                            </div>
                            {(ai.key_terms ?? []).map((t: KeyTerm, k: number) => (
                              <div key={k}>
                                <dt>{t.heading}</dt>
                                <dd>{t.text}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="chips">
                            <button type="button" className="chip" onClick={() => setAiEdit({ ...ai, key_terms: (ai.key_terms ?? []).map((t) => ({ ...t })) })}>
                              Change these lines
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <label>
                            Heading
                            <input className="input" value={aiEdit.transaction_title} onChange={(e) => setAiEdit({ ...aiEdit, transaction_title: e.target.value.toUpperCase() })} />
                          </label>
                          <label>
                            2.1 The Parties propose to enter into…
                            <textarea className="input" rows={2} value={aiEdit.transaction_description} onChange={(e) => setAiEdit({ ...aiEdit, transaction_description: e.target.value })} />
                          </label>
                          <label>
                            2.3 Structure
                            <textarea className="input" rows={4} value={aiEdit.structure} onChange={(e) => setAiEdit({ ...aiEdit, structure: e.target.value })} />
                          </label>
                          {(aiEdit.key_terms ?? []).map((t: KeyTerm, k: number) => (
                            <label key={k}>
                              {t.heading}
                              <textarea
                                className="input"
                                rows={2}
                                value={t.text}
                                onChange={(e) => {
                                  const kt = (aiEdit.key_terms ?? []).slice();
                                  kt[k] = { ...t, text: e.target.value };
                                  setAiEdit({ ...aiEdit, key_terms: kt });
                                }}
                              />
                            </label>
                          ))}
                          <div className="chips">
                            <button type="button" className="go" disabled={savingAi} onClick={() => void saveAi()}>
                              {savingAi ? "Saving…" : "Save and update the letter"}
                            </button>
                            <button type="button" className="chip" disabled={savingAi} onClick={() => setAiEdit(null)}>
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="cg-turn" role="alert">
                    <div className="cg-avatar" aria-hidden="true">FD</div>
                    <div className="cg-msg">
                      <p>{error}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="gen-compose">
                <div className="chips">
                  <button type="button" className="chip" onClick={changeAnswers}>
                    Change answers and prepare again
                  </button>
                  <Link className="chip" href="/draft">
                    New draft
                  </Link>
                </div>
                <p className="hint">Changing an answer prepares a fresh term sheet (one credit). Editing the letter itself is free — use the document beside this.</p>
              </div>
            </section>

            {docOpen && html && (
              <section className="gen-right">
                <div className="dbar">
                  <span className="dstat">
                    <i />
                    {[`Version ${version}`, yellow.length ? `${yellow.length} for your lawyer` : ""].filter(Boolean).join(" · ")}
                  </span>
                  <div className="dacts">
                    <button
                      type="button"
                      className="dbtn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(editorRef.current?.plain ?? text);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        } catch {
                          setError("Could not copy. Select the text and copy manually.");
                        }
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    {isAdmin && draftId && (
                      <button type="button" className="dbtn" title="Tell the drafter what should change — select a passage first to quote it" onClick={openFeedback}>
                        Feedback
                      </button>
                    )}
                    <button
                      type="button"
                      className="dbtn gold"
                      disabled={exporting}
                      onClick={() => void exportDocx()}
                    >
                      {exporting ? "Preparing…" : "Download Word"}
                    </button>
                    <button type="button" className="dbtn d-close" aria-label="Close document" title="Close document" onClick={() => setDocOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {fbOpen && (
                  <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && setFbOpen(false)}>
                    <div className="fb-modal" role="dialog" aria-modal="true" aria-labelledby="ts-fb-title">
                      <h3 id="ts-fb-title">What should change?</h3>
                      <p className="fb-sub">
                        The drafter reads it against this term sheet and turns it into a rule for the AI’s lines in every later one. The master’s wording is not the AI’s to change — for that, upload a new master.
                      </p>
                      {fbExcerpt && (
                        <blockquote className="fb-quote">
                          {fbExcerpt}
                          <button type="button" className="link-btn" onClick={() => setFbExcerpt("")}>
                            remove quote
                          </button>
                        </blockquote>
                      )}
                      <textarea rows={5} value={fbText} placeholder="What is wrong, and what it should be instead" onChange={(e) => setFbText(e.target.value)} disabled={fbSending} autoFocus />
                      {fbDone && <p className="fb-done">{fbDone}</p>}
                      <div className="fb-actions">
                        <button type="button" className="dbtn" onClick={() => setFbOpen(false)}>
                          Close
                        </button>
                        <button type="button" className="dbtn gold" disabled={fbSending || !fbText.trim()} onClick={() => void sendFeedback()}>
                          {fbSending ? "Sending…" : "Send to the firm"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <DocumentEditor
                  key={`${draftId ?? "unsaved"}:v${version}`}
                  text={text}
                  savedHtml={html}
                  look={look}
                  onContentChange={(h, p) => {
                    editorRef.current = { html: h, plain: p };
                  }}
                  onSave={saveDocument}
                />
              </section>
            )}
          </div>
        )}

        {/* ── the progress pane ── */}
        <section className="pane">
          <div className="pane-h">
            {isDraft ? "Your answers" : "Progress"}
            {!isDraft && <span className="pct">{pct}%</span>}
          </div>
          <div className="studio-body">
            {isDraft && yellow.length > 0 && (
              <p className="ts-pane-flags">
                <i aria-hidden="true" />
                {yellow.length === 1 ? "1 point" : `${yellow.length} points`} for your lawyer — listed in the conversation
              </p>
            )}
            {isDraft && status === "stopped" ? (
              <p className="sub">Not drafted — this one needs a lawyer.</p>
            ) : (
              <>
                <div className="prog-h">
                  <b className="cnt">
                    {answered} of {steps.length} answered
                    {skippedCount ? ` · ${skippedCount} skipped` : ""}
                  </b>
                  <span className="eta">{isDraft ? "Click one to change it" : finished ? "Ready to prepare" : `About ${Math.max(1, Math.ceil(pending.length * 0.5))} min`}</span>
                </div>
                <div className="segs" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
                  {steps.map((s) => {
                    const st = settled[stepKey(s)];
                    return <i key={stepKey(s)} className={st ?? (s === step ? "now" : "")} />;
                  })}
                </div>
                {/* One heading per section, its questions beneath; what has
                    not been reached yet is faded. An answered or skipped one
                    can be clicked to change it, as on the NDA. */}
                <div className="notes ts-notes">
                  {groupSteps(steps).map((g, gi) => (
                    <div className="ts-group" key={`${g.name}-${gi}`}>
                      <p className="ts-group-h">{g.name}</p>
                      {g.items.map((s) => {
                        const k = stepKey(s);
                        const st = settled[k] ?? (s === step ? "now" : "");
                        const n = steps.indexOf(s) + 1;
                        const value =
                          st === "done"
                            ? s.kind === "q"
                              ? answerLabel(s.q, answers)
                              : parties.map((p) => p.name).filter(Boolean).join(" · ")
                            : st === "skp"
                              ? "Skipped"
                              : "";
                        return (
                          <div
                            key={k}
                            className={`inst ts-inst ${st || "later"}`}
                            role={st === "done" || st === "skp" ? "button" : undefined}
                            tabIndex={st === "done" || st === "skp" ? 0 : undefined}
                            title={st === "done" || st === "skp" ? `${value ? `${value} — ` : ""}click to change` : undefined}
                            onClick={() => (st === "done" || st === "skp") && revisit(s)}
                            onKeyDown={(e) => e.key === "Enter" && (st === "done" || st === "skp") && revisit(s)}
                          >
                            <i>{st === "done" ? "✓" : n}</i>
                            <div>
                              <b>{shortLabel(s, deal)}</b>
                              {value && <small>{value}</small>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {!isDraft && (
            <div className="studio-foot">
              <button
                type="button"
                className="btn s-gen"
                disabled={busy || !finished || stage === "intro"}
                onClick={() => (stage === "review" ? void prepare() : setStage("review"))}
              >
                {busy ? "Preparing…" : stage === "review" ? (guest ? "Sign up and prepare" : "Prepare term sheet") : "Review answers"}
              </button>
              <button type="button" className="btn btn-quiet s-skipall" disabled={busy || finished || stage === "intro"} onClick={skipRest}>
                Skip the rest
              </button>
              <small>Skipped questions take the usual answer — nothing is invented.</small>
            </div>
          )}
          {isDraft && (
            <div className="studio-foot">
              <button type="button" className="btn s-gen" disabled={busy} onClick={changeAnswers}>
                Change answers
              </button>
              <small>Preparing again with new answers uses one credit. Editing the letter itself is free.</small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Consecutive steps under the same heading, together. */
function groupSteps(steps: Step[]): { name: string; items: Step[] }[] {
  const out: { name: string; items: Step[] }[] = [];
  for (const s of steps) {
    const name = groupOf(s);
    const last = out[out.length - 1];
    if (last && last.name === name) last.items.push(s);
    else out.push({ name, items: [s] });
  }
  return out;
}

function partiesComplete(ps: Party[]): boolean {
  if (ps.length < 2) return false;
  return ps.every((p) =>
    p.name.trim() && p.address.trim() && (p.kind === "individual" ? p.id_no?.trim() : p.reg_no?.trim() && p.jurisdiction?.trim() && p.entity_type?.trim()),
  );
}

/** The saved answers, minus the assembler's own keys. */
function fromSaved(saved: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(saved)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

/** Just enough Markdown for the intro: **bold** and paragraphs. */
function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/).map((bit, k) =>
            /^\*\*[^*]+\*\*$/.test(bit) ? <b key={k}>{bit.slice(2, -2)}</b> : <span key={k}>{bit}</span>,
          )}
        </p>
      ))}
    </>
  );
}
