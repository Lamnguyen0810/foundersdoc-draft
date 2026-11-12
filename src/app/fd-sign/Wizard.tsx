"use client";

import Link from "next/link";
import { clearHandoff, peekHandoff } from "./handoff";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHANNEL_TEXT, normalisePhone, type CodeChannel } from "@/lib/sign/phone-format";
import BoxEditor from "../admin/sign/BoxEditor";
import { openPdf, readPdf, type PdfInfo } from "../sign/PdfPages";
import { autoPlace, boxId, colour, type Box, type BoxKind } from "@/lib/sign/boxes";
import type { DraftBlock } from "@/lib/sign/draft-pdf";
import { Ic, useList } from "./ui";
import PageEditor, { type EditSummary } from "./PageEditor";

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
}
let seq = 0;
const blank = (): Person => ({ key: `p${Date.now().toString(36)}${seq++}`, name: "", email: "", role: "", via: "email", phone: "" });

/** channels = the phone channels switched on in Vercel (lib/sign/phone.ts); none = email codes only, as before */
export default function Wizard({ channels = [] }: { channels?: CodeChannel[] }) {
  const router = useRouter();
  const params = useSearchParams();
  /* an FD AI draft as the document (0190): its signature blocks place the boxes */
  const [fromDraft, setFromDraft] = useState<{ id: string; title: string; blocks: DraftBlock[]; blanks: number } | null>(null);
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; updatedAt: string; gaps: number }> | null>(null);
  const [draftBusy, setDraftBusy] = useState("");
  const { data, reload } = useList();
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
  const [busy, setBusy] = useState(false);
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
  function restorePages() {
    if (!untrimmed) return;
    setFile(untrimmed.file);
    setInfo(untrimmed.info);
    setUntrimmed(null);
    setBoxes([]);
    setPlaced(false);
  }

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
    else if (filled.some((x) => x.via !== "email" && !normalisePhone(x.phone))) p[2] = "Add a mobile number with the country code (e.g. +65 9123 4567) for WhatsApp / SMS codes.";
    const missing = filled.findIndex((_, i) => !boxes.some((b) => b.position === i + 1 && b.kind === "signature"));
    if (missing >= 0) p[3] = `${filled[missing].name || `Person ${missing + 1}`} needs a signature box.`;
    return p;
  }, [file, title, people, boxes, ccList]);
  const signers = people.filter((x) => x.name.trim() || x.email.trim());

  /* Boxes for everyone: from an FD AI draft, person 1 signs block 1, person 2 block 2 …;
     otherwise (or for people beyond the blocks) on the line that names them. */
  const placeAll = (): Box[] => {
    if (!info) return [];
    const auto = autoPlace(info, signers.map((s) => ({ name: s.name.trim(), role: s.role.trim() || "Signer" })), { everyone: true });
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

  async function send() {
    for (const k of [1, 2, 3])
      if (problems[k]) {
        setStep(k);
        return setErr(problems[k]);
      }
    setBusy(true);
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
          fields: boxes.map(({ position, kind, page, x, y, w, h, label, required }) => ({ position, kind, page, x, y, w, h, ...(asks(kind) ? { label: label?.trim() || undefined, required: !!required } : {}) })),
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
      router.push(`/fd-sign/d/${j.id}?sent=${encodeURIComponent(j.emailedTo || signers[0].name)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
      setBusy(false);
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
                  {untrimmed && (
                    <small className="fds-trimmed">
                      Edited: {editLine(untrimmed.edits)} ·{" "}
                      <button className="fds-linkbtn" onClick={restorePages}>
                        Restore original
                      </button>
                    </small>
                  )}
                </div>
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
              <p>In signing order. Each person is emailed when the one before has signed.</p>
            </div>
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
                      <small>{i === 0 ? "emailed when you send" : `after ${signers[i - 1].email.trim().toLowerCase() === me?.email ? "you sign" : `${signers[i - 1].name.split(/\s+/)[0] || "they"} signs`}`}</small>
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
                {boxes.some((b) => b.position === i + 1 && b.kind === "signature") ? <small>{fieldCount(i + 1)} {fieldCount(i + 1) === 1 ? "field" : "fields"}</small> : <small className="miss">needs signature</small>}
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
            </div>
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
                placeholder="e.g. Rachel Wong"
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
            `${signers.length} ${signers.length === 1 ? "person signs" : "people sign"}${ccList.length ? ` · ${ccList.length} ${ccList.length === 1 ? "copy" : "copies"}` : ""}`
          ) : step === 3 ? (
            problems[3] ? <span style={{ color: "var(--fds-red-tx)" }}>{problems[3]}</span> : <span className="fds-ok">Everyone has a signature box</span>
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
          <button className="fds-btn gold lg" onClick={() => void send()} disabled={busy}>
            <Ic n="mail" s={16} w={2} />
            {busy ? "Sending…" : "Send for signing"}
          </button>
        )}
      </div>
    </div>
  );
}
