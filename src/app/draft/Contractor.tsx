"use client";

/**
 * The contractor agreement screen — the employment screen (Employment.tsx),
 * for the contractor questionnaire (lib/contractor/data/questionnaire.ts).
 *
 * The flow is the same: Where, then the parties and the engagement, then the
 * fifteen questions, the review, and the draft. While the FD Master
 * Contractor Agreement is not loaded (lib/contractor/data/master.ts), the
 * last step saves the answers and tells the person a lawyer will send the
 * draft; nothing is charged. The variable names employer / employee / job
 * are kept from the employment screen and mean Company / Contractor /
 * engagement here.
 */

import Link from "next/link";
import { BetaBadge } from "./beta";
import { useEffect, useMemo, useRef, useState } from "react";
import DocumentEditor from "./DocumentEditor";
import JurisdictionPicker from "./JurisdictionPicker";
import RailHistory from "./RailHistory";
import type { RecentDraft } from "./history";
import type { CompanyPrefill } from "./TermSheet";
import { track } from "@/lib/track";
import { DEFAULT_LOOK, type DocumentLook } from "@/lib/playbook";
import { DEFAULT_JURISDICTIONS } from "@/lib/jurisdictions";
import { applyDefaults, problemWith, questionsFor, workJurisdiction, type Option, type Question } from "@/lib/contractor/questions";
import { CONTRACTOR_INTRO } from "@/lib/contractor/data/intro";
import type { Answers, Company as Employer, Contractor as Employee, DraftStatus, Engagement as Job, Flag } from "@/lib/contractor/types";

/** Kept from the employment screen for shape; the contractor master has no AI-written lines yet. */
type AiFields = { dismissal_grounds?: string[] };

/* ── what the page hands in ───────────────────────────────────────────── */

