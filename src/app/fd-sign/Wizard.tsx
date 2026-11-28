"use client";

import Link from "next/link";
import { clearHandoff, peekHandoff } from "./handoff";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANNEL_TEXT, normalisePhone, type CodeChannel } from "@/lib/sign/phone-format";
import BoxEditor from "../admin/sign/BoxEditor";
import { openPdf, readPdf, type PdfInfo } from "../sign/PdfPages";
import { autoPlace, boxId, colour, type Box, type BoxKind } from "@/lib/sign/boxes";
import type { DraftBlock } from "@/lib/sign/draft-pdf";
import { Ic, SignCredits, signLeft, useList, type SignAllowanceView } from "./ui";
import PageEditor, { type EditSummary } from "./PageEditor";
import ExitAsk, { type ExitAnswer } from "./ExitAsk";
import Supplements, { saveFile } from "./Supplements";
import { stepsFrom } from "@/lib/sign/order";

/* New signing request, in 4 steps: Document → People → Fields → Review and send.
   Signers sign in the order listed; each gets an email when it's their turn and
   confirms a 6-digit email code before signing. */

const MAX = 10 * 1024 * 1024;
/* "2 text boxes, 1 white-out, 1 page removed" */
function editLine(e: EditSummary): string {
  const n = (k: number, one: string, many: string) => (k ? `${k} ${k === 1 ? one : many}` : "");
  return (
    [n(e.texts, "text box", "text boxes"), n(e.whiteouts, "white-out", "white-outs"), n(e.removed, "page removed", "pages removed"), n(e.added, "page added", "pages added"), n(e.rotated, "page rotated", "pages rotated"), e.moved ? "pages reordered" : ""]
      .filter(Boolean)
      .join(", ") || "no changes"
  );
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STEPS = ["Document", "People", "Fields", "Review and send"];
/* phones show every step's name under its number, so a shorter last one */
const SHORT = ["Document", "People", "Fields", "Review"];
const KIND_TEXT: Record<BoxKind, string> = { signature: "Signature", date: "Date signed", name: "Full name", initials: "Initials", text: "Text box", checkbox: "Checkbox" };
const KIND_ICON: Record<BoxKind, string> = { signature: "pen", date: "cal", name: "user", initials: "type", text: "textbox", checkbox: "box" };
const KIND_HINT: Partial<Record<BoxKind, string>> = { initials: "from their name", text: "they type it", checkbox: "they tick it" };
const asks = (k: BoxKind) => k === "text" || k === "checkbox";

interface Person {
  key: string;
  name: string;
  email: string;
  role: string;
  /** 0222: how they get the signing code, and their mobile for WhatsApp / SMS */
  via: CodeChannel;
  phone: string;
  /** 0304: signs at the same time as the person above (parallel) */
  together: boolean;
  /** 0304: only fills in text / date boxes, no signature (e.g. the dating line) */
  fill: boolean;
  /** 0308: approves first (no boxes, no signature) before this person (their key) signs; "" = signs */
  approveFor: string;
  /** 0309: with 2+ approvers, one approval is enough (default) or all of them must approve */
  allApprove: boolean;
  /** 0319: an approver who also signs (their signature is their approval); they get signature boxes */
  alsoSign: boolean;
}
let seq = 0;
const blank = (): Person => ({ key: `p${Date.now().toString(36)}${seq++}`, name: "", email: "", role: "", via: "email", phone: "", together: false, fill: false, approveFor: "", allApprove: false, alsoSign: false });

/** channels = the phone channels switched on in Vercel (lib/sign/phone.ts); none = email codes only, as before */
/** plan (0223, FD_SIGN_PRICING=on): this month's requests and WhatsApp / SMS codes; null = Beta, nothing shown */
export default function Wizard({
  channels = [],
  phoneLocked = false,
  plan = null,
}: {
  channels?: CodeChannel[];
  /** 0236: WhatsApp / SMS codes are switched on, but only for premium plans: show them, locked */
  phoneLocked?: boolean;
  plan?: SignAllowanceView | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  /* an FD AI draft as the document (0190): its signature blocks place the boxes */
  const [fromDraft, setFromDraft] = useState<{ id: string; title: string; blocks: DraftBlock[]; blanks: number } | null>(null);
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; updatedAt: string; gaps: number }> | null>(null);
  const [draftBusy, setDraftBusy] = useState("");
  const { data, reload } = useList();
  /* 0229: the signing-requests counter. Starts from the server's figure, then follows My documents'
     list, which reloads when the sender comes back to this tab (e.g. after buying a plan in another tab). */
  const allow: SignAllowanceView | null = data?.plan?.live ? { label: data.plan.label, used: data.today, limit: data.limit, per: data.plan.per, endsAt: data.plan.endsAt } : plan;
  const noneLeft = !!allow && signLeft(allow) === 0;
  useEffect(() => {
    const back = () => document.visibilityState === "visible" && void reload();
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [reload]);
  const [step, setStep] = useState(1);
  /* 0221: tell Founders Doc when someone starts a request and, if they leave, at which step (no title or file is sent) */
  const progress = useRef({ started: false, sent: false, left: false, step: 1 });
  useEffect(() => {
    progress.current.step = step;
  }, [step]);
  /* 0205: the furthest step reached, so the bar can jump back and forward again
     to any step already opened (each jump still checks the steps before it) */
  const [reached, setReached] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  /* 0213: remove pages before sending; the file as first uploaded, to restore it */
  const [trimming, setTrimming] = useState(false);
  const [untrimmed, setUntrimmed] = useState<{ file: File; info: PdfInfo; edits: EditSummary } | null>(null);
  const [fileErr, setFileErr] = useState("");
  /* a Word file we turned into a PDF: its name and what was not kept */
  const [converted, setConverted] = useState<{ name: string; warnings: string[] } | null>(null);
  const [converting, setConverting] = useState(false);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState("");
  const [people, setPeople] = useState<Person[]>([blank()]);
  const [cc, setCc] = useState("");
  /* 0296: key controllers (a status email each time someone signs), and the supplemental documents inserted */
  const [ctl, setCtl] = useState("");
  /* 0304: a reminder each day to whoever's turn it is */
  const [daily, setDaily] = useState(false);
  const [inserted, setInserted] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  /* 0199: the name signers see ("Rachel Wong sent you a document"); starts as the account name */
  const [fromName, setFromName] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [active, setActive] = useState(1);
  const [armed, setArmed] = useState<BoxKind | null>(null);
  /* text box / checkbox: what it asks, and whether it must be filled in (set before placing, editable after) */
  const [askLabel, setAskLabel] = useState("");
  const [askReq, setAskReq] = useState(true);
  const [placed, setPlaced] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const input = useRef<HTMLInputElement>(null);

  const me = data?.me;

  /* Word (.docx): turned into a PDF on our server (0191), then used like any PDF */
  async function fromWord(f: File): Promise<File | null> {
    setConverting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/fd-sign/convert", { method: "POST", body: fd });
      if (!r.ok) {
        setFileErr(((await r.json().catch(() => ({}))) as { error?: string }).error || "This Word file couldn't be read. Save it as PDF in Word, then upload the PDF.");
        return null;
      }
      const meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob((r.headers.get("x-fds-word") ?? "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))) as { warnings?: string[] };
      setConverted({ name: f.name, warnings: meta.warnings ?? [] });
      return new File([await r.blob()], f.name.replace(/\.docx$/i, "") + ".pdf", { type: "application/pdf" });
    } catch {
      setFileErr("This Word file couldn't be read. Save it as PDF in Word, then upload the PDF.");
      return null;
    } finally {
      setConverting(false);
    }
  }

  async function pick(f: File | undefined | null) {
    setFileErr("");
    setFromDraft(null);
    if (!f) return;
    if (f.size > MAX) return setFileErr("This file is over 10 MB. Please make it smaller and try again.");
    let head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b && /\.docx$/i.test(f.name)) {
      const pdf = await fromWord(f);
      if (!pdf) return;
      f = pdf;
      head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    } else setConverted(null);
    if (/\.doc$/i.test(f.name)) return setFileErr("This is the old Word format (.doc). In Word choose File → Save as → .docx or PDF, then upload that.");
    if (String.fromCharCode(...head) !== "%PDF-") return setFileErr("Please upload a PDF or a Word file (.docx).");
    try {
      const doc = await openPdf(f);
      const i = await readPdf(doc);
      void doc.destroy();
      setInfo(i);
    } catch {
      return setFileErr("This PDF could not be opened. If it has a password, remove it and try again.");
    }
    setFile(f);
    setBoxes([]);
    setPlaced(false);
    setUntrimmed(null);
    setTrimming(false);
    setInserted([]);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").slice(0, 200));
  }

  /* 0213: the pages left after "Remove pages" (or all of them again) */
  /* 0214: the edited copy from "Edit document" (the first upload is kept to restore) */
  async function applyTrimmed(f: File, edits: EditSummary) {
    try {
      const doc = await openPdf(f);
      const i = await readPdf(doc);
      void doc.destroy();
      const add = (a: EditSummary, b: EditSummary): EditSummary => ({ texts: a.texts + b.texts, whiteouts: a.whiteouts + b.whiteouts, removed: a.removed + b.removed, added: a.added + b.added, rotated: a.rotated + b.rotated, moved: a.moved || b.moved });
      if (!untrimmed && file && info) setUntrimmed({ file, info, edits });
      else if (untrimmed) setUntrimmed({ ...untrimmed, edits: add(untrimmed.edits, edits) });
      /* an FD AI draft's signature blocks point at pages that may have moved: place boxes on the signature lines instead */
      if (fromDraft && (edits.removed || edits.added || edits.moved || edits.rotated)) setFromDraft({ ...fromDraft, blocks: [] });
      setInfo(i);
      setFile(f);
      setBoxes([]);
      setPlaced(false);
      setTrimming(false);
    } catch {
      setFileErr("The edited PDF could not be opened. Please try again.");
    }
  }
  /* 0296: the document with its supplemental documents inserted (restorable, like an edit) */
  async function applyInserted(f: File, lines: string[], pages: number) {
    const before = info?.pages.length ?? 0;
    await applyTrimmed(f, { texts: 0, whiteouts: 0, removed: 0, added: Math.max(0, pages - before), rotated: 0, moved: false });
    setInserted((l) => [...l, ...lines].slice(0, 10));
  }
  function restorePages() {
    if (!untrimmed) return;
    setInserted([]);
    setFile(untrimmed.file);
    setInfo(untrimmed.info);
    setUntrimmed(null);
    setBoxes([]);
    setPlaced(false);
  }

  /* 0233: "Before you go", like drafting: their answer rides on the "left" line */
  const askable = useCallback(() => progress.current.started && !progress.current.sent && !progress.current.left, []);
  const leftWith = useCallback((a: ExitAnswer) => {
    const p = progress.current;
    if (!p.started || p.sent || p.left) return;
    p.left = true;
    void fetch("/api/fd-sign/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "left", step: p.step, ...a }), keepalive: true }).catch(() => undefined);
  }, []);

  /* 0221: started = a document is in; left = the page closes before sending */
  useEffect(() => {
    if (!file || progress.current.started) return;
    progress.current.started = true;
    void fetch("/api/fd-sign/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "started", step: 1 }), keepalive: true }).catch(() => undefined);
  }, [file]);
  useEffect(() => {
    const leave = () => {
      const p = progress.current;
      if (!p.started || p.sent || p.left) return;
      p.left = true;
      const body = new Blob([JSON.stringify({ kind: "left", step: p.step })], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/fd-sign/progress", body)) void fetch("/api/fd-sign/progress", { method: "POST", body, keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave(); // leaving for another page inside the app
    };
  }, []);

  /* people */
  const setP = (k: string, patch: Partial<Person>) => setPeople((l) => l.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  function addMe() {
    if (!me) return;
    if (people.some((p) => p.email.trim().toLowerCase() === me.email)) return;
    const empty = people.find((p) => !p.name && !p.email);
    if (empty) setP(empty.key, { name: me.name, email: me.email });
    else setPeople((l) => [...l, { ...blank(), name: me.name, email: me.email }]);
  }
  /* a box belongs to a signer by their place among the filled-in rows (1, 2, …) */
  const isFilled = (p: Person) => Boolean(p.name.trim() || p.email.trim());
  const posOf = (i: number) => (isFilled(people[i]) ? people.slice(0, i + 1).filter(isFilled).length : 0);
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= people.length) return;
    const a = posOf(i), b = posOf(j);
    setPeople((l) => {
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    if (a && b) setBoxes((bx) => bx.map((x) => (x.position === a ? { ...x, position: b } : x.position === b ? { ...x, position: a } : x)));
  }
  function remove(i: number) {
    const a = posOf(i);
    setPeople((l) => (l.length > 1 ? l.filter((_, k) => k !== i) : [blank()]));
    if (a) setBoxes((b) => b.filter((x) => x.position !== a).map((x) => (x.position > a ? { ...x, position: x.position - 1 } : x)));
    setActive(1);
  }
  const ccList = cc
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const ctlList = useMemo(
    () => [
      ...new Set([
        ...ctl
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ]),
    ],
    [ctl],
  );

  const problems = useMemo(() => {
    const p: Record<number, string> = {};
    if (!file) p[1] = "Upload the document first.";
    else if (!title.trim()) p[1] = "Give the document a name.";
    const filled = people.filter((x) => x.name.trim() || x.email.trim());
    if (!filled.length) p[2] = "Add at least one person to sign.";
    else if (filled.length > 10) p[2] = "Up to 10 people can sign one document.";
    else if (filled.some((x) => !x.name.trim())) p[2] = "Every person needs a name.";
    else if (filled.some((x) => !EMAIL.test(x.email.trim()))) p[2] = "Check the email addresses.";
    else if (new Set(filled.map((x) => x.email.trim().toLowerCase())).size !== filled.length) p[2] = "Each person needs their own email address.";
    else if (ccList.length > 5 || ccList.some((e) => !EMAIL.test(e))) p[2] = "Copies: up to 5 valid email addresses.";
    else if (ctlList.length > 3 || ctlList.some((e) => !EMAIL.test(e))) p[2] = "Status updates: up to 3 valid email addresses.";
    else if (filled.some((x) => x.via !== "email" && !normalisePhone(x.phone))) p[2] = "Add a mobile number with the country code (e.g. +65 9123 4567) for WhatsApp / SMS codes.";
    else {
      /* 0308: an approver approves someone who signs, and comes before them or at the same time */
      const st = stepsFrom(filled.map((x) => x.together));
      filled.forEach((x, i) => {
        if (p[2] || !x.approveFor) return;
        const t = filled.findIndex((y) => y.key === x.approveFor);
        const who = x.name || `Person ${i + 1}`;
        if (t < 0) p[2] = `${who}: choose who they approve for.`;
        else if (filled[t]!.approveFor || filled[t]!.fill) p[2] = `${who} can only approve for someone who signs.`;
        else if (st[i]! > st[t]!) p[2] = `${who} approves for ${filled[t]!.name || `person ${t + 1}`}, so put them above, or at the same time.`;
      });
    }
    /* 0304: a person who only fills in needs a text or date box and no signature box; everyone else a signature box */
    filled.forEach((x, i) => {
      if (p[3]) return;
      const mine = boxes.filter((b) => b.position === i + 1);
      const who = x.name || `Person ${i + 1}`;
      if (x.approveFor && !x.alsoSign) {
        if (mine.length) p[3] = `${who} only approves: remove their boxes.`;
        return;
      }
      if (x.fill && !mine.some((b) => b.kind === "text" || b.kind === "date" || b.kind === "name" || b.kind === "checkbox")) p[3] = `${who} fills in only: add a text or date box for them.`;
      else if (x.fill && mine.some((b) => b.kind === "signature" || b.kind === "initials")) p[3] = `${who} fills in only: remove their signature box.`;
      else if (!x.fill && !mine.some((b) => b.kind === "signature")) p[3] = `${who} needs a signature box.`;
    });
    return p;
  }, [file, title, people, boxes, ccList, ctlList]);
  const signers = people.filter((x) => x.name.trim() || x.email.trim());

  /* Boxes for everyone: from an FD AI draft, person 1 signs block 1, person 2 block 2 …;
     otherwise (or for people beyond the blocks) on the line that names them. */
  const placeAll = (): Box[] => {
    if (!info) return [];
    /* 0304: no signature box for a person who only fills in (they get text / date boxes by hand) */
    const auto = autoPlace(info, signers.map((s) => ({ name: s.name.trim(), role: s.role.trim() || "Signer" })), { everyone: true }).filter((b) => !signers[b.position - 1]?.fill && !(signers[b.position - 1]?.approveFor && !signers[b.position - 1]?.alsoSign));
    if (!fromDraft?.blocks.length) return auto;
    const out: Box[] = [];
    signers.forEach((_, i) => {
      const blk = fromDraft.blocks[i];
      if (!blk) return void out.push(...auto.filter((b) => b.position === i + 1));
      for (const b of blk.boxes)
        out.push({ id: boxId(), position: i + 1, kind: b.kind, page: b.page, x: b.x, y: b.y, w: b.w, h: b.h, ...(b.kind === "text" ? { label: b.label ?? "Title", required: true } : {}) });
    });
    return out;
  };
  /* first time on Fields: put a signature box on each person's line */
  useEffect(() => {
    if (step !== 3 || placed || !info) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off auto placement when the step opens
    setBoxes(placeAll());
    setPlaced(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placeAll reads the same state
  }, [step, placed, info, signers]);

  /* ?draft=<id> (the "Send for signing" button on an FD AI draft) */
  async function openDraft(id: string) {
    setDraftBusy(id);
    setFileErr("");
    try {
      const r = await fetch(`/api/fd-sign/drafts/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not open that draft.");
      const meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob((r.headers.get("x-fds-draft") ?? "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))) as {
        title: string;
        blocks: DraftBlock[];
        blanks: number;
      };
      const blob = await r.blob();
      const f = new File([blob], `${meta.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Document"}.pdf`, { type: "application/pdf" });
      await pick(f);
      setTitle(meta.title);
      setFromDraft({ id, title: meta.title, blocks: meta.blocks ?? [], blanks: meta.blanks ?? 0 });
      setDrafts(null);
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : "Could not open that draft.");
    } finally {
      setDraftBusy("");
    }
  }
  async function listDrafts() {
    setFileErr("");
    const r = await fetch("/api/fd-sign/drafts", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setFileErr(j.error || "Could not load your drafts.");
    setDrafts(j.drafts ?? []);
  }
  /* 0201: the file just checked on the Signing-ready check tab */
  const [handoff] = useState(() => (params.get("from") === "check" ? peekHandoff() : null));
  const checked = handoff?.verdict ?? null;
  const fromCheck = useRef(false);
  useEffect(() => {
    if (fromCheck.current || !handoff) return;
    fromCheck.current = true;
    clearHandoff();
    void pick(handoff.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the checked file
  }, [handoff]);
  /* 0310: "Edit draft": open a saved draft again, with everything it was saved with */
  const [editing, setEditing] = useState<string | null>(null);
  /* 0311: "Duplicate": the same, but a new request (the original is not changed) */
  const [copied, setCopied] = useState<string | null>(null);
  const editId = params.get("edit") ?? params.get("copy");
  const asCopy = !params.get("edit") && !!params.get("copy");
  const editAsked = useRef(false);
  async function openEdit(id: string, copy = false) {
    setFileErr("");
    try {
      const r = await fetch(`/api/fd-sign/${id}/edit${copy ? "?copy=1" : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        title: string;
        fileName: string;
        message: string | null;
        folderId: string | null;
        signers: Array<{ name: string; email: string; role: string; channel: CodeChannel; phone: string | null }>;
        fields: Array<Omit<Box, "id">>;
        cc: string[];
        controllers: string[];
        supplements: string[];
        order: { steps: number[]; fill: number[]; approve?: Array<[number, number]>; anyOf?: number[]; signs?: number[] };
        remindDaily: boolean;
      };
      if (!r.ok) throw new Error(j.error || "Could not open that draft.");
      const pdf = await fetch(`/api/sign/file?e=${id}&raw=1`, { cache: "no-store" });
      if (!pdf.ok) throw new Error("Could not open the draft's document.");
      const f = new File([await pdf.blob()], `${(j.fileName || j.title).replace(/\.(pdf|docx)$/i, "")}.pdf`, { type: "application/pdf" });
      const doc = await openPdf(f);
      const i = await readPdf(doc);
      void doc.destroy();
      const keys = j.signers.map(() => blank().key);
      const ap = j.order.approve ?? [];
      setPeople(
        j.signers.map((x, k) => {
          const target = ap.find(([a]) => a === k + 1)?.[1];
          return {
            key: keys[k]!,
            name: x.name,
            email: x.email,
            role: x.role,
            via: x.channel ?? "email",
            phone: x.phone ?? "",
            together: k > 0 && j.order.steps[k] === j.order.steps[k - 1],
            fill: j.order.fill.includes(k + 1),
            approveFor: target ? keys[target - 1]! : "",
            /* Rachel (0309): one approval is enough unless all were asked for */
            allApprove: ap.some(([, t]) => t === k + 1) && !(j.order.anyOf ?? []).includes(k + 1),
            alsoSign: !!target && (j.order.signs ?? []).includes(k + 1),
          };
        }),
      );
      setInfo(i);
      setFile(f);
      setBoxes(j.fields.map((b) => ({ ...b, id: boxId() })));
      setPlaced(true);
      setUntrimmed(null);
      setConverted(null);
      setInserted(j.supplements);
      setTitle(copy ? `${j.title} (copy)`.slice(0, 200) : j.title);
      setMessage(j.message ?? "");
      setFolderId(j.folderId ?? "");
      setCc(j.cc.join(", "));
      setCtl(j.controllers.join(", "));
      setDaily(j.remindDaily);
      if (copy) setCopied(j.title);
      else setEditing(id);
      setReached(4);
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : "Could not open that draft.");
    }
  }
  useEffect(() => {
    if (!editId || editAsked.current || !/^[0-9a-f-]{36}$/i.test(editId)) return;
    editAsked.current = true;
    void openEdit(editId, asCopy);
  }, [editId, asCopy]);
  const wanted = params.get("draft");
  const asked = useRef(false);
  useEffect(() => {
    if (!wanted || asked.current || !/^[0-9a-f-]{36}$/i.test(wanted)) return;
    asked.current = true;
    void openDraft(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the link's draft
  }, [wanted]);

  function go(n: number) {
    for (let k = 1; k < n; k++)
      if (problems[k]) {
        setStep(k);
        setErr(problems[k]);
        return;
      }
    setErr("");
    if (step === 2 && n > 2) setPeople((l) => (l.some(isFilled) ? l.filter(isFilled) : l));
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0 });
  }

  /* 0305: draft = save it without sending (send it later from the document page) */
  async function send(draft = false) {
    for (const k of [1, 2, 3])
      if (problems[k]) {
        setStep(k);
        return setErr(problems[k]);
      }
    setBusy(draft ? "draft" : "send");
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file!);
      fd.append(
        "meta",
        JSON.stringify({
          title: title.trim(),
          message: message.trim() || null,
          senderName: senderName === "You" ? null : senderName,
          folderId: folderId || null,
          signers: signers.map((s) => ({
            name: s.name.trim(),
            email: s.email.trim().toLowerCase(),
            role: s.role.trim(),
            ...(s.via !== "email" && channels.includes(s.via) ? { channel: s.via, phone: normalisePhone(s.phone) } : {}),
          })),
          cc: ccList,
          controllers: ctlList,
          /* 0304 */
          steps: stepsFrom(signers.map((s) => s.together)),
          fillOnly: signers.flatMap((s, i) => (s.fill ? [i + 1] : [])),
          approveAny: signers.flatMap((s, i) => (!s.allApprove && signers.some((y) => y.approveFor === s.key) ? [i + 1] : [])),
          approveSign: signers.flatMap((s, i) => (s.approveFor && s.alsoSign ? [i + 1] : [])),
          approve: signers.flatMap((s, i) => {
            const t = s.approveFor ? signers.findIndex((y) => y.key === s.approveFor) : -1;
            return t >= 0 ? [[i + 1, t + 1]] : [];
          }),
          remindDaily: daily,
          draft,
          /* 0310: saving or sending an edited draft replaces it */
          ...(editing ? { replaces: editing } : {}),
          supplements: inserted,
          fields: boxes.map(({ position, kind, page, x, y, w, h, label, required, value }) => ({ position, kind, page, x, y, w, h, ...(asks(kind) ? { label: label?.trim() || undefined, required: !!required } : {}), ...(kind === "text" && value?.trim() ? { value: value.trim() } : {}) })),
        }),
      );
      const r = await fetch("/api/fd-sign/send", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send. Please try again.");
      try {
        if (j.previewLink) sessionStorage.setItem("fds-preview-link", j.previewLink);
      } catch {
        /* preview only */
      }
      progress.current.sent = true;
      router.push(j.draft ? `/fd-sign/d/${j.id}?draft=1` : `/fd-sign/d/${j.id}?sent=${encodeURIComponent(j.emailedTo || signers[0].name)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
      setBusy("");
    }
  }

  async function newFolder() {
    const name = prompt("Folder name")?.trim();
    if (!name) return;
    const r = await fetch("/api/fd-sign/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Could not add the folder.");
    await reload();
    setFolderId(j.id);
  }

  const names = signers.map((s) => s.name.trim() || "Signer");
  const fieldCount = (pos: number) => boxes.filter((b) => b.position === pos).length;
  const folder = data?.folders.find((f) => f.id === folderId);
  const senderName = (fromName ?? me?.name ?? "").trim() || "You";
  /* an account with no name set shows its email's first part (e.g. "nguyenhoanglam.first"): ask for a proper name */
  const nameLooksLikeEmail = !fromName && !!me && !/\s/.test(me.name) && me.email.startsWith(me.name.toLowerCase());
  /* the preview is general: names appear as placeholders, filled in for each email */
  const fromTok = <span className="tok">Your name</span>;

  return (
    <div className="fds wiz">
      <ExitAsk canAsk={askable} step={step} onLeave={leftWith} />
      <div className="fds-wtop">
        <div className="l">
          <Link className="x" href="/fd-sign" aria-label="Close">
            <Ic n="x" s={16} />
          </Link>
          New signing request
        </div>
        <nav className="fds-steps" aria-label="Steps">
          {STEPS.map((t, i) => {
            const n = i + 1;
            const open = n <= Math.max(reached, step + 1);
            const done = n < reached && n !== step && !problems[n];
            return (
              <span key={t} style={{ display: "contents" }}>
                <button
                  type="button"
                  className={`fds-stp ${n === step ? "on" : done ? "ok" : n <= reached ? "seen" : ""}`}
                  onClick={() => n !== step && go(n)}
                  disabled={!open}
                  aria-current={n === step ? "step" : undefined}
                  title={n === step ? t : open ? `Go to ${t}` : `${t}: finish the steps before it first`}
                >
                  <i>{done ? "✓" : n}</i>
                  <span className="full">{t}</span>
                  <span className="short">{SHORT[i]}</span>
                </button>
                {i < 3 && <span className={`fds-sl ${n < reached ? "ok" : ""}`} />}
              </span>
            );
          })}
        </nav>
        <span />
      </div>

      {step === 1 && (
        <div className="fds-wbody">
          <div>
            <div className="fds-wh">
              <h2>What needs signing?</h2>
              <p>Upload the final version. People sign exactly what you upload.</p>
            </div>
            {allow && <SignCredits a={allow} newTab />}
            {checked ? (
              <p className={`fds-checked ${checked === "ready" || checked === "ready_with_ack" ? "ok" : "warn"}`}>
                <Ic n="shield" s={16} />
                {checked === "ready" ? "Checked: ready to sign." : checked === "ready_with_ack" ? "Checked: ready, points accepted." : "Checked: sent anyway, with your reason recorded."}
              </p>
            ) : (
              <Link className="fds-checked link" href="/fd-sign/check">
                <Ic n="shield" s={16} />
                Not sure it&rsquo;s the final version? Run the signing-ready check first ›
              </Link>
            )}
            <label
              className={`fds-drop ${over ? "over" : ""}`}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void pick(e.dataTransfer.files[0]);
              }}
            >
              <input ref={input} type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void pick(e.target.files?.[0])} />
              <div className="ic">
                <Ic n="up" s={26} w={1.8} />
              </div>
              <b>{converting ? "Turning your Word file into a PDF…" : file ? "Drop a different file here" : "Drop your document here"}</b>
              <p>PDF or Word (.docx) · up to 10 MB</p>
              <span className="fds-btn ink">Choose a file</span>
            </label>
            <div className="fds-or">or</div>
            <button className="fds-src" onClick={() => void (drafts ? setDrafts(null) : listDrafts())}>
              <span className="ci">
                <Ic n="spark" s={19} />
              </span>
              <span>
                <b>Use an FD AI draft</b>
                <small>Pick one of your saved drafts. No download or upload needed</small>
              </span>
              <Ic n={drafts ? "x" : "chev"} s={16} />
            </button>
            {drafts && (
              <div className="fds-drafts">
                {drafts.length === 0 && <p className="fds-muted">No saved drafts yet. Draft one with FD AI, then come back.</p>}
                {drafts.map((d) => (
                  <button key={d.id} className="fds-draft" disabled={!!draftBusy} onClick={() => void openDraft(d.id)}>
                    <Ic n="doc" s={16} />
                    <span>
                      <b>{d.title}</b>
                      <small>
                        Saved {new Date(d.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {d.gaps ? ` · ${d.gaps} ${d.gaps === 1 ? "gap" : "gaps"} to fill in` : ""}
                      </small>
                    </span>
                    <em>{draftBusy === d.id ? "Opening…" : "Use"}</em>
                  </button>
                ))}
              </div>
            )}
            {fileErr && <div className="fds-err">{fileErr}</div>}
            {copied && (
              <div className="fds-err" style={{ background: "var(--fds-blue-soft)", color: "var(--fds-blue-tx)" }}>
                A copy of &ldquo;{copied}&rdquo;, with its document, people, boxes and settings. Change anything, then save it as a draft or send it. The original is not changed.
              </div>
            )}
            {editing && (
              <div className="fds-err" style={{ background: "var(--fds-gold-soft)", color: "var(--fds-gold-tx)" }}>
                Editing a saved draft. Change anything, then <b>Save as draft</b> again (it replaces the old one) or <b>Send for signing</b>. Nobody has been emailed.
              </div>
            )}
            {converted && file && (
              <div className="fds-err" style={{ background: "var(--fds-blue-soft)", color: "var(--fds-blue-tx)" }}>
                Converted from Word ({converted.name}). Please check it in step 3: the text, headings, bold and lists are kept, but not the exact fonts and spacing.
                {converted.warnings.length ? ` ${converted.warnings.join(" ")}` : ""} For an exact copy, save it as PDF in Word and upload the PDF instead.
              </div>
            )}
            {fromDraft && file && (
              <div className={`fds-err`} style={fromDraft.blanks ? undefined : { background: "var(--fds-green-soft)", color: "var(--fds-green-tx)" }}>
                {fromDraft.blanks
                  ? `From FD AI: this draft still has ${fromDraft.blanks} ${fromDraft.blanks === 1 ? "gap" : "gaps"} ([●]) in the text. Fill ${fromDraft.blanks === 1 ? "it" : "them"} in on FD AI before sending, or send it if that's intended.`
                  : `From FD AI: ${fromDraft.blocks.length} signature ${fromDraft.blocks.length === 1 ? "block" : "blocks"} found. We'll put each person's boxes on their block.`}
              </div>
            )}
            {file && (
              <div className="fds-file">
                <span className="fds-thumb">
                  <i /><i /><i /><i /><i /><i />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{file.name}</b>
                  <small>
                    {info?.pages.length ?? "?"} {info?.pages.length === 1 ? "page" : "pages"} · {Math.max(1, Math.round(file.size / 1024))} KB · <span className="fds-ok">✓ Ready</span>
                  </small>
                  {inserted.length > 0 && (
                    <small className="fds-trimmed">
                      Supplemental: {inserted.join(" · ")}
                    </small>
                  )}
                  {untrimmed && (
                    <small className="fds-trimmed">
                      Edited: {editLine(untrimmed.edits)} ·{" "}
                      <button className="fds-linkbtn" onClick={restorePages}>
                        Restore original
                      </button>
                    </small>
                  )}
                </div>
                {/* 0300: the document as it stands (with any supplemental documents inserted), to check it or keep it */}
                <button className="fds-ico" aria-label="Download this PDF" title="Download this PDF" onClick={() => saveFile(file, file.name.replace(/\.docx$/i, ".pdf"))}>
                  <Ic n="download" s={16} />
                </button>
                {!trimming && (
                  <button className="fds-btn sm" onClick={() => setTrimming(true)}>
                    <Ic n="pen" s={14} /> Edit document
                  </button>
                )}
                <button className="fds-btn sm" onClick={() => input.current?.click()}>
                  Replace
                </button>
              </div>
            )}
            {file && trimming && <PageEditor file={file} onDone={(f, edits) => void applyTrimmed(f, edits)} onClose={() => setTrimming(false)} />}
            {file && info && !trimming && <Supplements key={`${file.name}:${file.size}:${info.pages.length}`} file={file} info={info} toPdf={fromWord} onInserted={(f, lines, pages) => void applyInserted(f, lines, pages)} />}
            <div className="fds-f2">
              <div className="fds-fld">
                <label htmlFor="fds-title">Document name (people see this)</label>
                <input id="fds-title" className="fds-inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Consultancy Agreement" />
              </div>
              <div className="fds-fld">
                <label htmlFor="fds-folder">Save in folder</label>
                <select id="fds-folder" className="fds-inp" value={folderId} onChange={(e) => (e.target.value === "+" ? void newFolder() : setFolderId(e.target.value))}>
                  <option value="">No folder</option>
                  {(data?.folders ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                  <option value="+">+ New folder…</option>
                </select>
              </div>
            </div>
          </div>
          <aside className="fds-aside">
            <h3>How it works</h3>
            <ol className="fds-how">
              <li>
                <b>Upload</b>The document you want signed
              </li>
              <li>
                <b>Add people</b>Who signs, and in what order
              </li>
              <li>
                <b>Place fields</b>We put a box on each signature line for you
              </li>
              <li>
                <b>Send</b>Each person gets an email. No account needed
              </li>
            </ol>
            <div className="fds-note">
              <Ic n="help" s={16} />
              <span>
                Not for wills, or documents the law says must be signed on paper. If unsure,{" "}
                <a href="/fd-consult" target="_blank" rel="noopener noreferrer">
                  book an FD Consult session
                </a>{" "}
                before sending.
              </span>
            </div>
          </aside>
        </div>
      )}

      {step === 2 && (
        <div className="fds-wbody">
          <div>
            <div className="fds-wh">
              <h2>Who needs to sign?</h2>
              <p>In signing order. Each person is emailed when the one before has signed. Tick &ldquo;at the same time&rdquo; for people who sign together (e.g. all the directors).</p>
            </div>
            {noneLeft && allow && <SignCredits a={allow} newTab />}
            {phoneLocked && (
              <p className="fds-lock">
                <Ic n="shield" s={13} w={2} /> Signing codes by WhatsApp come with Sign Standard and up.{" "}
                <a href="/billing#fd-sign" target="_blank" rel="noopener">
                  See plans ›
                </a>
              </p>
            )}
            {people.map((p, i) => (
              <div className="fds-pc" key={p.key} style={{ ["--c" as string]: colour(i + 1) }}>
                <span className="n">{i + 1}</span>
                <input className="fds-inp" value={p.name} maxLength={160} placeholder="Full name" aria-label={`Person ${i + 1} name`} onChange={(e) => setP(p.key, { name: e.target.value })} />
                <input className="fds-inp em" type="email" value={p.email} maxLength={200} placeholder="Email" aria-label={`Person ${i + 1} email`} onChange={(e) => setP(p.key, { email: e.target.value })} />
                <input className="fds-inp role" value={p.role} maxLength={80} placeholder="Role (optional)" aria-label={`Person ${i + 1} role`} onChange={(e) => setP(p.key, { role: e.target.value })} />
                <span className="ops">
                  <button className="fds-ico" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Ic n="arrowUp" s={15} />
                  </button>
                  <button className="fds-ico" aria-label="Move down" disabled={i === people.length - 1} onClick={() => move(i, 1)}>
                    <Ic n="arrowDown" s={15} />
                  </button>
                  <button className="fds-ico" aria-label="Remove" onClick={() => remove(i)}>
                    <Ic n="x" s={15} />
                  </button>
                </span>
                {channels.length > 0 && (
                  <div className="fds-pc-code">
                    <label htmlFor={`via-${p.key}`}>Signing code by</label>
                    <select id={`via-${p.key}`} className="fds-inp" value={p.via} onChange={(e) => setP(p.key, { via: e.target.value as CodeChannel })}>
                      <option value="email">Email</option>
                      {channels.map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_TEXT[c]}
                        </option>
                      ))}
                    </select>
                    {p.via !== "email" && (
                      <input
                        className="fds-inp"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={p.phone}
                        maxLength={24}
                        placeholder="Mobile, e.g. +65 9123 4567"
                        aria-label={`Person ${i + 1} mobile`}
                        onChange={(e) => setP(p.key, { phone: e.target.value })}
                      />
                    )}
                    <small>{p.via === "email" ? "The code goes to the same email as the link." : `A second check: the link comes by email, the code by ${CHANNEL_TEXT[p.via]}.`}</small>
                  </div>
                )}
                {/* 0304: parallel signing, and people who only fill in (e.g. the date on the dating line) */}
                <div className="fds-pc-opts">
                  {i > 0 && (
                    <label className="fds-chk">
                      <input type="checkbox" checked={p.together} onChange={(e) => setP(p.key, { together: e.target.checked })} /> Signs at the same time as person {i}
                    </label>
                  )}
                  {/* 0308: what this person does: signs, fills in only, or approves first for someone */}
                  <label className="fds-chk fds-does">
                    <span>Does:</span>
                    <select
                      className="fds-inp"
                      aria-label={`Person ${i + 1} does`}
                      value={p.approveFor ? `${p.alsoSign ? "both" : "approve"}:${p.approveFor}` : p.fill ? "fill" : "sign"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setP(
                          p.key,
                          v === "fill"
                            ? { fill: true, approveFor: "", alsoSign: false }
                            : v.startsWith("approve:")
                              ? { fill: false, approveFor: v.slice(8), alsoSign: false }
                              : v.startsWith("both:")
                                ? { fill: false, approveFor: v.slice(5), alsoSign: true }
                                : { fill: false, approveFor: "", alsoSign: false },
                        );
                      }}
                    >
                      <option value="sign">Signs</option>
                      <option value="fill">Fills in only, no signature (e.g. the date)</option>
                      {people
                        .filter((o) => o.key !== p.key)
                        .map((o) => (
                          <option key={o.key} value={`approve:${o.key}`}>
                            Approves first, before {o.name.trim() || `person ${people.indexOf(o) + 1}`} signs
                          </option>
                        ))}
                      {/* 0319: approves and signs (one signature does both) */}
                      {people
                        .filter((o) => o.key !== p.key)
                        .map((o) => (
                          <option key={`both-${o.key}`} value={`both:${o.key}`}>
                            Approves before {o.name.trim() || `person ${people.indexOf(o) + 1}`} signs, and signs too
                          </option>
                        ))}
                    </select>
                  </label>
                  {/* 0309: two or more approvers: is one approval enough? */}
                  {people.filter((o) => o.approveFor === p.key).length > 1 && (
                    <label className="fds-chk fds-does">
                      <span>Needs:</span>
                      <select className="fds-inp" aria-label={`Person ${i + 1} needs`} value={p.allApprove ? "all" : "any"} onChange={(e) => setP(p.key, { allApprove: e.target.value === "all" })}>
                        <option value="any">Any one approval</option>
                        <option value="all">All approvals</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button className="fds-btn" disabled={people.length >= 10} onClick={() => setPeople((l) => [...l, blank()])}>
                <Ic n="plus" s={16} />
                Add person
              </button>
              <button className="fds-btn" disabled={!me || people.some((p) => p.email.trim().toLowerCase() === me?.email)} onClick={addMe}>
                <Ic n="user" s={16} />
                Add me
              </button>
            </div>
            <div className="fds-fld" style={{ marginTop: 22 }}>
              <label htmlFor="fds-cc">Send a copy of the signed document to (optional)</label>
              <input id="fds-cc" className="fds-inp" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="finance@company.com, partner@company.com" />
            </div>
            <label className="fds-chk" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> Remind daily until signed (an email each morning to whoever&rsquo;s turn it is)
            </label>
            <div className="fds-fld" style={{ marginTop: 16 }}>
              <label htmlFor="fds-ctl">Status updates to a key controller (optional)</label>
              <input id="fds-ctl" className="fds-inp" value={ctl} onChange={(e) => setCtl(e.target.value)} placeholder="cosec@company.com" />
              <small className="fds-hint">
                The person who follows this signing, e.g. the company secretary, the lawyer or the deal lead. They get an email each time someone signs, showing who has signed and who hasn&rsquo;t. They don&rsquo;t sign and don&rsquo;t get the document. Up to 3.
              </small>
              {me && <small className="fds-hint">You ({me.email}) get these updates anyway: an email each time someone signs, and one when everyone has.</small>}
            </div>
          </div>
          <aside className="fds-aside">
            {fromDraft && fromDraft.blocks.length > 0 && (
              <div className="fds-note" style={{ marginTop: 0, marginBottom: 14, flexDirection: "column", gap: 4 }}>
                <b style={{ color: "var(--fds-tx)" }}>Signature blocks in this draft</b>
                {fromDraft.blocks.map((b, i) => (
                  <span key={i}>
                    {i + 1}. {b.head}
                  </span>
                ))}
                <span>Person 1 signs block 1, person 2 block 2.</span>
              </div>
            )}
            <h3>Signing order</h3>
            <div className="fds-chain">
              {signers.map((s, i) => (
                <div key={i}>
                  <div className="c">
                    <span className="fds-av" style={{ background: colour(i + 1) }}>
                      {i + 1}
                    </span>
                    <span>
                      <b>{s.email.trim().toLowerCase() === me?.email ? "You" : s.name || "Someone"}</b>
                      <small>
                        {(() => {
                          /* 0304: who signs together, and who only fills in */
                          const st = stepsFrom(signers.map((x) => x.together));
                          const first = (x: Person) => (x.email.trim().toLowerCase() === me?.email ? "you" : x.name.split(/\s+/)[0] || "they");
                          const before = signers.filter((_, k) => st[k] === st[i]! - 1);
                          const when =
                            st[i] === 1
                              ? "emailed when you send"
                              : i > 0 && st[i] === st[i - 1]
                                ? `at the same time as ${first(signers[i - 1]!)}`
                                : before.length > 2
                                  ? "after everyone above"
                                  : `after ${before.map(first).join(" and ")} ${before.length === 1 && first(before[0]!) !== "you" ? "signs" : "sign"}`;
                          const tgt = s.approveFor ? signers.find((y) => y.key === s.approveFor) : null;
                          const by = signers.filter((y) => y.approveFor === s.key).map(first);
                          const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));
                          const once = by.length ? (by.length > 1 && !s.allApprove ? `once ${by.join(" or ")} approves` : `once ${list(by)} approve${by.length === 1 ? "s" : ""}`) : "";
                          return `${once && st[i] === 1 ? once : when}${once && st[i] !== 1 ? `, ${once}` : ""}${s.fill ? " · fills in only" : ""}${tgt ? ` · approves before ${first(tgt)} signs${s.alsoSign ? ", and signs" : ""}` : ""}`;
                        })()}
                      </small>
                    </span>
                  </div>
                  <div className="ln" />
                </div>
              ))}
              <div className="c">
                <span className="fds-av" style={{ background: "var(--fds-green)" }}>
                  <Ic n="check" s={13} w={2.4} />
                </span>
                <span>
                  <b>Everyone gets the signed PDF</b>
                  <small>{ccList.length ? `plus ${ccList.length} ${ccList.length === 1 ? "copy" : "copies"}` : "with the audit trail page"}</small>
                </span>
              </div>
            </div>
            {ctlList.length > 0 && (
              <div className="fds-note">
                <Ic n="mail" s={16} />
                <span>
                  {ctlList.length === 1 ? "1 key controller gets" : `${ctlList.length} key controllers get`} a status email each time someone signs.
                </span>
              </div>
            )}
            <div className="fds-note">
              <Ic n="lock" s={16} />
              <span>Each person confirms a 6-digit code sent to their email before they can sign.</span>
            </div>
          </aside>
        </div>
      )}

      {step === 3 && file && (
        <div className="fds-fwrap">
          <div className="fds-pal">
            <h4>Fields for</h4>
            {signers.map((s, i) => (
              <button key={i} className={`fds-who ${active === i + 1 ? "on" : ""}`} style={{ ["--c" as string]: colour(i + 1) }} onClick={() => setActive(i + 1)}>
                <span className="fds-dot" style={{ background: colour(i + 1) }} />
                {s.name || `Person ${i + 1}`}
                {signers[i]?.approveFor && !signers[i]?.alsoSign ? (
                  /* 0308: approvers get no boxes (0319: unless they also sign) */
                  <small>approves, no boxes</small>
                ) : signers[i]?.fill ? (
                  fieldCount(i + 1) ? <small>{fieldCount(i + 1)} {fieldCount(i + 1) === 1 ? "field" : "fields"} · fills in</small> : <small className="miss">needs a text or date box</small>
                ) : boxes.some((b) => b.position === i + 1 && b.kind === "signature") ? (
                  <small>{fieldCount(i + 1)} {fieldCount(i + 1) === 1 ? "field" : "fields"}</small>
                ) : (
                  <small className="miss">needs signature</small>
                )}
              </button>
            ))}
            <button
              className="fds-btn"
              style={{ width: "100%", margin: "12px 0 6px", background: "var(--fds-gold-tint)", borderColor: "#ecd9a3", color: "var(--fds-gold-tx)" }}
              onClick={() => info && setBoxes(placeAll())}
            >
              <Ic n="spark" s={16} />
              Auto-place again
            </button>
            <p className="fds-muted" style={{ fontSize: 11.5, lineHeight: 1.45, margin: "0 0 16px" }}>
              We look for each person&rsquo;s name or role on the page and put their signature box on that line. Drag to move, drag the corner to resize.
            </p>
            <h4>Add to the page</h4>
            {(["signature", "initials", "date", "name", "text", "checkbox"] as BoxKind[]).map((k) => (
              <button
                key={k}
                className={`fds-fb ${armed === k ? "on" : ""}`}
                onClick={() => {
                  setArmed(armed === k ? null : k);
                  if (asks(k)) {
                    setAskLabel("");
                    setAskReq(k === "text");
                  }
                }}
              >
                <span className="ci">
                  <Ic n={KIND_ICON[k]} s={16} />
                </span>
                {KIND_TEXT[k]}
                {KIND_HINT[k] && <small className="fds-muted" style={{ marginLeft: "auto", fontSize: 11 }}>{KIND_HINT[k]}</small>}
              </button>
            ))}
            {armed && asks(armed) && (
              <div className="fds-ask">
                <label htmlFor="fds-ask">{armed === "text" ? "What should they type?" : "What are they ticking?"}</label>
                <input id="fds-ask" className="fds-inp" maxLength={60} value={askLabel} onChange={(e) => setAskLabel(e.target.value)} placeholder={armed === "text" ? "e.g. Company name" : "e.g. I have read clause 5"} />
                <label className="fds-check">
                  <input type="checkbox" checked={askReq} onChange={(e) => setAskReq(e.target.checked)} />
                  {armed === "text" ? "They must fill this in" : "They must tick this"}
                </label>
              </div>
            )}
            {boxes.some((b) => b.position === active && asks(b.kind)) && (
              <>
                <h4 style={{ marginTop: 16 }}>Questions for {names[active - 1]?.split(/\s+/)[0] || "them"}</h4>
                {boxes
                  .filter((b) => b.position === active && asks(b.kind))
                  .map((b) => (
                    <div className="fds-q" key={b.id}>
                      <Ic n={KIND_ICON[b.kind]} s={14} />
                      <input
                        aria-label="Question"
                        maxLength={60}
                        value={b.label ?? ""}
                        onChange={(e) => setBoxes((l) => l.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))}
                      />
                      <button
                        className={`fds-req ${b.required ? "on" : ""}`}
                        title={b.required ? "Required: click to make it optional" : "Optional: click to make it required"}
                        onClick={() => setBoxes((l) => l.map((x) => (x.id === b.id ? { ...x, required: !x.required } : x)))}
                      >
                        {b.required ? "Required" : "Optional"}
                      </button>
                      {/* 0306: filled in already (e.g. "President"); they can still change it */}
                      {b.kind === "text" && (
                        <input
                          aria-label="Filled in already (optional)"
                          maxLength={200}
                          value={b.value ?? ""}
                          placeholder="Filled in already (optional), e.g. President"
                          onChange={(e) => setBoxes((l) => l.map((x) => (x.id === b.id ? { ...x, value: e.target.value } : x)))}
                        />
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>
          <div className="fds-canvas">
            {armed && (
              <div className="fds-armed">
                Click on the page where {names[active - 1]?.split(/\s+/)[0] || "they"} should put their {KIND_TEXT[armed].toLowerCase()}.
              </div>
            )}
            <BoxEditor
              file={file}
              boxes={boxes}
              onChange={(b) =>
                setBoxes(
                  b.map((x) =>
                    asks(x.kind) && x.label === undefined ? { ...x, label: askLabel.trim() || (x.kind === "text" ? "Text" : "I agree"), required: askReq } : x,
                  ),
                )
              }
              names={names} active={active} armed={armed} onPlaced={() => setArmed(null)} onInfo={(i) => setInfo((x) => x ?? i)} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="fds-rv">
          <div>
            <div className="fds-wh">
              <h2>Check and send</h2>
              {noneLeft && allow && <SignCredits a={allow} newTab />}
              <p style={{ marginBottom: 16 }}>
                <b style={{ color: "var(--fds-tx)" }}>{title}</b> · {info?.pages.length} {info?.pages.length === 1 ? "page" : "pages"} · {folder ? `${folder.name} folder` : "no folder"} ·{" "}
                <button className="fds-btn sm ghost" style={{ color: "var(--fds-gold-tx)", padding: 0, height: "auto" }} onClick={() => go(1)}>
                  Change
                </button>
              </p>
            </div>
            <div className="fds-sec">
              <h3>
                <Ic n="users" s={16} />
                Signing order
                <button className="r" onClick={() => go(2)}>
                  Edit
                </button>
              </h3>
              {signers.map((s, i) => (
                <div className="fds-prow" key={i}>
                  <span className="fds-av" style={{ background: colour(i + 1), width: 28, height: 28 }}>
                    {i + 1}
                  </span>
                  <span>
                    <b>{s.email.trim().toLowerCase() === me?.email ? `${s.name} (you)` : s.name}</b>
                    <small>{s.email}</small>
                  </span>
                  <span className="r">
                    {boxes
                      .filter((b) => b.position === i + 1)
                      .map((b) => (asks(b.kind) && b.label ? `“${b.label}”` : KIND_TEXT[b.kind].toLowerCase()))
                      .filter((v, k, a) => a.indexOf(v) === k)
                      .join(", ")}
                  </span>
                </div>
              ))}
              {ccList.map((e) => (
                <div className="fds-prow" key={e}>
                  <span className="fds-av" style={{ background: "#9a9aa0", width: 28, height: 28 }}>
                    <Ic n="mail" s={13} />
                  </span>
                  <span>
                    <b>{e}</b>
                    <small>gets a copy when everyone has signed</small>
                  </span>
                </div>
              ))}
              {ctlList.map((e) => (
                <div className="fds-prow" key={`k${e}`}>
                  <span className="fds-av" style={{ background: "#2f6fdb", width: 28, height: 28 }}>
                    <Ic n="mail" s={13} />
                  </span>
                  <span>
                    <b>{e === me?.email ? `${e} (you)` : e}</b>
                    <small>key controller: a status update after each signature</small>
                  </span>
                </div>
              ))}
            </div>
            {inserted.length > 0 && (
              <div className="fds-sec">
                <h3>
                  <Ic n="doc" s={16} />
                  Supplemental documents
                  <button className="r" onClick={() => go(1)}>
                    Edit
                  </button>
                </h3>
                {inserted.map((l) => (
                  <p key={l} className="fds-muted" style={{ margin: "4px 0" }}>
                    {l}
                  </p>
                ))}
              </div>
            )}
            <div className="fds-sec">
              <h3>
                <Ic n="user" s={16} />
                Your name
              </h3>
              <input
                className="fds-inp"
                maxLength={80}
                value={fromName ?? me?.name ?? ""}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Alex Tan"
                aria-label="Your name, as signers see it"
              />
              <small className={`fds-namehint ${nameLooksLikeEmail ? "warn" : ""}`}>
                {nameLooksLikeEmail ? "This looks like part of your email. Type your full name so people know who sent it." : `Signers see “${senderName} sent you a document to sign”.`}
              </small>
            </div>
            <div className="fds-sec">
              <h3>
                <Ic n="mail" s={16} />
                Message to everyone (optional)
              </h3>
              <textarea className="fds-inp" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, please review and sign. Any questions, just reply to this email." />
            </div>
            <div className="fds-sec">
              <h3>
                <Ic n="shield" s={16} />
                Security
              </h3>
              <div className="fds-set">
                <span className="ci">
                  <Ic n="lock" s={16} />
                </span>
                <span>
                  <b>Email code before signing</b>
                  <small>Every person confirms a 6-digit code</small>
                </span>
                <span className="r">Always on</span>
              </div>
              <div className="fds-set">
                <span className="ci">
                  <Ic n="cal" s={16} />
                </span>
                <span>
                  <b>Link expires after 30 days</b>
                  <small>You can remind people or send it again</small>
                </span>
              </div>
              <div className="fds-set">
                <span className="ci">
                  <Ic n="shield" s={16} />
                </span>
                <span>
                  <b>Audit trail</b>
                  <small>The signed PDF gets a page with every step, time and a SHA-256 fingerprint</small>
                </span>
              </div>
            </div>
          </div>
          {/* 0205: an inbox-style preview of the invitation, the same for every person (names shown as placeholders) */}
          <div className="fds-mailp">
            <div className="lab">Email preview</div>
            <p className="sub">Each person gets their own copy of this email, one at a time if they sign in order.</p>
            <div className="fds-em">
              <div className="win" aria-hidden>
                <i />
                <i />
                <i />
                <span>Inbox</span>
              </div>
              <div className="subj">
                {fromTok} sent you a document to sign: {title.trim() || "Document name"}
              </div>
              <div className="who">
                <span className="av" aria-hidden>
                  <Ic n="user" s={16} />
                </span>
                <div>
                  <div className="nm">
                    <b>{fromTok}</b> <span>via FD Sign</span>
                  </div>
                  <div className="to">
                    to <span className="tok">Signer&rsquo;s name</span>
                  </div>
                </div>
                <span className="when">just now</span>
              </div>
              <div className="bd">
                <span className="pillk">FD SIGN</span>
                <h4>{fromTok} sent you a document to sign</h4>
                <div className="doc">
                  <Ic n="doc" s={16} />
                  {title.trim() || "Document name"}
                </div>
                {message.trim() && <p className="msg">{message.trim()}</p>}
                <span className="btn">Review &amp; sign →</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fds-wfoot">
        {step > 1 && (
          <button className="fds-btn" onClick={() => go(step - 1)}>
            <Ic n="back" s={16} />
            Back
          </button>
        )}
        <span className="hint">
          {err ? (
            <span style={{ color: "var(--fds-red-tx)", fontWeight: 600 }}>{err}</span>
          ) : step === 1 ? (
            <>
              <Ic n="lock" s={15} />
              Only you and the people you add can see this document
            </>
          ) : step === 2 ? (
            /* 0311: say why Continue is off (e.g. an approver below the person they approve for) */
            problems[2] && signers.some((x) => x.name.trim() || x.email.trim()) ? (
              <span style={{ color: "var(--fds-red-tx)" }}>{problems[2]}</span>
            ) : (
              `${signers.length} ${signers.length === 1 ? "person signs" : "people sign"}${ccList.length ? ` · ${ccList.length} ${ccList.length === 1 ? "copy" : "copies"}` : ""}`
            )
          ) : step === 3 ? (
            problems[3] ? <span style={{ color: "var(--fds-red-tx)" }}>{problems[3]}</span> : <span className="fds-ok">{signers.some((x) => x.fill || x.approveFor) ? "Everyone has their boxes" : "Everyone has a signature box"}</span>
          ) : (
            <>
              <Ic n="mail" s={15} />
              {signers[0]?.name || "The first person"} is emailed now{signers.length > 1 ? "; the others when it's their turn" : ""}.
            </>
          )}
        </span>
        <span className="fds-sp" />
        {err && step < 4 && <span />}
        {step < 4 ? (
          <button className="fds-btn gold lg" onClick={() => go(step + 1)} disabled={!!problems[step]}>
            Continue
            <Ic n="chev" s={16} w={2} />
          </button>
        ) : (
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="fds-btn lg" onClick={() => void send(true)} disabled={!!busy} title="Keep it to send later: nobody is emailed">
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <button className="fds-btn gold lg" onClick={() => void send()} disabled={!!busy}>
              <Ic n="mail" s={16} w={2} />
              {busy === "send" ? "Sending…" : "Send for signing"}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
