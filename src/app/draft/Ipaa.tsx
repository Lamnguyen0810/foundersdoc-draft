"use client";

/**
 * The IP assignment agreement screen — the convertible loan agreement screen
 * (Cln.tsx) with the loan agreement's level slider (Loan.tsx), for the IP
 * assignment questionnaire (lib/ipaa/data/questionnaire.ts).
 *
 * The flow: how detailed the agreement should be (IP0 — Basic, Standard or
 * Complex, on the NDA's slider), which side the user is on (the creator or
 * the recipient), the governing law, who is making the IP, then the two
 * parties in fixed boxes — the user's own side filled from the company
 * profile — then the rest of the questions, and the agreement, assembled on
 * the server (lib/ipaa/assemble.ts) and reviewed by FD AI.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DocumentEditor from "./DocumentEditor";
import DetailSlider, { type SliderSteps } from "./DetailSlider";
import ShareButton from "./ShareButton";
import { AskComposer, atLeast, buildReminders, DocIcon, ReminderList, DraftingLeft, FollowStream, GenCompose, TypingTurn, useAskFD, useDraftProgress } from "./AgreementParts";
import RailHistory from "./RailHistory";
import type { RecentDraft } from "./history";
import type { CompanyPrefill } from "./TermSheet";
import { track } from "@/lib/track";
import { DEFAULT_LOOK, type DocumentLook } from "@/lib/playbook";
import { applyDefaults, levelOf, problemWith, questionsFor, withFixed, type Option, type Question } from "@/lib/ipaa/questions";
import { IPAA_INTRO } from "@/lib/ipaa/data/intro";
import type { Answers, DraftStatus, Flag, Party, PartyKind } from "@/lib/ipaa/types";

/* ── what the page hands in ───────────────────────────────────────────── */

export interface IpaaResume {
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

export interface IpaaProps {
  look?: DocumentLook;
  userEmail: string | null;
  guest: boolean;
  wallet: { credits: number; inTrial: boolean; trialEndsAt: string | null } | null;
  isAdmin: boolean;
  company: CompanyPrefill | null;
  resume?: IpaaResume;
  recent?: RecentDraft[];
}

type Stage = "intro" | "questions" | "review" | "drafted";

/** A step is a question, or the two parties. */
type Step = { kind: "q"; q: Question } | { kind: "parties" };

const PARTIES_BEFORE = "IP6";
export const IPAA_HANDOFF_KEY = "fdai.ipaa-handoff";
const STASH_KEY = "fdai.ipaa-in-progress";

const PARTIES_Q = "Who are the Creator and the Recipient? Names as they will appear in the agreement, the details for notices, and who signs.";

type Msg = { who: "fd" | "me"; text: string; label?: string; skipped?: boolean };
type Settled = Record<string, "done" | "skp">;

const stepKey = (s: Step) => (s.kind === "q" ? s.q.id : s.kind);

/** The parties once the side, the law and who is making the IP are known — before IP6. */
function stepsFor(a: Answers): Step[] {
  const out: Step[] = [];
  for (const q of questionsFor(a)) {
    if (q.id === PARTIES_BEFORE) out.push({ kind: "parties" });
    out.push({ kind: "q", q });
  }
  return out;
}

const SHORT: Record<string, string> = {
  IP0: "Level of detail", IP1: "Your side", IP2: "Governing law", IP2a: "Which law", IP3: "The creator", IP3a: "Who creates it", IP4: "About you", IP4a: "What you do",
  IP5: "Your aim", IP6: "Others involved", IP7: "Type of IP", IP7a: "Other IP", IP8: "The work", IP9: "The project", IP9a: "Months",
  IP10: "Confidential information", IP11: "Ownership", IP11a: "The licence", IP12: "Ownership", IP12a: "Buy-back", IP13: "Shares", IP13a: "Creator's share",
  IP14: "Licence back", IP15: "Scope of licence", IP16: "Payment", IP16a: "Currency", IP16b: "Fee", IP17: "Warranties", IP17a: "Knowledge", IP18: "Disputes",
};

function shortLabel(s: Step): string {
  if (s.kind === "parties") return "The parties";
  return SHORT[s.q.id] ?? s.q.section;
}

function groupOf(s: Step): string {
  if (s.kind !== "q") return "The people";
  return s.q.section;
}

/** What "Skip the rest" cannot answer for anyone. */
const MUST_ASK = new Set(["IP0", "IP1", "IP8", "parties"]);

function allSettled(a: Answers): Settled {
  const out: Settled = {};
  for (const s of stepsFor(a)) out[stepKey(s)] = "done";
  return out;
}

/** The label shown for an answer, for the conversation and the summary. */
function answerLabel(q: Question, a: Answers): string {
  const v = a[q.id];
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return "";
  const label = (x: string) => {
    const full = q.options.find((o) => o.value === x)?.label ?? x;
    return full.split(" – ")[0];
  };
  if (Array.isArray(v)) return v.map((x) => label(String(x))).join(q.type === "free_text_list" ? " · " : ", ");
  return label(String(v));
}

/** The level of detail (IP0), on the NDA's comprehensiveness slider — the FD Lite menu's three versions. */
const LEVEL_STEPS: SliderSteps = {
  labels: ["Basic", "Standard", "Complex"],
  lengths: ["up to 3 pages · about 10 questions", "up to 7 pages · about 13 questions", "more than 7 pages · about 18 questions"],
  guide: [
    "The essentials: past, existing and future IP assigned 100% to the recipient, moral rights waived, the assignment perfected and confidentiality. For a simple, one-off piece of work.",
    "Adds a licence back to the creator (to showcase the work, or for any purpose), a licence of any background IP built into the work, and independent advice. Right for most engagements.",
    "Every option: joint ownership or the creator keeping the IP under licence, the scope of the licence, the right to sue, warranties, delivery of the work and permitted disclosure. For valuable or shared IP.",
  ],
  recommended: 2,
  title: "Level of detail",
  tip: "Which questions are asked and which clauses go in, as in the FD Lite menu: Basic, Standard or Complex.",
  note: "Choose Complex and you are asked a few more questions; choose Basic and the agreement stays short. You can change it later.",
};

const emptyParty = (kind: PartyKind = "company"): Party => ({ name: "", kind });

/** Who usually makes the IP as a company rather than an individual (IP3, IP4). */
const CREATOR_COMPANY = new Set(["provider", "consulting_co"]);

/* ── the component ────────────────────────────────────────────────────── */

export default function Ipaa({ look = DEFAULT_LOOK, userEmail, guest, wallet, isAdmin, company: profile, resume, recent }: IpaaProps) {
  const [stage, setStage] = useState<Stage>(resume ? "drafted" : "questions");
  const [learnMore, setLearnMore] = useState(false);
  const [answers, setAnswers] = useState<Answers>(() => (resume ? fromSaved(resume.answers) : {}));
  /* The user's own side is filled from the company profile once they say which side they are on (IP1). */
  const [creator, setCreator] = useState<Party>(() => (resume?.answers._creator as Party | undefined) ?? emptyParty("individual"));
  const [recipient, setRecipient] = useState<Party>(() => (resume?.answers._recipient as Party | undefined) ?? emptyParty("company"));
  const [settled, setSettled] = useState<Settled>(() => (resume ? allSettled(fromSaved(resume.answers)) : {}));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typed, setTyped] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [listItems, setListItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /* As on the NDA: questions to FD AI, and the progress bar while drafting. */
  const fd = useAskFD("IP Assignment Agreement", "ipaa", guest);
  const progress = useDraftProgress(busy);
  const [error, setError] = useState<string | null>(null);
  const [paywalled, setPaywalled] = useState(false);
  const [credits, setCredits] = useState(wallet?.credits ?? null);

  /* the draft */
  const [draftId, setDraftId] = useState<string | null>(resume?.id ?? null);
  const [title, setTitle] = useState(resume?.title ?? "IP Assignment Agreement");
  const [pastDrafts, setPastDrafts] = useState<RecentDraft[]>(recent ?? []);
  const [html, setHtml] = useState<string | null>(resume?.outputHtml ?? null);
  const [text, setText] = useState(resume?.output ?? "");
  const [status, setStatus] = useState<DraftStatus>(resume?.status ?? "draft");
  const [flags, setFlags] = useState<Flag[]>(resume?.flags ?? []);
  /* The blanks the agreement was assembled with, for "things to fill in". */
  const [missing, setMissing] = useState<string[]>([]);
  const [reviewNote] = useState<string | null>(resume?.reviewNote ?? null);
  /* Why nothing was drafted, in FD AI's words. */
  const [stopMessage, setStopMessage] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(Boolean(resume?.outputHtml));
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  /* The review points must be seen before the file leaves: the first
     Download opens them; "I've read them" downloads. */
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkRead, setCheckRead] = useState(false);
  const [version, setVersion] = useState(1);
  const editorRef = useRef<{ html: string; plain: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /* Feedback to the firm — the firm's own lawyers only, as on the NDA. */
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbExcerpt, setFbExcerpt] = useState("");
  const [fbSending, setFbSending] = useState(false);
  const [fbDone, setFbDone] = useState<string | null>(null);