export interface ContractorResume {
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

export interface ContractorProps {
  look?: DocumentLook;
  userEmail: string | null;
  guest: boolean;
  wallet: { credits: number; inTrial: boolean; trialEndsAt: string | null } | null;
  isAdmin: boolean;
  company: CompanyPrefill | null;
  resume?: ContractorResume;
  recent?: RecentDraft[];
}

type Stage = "intro" | "questions" | "review" | "drafted";

/** A step is a question, the people, or the job. */
type Step = { kind: "q"; q: Question } | { kind: "people" } | { kind: "job" };

const PEOPLE_AFTER = "C1b";
export const CONTRACTOR_HANDOFF_KEY = "fdai.contractor-handoff";
const STASH_KEY = "fdai.contractor-in-progress";

const PEOPLE_Q = "Who are the Company and the Contractor? Names as they will appear in the agreement.";
const JOB_Q = "Tell me about the engagement: the services, the fee and when it starts.";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Msg = { who: "fd" | "me"; text: string; label?: string; skipped?: boolean };
type Settled = Record<string, "done" | "skp">;

const stepKey = (s: Step) => (s.kind === "q" ? s.q.id : s.kind);

function stepsFor(a: Answers): Step[] {
  const out: Step[] = [];
  for (const q of questionsFor(a)) {
    out.push({ kind: "q", q });
    if (q.id === PEOPLE_AFTER) out.push({ kind: "people" }, { kind: "job" });
  }
  return out;
}

const SHORT: Record<string, string> = {
  C1a: "Company based in",
  C1b: "Contractor based in",
  C2: "Individual or company",
  C3: "Obligations",
  C4: "Exclusivity",
  C5: "No conflicts",
  C6: "Expenses",
  C7: "Who owns the work",
  C8a: "How long",
  C8b: "Fixed period ends",
  C9a: "Ending it",
  C9b: "Notice days",
  C10: "Grounds to end it",
  C11: "If they breach",
  C12: "After it ends",
  C13a: "Restrictions after",
  C13b: "How long after",
  C13c: "Where they apply",
  C14: "Probation",
  C15: "Confidentiality",
  C16: "Personal data",
};

function shortLabel(s: Step): string {
  if (s.kind === "people") return "Company and Contractor";
  if (s.kind === "job") return "The engagement";
  return SHORT[s.q.id] ?? s.q.section;
}

function groupOf(s: Step): string {
  if (s.kind !== "q") return "The parties and the engagement";
  return s.q.section;
}

/** What "Skip the rest" cannot answer for anyone. */
const MUST_ASK = new Set(["C1a", "C1b", "people", "job", "C8b"]);

function allSettled(a: Answers): Settled {
  const out: Settled = {};
  for (const s of stepsFor(a)) out[stepKey(s)] = "done";
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function niceDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** The label shown for an answer, for the conversation and the summary. */
function answerLabel(q: Question, a: Answers): string {
  const v = a[q.id];
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return "";
  const label = (x: string) => (x === "same" ? "Same as the Company" : q.options.find((o) => o.value === x)?.label ?? x);
  if (Array.isArray(v)) return v.map((x) => label(String(x))).join(q.type === "free_text_list" ? " · " : ", ");
  if (q.type === "date") return niceDate(String(v));
  return label(String(v));
}

const emptyEmployer = (): Employer => ({ name: "" });
const emptyEmployee = (): Employee => ({ name: "" });
const emptyJob = (): Job => ({ services: "", fee_basis: "month" });

/* ── the component ────────────────────────────────────────────────────── */

export default function Contractor({ look = DEFAULT_LOOK, userEmail, guest, wallet, isAdmin, company, resume, recent }: ContractorProps) {
  const [stage, setStage] = useState<Stage>(resume ? "drafted" : "intro");
  const [learnMore, setLearnMore] = useState(false);
  const [answers, setAnswers] = useState<Answers>(() => (resume ? fromSaved(resume.answers) : {}));
  /* The employer's side comes from the company profile where there is one. */
  const [employer, setEmployer] = useState<Employer>(
    () =>
      (resume?.answers._company as Employer | undefined) ??
      (company ? { name: company.name, reg_no: company.uen || undefined, address: company.address || undefined } : emptyEmployer()),
  );
  const [employee, setEmployee] = useState<Employee>(() => (resume?.answers._contractor as Employee | undefined) ?? emptyEmployee());
  const [job, setJob] = useState<Job>(() => (resume?.answers._engagement as Job | undefined) ?? emptyJob());
  const [settled, setSettled] = useState<Settled>(() => (resume ? allSettled(fromSaved(resume.answers)) : {}));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [listItems, setListItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywalled, setPaywalled] = useState(false);
  const [credits, setCredits] = useState(wallet?.credits ?? null);

  /* the draft */
  const [draftId, setDraftId] = useState<string | null>(resume?.id ?? null);
  const [title, setTitle] = useState(resume?.title ?? "Contractor Agreement");
  const [pastDrafts, setPastDrafts] = useState<RecentDraft[]>(recent ?? []);
  const [html, setHtml] = useState<string | null>(resume?.outputHtml ?? null);
  const [text, setText] = useState(resume?.output ?? "");
  const [status, setStatus] = useState<DraftStatus>(resume?.status ?? "draft");
  const [flags, setFlags] = useState<Flag[]>(resume?.flags ?? []);
  const [reviewNote] = useState<string | null>(resume?.reviewNote ?? null);
  /* Why nothing was drafted, in FD AI's words (the master is pending). */
  const [stopMessage, setStopMessage] = useState<string | null>(null);
  const [ai, setAi] = useState<AiFields | null>(() => (resume ? ((resume.answers._ai as AiFields | null) ?? null) : null));
  const [aiEdit, setAiEdit] = useState<string[] | null>(null);
  const [savingAi, setSavingAi] = useState(false);
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

  /* Restore a hand-off (a visitor who signed up mid-flow) or a stash, after
     mount: the server never saw the storage. */
  useEffect(() => {
    if (resume) return;
    const t = setTimeout(() => {
      try {
        const handoff = localStorage.getItem(CONTRACTOR_HANDOFF_KEY);
        const raw = handoff ?? sessionStorage.getItem(STASH_KEY);
        if (!raw) return;
        const s = JSON.parse(raw) as { answers: Answers; employer: Employer; employee: Employee; job: Job; settled?: Settled; msgs?: Msg[]; stage: Stage };
        if (!s || !s.answers || Object.keys(s.answers).length === 0) return;
        setAnswers(s.answers);
        setEmployer(s.employer ?? emptyEmployer());
        setEmployee(s.employee ?? emptyEmployee());
        setJob(s.job ?? emptyJob());
        setSettled(s.settled ?? {});
        setMsgs(Array.isArray(s.msgs) ? s.msgs : []);
        if (handoff && !guest) {
          localStorage.removeItem(CONTRACTOR_HANDOFF_KEY);
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
      sessionStorage.setItem(STASH_KEY, JSON.stringify({ answers, employer, employee, job, settled, msgs, stage }));
    } catch {
      /* private mode */
    }
  }, [answers, employer, employee, job, settled, msgs, stage, resume]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, stage, error]);

  /* ── answering ──────────────────────────────────────────────────────── */

  const resetInput = () => {
    setTyped("");
    setPicked("");
    setMulti([]);
    setListItems([]);
  };

  const say = (...m: Msg[]) => setMsgs((prev) => [...prev, ...m]);

  const settle = (q: Question, value: unknown, skipped: boolean) => {
    setError(null);
    const next: Answers = { ...answers, [q.id]: value };
    if (Object.keys(settled).length === 0) track("draft_started", { doc_type: "contractor", total_steps: steps.length });
    setAnswers(next);
    setSettled((st) => ({ ...st, [q.id]: skipped ? "skp" : "done" }));
    say({ who: "fd", text: q.text }, { who: "me", label: shortLabel({ kind: "q", q }), text: skipped ? "Skipped for now" : answerLabel(q, next) || "None", skipped });
    setOpenKey(null);
    resetInput();
  };

  const commit = (q: Question, value: unknown) => settle(q, value, false);
  const skip = (q: Question) => settle(q, q.defaultValue ?? "", true);

  const settleStep = (k: "people" | "job") => {
    setSettled((st) => ({ ...st, [k]: "done" }));
    setOpenKey(null);
    say(
      { who: "fd", text: k === "people" ? PEOPLE_Q : JOB_Q },
      {
        who: "me",
        label: k === "people" ? "Company and Contractor" : "The engagement",
        text: k === "people" ? [employer.name, employee.name].filter(Boolean).join(" → ") : [job.services.split(/[\n.]/)[0].slice(0, 60), job.fee ? `${job.fee} a ${job.fee_basis ?? "month"}` : ""].filter(Boolean).join(" · "),
      },
    );
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
      if ((s.q.type === "free_text" || s.q.type === "date") && typeof v === "string") setTyped(v);
      if (s.q.type === "jurisdiction" && typeof v === "string" && v !== "same") setPicked(v);
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

  /** The usual answer for everything still open, except what only the person can say. */
  function skipRest() {
    const a: Answers = { ...answers };
    const st: Settled = { ...settled };
    for (let pass = 0; pass < 4; pass++) {
      for (const s of stepsFor(a)) {
        const k = stepKey(s);
        if (st[k] || MUST_ASK.has(k) || s.kind !== "q") continue;
        const v = a[k];
        if (v === undefined || v === null || v === "") a[k] = s.q.defaultValue ?? "";
        st[k] = "skp";
      }
    }
    const left = stepsFor(a).filter((s) => !st[stepKey(s)]);
    track("draft_with_what_i_have", { doc_type: "contractor", count: Object.keys(st).length - Object.keys(settled).length, total_steps: steps.length });
    setAnswers(a);
    setSettled(st);
    setOpenKey(null);
    resetInput();
    say(
      { who: "me", label: "Skip the rest", text: "Use the usual answers", skipped: true },
      {
        who: "fd",
        text: left.length
          ? `I’ve used the usual answer for the rest. Before I can prepare it, I still need: ${left.map((s) => shortLabel(s).toLowerCase()).join(", ")}.`
          : "I’ve used the usual answer for everything you skipped — you can change any of them from the list on the right.",
      },
    );
    if (left.length === 0) setStage("review");
  }

  /* ── preparing the contract ─────────────────────────────────────────── */

  async function prepare() {
    if (guest) {
      try {
        localStorage.setItem(CONTRACTOR_HANDOFF_KEY, JSON.stringify({ answers, employer, employee, job, settled, msgs, stage: "review" }));
      } catch {
        /* the sign-up still works; the answers just do not follow */
      }
      track("signup_gate", { doc_type: "contractor", reason: "generate" });
      window.location.href = "/signup?from=draft";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contractor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: applyDefaults(answers), company: employer, contractor: employee, engagement: job }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 402) {
        setPaywalled(true);
        track("paywall_hit", { doc_type: "contractor" });
        return;
      }
      if (!res.ok || !j) {
        setError((j?.error as string) ?? "Something went wrong. Please try again.");
        track("draft_failed", { doc_type: "contractor" });
        return;
      }
      if (j.kind === "stopped") {
        setStatus("stopped");
        setDraftId((j.draftId as string | null) ?? null);
        setFlags(((j.flags as Flag[]) ?? []).filter((f) => f.scenario !== "CT11"));
        setStopMessage((j.message as string) ?? null);
        setHtml(null);
        setText("");
        setStage("drafted");
        try {
          sessionStorage.removeItem(STASH_KEY);
        } catch {
          /* fine */
        }
        track("draft_generated", { doc_type: "contractor", words: 0, reason: "master_pending" });
        return;
      }
      setDraftId((j.draftId as string | null) ?? null);
      setTitle((j.title as string) ?? "Contractor Agreement");
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
      track("draft_generated", { doc_type: "contractor", words: Number(j.words ?? 0) });
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
      const grounds = aiEdit.map((g) => g.trim()).filter(Boolean);
      const res = await fetch(`/api/contractor/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ai: { dismissal_grounds: grounds } }),
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
      setAi((j.ai as AiFields) ?? { dismissal_grounds: grounds });
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
    await fetch(`/api/drafts/${draftId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outputHtml: editedHtml, output: plain }) });
  }

  /** The points for the lawyer as a cover sheet, ahead of the contract, so
   *  they travel with the file whoever opens it. */
  function coverSheet(): { html: string; text: string } {
    const points = flags.filter((f) => f.level === "yellow" || f.level === "red");
    if (points.length === 0) return { html: "", text: "" };
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const intro = `FD AI marked ${points.length === 1 ? "one point" : `${points.length} points`} for whoever checks this contract before it is signed. This page is not part of the Agreement: remove it before the contract goes to the employee.`;
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
          fileName: `${title.replace(/[^a-zA-Z0-9 &-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48) || "Contractor-Agreement"}-V${version}.docx`,
          includeNotes: false,
          docTypeSlug: "contractor",
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
      a.download = match?.[1] ?? "contractor-agreement.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track("draft_exported", { doc_type: "contractor", format: "docx" });
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
      track("draft_feedback", { doc_type: "contractor" });
      setFbText("");
      setFbExcerpt("");
      setFbDone(
        j.learnt && j.rule
          ? `Learnt. From the next contractor agreement: “${j.rule}” — edit or switch off under Admin → AI files → Feedback & lessons.`
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
      case "jurisdiction":
        return (
          <>
            <div className="chips emp-jur">
              {q.allowSame && (
                <button type="button" className={`chip rec${answers[q.id] === "same" && !picked ? " on" : ""}`} onClick={() => commit(q, "same")}>
                  Same as the Company{str(answers.C1a) ? ` (${str(answers.C1a)})` : ""}
                </button>
              )}
              <JurisdictionPicker options={DEFAULT_JURISDICTIONS} value={picked} onChange={setPicked} label={q.text} />
              {backButton()}
              <button type="button" className="go" disabled={!picked.trim()} onClick={() => commit(q, picked.trim())}>
                Continue
              </button>
            </div>
            {skipLink(q)}
          </>
        );

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

      case "date":
        return (
          <>
            <div className="chips">
              <input className="input" type="date" aria-label={q.text} value={typed} onChange={(e) => setTyped(e.target.value)} />
              {backButton()}
              <button type="button" className="go" disabled={!typed} onClick={() => commit(q, typed)}>
                Continue
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

  /* ── the people and the job ─────────────────────────────────────────── */

  function peopleUI() {
    const setEr = (patch: Partial<Employer>) => setEmployer((e) => ({ ...e, ...patch }));
    const setEe = (patch: Partial<Employee>) => setEmployee((e) => ({ ...e, ...patch }));
    const ok = Boolean(employer.name.trim() && employee.name.trim());
    return (
      <div className="ts-parties">
        <div className="ts-party">
          <div className="ts-party-h"><b>The Company</b></div>
          <label>
            Full legal name (never a trading name)
            <input className="input" value={employer.name} onChange={(e) => setEr({ name: e.target.value })} placeholder="e.g. Meridian Logistics Pte. Ltd." />
          </label>
          <div className="ts-row">
            <label>
              Registration number
              <input className="input" value={employer.reg_no ?? ""} onChange={(e) => setEr({ reg_no: e.target.value })} placeholder="e.g. 202012345K" />
            </label>
            <label>
              Registered address
              <input className="input" value={employer.address ?? ""} onChange={(e) => setEr({ address: e.target.value })} />
            </label>
          </div>
          <div className="ts-row">
            <label>
              Who signs for the Company
              <input className="input" value={employer.signatory_name ?? ""} onChange={(e) => setEr({ signatory_name: e.target.value })} placeholder="e.g. Jane Tan" />
            </label>
            <label>
              Their title
              <input className="input" value={employer.signatory_designation ?? ""} onChange={(e) => setEr({ signatory_designation: e.target.value })} placeholder="e.g. Director" />
            </label>
            <label>
              Their email
              <input className="input" type="email" value={employer.signatory_email ?? ""} onChange={(e) => setEr({ signatory_email: e.target.value })} />
            </label>
          </div>
        </div>
        <div className="ts-party">
          <div className="ts-party-h"><b>The Contractor{str(answers.C2) === "company" ? " — a company" : ""}</b></div>
          <label>
            {str(answers.C2) === "company" ? "Full legal name of the contractor company" : "Full name"}
            <input className="input" value={employee.name} onChange={(e) => setEe({ name: e.target.value })} placeholder={str(answers.C2) === "company" ? "e.g. Northstar Design Pte. Ltd." : "e.g. Alex Lee"} />
          </label>
          <label>
            {str(answers.C2) === "company" ? "Registered address" : "Home address"}
            <input className="input" value={employee.address ?? ""} onChange={(e) => setEe({ address: e.target.value })} />
          </label>
          <div className="ts-row">
            {str(answers.C2) === "company" ? (
              <>
                <label>
                  Registration number
                  <input className="input" value={employee.reg_no ?? ""} onChange={(e) => setEe({ reg_no: e.target.value })} placeholder="e.g. 202112345A" />
                </label>
                <label>
                  Who signs for the contractor company
                  <input className="input" value={employee.signatory_name ?? ""} onChange={(e) => setEe({ signatory_name: e.target.value })} placeholder="e.g. Alex Lee, Director" />
                </label>
              </>
            ) : (
              <label>
                Passport or ID number
                <input className="input" value={employee.id_no ?? ""} onChange={(e) => setEe({ id_no: e.target.value })} />
              </label>
            )}
            <label>
              Email
              <input className="input" type="email" value={employee.email ?? ""} onChange={(e) => setEe({ email: e.target.value })} />
            </label>
          </div>
        </div>
        <div className="chips">
          {backButton()}
          <button type="button" className="go" disabled={!ok} onClick={() => settleStep("people")} title={ok ? undefined : "Both names are needed"}>
            Continue
          </button>
        </div>
        <p className="later">Only the two names are needed now. Anything else left blank is marked [●] in the contract for you to fill in.</p>
      </div>
    );
  }

  function jobUI() {
    const set = (patch: Partial<Job>) => setJob((j) => ({ ...j, ...patch }));
    const ok = Boolean(job.services.trim());
    const basis = job.fee_basis ?? "month";
    return (
      <div className="ts-parties">
        <div className="ts-party">
          <label>
            The services, in a few lines
            <textarea className="input" rows={3} value={job.services} onChange={(e) => set({ services: e.target.value })} placeholder="e.g. Design and build the Company’s mobile app (iOS and Android), including the admin dashboard, to the specification agreed in writing." />
          </label>
          <div className="ts-row">
            <label>
              Fee, with the currency
              <input className="input" value={job.fee ?? ""} onChange={(e) => set({ fee: e.target.value })} placeholder="e.g. SGD 8,000" />
            </label>
            <div>
              <span className="emp-place-h">Per</span>
              <span className="chips" style={{ marginTop: 4 }}>
                {(["month", "day", "hour", "project", "milestone"] as const).map((b) => (
                  <button key={b} type="button" className={`chip${basis === b ? " on" : ""}`} onClick={() => set({ fee_basis: b })}>{b}</button>
                ))}
              </span>
            </div>
          </div>
          <div className="ts-row">
            <label>
              Payment terms
              <input className="input" value={job.payment_terms ?? ""} onChange={(e) => set({ payment_terms: e.target.value })} placeholder="e.g. within 14 days of invoice, monthly in arrears" />
            </label>
            <label>
              Start date
              <input className="input" type="date" value={job.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value })} />
            </label>
          </div>
          <div className="ts-row">
            <label>
              Working arrangement
              <input className="input" value={job.schedule ?? ""} onChange={(e) => set({ schedule: e.target.value })} placeholder="e.g. flexible hours, about 20 hours a week — or leave blank" />
            </label>
            <label>
              Where the work is done
              <input className="input" value={job.location ?? ""} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. remote, or the Company’s office in Singapore" />
            </label>
          </div>
          <label>
            Other benefits beyond the fee
            <input className="input" value={job.benefits ?? ""} onChange={(e) => set({ benefits: e.target.value })} placeholder="e.g. none — or equity, transport, medical cover" />
          </label>
        </div>
        <div className="chips">
          {backButton()}
          <button type="button" className="go" disabled={!ok} onClick={() => settleStep("job")} title={ok ? undefined : "A line on the services is needed"}>
            Continue
          </button>
        </div>
        <p className="later">Only the services are needed now. Anything left blank is marked [●] in the agreement, never guessed.</p>
      </div>
    );
  }

  /* ── rendering ──────────────────────────────────────────────────────── */

  const summary = steps
    .filter((s): s is { kind: "q"; q: Question } => s.kind === "q")
    .map((s) => ({ id: s.q.id, label: shortLabel(s), value: answerLabel(s.q, answers) }))
    .filter((x) => x.value);
  const people = [employer.name, employee.name].filter(Boolean).join(" → ");
  const jobLine = [job.services.split(/[\n.]/)[0].slice(0, 60), job.fee ? `${job.fee} a ${job.fee_basis ?? "month"}` : "", job.start_date ? `from ${niceDate(job.start_date)}` : ""].filter(Boolean).join(" · ");

  const yellow = flags.filter((f) => f.level === "yellow" || f.level === "red");
  const infos = flags.filter((f) => f.level === "green" && f.user_message);
  const grounds = ai?.dismissal_grounds ?? [];
  const isDraft = stage === "drafted";

  const stepAnswer = (s: Step): string => {
    const k = stepKey(s);
    if (settled[k] === "skp") return "Skipped";
    if (settled[k] !== "done") return "";
    if (s.kind === "people") return people;
    if (s.kind === "job") return jobLine;
    return answerLabel(s.q, answers);
  };

  return (
    <div className="fdai-screens">
      <div id="scr-chat" className={`scr on fade-in ts-screen emp-screen${isDraft ? " is-draft" : ""}${isDraft && docOpen && html ? " doc-open" : ""}`}>
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
          <span className="dname">{isDraft ? title : "New contractor agreement"}</span>
          <BetaBadge />
          <Link className="chg" href="/draft">Change document</Link>
        </div>

        {/* ── the conversation ── */}
        {!isDraft && (
          <div className="convo">
            <div className="chat" ref={threadRef}>
              <div className="chat-in">
                <div className="m">
                  <div className="av">FD</div>
                  <div>
                    <div className="txt ts-intro">
                      <Markdown text={CONTRACTOR_INTRO.short} />
                      {learnMore && (
                        <>
                          <p><b>What you get</b></p>
                          <ul className="ts-list">{CONTRACTOR_INTRO.learn_more.what_you_get.map((x) => <li key={x}>{x}</li>)}</ul>
                          <p><b>Good to know</b></p>
                          <ul className="ts-list">{CONTRACTOR_INTRO.learn_more.good_to_know.map((x) => <li key={x}>{x}</li>)}</ul>
                        </>
                      )}
                      <p className="ts-disclaimer">{CONTRACTOR_INTRO.disclaimer}</p>
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

                {stage === "questions" && step && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">
                        {step.kind === "q" ? step.q.text : step.kind === "people" ? PEOPLE_Q : JOB_Q}
                        {step.kind === "q" && step.q.help && <p className="sub">{step.q.help}</p>}
                        {step.kind === "people" && company && <p className="sub">The Company is filled in from your company profile — change anything that is not right.</p>}
                      </div>
                      <div className="ans">{step.kind === "q" ? questionUI(step.q) : step.kind === "people" ? peopleUI() : jobUI()}</div>
                    </div>
                  </div>
                )}

                {stage === "questions" && finished && !opened && (
                  <div className="m">
                    <div className="av">FD</div>
                    <div>
                      <div className="txt">That’s everything. Have a look over the answers, then I’ll prepare the contract.</div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" onClick={() => setStage("review")}>Review answers</button>
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
                          <div><dt>Company and Contractor</dt><dd>{people}</dd></div>
                          <div><dt>The engagement</dt><dd>{jobLine}</dd></div>
                          {summary.map((x) => (
                            <div key={x.id}><dt>{x.label}</dt><dd>{x.value}</dd></div>
                          ))}
                        </dl>
                      </div>
                      <div className="ans">
                        <div className="chips">
                          <button type="button" className="go" disabled={busy} onClick={() => void prepare()}>
                            {busy ? "Preparing…" : guest ? "Sign up and prepare" : "Prepare contract"}
                          </button>
                          <button type="button" className="chip" disabled={busy} onClick={changeAnswers}>Change an answer</button>
                        </div>
                        <p className="later">Beta: the firm’s master wording for this agreement is being finalised. Your answers and the points for your lawyer are saved, and Founders Doc sends you the draft — no credit is used.</p>
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
                        <p style={{ margin: "8px 0 0" }}>Your answers are still here. Add credits and the contract is prepared straight away.</p>
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
            <div className="composer">
              <p className="fine">
                A draft contractor agreement, assembled from Founders Doc’s master — to be checked by a qualified lawyer before use.{" "}
                <a href="/terms-of-service">Terms</a>
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
                  <h2>{status === "stopped" ? "Saved — your draft is on its way" : "Your contractor agreement is ready"}</h2>
                  <p>
                    {status === "stopped"
                      ? "Your answers are with Founders Doc. Nothing has been charged."
                      : "Read the agreement beside this, check the points for your lawyer, and download it as Word."}
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
                      <span>Contractor</span>
                    </div>
                    <dl className="cg-answers">
                      <div><dt>Company and Contractor</dt><dd>{people}</dd></div>
                      <div><dt>The engagement</dt><dd>{jobLine}</dd></div>
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
                        <p>{stopMessage ?? "Your answers are saved. The Contractor Agreement is in Beta: our lawyers are finalising the master wording, so FD AI has not produced the document itself. Founders Doc has been told and will send you the draft, with the points below, at no charge."}</p>
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
                          Here’s the <b>contractor agreement</b>, assembled from the firm’s master under the law of{" "}
                          <b>{workJurisdiction(applyDefaults(answers)).split(",")[0] || "the place the Company is based"}</b>. Nothing in it is invented:
                          anything you left blank is marked [●] for you to fill in.
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
                        {infos.length > 0 && <ul className="cg-checks">{infos.map((f, k) => <li key={k}>{f.user_message}</li>)}</ul>}
                        {yellow.length > 0 && (
                          <>
                            <p>
                              I’ve marked {yellow.length === 1 ? "one point" : `${yellow.length} points`} for whoever checks it before it’s signed.
                              They’re not in the contract — worth sending this list with it:
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

                {grounds.length > 0 && status !== "stopped" && (
                  <div className="cg-turn">
                    <div className="cg-avatar" aria-hidden="true">FD</div>
                    <div className="cg-msg ts-ai">
                      <p>
                        <b>These are the only lines I wrote</b> — your reasons for instant dismissal, in the contract’s wording. Everything else is the
                        firm’s approved wording. Check they say what you meant.
                      </p>
                      {!aiEdit ? (
                        <>
                          <dl className="ts-ai-lines">
                            {grounds.map((g, k) => (
                              <div key={k}>
                                <dt>Reason {k + 1}</dt>
                                <dd>{g}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="chips">
                            <button type="button" className="chip" onClick={() => setAiEdit(grounds.slice())}>Change these lines</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {aiEdit.map((g, k) => (
                            <label key={k}>
                              Reason {k + 1}
                              <textarea
                                className="input"
                                rows={2}
                                value={g}
                                onChange={(e) => {
                                  const next = aiEdit.slice();
                                  next[k] = e.target.value;
                                  setAiEdit(next);
                                }}
                              />
                            </label>
                          ))}
                          <div className="chips">
                            <button type="button" className="go" disabled={savingAi || !draftId} onClick={() => void saveAi()}>
                              {savingAi ? "Saving…" : "Save and update the contract"}
                            </button>
                            <button type="button" className="chip" disabled={savingAi} onClick={() => setAiEdit(null)}>Cancel</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="cg-turn" role="alert">
                    <div className="cg-avatar" aria-hidden="true">FD</div>
                    <div className="cg-msg"><p>{error}</p></div>
                  </div>
                )}
              </div>

              <div className="gen-compose">
                <div className="chips">
                  <button type="button" className="chip" onClick={changeAnswers}>Change answers and prepare again</button>
                  <Link className="chip" href="/draft">New draft</Link>
                </div>
                <p className="hint">{status === "stopped" ? "Changing an answer saves a fresh set for Founders Doc. No credit is used while the Contractor Agreement is in Beta." : "Changing an answer prepares a fresh agreement (one credit). Editing the agreement itself is free — use the document beside this."}</p>
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
                      They are not in the contract. They go on the first page of the Word file so they travel with it.
                    </p>
                  </div>
                )}
                {checkOpen && (
                  <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && setCheckOpen(false)}>
                    <div className="fb-modal ts-check-modal" role="dialog" aria-modal="true" aria-labelledby="emp-check-title">
                      <h3 id="emp-check-title">Before you sign</h3>
                      <p className="fb-sub">
                        {yellow.length === 1 ? "One point" : `${yellow.length} points`} for whoever checks this contract. The statutory rules apply whatever the contract says, so these are worth a lawyer’s ten minutes.
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
                    <div className="fb-modal" role="dialog" aria-modal="true" aria-labelledby="emp-fb-title">
                      <h3 id="emp-fb-title">What should change?</h3>
                      <p className="fb-sub">
                        The drafter reads it against this contract and turns it into a rule for the AI’s part in every later one. The master’s wording is not the AI’s to change — for that, upload a new master.
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
              <p className="sub">Saved — Founders Doc sends the draft.</p>
            ) : (
              <>
                <div className="prog-h">
                  <b className="cnt">
                    {answered} of {steps.length} answered
                    {skippedCount ? ` · ${skippedCount} skipped` : ""}
                  </b>
                  <span className="eta">{isDraft ? "Click one to change it" : finished ? "Ready to prepare" : `About ${Math.max(1, Math.ceil(pending.length * 0.4))} min`}</span>
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
                        const value = isOpen ? (answer ? `Open now — ${answer}` : "") : answer || "Not yet — click to open";
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
                onClick={() => (stage === "review" ? void prepare() : setStage("review"))}
              >
                {busy ? "Preparing…" : stage === "review" ? (guest ? "Sign up and prepare" : "Prepare contract") : "Review answers"}
              </button>
              <button type="button" className="btn btn-quiet s-skipall" disabled={busy || finished || stage === "intro"} onClick={skipRest}>
                Skip the rest
              </button>
              <small>Skipped questions take the usual answer — nothing is invented.</small>
            </div>
          )}
          {isDraft && (
            <div className="studio-foot">
              <button type="button" className="btn s-gen" disabled={busy} onClick={changeAnswers}>Change answers</button>
              <small>{status === "stopped" ? "No credit is used while the Contractor Agreement is in Beta." : "Preparing again with new answers uses one credit. Editing the agreement itself is free."}</small>
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