  async function patchPastDraft(id: string, change: { title?: string; pinned?: boolean }) {
    const was = pastDrafts;
    const wasTitle = title;
    setPastDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
    if (change.title && id === draftId) setTitle(change.title);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setPastDrafts(was);
      if (change.title && id === draftId) setTitle(wasTitle);
    }
  }

  /* ── the steps, from the answers ────────────────────────────────────── */
  const steps = useMemo<Step[]>(() => stepsFor(answers), [answers]);
  const pending = steps.filter((s) => !settled[stepKey(s)]);
  const opened = openKey ? steps.find((s) => stepKey(s) === openKey) : undefined;
  const step = stage === "questions" ? (opened ?? pending[0]) : undefined;
  const finished = pending.length === 0;
  const answered = steps.filter((s) => settled[stepKey(s)] === "done").length;
  const skippedCount = steps.filter((s) => settled[stepKey(s)] === "skp").length;
  const pct = steps.length ? Math.round(((answered + skippedCount) / steps.length) * 100) : 0;

  /* The parties, in a line. */
  const partyLine = (p: Party, label: string) => (p.name.trim() ? `${label}: ${p.name.trim()}${p.id_no?.trim() ? ` (${p.id_no.trim()})` : ""}` : "");
  const LAWS: Record<string, string> = { sg: "Singapore", ew: "England and Wales", hk: "Hong Kong", de: "Delaware", ny: "New York" };
  const lawName = answers.IP2 === "other" ? String(answers.IP2a ?? "").trim() : LAWS[String(answers.IP2 ?? "sg")] ?? "";
  const partiesLine = [partyLine(creator, "Creator"), partyLine(recipient, "Recipient")].filter(Boolean).join(" · ");
  const iAmCreator = answers.IP1 === "creator";
  /* A creator's template leaves the recipient blank, to fill in for each client. */
  const template = iAmCreator && answers.IP5 === "template";

  /* Restore a hand-off (a visitor who signed up mid-flow) or a stash, after
     mount: the server never saw the storage. */
  useEffect(() => {
    if (resume) return;
    const t = setTimeout(() => {
      try {
        const handoff = localStorage.getItem(IPAA_HANDOFF_KEY);
        const raw = handoff ?? sessionStorage.getItem(STASH_KEY);
        if (!raw) return;
        const s = JSON.parse(raw) as { answers: Answers; creator?: Party; recipient?: Party; settled?: Settled; msgs?: Msg[]; stage: Stage };
        if (!s || !s.answers || Object.keys(s.answers).length === 0) return;
        setAnswers(s.answers);
        setCreator(s.creator ?? emptyParty("individual"));
        setRecipient(s.recipient ?? emptyParty("company"));
        setSettled(s.settled ?? {});
        setMsgs(Array.isArray(s.msgs) ? s.msgs : []);
        if (handoff && !guest) {
          localStorage.removeItem(IPAA_HANDOFF_KEY);
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
      sessionStorage.setItem(STASH_KEY, JSON.stringify({ answers, creator, recipient, settled, msgs, stage }));
    } catch {
      /* private mode */
    }
  }, [answers, creator, recipient, settled, msgs, stage, resume]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, stage, error, fd.follow.length, fd.asking]);

  /* ── answering ──────────────────────────────────────────────────────── */

  const resetInput = () => {
    setTyped("");
    setMulti([]);
    setListItems([]);
  };

  const say = (...m: Msg[]) => setMsgs((prev) => [...prev, ...m]);

  const settle = (q: Question, value: unknown, skipped: boolean) => {
    setError(null);
    /* The level (IP0) sets the answers it does not ask; they follow every answer. */
    const next: Answers = withFixed({ ...answers, [q.id]: value });
    /* The user's own side, from the company profile, once they say which it is. */
    if (q.id === "IP1" && profile) {
      const mine: Party = { name: profile.name, kind: "company", id_no: profile.uen || undefined, address: profile.address || undefined };
      if (value === "creator" && !creator.name.trim()) setCreator(mine);
      if (value === "recipient" && !recipient.name.trim()) setRecipient(mine);
    }
    /* Who makes the IP decides whether the Creator is usually a person or a company. */
    if ((q.id === "IP3" || q.id === "IP4") && typeof value === "string" && !creator.name.trim()) {
      setCreator((c) => ({ ...c, kind: CREATOR_COMPANY.has(value) ? "company" : "individual" }));
    }
    if (Object.keys(settled).length === 0) track("draft_started", { doc_type: "ipaa", total_steps: steps.length });
    setAnswers(next);
    setSettled((st) => ({ ...st, [q.id]: skipped ? "skp" : "done" }));
    say({ who: "fd", text: q.text }, { who: "me", label: shortLabel({ kind: "q", q }), text: skipped ? "Skipped for now" : answerLabel(q, next) || "None", skipped });
    setOpenKey(null);
    resetInput();
  };

  const commit = (q: Question, value: unknown) => settle(q, value, false);
  const skip = (q: Question) => settle(q, q.defaultValue ?? "", true);

  const settleParties = () => {
    setSettled((st) => ({ ...st, parties: "done" }));
    setOpenKey(null);
    say({ who: "fd", text: PARTIES_Q }, { who: "me", label: "The parties", text: partiesLine });
    resetInput();
  };

  /** Open any step from the list — answered, skipped or not yet reached. */
  function revisit(s: Step) {
    const k = stepKey(s);
    if (busy) return;
    if (stage === "questions" && step && stepKey(step) === k) return;
    resetInput();
    if (s.kind === "q") {
      const v = answers[k];
      if ((s.q.type === "free_text" || s.q.type === "scale") && typeof v === "string") setTyped(v);
      if (s.q.type === "multi_choice" && Array.isArray(v)) setMulti(v.map(String));
      if (s.q.type === "free_text_list" && Array.isArray(v)) setListItems(v.map(String));
    }
    const name = shortLabel(s).toLowerCase();
    say({
      who: "fd",
      text:
        settled[k] === "done"
          ? `Here’s your answer on ${name}. Change it, or answer it the same way to keep it — your other answers are kept.`
          : settled[k] === "skp"
            ? `Let’s go back to ${name}.`
            : `Let’s look at ${name}.`,
    });
    setOpenKey(k);
    setStage("questions");
    setDocOpen(false);
  }

  /** The usual answer for everything still open, except what only the person
   *  can say — and a required question with no usual answer, which stays open:
   *  nothing is invented. */
  function skipRest() {
    const a: Answers = { ...answers };
    const st: Settled = { ...settled };
    for (let pass = 0; pass < 4; pass++) {
      for (const s of stepsFor(a)) {
        const k = stepKey(s);
        if (st[k] || MUST_ASK.has(k) || s.kind !== "q") continue;
        if (s.q.required && s.q.defaultValue === undefined && (a[k] === undefined || a[k] === "")) continue;
        const v = a[k];
        if (v === undefined || v === null || v === "") a[k] = s.q.defaultValue ?? "";
        st[k] = "skp";
      }
    }
    const left = stepsFor(a).filter((s) => !st[stepKey(s)]);
    track("draft_with_what_i_have", { doc_type: "ipaa", count: Object.keys(st).length - Object.keys(settled).length, total_steps: steps.length });
    setAnswers(withFixed(a));
    setSettled(st);
    setOpenKey(null);
    resetInput();
    say(
      { who: "me", label: "Skip the rest", text: "Use the usual answers", skipped: true },
      {
        who: "fd",
        text: left.length
          ? `I’ve used the usual answer wherever there is one. These have no usual answer, so only you can choose: ${left.map((s) => shortLabel(s).toLowerCase()).join(", ")}.`
          : "I’ve used the usual answer for everything you skipped — you can change any of them from the list on the right.",
      },
    );
    if (left.length === 0) setStage("review");
  }

  /* ── preparing the contract ─────────────────────────────────────────── */

  /** A question typed into the message box, answered as on the NDA. */
  async function askQuestion(q: string) {
    say({ who: "me", label: "Question", text: q });
    const onScreen = stage === "questions" && step && step.kind === "q" ? step.q.text : "";
    const help = stage === "questions" && step && step.kind === "q" ? (step.q.help ?? "") : "";
    say({ who: "fd", text: await fd.answer(q, onScreen, help) });
  }

  /** "+": a file to ask FD AI about, as on the NDA. */
  async function attachFile(f: File) {
    say({ who: "me", label: "Attached", text: f.name });
    say({ who: "fd", text: await fd.attach(f) });
  }

  async function prepare() {
    if (guest) {
      try {
        localStorage.setItem(IPAA_HANDOFF_KEY, JSON.stringify({ answers, creator, recipient, settled, msgs, stage: "review" }));
      } catch {
        /* the sign-up still works; the answers just do not follow */
      }
      track("signup_gate", { doc_type: "ipaa", reason: "generate" });
      window.location.href = "/signup?from=draft";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await atLeast(fetch("/api/ipaa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: applyDefaults(answers), creator, recipient }),
      }));
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 402) {
        setPaywalled(true);
        track("paywall_hit", { doc_type: "ipaa" });
        return;
      }
      if (!res.ok || !j) {
        setError((j?.error as string) ?? "Something went wrong. Please try again.");
        track("draft_failed", { doc_type: "ipaa" });
        return;
      }
      if (j.kind === "stopped") {
        setStatus("stopped");
        setDraftId((j.draftId as string | null) ?? null);
        setFlags(((j.flags as Flag[]) ?? []).filter((f) => !(f.scenario === "IPP" && f.level === "red")));
        setStopMessage((j.message as string) ?? null);
        setHtml(null);
        setText("");
        setStage("drafted");
        try {
          sessionStorage.removeItem(STASH_KEY);
        } catch {
          /* fine */
        }
        track("draft_generated", { doc_type: "ipaa", words: 0, reason: "master_pending" });
        return;
      }
      setDraftId((j.draftId as string | null) ?? null);
      setTitle((j.title as string) ?? "IP Assignment Agreement");
      setHtml(j.html as string);
      setText(j.text as string);
      setStatus(j.status as DraftStatus);
      setFlags((j.flags as Flag[]) ?? []);
      setMissing(Array.isArray(j.missing) ? (j.missing as string[]) : []);
      setVersion(1);
      setDocOpen(true);
      setStage("drafted");
      if (typeof j.creditsLeft === "number") setCredits(j.creditsLeft);
      try {
        sessionStorage.removeItem(STASH_KEY);
      } catch {
        /* fine */
      }
      track("draft_generated", { doc_type: "ipaa", words: Number(j.words ?? 0) });
    } catch {
      setError("Could not reach FD AI. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDocument(editedHtml: string, plain: string) {
    if (!draftId) return;
    await fetch(`/api/drafts/${draftId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outputHtml: editedHtml, output: plain }) });
  }

  /** The points for the lawyer as a cover sheet, ahead of the contract, so
   *  they travel with the file whoever opens it. */
  function coverSheet(): { html: string; text: string } {
    const points = flags.filter((f) => f.level === "yellow" || f.level === "red");
    if (points.length === 0) return { html: "", text: "" };
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const intro = `FD AI marked ${points.length === 1 ? "one point" : `${points.length} points`} for whoever checks this agreement before it is signed. This page is not part of the Agreement: remove it before the parties sign.`;
    const lines = points.map((f, k) => `${k + 1}. ${f.title ?? "Worth checking"}: ${f.reason}`);
    return {
      html:
        `<p class="doc-title">Before you sign</p><p>${esc(intro)}</p>` +
        points.map((f, k) => `<p><b>${k + 1}. ${esc(f.title ?? "Worth checking")}.</b> ${esc(f.reason)}</p>`).join("") +
        `<p class="doc-title">\u00a0</p>`,
      text: `BEFORE YOU SIGN\n\n${intro}\n\n${lines.join("\n\n")}\n\n\n`,
    };
  }

  async function exportDocx() {
    if (!html || status === "stopped") return;
    setExporting(true);
    try {
      const cover = coverSheet();
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: cover.text + (editorRef.current?.plain ?? text),
          html: cover.html + (editorRef.current?.html ?? html),
          title,
          fileName: `${title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48).replace(/-+$/, "") || "IP-Assignment-Agreement"}-V${version}.docx`,
          includeNotes: false,
          docTypeSlug: "ipaa",
          draftId,
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
      a.download = match?.[1] ?? "ip-assignment-agreement.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track("draft_exported", { doc_type: "ipaa", format: "docx" });
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
      track("draft_feedback", { doc_type: "ipaa" });
      setFbText("");
      setFbExcerpt("");
      setFbDone(
        j.learnt && j.rule
          ? `Learnt. From the next IP assignment agreement: “${j.rule}” — edit or switch off under Admin → AI files → Feedback & lessons.`
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

  function chipsFor(opts: Option[], onPick: (o: Option) => void, on?: (o: Option) => boolean) {
    return opts.map((o) => (
      <button
        key={o.value}
        type="button"
        className={`chip${o.recommended ? " rec" : ""}${on?.(o) ? " on" : ""}`}
        title={o.recommended ? "Usual choice" : undefined}
        onClick={() => onPick(o)}
      >
        {o.label}
        {o.recommended ? " ·" : ""}
      </button>
    ));
  }

  const skipLink = (q: Question) =>
    q.defaultValue !== undefined || !q.required ? (
      <p className="later">
        <button type="button" className="alt-link" onClick={() => skip(q)}>
          {q.defaultValue !== undefined ? "Skip — use the usual answer" : "Skip for now"}
        </button>
      </p>
    ) : null;

  /** "← Back": the step before this one, opened again (as from the list on
   *  the right). Its answer is kept until a new one is given. */
  function backButton() {
    if (!step || busy) return null;
    const at = steps.findIndex((x) => stepKey(x) === stepKey(step));
    const prev = at > 0 ? steps[at - 1] : undefined;
    if (!prev) return null;
    return (
      <button type="button" className="back" onClick={() => revisit(prev)}>
        ← Back
      </button>
    );
  }

  function questionUI(q: Question) {
    switch (q.type) {
      case "scale": {
        /* The level of detail, on the slider the NDA and the loan agreement use. */
        const values = q.options.map((o) => o.value);
        const current = values.indexOf(typed || String(answers[q.id] ?? "") || String(q.defaultValue ?? ""));
        const level = current >= 0 ? current + 1 : 2;
        return (
          <>
            <div className="chips emp-scale">
              <DetailSlider value={level} steps={LEVEL_STEPS} label={q.text} onChange={(l) => setTyped(values[l - 1] ?? values[0])} />
              {backButton()}
              <button type="button" className="go" onClick={() => commit(q, values[level - 1] ?? values[0])}>
                Continue
              </button>
            </div>
            {skipLink(q)}
          </>
        );
      }

      case "single_choice":
        return (
          <>
            <div className="chips">{chipsFor(q.options, (o) => commit(q, o.value), (o) => answers[q.id] === o.value)}</div>
            {backButton() && <div className="chips ts-back-row">{backButton()}</div>}
            {skipLink(q)}
          </>
        );

      case "multi_choice":
        return (
          <>
            <div className="chips">
              {chipsFor(
                q.options,
                (o) =>
                  setMulti((m) => {
                    if (o.exclusive) return m.includes(o.value) ? [] : [o.value];
                    const without = m.filter((x) => !q.options.find((p) => p.value === x)?.exclusive);
                    return without.includes(o.value) ? without.filter((x) => x !== o.value) : [...without, o.value];
                  }),
                (o) => multi.includes(o.value),
              )}
              {backButton()}
              <button type="button" className="go" disabled={multi.length === 0} onClick={() => commit(q, multi)}>
                Done
              </button>
            </div>
            {skipLink(q)}
          </>
        );

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
              placeholder={q.placeholder ?? "One at a time"}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && typed.trim()) {
                  e.preventDefault();
                  setListItems((xs) => [...xs, typed.trim()].slice(0, q.maxItems ?? 8));
                  setTyped("");
                }
              }}
            />
            {typed.trim() && (
              <button type="button" className="go" onClick={() => { setListItems((xs) => [...xs, typed.trim()].slice(0, q.maxItems ?? 8)); setTyped(""); }}>
                Add
              </button>
            )}
            {backButton()}
            <button type="button" className="go" disabled={listItems.length === 0} onClick={() => commit(q, listItems)}>
              That’s all
            </button>
          </div>
        );

      case "free_text":
      default: {
        const problem = typed.trim() ? problemWith(q, typed.trim()) : null;
        return (
          <div className="chips">
            <textarea
              className="input"
              rows={1}
              maxLength={q.maxLength ?? 300}
              placeholder={q.placeholder ?? ""}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && typed.trim() && !problem) {
                  e.preventDefault();
                  commit(q, typed.trim());
                }
              }}
            />
            {problem && <p className="ts-refuse" role="alert">{problem}</p>}
            {backButton()}
            <button type="button" className="go" disabled={!typed.trim() || Boolean(problem)} onClick={() => commit(q, typed.trim())}>
              Continue
            </button>
            {!q.required && (
              <button type="button" className="alt-link" onClick={() => skip(q)}>
                Leave blank for now
              </button>
            )}
          </div>
        );
      }
    }
  }

  /* ── the two parties ────────────────────────────────────────────────── */

  function partyBox(p: Party, set: (patch: Partial<Party>) => void, label: string, mine: boolean, optional = false) {
    const isCo = p.kind === "company";
    return (
      <div className="ts-party">
        <div className="ts-party-h">
          <b>
            {label}
            {mine && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(243,191,75,.22)", color: "#8a5b00", verticalAlign: 1 }}>
                You
              </span>
            )}
          </b>
          <span className="chips" style={{ display: "inline-flex", marginLeft: 8, gap: 6 }}>
            {(["individual", "company"] as const).map((k) => (
              <button key={k} type="button" className={`chip${p.kind === k ? " on" : ""}`} onClick={() => set({ kind: k })}>
                {k === "company" ? "A company" : "An individual"}
              </button>
            ))}
          </span>
          {optional && <span className="sub" style={{ marginLeft: 8 }}>Optional for a template</span>}
        </div>
        <div className="ts-row">
          <label>
            {isCo ? "Full legal name" : "Full name"}
            <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder={isCo ? "e.g. Northwind Labs Pte. Ltd." : "e.g. Ann Wong"} />
          </label>
          <label>
            {isCo ? "Registration no." : "Identity card / passport no."}
            <input className="input" value={p.id_no ?? ""} onChange={(e) => set({ id_no: e.target.value })} placeholder={isCo ? "e.g. 202412345K" : ""} />
          </label>
          {isCo && (
            <label>
              Incorporated in
              <input className="input" value={p.jurisdiction ?? ""} onChange={(e) => set({ jurisdiction: e.target.value })} placeholder={lawName || "Singapore"} />
            </label>
          )}
        </div>
        <div className="ts-row">
          <label>
            {isCo ? "Registered address" : "Address"}
            <input className="input" value={p.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
          </label>
          <label>
            Email for notices
            <input className="input" type="email" value={p.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </label>
        </div>
        {isCo && (
          <div className="ts-row">
            <label>
              Who signs
              <input className="input" value={p.signatory_name ?? ""} onChange={(e) => set({ signatory_name: e.target.value })} placeholder="e.g. Kim Lee" />
            </label>
            <label>
              Their title
              <input className="input" value={p.signatory_title ?? ""} onChange={(e) => set({ signatory_title: e.target.value })} placeholder="e.g. Director" />
            </label>
          </div>
        )}
      </div>
    );
  }

  function partiesUI() {
    const mine = iAmCreator ? creator : recipient;
    const ok = template ? Boolean(mine.name.trim()) : Boolean(creator.name.trim() && recipient.name.trim());
    return (
      <div className="ts-parties">
        {partyBox(creator, (patch) => setCreator((x) => ({ ...x, ...patch })), "The Creator", iAmCreator)}
        {partyBox(recipient, (patch) => setRecipient((x) => ({ ...x, ...patch })), "The Recipient", !iAmCreator, template)}
        <div className="chips">
          {backButton()}
          <button type="button" className="go" disabled={!ok} onClick={settleParties} title={ok ? undefined : template ? "Your name is needed" : "Both names are needed"}>
            Continue
          </button>
        </div>
        <p className="later">{template ? "Only your name is needed now: the recipient's details are marked [●] to fill in for each client." : "Only the two names are needed now. Anything left blank is marked [●] in the agreement."}</p>
      </div>
    );
  }


  /* ── rendering ──────────────────────────────────────────────────────── */

  const summary = steps
    .filter((s): s is { kind: "q"; q: Question } => s.kind === "q")
    .map((s) => ({ id: s.q.id, label: shortLabel(s), value: answerLabel(s.q, answers) }))
    .filter((x) => x.value);

  const yellow = flags.filter((f) => f.level === "yellow" || f.level === "red");
  const infos = flags.filter((f) => f.level === "green" && f.user_message);
  const isDraft = stage === "drafted";
  /* Preparing: the NDA's drafting screen, with its progress bar. */
  const drafting = busy && !isDraft;
  const draftingAnswers = summary.map((x) => ({ label: x.label, value: x.value }));
  /* As on the NDA: one numbered list of what to fill in or check. */
  const reminders = buildReminders({ missing, flags: yellow, steps, label: (s) => shortLabel(s), question: (s) => (s.kind === "q" ? s.q.text : undefined), id: (s) => stepKey(s), isQuestion: (s) => s.kind === "q", open: revisit });

  const stepAnswer = (s: Step): string => {
    const k = stepKey(s);
    if (settled[k] === "skp") return "Skipped";
    if (settled[k] !== "done") return "";
    if (s.kind === "parties") return partiesLine;
    return answerLabel(s.q, answers);
  };

  return (
    <div className="fdai-screens">
      <div id="scr-chat" className={`scr on fade-in ts-screen emp-screen${isDraft || drafting ? " is-draft" : ""}${isDraft && docOpen && html ? " doc-open" : ""}`}>
        {/* ── the rail ── */}
        <aside className="rail" aria-label="FD AI">
          <Link className="sb-new" href="/draft">+ New draft</Link>
          <p className="k">FD AI</p>
          <nav className="nav2">
            <Link href="/draft"><i />New draft</Link>
            <a href="/history"><i />Past drafts</a>
            <a href="/billing"><i />Credits</a>
            <a href="/usage"><i />Usage</a>
          </nav>
          {credits !== null && (
            <div className="rail-credits">
              <span>
                <b>{credits}</b> {credits === 1 ? "credit" : "credits"} left
              </span>
              {wallet?.inTrial ? <small>Free week · trial credits expire</small> : <a href="/billing">{credits === 0 ? "Add credits" : "Add more"}</a>}
            </div>
          )}
          <RailHistory
            drafts={pastDrafts}
            currentId={draftId}
            onRename={(id, t) => {
              const tidy = t.replace(/\s+/g, " ").trim().slice(0, 80);
              if (tidy) void patchPastDraft(id, { title: tidy });
            }}
            onTogglePin={(id, next) => void patchPastDraft(id, { pinned: next })}
          />
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
                  <a className="guest-signup" href="/signup?from=draft">Sign up for free</a>
                  <a className="guest-login" href="/login?from=draft">Log in</a>
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
          <span className="dname">{isDraft ? title : "New IP assignment agreement"}</span>
          <ShareButton
            getInput={() => ({
              docLabel: "IP Assignment Agreement",
              title: isDraft ? title : "New IP assignment agreement",
              turns: [...msgs, ...fd.follow],
              answers: draftingAnswers,
              points: reminders.map((r) => ({ title: r.what, detail: r.rows.map((x) => `${x.k}: ${x.v}`).join("\n") })),
            })}
          />
          <Link className="chg" href="/draft">Change document</Link>
        </div>

        {/* ── the conversation ── */}
        {!isDraft && !drafting && (
          <div className="convo">
            <div className="chat" ref={threadRef}>
              <div className="chat-in">
                <div className="m">
                  <div className="av">FD</div>
                  <div>
                    <div className="txt ts-intro">
                      <Markdown text={IPAA_INTRO.short} />
                      {learnMore && (
                        <>
                          <p><b>What you get</b></p>
                          <ul className="ts-list">{IPAA_INTRO.learn_more.what_you_get.map((x) => <li key={x}>{x}</li>)}</ul>
                          <p><b>Good to know</b></p>
                          <ul className="ts-list">{IPAA_INTRO.learn_more.good_to_know.map((x) => <li key={x}>{x}</li>)}</ul>
                        </>
                      )}
                      <p className="ts-disclaimer">{IPAA_INTRO.disclaimer}</p>
                    </div>
                    <div className="ans">
                      <div className="chips">
                        {stage === "intro" && (
                          <button type="button" className="go" onClick={() => setStage("questions")}>Start</button>
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
                      <div><div className="txt">{m.text}</div></div>
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

                {fd.asking && <TypingTurn convo />}

                {stage === "questions" && step && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">
                        {step.kind === "q" ? step.q.text : PARTIES_Q}
                        {step.kind === "q" && step.q.help && <p className="sub">{step.q.help}</p>}
                        {step.kind === "parties" && profile && <p className="sub">Your side is filled in from your company profile — change anything that is not right.</p>}
                      </div>
                      <div className="ans">{step.kind === "q" ? questionUI(step.q) : partiesUI()}</div>
                    </div>
                  </div>
                )}

                {stage === "questions" && finished && !opened && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">That’s everything. Ready when you are — you can still change any answer afterwards.</div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" disabled={busy} onClick={() => void prepare()}>{guest ? "Sign up and generate" : "Generate draft"}</button>
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
                          <div><dt>The parties</dt><dd>{partiesLine || "—"}</dd></div>
                          {summary.map((x) => (
                            <div key={x.id}><dt>{x.label}</dt><dd>{x.value}</dd></div>
                          ))}
                        </dl>
                      </div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" disabled={busy} onClick={() => void prepare()}>
                            {busy ? "Drafting…" : guest ? "Sign up and generate" : "Generate draft"}
                          </button>
                          <button type="button" className="chip" disabled={busy} onClick={changeAnswers}>Change an answer</button>
                        </div>
                        <p className="later">One credit. If a point needs a lawyer before the agreement can be issued, FD AI saves your answers instead and nothing is charged.</p>
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
                        <p style={{ margin: "8px 0 0" }}>Your answers are still here. Add credits and the agreement is prepared straight away.</p>
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
                    <div><div className="txt">{error}</div></div>
                  </div>
                )}
              </div>
            </div>
            <AskComposer disabled={fd.asking} onSend={(t) => void askQuestion(t)} onAttach={(f) => void attachFile(f)}>
              <p className="fine">
                A draft IP assignment agreement, from Founders Doc’s wording — to be checked by a qualified lawyer before use.{" "}
                <a href="/terms-of-service">Terms</a>
              </p>
            </AskComposer>
          </div>
        )}

        {/* ── the draft view ── */}
        {drafting && (
          <div className="dview">
            <DraftingLeft docLabel="IP Assignment Agreement" answers={draftingAnswers} skippedCount={skippedCount} conversation={msgs} progress={progress} />
          </div>
        )}

        {isDraft && (
          <div className="dview">
            <section className="gen-left">
              <div className="gen-left-head">
                <div className="gen-left-title">
                  <span className="eyebrow">FD AI</span>
                  <h2>{status === "stopped" ? "Saved — Founders Doc will be in touch" : "Your draft is ready"}</h2>
                  <p>
                    {status === "stopped"
                      ? "Your answers are with Founders Doc. Nothing has been charged."
                      : "Review the document beside the chat, check the points for your lawyer, or ask FD AI to explain any part of it."}
                  </p>
                </div>
                <span className="gen-ready">
                  <i />
                  {status === "stopped" ? "Saved" : "Ready"}
                </span>
              </div>

              <div className="gen-thread" ref={threadRef}>
                <div className="cg-user cg-summary-wrap">
                  <div className="cg-bubble cg-summary">
                    <div className="cg-summary-head">
                      <b>Your answers</b>
                      <span>SA</span>
                    </div>
                    <dl className="cg-answers">
                      <div><dt>The parties</dt><dd>{partiesLine || "—"}</dd></div>
                      {summary.map((x) => (
                        <div key={x.id}><dt>{x.label}</dt><dd>{x.value}</dd></div>
                      ))}
                    </dl>
                  </div>
                </div>

                <div className="cg-turn">
                  <div className="cg-avatar" aria-hidden="true">FD</div>
                  <div className="cg-msg">
                    {status === "stopped" ? (
                      <>
                        <p>{stopMessage ?? "Your answers are saved, but FD AI has not issued the agreement: one of the points below needs a lawyer before it is signed. Founders Doc has been told and will be in touch. No credit has been used."}</p>
                        {yellow.length > 0 && (
                          <>
                            <p>Points I’ve noted for whoever prepares it:</p>
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
                        <p>
                          Questions in the meantime? <a href="/contact">Get in touch</a>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          Here’s the <b>{levelOf(answers) === "basic" ? "basic " : levelOf(answers) === "complex" ? "complex " : ""}IP assignment agreement</b>, from {creator.name.trim() || "the Creator"} to {recipient.name.trim() || "the Recipient"}, leaning to the {iAmCreator ? "Creator" : "Recipient"}, under the laws of {lawName || "the chosen jurisdiction"}. Nothing in it is invented:
                          anything you left blank is marked [●] for you to fill in.
                        </p>
                        {reviewNote && (
                          <p className="ts-note">
                            <b>A note from Founders Doc:</b> {reviewNote}
                          </p>
                        )}
                        {html && (
                          <button type="button" className="gen-doc-card cg-file" onClick={() => setDocOpen(true)} aria-pressed={docOpen}>
                            <span className="cg-file-ic"><DocIcon /></span>
                            <span>
                              <b>{title}</b>
                              <small>Version {version} · click to display</small>
                            </span>
                          </button>
                        )}
                        {infos.length > 0 && <ul className="cg-checks">{infos.map((f, k) => <li key={k}>{f.user_message}</li>)}</ul>}
                        <ReminderList items={reminders} />
                      </>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="cg-turn" role="alert">
                    <div className="cg-avatar" aria-hidden="true">FD</div>
                    <div className="cg-msg"><p>{error}</p></div>
                  </div>
                )}
                <FollowStream follow={fd.follow} asking={fd.asking} />
              </div>

              <GenCompose disabled={fd.asking} onSend={(t) => void fd.askFollow(t)} onAttach={(f) => void fd.attachFollow(f)} />
            </section>

            {docOpen && html && (
              <section className="gen-right">
                <div className="dbar">
                  <span className="dstat">
                    <i />
                    {[`Version ${version}`, yellow.length ? `${yellow.length} for your lawyer` : ""].filter(Boolean).join(" · ")}
                  </span>
                  <div className="dacts">
                    <button type="button" className="dbtn" onClick={changeAnswers}>
                      Edit answers
                    </button>
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
                      onClick={() => (yellow.length > 0 && !checkRead ? setCheckOpen(true) : void exportDocx())}
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
                {yellow.length > 0 && (
                  <div className="ts-sign-check" role="note">
                    <p className="ts-sign-check-h">
                      <i aria-hidden="true" />
                      Before you sign: {yellow.length === 1 ? "one point" : `${yellow.length} points`} for your lawyer
                      <button type="button" className="link-btn" onClick={() => setCheckOpen(true)}>Read them</button>
                    </p>
                    <p className="ts-sign-check-sub">
                      They are not in the agreement. They go on the first page of the Word file so they travel with it.
                    </p>
                  </div>
                )}
                {checkOpen && (
                  <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && setCheckOpen(false)}>
                    <div className="fb-modal ts-check-modal" role="dialog" aria-modal="true" aria-labelledby="cf-check-title">
                      <h3 id="cf-check-title">Before you sign</h3>
                      <p className="fb-sub">
                        {yellow.length === 1 ? "One point" : `${yellow.length} points`} for whoever checks this agreement. They are worth a lawyer’s time before the parties sign.
                      </p>
                      <ul className="ts-flags">
                        {yellow.map((f, k) => (
                          <li key={k} className={f.level === "red" ? "red" : ""}>
                            <b>{f.title ?? "Worth checking"}</b>
                            <span>{f.reason}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="fb-actions">
                        <button type="button" className="dbtn" onClick={() => setCheckOpen(false)}>Close</button>
                        <button
                          type="button"
                          className="dbtn gold"
                          disabled={exporting}
                          onClick={() => {
                            setCheckRead(true);
                            setCheckOpen(false);
                            void exportDocx();
                          }}
                        >
                          I’ve read them — download Word
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {fbOpen && (
                  <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && setFbOpen(false)}>
                    <div className="fb-modal" role="dialog" aria-modal="true" aria-labelledby="cf-fb-title">
                      <h3 id="cf-fb-title">What should change?</h3>
                      <p className="fb-sub">
                        The drafter reads it against this agreement and turns it into a rule for the AI’s part in every later one. The IP assignment agreement wording is not the AI’s to change — for that, Founders Doc updates the template.
                      </p>
                      {fbExcerpt && (
                        <blockquote className="fb-quote">
                          {fbExcerpt}
                          <button type="button" className="link-btn" onClick={() => setFbExcerpt("")}>remove quote</button>
                        </blockquote>
                      )}
                      <textarea rows={5} value={fbText} placeholder="What is wrong, and what it should be instead" onChange={(e) => setFbText(e.target.value)} disabled={fbSending} autoFocus />
                      {fbDone && <p className="fb-done">{fbDone}</p>}
                      <div className="fb-actions">
                        <button type="button" className="dbtn" onClick={() => setFbOpen(false)}>Close</button>
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
            Progress
            <span className="pct">{isDraft ? 100 : pct}%</span>
          </div>
          <div className="studio-body">
            {isDraft && yellow.length > 0 && (
              <p className="ts-pane-flags">
                <i aria-hidden="true" />
                {yellow.length === 1 ? "1 point" : `${yellow.length} points`} for your lawyer — listed in the conversation
              </p>
            )}
            {isDraft && status === "stopped" ? (
              <p className="sub">Saved — Founders Doc will be in touch.</p>
            ) : (
              <>
                <div className="prog-h">
                  <b className="cnt">
                    {answered} of {steps.length} answered
                    {skippedCount ? ` · ${skippedCount} skipped` : ""}
                  </b>
                  <span className="eta">{isDraft ? "Click one to change it" : finished ? "Ready to generate" : `About ${Math.max(1, Math.ceil(pending.length * 0.4))} min`}</span>
                </div>
                <div className="segs" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
                  {steps.map((s) => {
                    const st = settled[stepKey(s)];
                    return <i key={stepKey(s)} className={st ?? (s === step ? "now" : "")} />;
                  })}
                </div>
                <div className="notes ts-notes">
                  {groupSteps(steps).map((g, gi) => (
                    <div className="ts-group" key={`${g.name}-${gi}`}>
                      <p className="ts-group-h">{g.name}</p>
                      {g.items.map((s) => {
                        const k = stepKey(s);
                        const isOpen = s === step;
                        const st = isOpen ? "now" : (settled[k] ?? "");
                        const n = steps.indexOf(s) + 1;
                        const answer = stepAnswer(s);
                        const value = isOpen ? (answer ? `Open now — ${answer}` : "") : answer || (settled[k] === "done" ? "Left blank" : "Not yet — click to open");
                        return (
                          <div
                            key={k}
                            className={`inst ts-inst ${st || "later"}`}
                            role={isOpen ? undefined : "button"}
                            tabIndex={isOpen ? undefined : 0}
                            title={isOpen ? undefined : `${answer ? `${answer} — ` : ""}click to see or change`}
                            style={isOpen ? undefined : { cursor: "pointer" }}
                            onClick={() => !isOpen && revisit(s)}
                            onKeyDown={(e) => e.key === "Enter" && !isOpen && revisit(s)}
                          >
                            <i>{st === "done" ? "✓" : n}</i>
                            <div>
                              <b>{shortLabel(s)}</b>
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
                onClick={() => void prepare()}
              >
                {busy ? "Drafting…" : guest ? "Sign up and generate" : "Generate draft"}
              </button>
              <button type="button" className="btn btn-quiet s-skipall" disabled={busy || finished || stage === "intro"} onClick={skipRest}>
                Skip the rest
              </button>
              <small>Skipped questions take the usual answer — nothing is invented.</small>
            </div>
          )}
          {isDraft && (
            <div className="studio-foot">
              <button type="button" className="btn s-gen" disabled={busy} onClick={changeAnswers}>Edit answers</button>
              <small>{status === "stopped" ? "No credit was used." : "Preparing again with new answers uses one credit. Editing the agreement itself is free."}</small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

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
