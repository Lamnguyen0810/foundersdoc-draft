"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  fmtDay,
  isoDay,
  readHolderCsv,
  schedule,
  today,
  type CompanyDocKind,
  type DocKind,
  type DocLabel,
  type EsopBatch,
  type EsopCompany,
  type EsopDocument,
  type EsopHolder,
  type EsopRun,
  type LeaverType,
  addYears,
  calcHolder,
} from "@/lib/esop/vesting";
import { buildXlsx, zip, type XSheet } from "@/lib/esop/xlsx";
import BulkUpload from "./BulkUpload";
import "./overview.css";
import { Ic, type IconName } from "./icons";
import { buildRows, fileSize, nf, shortNames, type Grant, type Row } from "./model";

/**
 * The ESOP dashboard, in Rachel's design (overview v23, 5 Nov 2026), followed
 * strictly: the dark sidebar, the summary (Active, Alumni, Next vesting, the
 * Option pool bar, Needs attention), and the Option holders register with its
 * tabs, quick filters, selection bar, row details drawer and pages of 25.
 *
 * Everything the earlier sheet did is still here, in the design's places:
 *   - editing a holder (every field, Active / Leaver): "Edit grant" in the drawer
 *   - add a holder: "Add grant"; Excel: "Export"; FD's Bulk upload
 *   - documents: download and upload in the drawer, per grant and tranche
 *   - the vesting schedule with Approve, Email for approval and Reset
 *     simulation, batch dates and Import holders (CSV): the Vesting panel,
 *     opened from Next vesting, Prepare and View all
 * New from the design: top-up grants with their own schedule, the option
 * pool, the company's own documents (ESOP rules, Resolutions, All documents),
 * download as a zip, sort, density, Batches switch, pages.
 *
 * DATA. Saves go straight to Supabase with the signed-in person's own session,
 * so row-level security (105) decides what is allowed. Without Supabase
 * (preview) changes stay on screen.
 */

type Role = "admin" | "ceo";
type Tab = "active" | "alumni";
type Section = "esop" | "letter_of_grant" | "certificate" | "esop_rules" | "resolution" | "all";
type Chip = "all" | "soon" | "behind" | "certs" | "multi" | "good" | "bad" | "unvested";
type SortKey = "name" | "vested" | "next";
type Panel = { kind: "holder"; id: string; edit?: boolean } | { kind: "vesting"; ref: string | null } | null;

interface Props {
  company: EsopCompany;
  batches: EsopBatch[];
  holders: EsopHolder[];
  documents: EsopDocument[];
  role: Role;
  viewer: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
  runs: EsopRun[];
  canApprove: boolean;
  /** simulation address (esop_companies.email_override) when on, admins only */
  simulation?: string | null;
  /** "Reset simulation" (116): only for Rachel + Lam while simulation is on; refs = approvals made in simulation */
  reset?: { to: string | null; refs: string[] } | null;
  /** "📧 Email for approval" (117): Founders Doc admins (and Rachel / Lam) */
  emailApproval?: boolean;
  focusRef: string | null;
  /** FD Sign: certificates waiting for a signature (admins), for the sidebar badge */
  signPending?: number;
}

const BUCKET = "esop-docs";
const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
const MAX_BYTES = 10 * 1024 * 1024;
const SELECT_HOLDER = "*";
const DOC_COLS = "*";
const PAGE = 25;
const ACCENT = "#F3BF4B";

const LEAVER: Record<LeaverType | "Active", [string, string]> = {
  Active: ["Active", "good"],
  Good: ["Good leaver", "good"],
  Bad: ["Bad leaver", "bad"],
  Unvested: ["Unvested", "grey"],
};
const SECTION_TITLE: Record<Exclude<Section, "esop">, string> = {
  esop_rules: "ESOP rules",
  resolution: "Resolutions",
  letter_of_grant: "Letters of Grant",
  certificate: "Option certificates",
  all: "All documents",
};
const KIND_TEXT: Record<string, string> = { letter_of_grant: "Letter of Grant", certificate: "Option certificate", esop_rules: "ESOP rules", resolution: "Resolution", other: "Document" };

export default function EsopSheet(props: Props) {
  const { company, role } = props;
  const [holders, setHolders] = useState<EsopHolder[]>(props.holders);
  const [batches, setBatches] = useState<EsopBatch[]>(props.batches);
  const [docs, setDocs] = useState<EsopDocument[]>(props.documents);
  const [runs, setRuns] = useState<EsopRun[]>(props.runs);
  const [pool, setPool] = useState<number | null>(company.option_pool ?? null);
  const [approving, setApproving] = useState("");
  const [resetting, setResetting] = useState("");
  const [emailing, setEmailing] = useState("");
  const [resettable, setResettable] = useState<string[]>(props.reset?.refs ?? []);
  const [toast, setToast] = useState("");
  /* the register */
  const [section, setSection] = useState<Section>("esop");
  const [tab, setTab] = useState<Tab>("active");
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");
  const [batch, setBatch] = useState("");
  const [useBatches, setUseBatches] = useState(true);
  const [dense, setDense] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "next", dir: 1 });
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openGrants, setOpenGrants] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<Panel>(props.focusRef ? { kind: "vesting", ref: props.focusRef } : null);
  const [docQ, setDocQ] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const upTarget = useRef<{ holder: EsopHolder | null; kind: DocKind | CompanyDocKind; tranche: number | null; label: DocLabel | null } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerRef = useRef<HTMLDivElement>(null);

  const client = useMemo(
    () => (props.supabaseUrl && props.supabaseKey ? createBrowserClient(props.supabaseUrl, props.supabaseKey) : null),
    [props.supabaseUrl, props.supabaseKey],
  );
  const now = useMemo(() => today(), []);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.batch, b])), [batches]);
  const local = client ? "" : " (preview, not stored)";

  /* "Review" and "View alumni" scroll to the register */
  const [jump, setJump] = useState(0);
  useEffect(() => {
    if (jump) registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jump]);

  /* Esc closes the drawer, as in the design */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* Shows a message; returns false so a failing step can `return say(…)`. */
  function say(text: string): false {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
    return false;
  }

  /* ── saving ─────────────────────────────────────────────────────────── */

  async function saveHolder(h: EsopHolder, patch: Partial<EsopHolder>, done = "Saved"): Promise<boolean> {
    setHolders((list) => list.map((x) => (x.id === h.id ? { ...x, ...patch } : x)));
    if (!client) {
      say(done + local);
      return true;
    }
    const { data, error } = await client.from("esop_holders").update(patch).eq("id", h.id).select("updated_at, updated_by").single();
    if (error) {
      setHolders((list) => list.map((x) => (x.id === h.id ? h : x)));
      say(/topup_|legal_name|vested_override/.test(error.message) ? "Not saved: run supabase/121_esop_overview_v23.sql first." : `Not saved: ${error.message}`);
      return false;
    }
    setHolders((list) => list.map((x) => (x.id === h.id ? { ...x, ...data } : x)));
    say(done);
    return true;
  }

  async function addGrant() {
    setSection("esop");
    setTab("active");
    setQ("");
    setChip("all");
    const draft = { name: "New holder", batch: batches.at(-1)?.batch ?? 1, options_per_tranche: 0, status: "Active" as const };
    if (!client) {
      const id = crypto.randomUUID();
      setHolders((l) => [...l, { ...draft, id, email: null, id_no: null, leaver_type: null, last_day: null, notes: null, updated_at: new Date().toISOString(), updated_by: null }]);
      setPanel({ kind: "holder", id, edit: true });
      return say("New holder added: fill in their details" + local);
    }
    const { data, error } = await client.from("esop_holders").insert({ ...draft, company_id: company.id }).select(SELECT_HOLDER).single<EsopHolder>();
    if (error || !data) return say(`Could not add a holder: ${error?.message ?? "unknown error"}`);
    setHolders((l) => [...l, data]);
    setPanel({ kind: "holder", id: data.id, edit: true });
    say("New holder added: fill in their details");
  }

  async function saveBatch(b: EsopBatch, patch: Partial<EsopBatch>) {
    setBatches((l) => l.map((x) => (x.batch === b.batch ? { ...x, ...patch } : x)));
    if (!client) return say("Saved" + local);
    const { error } = await client.from("esop_batches").update(patch).eq("company_id", company.id).eq("batch", b.batch);
    if (error) {
      setBatches((l) => l.map((x) => (x.batch === b.batch ? b : x)));
      return say(`Not saved: ${error.message}`);
    }
    say("Saved");
  }

  async function addBatch() {
    const row: EsopBatch = { batch: (batches.at(-1)?.batch ?? 0) + 1, vesting_start: null, tranches: 4, note: null };
    if (client) {
      const { error } = await client.from("esop_batches").insert({ ...row, company_id: company.id });
      if (error) return say(`Could not add batch: ${error.message}`);
    }
    setBatches((l) => [...l, row]);
    say(`Batch ${row.batch} added: type its vesting start`);
  }

  async function savePool() {
    const raw = window.prompt("Option pool size (shares)", pool ? String(pool) : "");
    if (raw === null) return;
    const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return say("Please type a whole number.");
    const before = pool;
    setPool(n);
    if (!client) return say("Saved" + local);
    const { error } = await client.from("esop_companies").update({ option_pool: n }).eq("id", company.id);
    if (error) {
      setPool(before);
      return say(/option_pool/.test(error.message) ? "Not saved: run supabase/121_esop_overview_v23.sql first." : `Not saved: ${error.message}`);
    }
    say("Option pool saved");
  }

  /* ── approval (107) ─────────────────────────────────────────────────── */

  async function approve(ref: string, certificates: number, leavers: number, again: boolean) {
    const msg = again
      ? `Send ${ref} to the automation again? Certificate numbers stay the same.`
      : `Approve ${ref}?\n\n${certificates} Option Certificate(s) and email(s) will be prepared, plus one payment link for ${certificates} certificate(s).${leavers ? ` ${leavers} leaver(s) are skipped.` : ""}${props.simulation ? `\n\nSimulation is on: every email goes to ${props.simulation}.` : ""}`;
    if (!window.confirm(msg)) return;
    if (!client) {
      setRuns((l) => [...l.filter((r) => r.ref !== ref), { ref, approved_by: props.viewer, approved_at: new Date().toISOString(), sent_at: new Date().toISOString(), payment_link: null }]);
      return say(`${ref} approved${local}`);
    }
    setApproving(ref);
    try {
      const res = await fetch("/api/esop/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: company.slug, ref }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; approved?: boolean; sent?: boolean; error?: string; approved_by?: string };
      if (out.ok || out.approved) {
        setRuns((l) => [
          ...l.filter((r) => r.ref !== ref),
          { ref, approved_by: out.approved_by ?? props.viewer, approved_at: new Date().toISOString(), sent_at: out.sent ? new Date().toISOString() : null, payment_link: null },
        ]);
      }
      say(out.ok ? `${ref} approved. Payment link, certificates and emails are on their way` : (out.error ?? "Could not approve."));
    } finally {
      setApproving("");
    }
  }

  /* ── reset a simulation (116) ───────────────────────────────────────── */

  async function resetSim(ref: string) {
    type Out = { ok?: boolean; error?: string; certificate_numbers?: number[]; numbers_restored?: boolean; next_certificate_no?: number; documents?: number; signing_requests?: number };
    const call = async (dry: boolean) => {
      const res = await fetch("/api/esop/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: company.slug, ref, dry }) });
      return (await res.json().catch(() => ({}))) as Out;
    };
    setResetting(ref);
    try {
      let p: Out = { ok: true, certificate_numbers: [], numbers_restored: false, documents: 0, signing_requests: 0 };
      if (client) {
        p = await call(true);
        if (!p.ok) return say(p.error ?? "Could not reset.");
      }
      const nums = p.certificate_numbers ?? [];
      const lines = [
        `Reset the ${ref} simulation?`,
        "",
        'This puts it back to "not approved", so you can run it again from the start:',
        `• the approval is removed`,
        nums.length
          ? `• certificate No. ${nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : nums[0]} ${p.numbers_restored ? `freed (the next certificate is No. ${p.next_certificate_no} again)` : "removed (numbers stay as they are, a later certificate uses a higher number)"}`
          : "",
        p.signing_requests ? `• ${p.signing_requests} FD Sign request(s) cancelled and removed` : "",
        p.documents ? `• ${p.documents} certificate(s) removed from the dashboard` : "",
        "",
        "Kept: holders and their details, Letters of Grant, emails already in your inbox, the test payment in Stripe.",
      ].filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "");
      if (!window.confirm(lines.join("\n"))) return;
      if (client) {
        const out = await call(false);
        if (!out.ok) return say(out.error ?? "Could not reset.");
        say(`${ref} reset${out.certificate_numbers?.length && out.numbers_restored ? ` · next certificate No. ${out.next_certificate_no}` : ""}. Reloading…`);
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      setRuns((l) => l.filter((r) => r.ref !== ref));
      setResettable((l) => l.filter((x) => x !== ref));
      say(`${ref} reset${local}`);
    } finally {
      setResetting("");
    }
  }

  /* ── approve from the email (117) ───────────────────────────────────── */

  async function emailForApproval(ref: string, certificates: number) {
    const to = props.simulation ?? "the client's contact (Aditya)";
    if (!window.confirm(`Email ${to} to approve ${ref}?\n\nThe email lists who gets a certificate (${certificates}), their options and the leavers, with one "Approve issuance of Option Certificates" button. No login needed. The link works once.`)) return;
    if (!client) return say(`Approval email for ${ref} sent${local}`);
    setEmailing(ref);
    try {
      const res = await fetch("/api/esop/approval-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: company.slug, ref }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: boolean; to?: string; link?: string; error?: string };
      if (!out.ok) return say(out.error ?? "Could not send.");
      if (out.sent) return say(`Approval email for ${ref} sent to ${out.to}`);
      if (out.link) {
        await navigator.clipboard?.writeText(out.link).catch(() => undefined);
        return say("Emails are off, so the approval link was copied instead");
      }
      say("Could not send the email.");
    } finally {
      setEmailing("");
    }
  }

  /** What can be done with one vesting: approve, send again, email for approval, reset, send for signing. */
  function approvalActions(ref: string, daysLeft: number, certificates: number, leavers: number) {
    const r = runs.find((x) => x.ref === ref);
    const resetBtn =
      props.reset && (resettable.includes(ref) || !client) ? (
        <button type="button" className="ev-link" disabled={resetting === ref} onClick={() => void resetSim(ref)} title="Put this vesting back to not approved, to try the simulation again">
          {resetting === ref ? "Resetting…" : "↺ Reset simulation"}
        </button>
      ) : null;
    const emailBtn = props.emailApproval ? (
      <button type="button" className="ev-btn sm" disabled={emailing === ref} onClick={() => void emailForApproval(ref, certificates)} title="Email the client's contact to approve from the email, no login">
        <Ic n="mail" s={13} />
        {emailing === ref ? "Sending…" : "Email for approval"}
      </button>
    ) : null;
    if (r?.sent_at)
      return (
        <span className="ev-acts">
          <span className="ev-ok" title={r.approved_at ? new Date(r.approved_at).toLocaleString("en-GB") : ""}>
            ✓ Approved{r.approved_by ? ` · ${r.approved_by.split("@")[0]}` : ""}
            {r.approved_at ? ` · ${fmtDay(r.approved_at.slice(0, 10))}` : ""}
          </span>
          {role === "admin" && certificates > 0 && (
            <a className="ev-btn sm" href={`/admin/sign?ref=${encodeURIComponent(ref)}`} title="Make the certificates and send them for signing in FD Sign">
              Send for signing
              <Ic n="chev" s={12} w={2.2} />
            </a>
          )}
          {resetBtn}
        </span>
      );
    if (r && props.canApprove)
      return (
        <span className="ev-acts">
          <button className="ev-btn sm gold" disabled={approving === ref} onClick={() => void approve(ref, certificates, leavers, true)}>
            Send again
          </button>
          {resetBtn}
        </span>
      );
    /* the button shows from 14 days before the vesting; in a simulation, admins can rehearse up to 120 days ahead */
    const early = daysLeft > 14 && !!props.simulation && daysLeft <= 120;
    if ((daysLeft > 14 && !early) || daysLeft < -60) return <span className="ev-muted">{daysLeft < -60 ? "Vested" : `Opens ${daysLeft - 14} days before`}</span>;
    if (certificates === 0) return <span className="ev-muted">No certificates</span>;
    if (!props.canApprove)
      return (
        <span className="ev-acts">
          <span className="ev-muted">Waiting for approval</span>
          {emailBtn}
        </span>
      );
    return (
      <span className="ev-acts">
        <button className="ev-btn sm gold" disabled={approving === ref} onClick={() => void approve(ref, certificates, leavers, false)}>
          {approving === ref ? "Approving…" : early ? "Approve (simulation)" : "Approve"}
        </button>
        {emailBtn}
      </span>
    );
  }

  /* ── documents ──────────────────────────────────────────────────────── */

  function pickFile(holder: EsopHolder | null, kind: DocKind | CompanyDocKind, tranche: number | null = null, label: DocLabel | null = null) {
    upTarget.current = { holder, kind, tranche, label };
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  async function upload(file: File) {
    const t = upTarget.current;
    if (!t) return;
    if (t.holder) await uploadFor(t.holder, t.kind as DocKind, file, t.tranche, t.label);
    else await uploadCompany(t.kind as CompanyDocKind, file);
  }

  /* A holder's Letter of Grant or certificate (also used by FD's Bulk upload). True when stored. */
  async function uploadFor(holder: EsopHolder, kind: DocKind, file: File, trancheIn: number | null, labelIn: DocLabel | null = null): Promise<boolean> {
    if (file.size > MAX_BYTES) return say(`${file.name} is over 10 MB.`);
    /* Bulk upload and the plain buttons pass no label: a "Supplemental" or "Amended" file name says which grant it is */
    const label: DocLabel | null = labelIn ?? (/supplemental|top[\s_-]?up/i.test(file.name) ? "Top-up" : kind === "letter_of_grant" && /amended/i.test(file.name) ? "Amended" : null);
    const certs = docs.filter((d) => d.holder_id === holder.id && d.kind === "certificate" && (label === "Top-up") === (d.label === "Top-up")).length;
    const tranche = kind === "certificate" ? (trancheIn ?? Math.min(certs + 1, 10)) : null;
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${company.id}/${holder.id}/${kind}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const fileName = file.name.slice(0, 200);
    const row = { holder_id: holder.id, kind, tranche, path, file_name: fileName, size_bytes: file.size, ...(label ? { label } : {}) };
    if (!client) {
      setDocs((l) => [...l, { id: crypto.randomUUID(), ...row, uploaded_at: new Date().toISOString() }]);
      say(`${file.name} uploaded${local}`);
      return true;
    }
    say("Uploading…");
    const up = await client.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) return say(/bucket/i.test(up.error.message) ? "File storage is not set up yet: run supabase/105." : `Upload failed: ${up.error.message}`);
    const { data, error } = await client
      .from("esop_documents")
      .insert({ company_id: company.id, ...row, uploaded_by: props.viewer })
      .select(DOC_COLS)
      .single<EsopDocument>();
    if (error || !data) return say(/label/.test(error?.message ?? "") ? "Saved the file, but its record needs supabase/121_esop_overview_v23.sql first." : `Saved the file but not its record: ${error?.message ?? "unknown error"}`);
    setDocs((l) => [...l, data]);
    say(`${file.name} uploaded`);
    return true;
  }

  /* The company's own documents (121): ESOP rules, Resolutions, other */
  async function uploadCompany(kind: CompanyDocKind, file: File): Promise<boolean> {
    if (file.size > MAX_BYTES) return say(`${file.name} is over 10 MB.`);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${company.id}/company/${kind}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const row = { holder_id: null, kind, tranche: null, path, file_name: file.name.slice(0, 200), size_bytes: file.size };
    if (!client) {
      setDocs((l) => [...l, { id: crypto.randomUUID(), ...row, uploaded_at: new Date().toISOString() }]);
      say(`${file.name} uploaded${local}`);
      return true;
    }
    say("Uploading…");
    const up = await client.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) return say(`Upload failed: ${up.error.message}`);
    const { data, error } = await client.from("esop_documents").insert({ company_id: company.id, ...row, uploaded_by: props.viewer }).select(DOC_COLS).single<EsopDocument>();
    if (error || !data) return say(/kind|holder/.test(error?.message ?? "") ? "Company documents need supabase/121_esop_overview_v23.sql first." : `Saved the file but not its record: ${error?.message ?? "unknown error"}`);
    setDocs((l) => [...l, data]);
    say(`${file.name} uploaded`);
    return true;
  }

  async function docUrl(d: EsopDocument): Promise<string | null> {
    if (d.url) return d.url;
    if (!client || !d.path) return null;
    const { data } = await client.storage.from(BUCKET).createSignedUrl(d.path, 120);
    return data?.signedUrl ?? null;
  }

  async function openDoc(d: EsopDocument) {
    if (!client && !d.url) return say("Preview: files are not stored, so there is nothing to open.");
    const u = await docUrl(d);
    if (!u) return say("Could not open the file.");
    window.open(u, "_blank", "noopener");
  }

  /* Several files as one zip ("Download all", "Download documents") */
  async function downloadZip(list: EsopDocument[], name: string) {
    if (!list.length) return say("No files to download.");
    if (!client && !list.some((d) => d.url)) return say("Preview: files are not stored, so there is nothing to download.");
    setBusy("zip");
    say(`Preparing ${list.length} file(s)…`);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const seen = new Set<string>();
      let failed = 0;
      for (const d of list) {
        const u = await docUrl(d);
        if (!u) {
          failed++;
          continue;
        }
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(String(r.status));
          const who = d.holder_id ? (holders.find((h) => h.id === d.holder_id)?.name ?? "Holder") : "Company";
          let fn = `${who.replace(/[^\w .-]+/g, "")}/${d.file_name.replace(/[\\/:*?"<>|]+/g, "_")}`;
          for (let k = 2; seen.has(fn); k++) fn = fn.replace(/(\.\w+)?$/, (m) => ` (${k})${m}`);
          seen.add(fn);
          files.push({ name: fn, data: new Uint8Array(await r.arrayBuffer()) });
        } catch {
          failed++;
        }
      }
      if (!files.length) return say("Could not fetch the files.");
      const bytes = zip(files);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }));
      a.download = `${name.replace(/[^\w]+/g, "-").replace(/-+$/, "")}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      say(`${files.length} file(s) downloaded${failed ? ` · ${failed} could not be fetched` : ""}`);
    } finally {
      setBusy("");
    }
  }

  /* ── Excel and CSV ──────────────────────────────────────────────────── */

  function downloadExcel(only?: Set<string>) {
    const docCount = (h: EsopHolder, k: DocKind) => docs.filter((d) => d.holder_id === h.id && d.kind === k).length;
    const list = only?.size ? holders.filter((h) => only.has(h.id)) : holders;
    const sheets: XSheet[] = [
      ...(["Active", "Leaver"] as const).map((st) => ({
        name: st === "Active" ? "Active" : "Alumni",
        widths: [24, 9, 14, 14, 14, 14, 12, 14, 28, 12, 12, 18, 40, 9, 14, 14, 18, 14, 12],
        rows: [
          ["Name", "Batch", "Vesting start date", "Tranche 1", "Tranche 2", "Tranche 3", "Letter of Grant", "Tranche 4", "E-mail", "Options vested", "Options unvested", "Status", "Comments", "Top up", "Option certificates", "ID no.", "Nationality", "Grant date", "Options / tranche"],
          ...list
            .filter((h) => h.status === st)
            .map((h) => {
              const c = calcHolder(h, batchMap, now);
              const tr = (n: number) => (c.start && n <= c.tranches ? fmtDay(addYears(c.start, n)) : "");
              const status = st === "Active" ? (c.vestedTranches ? `Tranche ${c.vestedTranches}` : "In progress") : `Leaver [${h.leaver_type ?? "Good"}]`;
              return [h.name, `Batch ${h.batch}`, fmtDay(c.start), tr(1), tr(2), tr(3), docCount(h, "letter_of_grant"), tr(4), h.email, c.vested, c.total - c.vested, status, h.notes, h.top_ups ? `${h.top_ups} Top Up` : "", docCount(h, "certificate"), h.id_no, h.nationality, h.grant_date ? fmtDay(h.grant_date) : "", h.options_per_tranche];
            }),
        ],
      })),
      {
        name: "Vesting schedule",
        widths: [14, 8, 9, 16, 10, 12],
        rows: [["Vesting date", "Batch", "Tranche", "Certificates due", "Leavers", "Status"], ...schedule(holders, batches, now).map((r) => [fmtDay(r.date), r.batch, `T${r.tranche}`, r.certificates, r.leavers, statusOf(r.daysLeft)])],
      },
    ];
    const bytes = buildXlsx(sheets);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${company.name.replace(/[^\w]+/g, "-").replace(/-+$/, "")}-ESOP-${isoDay(now)}${only?.size ? `-${only.size}-selected` : ""}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importCsv(file: File) {
    const { rows, problems } = readHolderCsv(await file.text());
    if (!rows.length) return say(problems[0] ?? "Nothing to import.");
    if (!window.confirm(`Add ${rows.length} holder(s) from ${file.name}?${problems.length ? ` ${problems.length} row(s) will be skipped.` : ""}`)) return;
    if (!client) {
      setHolders((l) => [...l, ...rows.map((r) => ({ ...r, id: crypto.randomUUID(), notes: null, updated_at: new Date().toISOString(), updated_by: null }))]);
      return say(`${rows.length} added${local}`);
    }
    const { data, error } = await client.from("esop_holders").insert(rows.map((r) => ({ ...r, company_id: company.id }))).select(SELECT_HOLDER);
    if (error) return say(`Import failed, nothing added: ${error.message}`);
    setHolders((l) => [...l, ...((data ?? []) as EsopHolder[])]);
    const missing = [...new Set(rows.map((r) => r.batch))].filter((b) => !batchMap.has(b));
    say(`${data?.length ?? 0} added${missing.length ? `: add batch ${missing.join(", ")} in the Vesting panel` : ""}`);
  }

  /* ── figures ────────────────────────────────────────────────────────── */

  const rows = useMemo(() => buildRows(holders, docs, batchMap, now), [holders, docs, batchMap, now]);
  const activeR = rows.filter((r) => r.active);
  const alumniR = rows.filter((r) => !r.active);
  const sched = useMemo(() => schedule(holders, batches, now), [holders, batches, now]);
  const nx = sched.find((r) => r.daysLeft >= 0) ?? null;
  const nxRef = nx ? `B${nx.batch}-T${nx.tranche}` : null;
  const nxPeople = nx ? activeR.filter((r) => r.h.batch === nx.batch) : [];
  const vestedSum = activeR.reduce((s, r) => s + r.c.vested, 0);
  const grantedSum = activeR.reduce((s, r) => s + r.c.total, 0);
  const unvestedSum = grantedSum - vestedSum;
  const goodSum = alumniR.filter((r) => r.h.leaver_type !== "Bad").reduce((s, r) => s + r.c.kept, 0);
  const available = pool !== null ? Math.max(0, pool - vestedSum - unvestedSum - goodSum) : null;
  const pctOf = (n: number) => (pool ? `${Math.min(100, (n / pool) * 100).toFixed(1)}%` : "0%");
  const noLetterN = activeR.filter((r) => r.noLetter).length;
  const certN = activeR.filter((r) => r.certMissing).length;
  const topMissing = rows.filter((r) => r.topMissing);
  const updated = holders.reduce((a, h) => (h.updated_at > a ? h.updated_at : a), "");
  const batchOptions = [...new Set(activeR.map((r) => r.h.batch))].sort((a, b) => a - b);

  /* Needs attention: only what applies today */
  const tasks: Array<{ title: string; sub: string; action: string; gold?: boolean; go: () => void; href?: string }> = [];
  if (nx && nxRef && nx.daysLeft <= 30 && nx.certificates > 0) {
    const run = runs.find((r) => r.ref === nxRef);
    if (!run?.sent_at)
      tasks.push({
        title: `Prepare ${nx.certificates} vesting ${nx.certificates === 1 ? "certificate" : "certificates"}`,
        sub: `${useBatches ? `Batch ${nx.batch}` : shortNames(nxPeople.map((r) => r.known ?? r.display))} · vests ${fmtDay(nx.date)}`,
        action: "Prepare",
        gold: true,
        go: () => setPanel({ kind: "vesting", ref: nxRef }),
      });
    else if (role === "admin")
      tasks.push({ title: `Send ${nx.certificates} certificates for signing`, sub: `${nxRef} approved · vests ${fmtDay(nx.date)}`, action: "Open", gold: true, go: () => undefined, href: `/admin/sign?ref=${encodeURIComponent(nxRef)}` });
  }
  const behindN = activeR.filter((r) => r.behind).length;
  if (behindN) tasks.push({ title: "Update vested figures", sub: `${behindN} people are behind their schedule`, action: "Review", go: () => goActive("behind") });
  if (topMissing.length)
    tasks.push({ title: "Record top-up schedules", sub: `${topMissing.slice(0, 3).map((r) => r.known?.split(/\s+/)[0] ?? r.h.name.split(/\s+/)[0]).join(", ")}${topMissing.length > 3 ? ` + ${topMissing.length - 3} more` : ""} · no dates on file`, action: "Review", go: () => goActive("multi") });
  if (certN) tasks.push({ title: "Add missing option certificates", sub: `${certN} ${certN === 1 ? "person" : "people"} · latest tranche not on file`, action: "Review", go: () => goActive("certs") });
  if (noLetterN) {
    const first = activeR.find((r) => r.noLetter)!;
    tasks.push({ title: "Add missing Letters of Grant", sub: `${noLetterN} ${noLetterN === 1 ? "person" : "people"} · no Letter of Grant on file`, action: "Review", go: () => setPanel({ kind: "holder", id: first.h.id }) });
  }

  function goActive(view: Chip) {
    setSection("esop");
    setTab("active");
    setChip(view);
    setPage(0);
    setSort({ key: "next", dir: 1 });
    setJump((n) => n + 1);
  }

  /* the register: tab → search and batch → quick filter → sort → page */
  const base = (tab === "active" ? activeR : alumniR).filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && !(r.h.name.toLowerCase().includes(s) || r.display.toLowerCase().includes(s) || (r.known ?? "").toLowerCase().includes(s) || (r.h.email ?? "").toLowerCase().includes(s))) return false;
    if (tab === "active" && useBatches && batch && String(r.h.batch) !== batch) return false;
    return true;
  });
  const chipDefs: Array<[Chip, string, (r: Row) => boolean]> =
    tab === "active"
      ? [
          ["all", "All", () => true],
          ["soon", "Vesting in 30 days", (r) => r.soon],
          ["behind", "Behind schedule", (r) => r.behind],
          ["certs", "Missing certificates", (r) => r.certMissing],
          ["multi", "Multiple grants", (r) => r.multi],
        ]
      : [
          ["all", "All", () => true],
          ["good", "Good leaver", (r) => r.h.leaver_type === "Good" || !r.h.leaver_type],
          ["bad", "Bad leaver", (r) => r.h.leaver_type === "Bad"],
          ["unvested", "Unvested", (r) => r.h.leaver_type === "Unvested"],
        ];
  const chipNow = chipDefs.some((c) => c[0] === chip) ? chip : "all";
  const filtered = base.filter(chipDefs.find((c) => c[0] === chipNow)![2]);
  const sortKey: SortKey = tab === "alumni" && sort.key === "next" ? "name" : sort.key;
  const nextOf = (r: Row) => (r.c.next ? Date.parse(r.c.next) : 8.64e15);
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    name: (a, b) => a.display.localeCompare(b.display),
    vested: (a, b) => a.pct - b.pct || a.display.localeCompare(b.display),
    next: (a, b) => nextOf(a) - nextOf(b) || a.display.localeCompare(b.display),
  };
  const sorted = [...filtered].sort((a, b) => sort.dir * cmp[sortKey](a, b));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE));
  const pg = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(pg * PAGE, pg * PAGE + PAGE);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => picked.has(r.h.id));
  const sortBy = (key: SortKey) => () => {
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }));
    setPage(0);
  };
  const arrow = (key: SortKey) => (sortKey === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");
  const showBatchCol = tab === "active" && useBatches;
  const pickedRows = rows.filter((r) => picked.has(r.h.id));
  const tint = new Map(rows.map((r, i) => [r.h.id, i % 3]));

  function switchTab(t: Tab) {
    setTab(t);
    setChip("all");
    setPage(0);
    setSort({ key: t === "active" ? "next" : "name", dir: 1 });
    setPicked(new Set());
  }
  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /* "Prepare certificates" for the selected: their earliest vesting, in the Vesting panel */
  function prepareSelected() {
    const due = pickedRows
      .filter((r) => r.active && r.c.next)
      .map((r) => ({ ref: `B${r.h.batch}-T${r.c.vestedTranches + 1}`, date: r.c.next! }))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!due) return say("None of them has a vesting coming up.");
    setPanel({ kind: "vesting", ref: due.ref });
  }

  const sel = panel?.kind === "holder" ? (rows.find((r) => r.h.id === panel.id) ?? null) : null;
  const simTo = props.reset?.to ?? props.simulation ?? null;

  /* ── layout ─────────────────────────────────────────────────────────── */

  const nav = (s: Section | "overview", icon: IconName, label: string) => {
    const on = s === "overview" ? false : section === s;
    return (
      <a
        href={s === "esop" || s === "overview" ? "#top" : `#${s}`}
        aria-current={on ? "page" : undefined}
        className={`ev-nav ${on ? "on" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          setSection(s === "overview" ? "esop" : s);
          setPanel(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <Ic n={icon} />
        {label}
      </a>
    );
  };

  return (
    <div className="esop ev" id="top">
      <div className="ev-top">
        <a href="#top" className="ev-brand" aria-label={`${company.name} ESOP, by Founders Doc`} onClick={(e) => (e.preventDefault(), setSection("esop"), setPanel(null))}>
          <span className="ev-fd">Founders Doc</span>
          <span className="ev-vr" aria-hidden="true" />
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small static logo from public/
            <img src={company.logo_url} alt={company.name} />
          ) : (
            <b>{company.name}</b>
          )}
        </a>
        <div className="ev-me">
          <a href="mailto:legal@foundersdoc.com?subject=ESOP%20dashboard">Help</a>
          <span className="ev-av" aria-hidden="true">
            {role === "admin" ? "FD" : (props.viewer[0] ?? "C").toUpperCase()}
          </span>
        </div>
      </div>

      <div className="ev-body">
        <aside className="ev-side">
          <nav aria-label="Main" className="ev-navs">
            <div className="ev-grp">
              <div className="ev-h">Company</div>
              {nav("overview", "overview", "Overview")}
              {nav("esop", "esop", "ESOP")}
            </div>
            <div className="ev-grp">
              <div className="ev-h">Documents</div>
              {nav("esop_rules", "rules", "ESOP rules")}
              {nav("resolution", "resolutions", "Resolutions")}
              {nav("letter_of_grant", "letters", "Letters of Grant")}
              {nav("certificate", "certs", "Option certificates")}
              {nav("all", "folder", "All documents")}
            </div>
            <div className="ev-grp">
              <div className="ev-h">Tools</div>
              <a className="ev-nav" href={role === "admin" ? "/admin/sign" : "/fd-sign"}>
                <Ic n="sign" />
                <span style={{ flex: 1 }}>FD Sign</span>
                {role === "admin" && (props.signPending ?? 0) > 0 && <span className="ev-badge">{props.signPending}</span>}
              </a>
              <Link className="ev-nav" href="/draft">
                <Ic n="ai" />
                FD AI
              </Link>
            </div>
          </nav>
          <div className="ev-foot">
            <a className="ev-nav" href="/settings">
              <Ic n="settings" />
              Settings
            </a>
            <div className="ev-user">
              <div className="ev-uav" aria-hidden="true">
                {role === "admin" ? "FD" : (props.viewer[0] ?? "C").toUpperCase()}
              </div>
              <div className="ev-uname">
                <span>{role === "admin" ? "Founders Doc Legal" : props.viewer}</span>
                <span>{role === "admin" ? "Administrator" : `${company.name} access`}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="ev-main">
          <div className="ev-wrap">
            {section === "esop" ? (
              <>
                <header className="ev-title">
                  <h1>{company.name.replace(/\s*\(TEST\)\s*$/i, "")} ESOP</h1>
                  <span>Updated {fmtDay((updated || isoDay(now)).slice(0, 10))} · maintained by Founders Doc</span>
                </header>

                <section aria-label="Summary" className="ev-summary">
                  <div className="ev-left">
                    <div className="ev-cards">
                      <div className="ev-card">
                        <div className="ev-k">Active</div>
                        <div className="ev-n">{activeR.length}</div>
                        {noLetterN === 0 ? (
                          <div className="ev-okline">
                            <Ic n="check" s={12} w={2.8} />
                            All letters on file
                          </div>
                        ) : (
                          <button className="ev-warnline" onClick={() => setPanel({ kind: "holder", id: activeR.find((r) => r.noLetter)!.h.id })}>
                            {noLetterN} without a Letter of Grant
                          </button>
                        )}
                      </div>
                      <div className="ev-card">
                        <div className="ev-k">Alumni</div>
                        <div className="ev-n">{alumniR.length}</div>
                        <button
                          className="ev-more"
                          onClick={() => {
                            switchTab("alumni");
                            setJump((n) => n + 1);
                          }}
                        >
                          View alumni →
                        </button>
                      </div>
                      <button className="ev-card ev-next" onClick={() => setPanel({ kind: "vesting", ref: nxRef })} aria-label="Next vesting: open the vesting schedule">
                        <div className="ev-nh">
                          <span>Next vesting</span>
                          <span>{nx ? `${nx.daysLeft} ${nx.daysLeft === 1 ? "day" : "days"}` : ""}</span>
                        </div>
                        <div className="ev-nd">{nx ? fmtDay(nx.date) : "None scheduled"}</div>
                        <div className="ev-nw">{nx ? `${useBatches ? `Batch ${nx.batch} · ` : ""}${shortNames(nxPeople.map((r) => r.known ?? r.display)) || "no active holders"}` : "Add batch dates in the Vesting panel"}</div>
                      </button>
                    </div>

                    <div className="ev-card ev-pool">
                      <div className="ev-poolh">
                        <span>
                          Option pool ·{" "}
                          {pool !== null ? (
                            <>
                              <b>{nf(pool)}</b> shares
                            </>
                          ) : (
                            "not set"
                          )}
                          {role === "admin" && (
                            <button className="ev-link" onClick={() => void savePool()}>
                              {pool !== null ? "Edit" : "Set pool size"}
                            </button>
                          )}
                        </span>
                        {pool !== null && available !== null && (
                          <span>
                            <b>{Math.round((available / Math.max(pool, 1)) * 100)}%</b> available to grant
                          </span>
                        )}
                      </div>
                      <div
                        className="ev-bar"
                        role="img"
                        aria-label={`Pool of ${pool !== null ? nf(pool) : "unknown size"}: ${nf(vestedSum)} vested, ${nf(unvestedSum)} unvested, ${nf(goodSum)} held by good leavers${available !== null ? `, ${nf(available)} available to grant` : ""}`}
                      >
                        {pool ? (
                          <>
                            <div style={{ width: pctOf(vestedSum), background: "#161616" }} />
                            <div style={{ width: pctOf(unvestedSum), background: ACCENT }} />
                            <div style={{ width: pctOf(goodSum), background: "#A3A39C" }} />
                            <div className="ev-avail" />
                          </>
                        ) : (
                          <>
                            <div style={{ flex: Math.max(vestedSum, 1), background: "#161616" }} />
                            <div style={{ flex: Math.max(unvestedSum, 0), background: ACCENT }} />
                            <div style={{ flex: Math.max(goodSum, 0), background: "#A3A39C" }} />
                          </>
                        )}
                      </div>
                      <div className="ev-legend">
                        {(
                          [
                            ["Vested", vestedSum, "#161616"],
                            ["Unvested", unvestedSum, ACCENT],
                            ["Good leavers", goodSum, "#A3A39C"],
                            ["Available", available, ""],
                          ] as Array<[string, number | null, string]>
                        ).map(([l, v, c]) => (
                          <div key={l}>
                            <span className="ev-lk">
                              <span className={`ev-sw ${c ? "" : "dash"}`} style={c ? { background: c } : undefined} aria-hidden="true" />
                              {l}
                            </span>
                            <span className="ev-lval">{v === null ? "–" : nf(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="ev-poolf">
                        {nf(grantedSum)} granted to active holders · {grantedSum ? Math.round((vestedSum / grantedSum) * 100) : 0}% of those vested · exercised: not recorded
                      </div>
                    </div>
                  </div>

                  <div className="ev-card ev-attn" role="region" aria-label="Needs attention">
                    <div className="ev-attnh">
                      <h2>
                        Needs attention <span className="ev-badge">{tasks.length}</span>
                      </h2>
                      <button className="ev-more" onClick={() => setPanel({ kind: "vesting", ref: null })}>
                        View all →
                      </button>
                    </div>
                    {tasks.length === 0 && <div className="ev-none">Nothing needs attention. Everything is on file.</div>}
                    {tasks.slice(0, 4).map((t, i) => (
                      <div key={t.title} className={`ev-task ${t.gold ? "gold" : ""}`}>
                        <span className="ev-tn" aria-hidden="true">
                          {i + 1}
                        </span>
                        <div className="ev-tt">
                          <div>{t.title}</div>
                          <div>{t.sub}</div>
                        </div>
                        {t.href ? (
                          <a className={`ev-tb ${t.gold ? "gold" : ""}`} href={t.href}>
                            {t.action}
                          </a>
                        ) : (
                          <button className={`ev-tb ${t.gold ? "gold" : ""}`} onClick={t.go}>
                            {t.action}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="ev-oh" ref={registerRef}>
                  <h2>Option holders</h2>
                  <div className="ev-ohb">
                    <button className="ev-btn" onClick={() => downloadExcel()}>
                      <Ic n="download" />
                      Export
                    </button>
                    {role === "admin" && (
                      <BulkUpload holders={holders} docs={docs} onUpload={uploadFor} className="ev-btn">
                        <Ic n="upload" />
                        Bulk upload
                      </BulkUpload>
                    )}
                    <button className="ev-btn gold" onClick={() => void addGrant()}>
                      <Ic n="plus" w={2.2} />
                      Add grant
                    </button>
                  </div>
                </div>

                <section className="ev-reg">
                  <div className="ev-regbar">
                    <div role="tablist" aria-label="Register views" className="ev-tabs">
                      {(["active", "alumni"] as Tab[]).map((t) => (
                        <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => switchTab(t)}>
                          {t === "active" ? "Active" : "Alumni"} <span>{t === "active" ? activeR.length : alumniR.length}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ev-tools">
                      <label className="ev-search">
                        <Ic n="search" w={2} />
                        <span className="ev-sr">Search name or email</span>
                        <input
                          type="search"
                          placeholder="Search name or email"
                          value={q}
                          onChange={(e) => {
                            setQ(e.target.value);
                            setPage(0);
                          }}
                        />
                      </label>
                      {tab === "active" && useBatches && (
                        <label className="ev-select">
                          <span className="ev-sr">Filter by batch</span>
                          <select
                            value={batch}
                            onChange={(e) => {
                              setBatch(e.target.value);
                              setPage(0);
                            }}
                          >
                            <option value="">All batches</option>
                            {batchOptions.map((b) => (
                              <option key={b} value={String(b)}>
                                Batch {b}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div role="group" aria-label="Row density" className="ev-dens">
                        <button onClick={() => setDense(false)} aria-pressed={!dense} aria-label="Comfortable rows" className={!dense ? "on" : ""}>
                          <Ic n="comfy" s={16} w={2} />
                        </button>
                        <button onClick={() => setDense(true)} aria-pressed={dense} aria-label="Compact rows" className={dense ? "on" : ""}>
                          <Ic n="compact" s={16} w={2} />
                        </button>
                      </div>
                      <button
                        role="switch"
                        aria-checked={useBatches}
                        className={`ev-switch ${useBatches ? "on" : ""}`}
                        onClick={() => {
                          setUseBatches((v) => !v);
                          setPage(0);
                        }}
                      >
                        Batches
                        <span aria-hidden="true">
                          <span />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div role="group" aria-label="Quick filters" className="ev-chips">
                    {chipDefs.map(([key, label, fn]) => (
                      <button
                        key={key}
                        aria-pressed={chipNow === key}
                        className={chipNow === key ? "on" : ""}
                        onClick={() => {
                          setChip(key);
                          setPage(0);
                        }}
                      >
                        {label} <span>{base.filter(fn).length}</span>
                      </button>
                    ))}
                  </div>

                  {picked.size > 0 && (
                    <div className="ev-selbar">
                      <span>{picked.size} selected</span>
                      <span style={{ flex: 1 }} />
                      {tab === "active" && (
                        <button className="gold" onClick={prepareSelected}>
                          Prepare certificates
                        </button>
                      )}
                      <button disabled={busy === "zip"} onClick={() => void downloadZip(docs.filter((d) => d.holder_id && picked.has(d.holder_id)), `${company.name}-ESOP-documents`)}>
                        Download documents
                      </button>
                      <button onClick={() => downloadExcel(picked)}>Export</button>
                      <button className="clear" onClick={() => setPicked(new Set())}>
                        Clear
                      </button>
                    </div>
                  )}

                  <div className="ev-tablewrap">
                    <table className={`ev-table ${dense ? "dense" : ""}`}>
                      <thead>
                        <tr>
                          <th className="ev-cb">
                            <input
                              type="checkbox"
                              aria-label="Select all on this page"
                              checked={allChecked}
                              onChange={() =>
                                setPicked((s) => {
                                  const n = new Set(s);
                                  pageRows.forEach((r) => (allChecked ? n.delete(r.h.id) : n.add(r.h.id)));
                                  return n;
                                })
                              }
                            />
                          </th>
                          <th>
                            <button className={sortKey === "name" ? "on" : ""} onClick={sortBy("name")}>
                              Name{arrow("name")}
                            </button>
                          </th>
                          {tab === "alumni" && <th>Leaver</th>}
                          <th>
                            <button className={sortKey === "vested" ? "on" : ""} onClick={sortBy("vested")}>
                              Vested{arrow("vested")}
                            </button>
                          </th>
                          {tab === "active" && (
                            <th>
                              <button className={sortKey === "next" ? "on" : ""} onClick={sortBy("next")}>
                                Next vest{arrow("next")}
                              </button>
                            </th>
                          )}
                          <th>Documents</th>
                          {showBatchCol && <th>Batch</th>}
                          <th className="ev-go">
                            <span className="ev-sr">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="ev-empty">
                              No one matches these filters.
                            </td>
                          </tr>
                        )}
                        {pageRows.map((r, idx) => {
                          const expanded = r.multi && (openGrants[r.h.id] ?? false);
                          const lv = LEAVER[r.active ? "Active" : (r.h.leaver_type ?? "Good")];
                          const open = () => setPanel({ kind: "holder", id: r.h.id });
                          return (
                            <RowBlock key={r.h.id}>
                              <tr className={r.soon ? "soon" : ""}>
                                <td className="ev-cb">
                                  <input type="checkbox" aria-label={`Select ${r.display}`} checked={picked.has(r.h.id)} onChange={() => togglePick(r.h.id)} />
                                </td>
                                <td>
                                  <div className="ev-namecell">
                                    <button className="ev-name" onClick={open}>
                                      {!dense && (
                                        <span className={`ev-ini t${tint.get(r.h.id) ?? idx % 3}`} aria-hidden="true">
                                          {r.initials}
                                        </span>
                                      )}
                                      <span className="ev-nm">
                                        <span>{r.display}</span>
                                        {!dense && (
                                          <span className="ev-sum">
                                            <span className={`ev-tick ${r.noLetter ? "no" : ""}`} aria-hidden="true">
                                              {r.noLetter ? "!" : <Ic n="check" s={9} w={3.6} />}
                                            </span>
                                            {r.multi ? "Original + top-up" : "1 grant"} · since {r.since}
                                            {r.topMissing ? " · top-up dates missing" : ""}
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                    {r.multi && (
                                      <button
                                        className="ev-pill"
                                        aria-expanded={expanded}
                                        aria-label={`Show both grants for ${r.display}`}
                                        onClick={() => setOpenGrants((o) => ({ ...o, [r.h.id]: !expanded }))}
                                      >
                                        {r.grants.length} grants
                                        <Ic n={expanded ? "up" : "down"} s={11} w={2.6} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {tab === "alumni" && (
                                  <td>
                                    <span className={`ev-lv ${lv[1]}`}>{lv[0]}</span>
                                  </td>
                                )}
                                <td>
                                  <div className="ev-vest">
                                    <div className="ev-vbar" aria-hidden="true">
                                      <div style={{ width: `${r.pct}%` }} />
                                    </div>
                                    <b>{r.granted ? `${r.pct}%` : "—"}</b>
                                    {r.behind && <span className="ev-dot amber" title="Register behind schedule" />}
                                  </div>
                                  <div className="ev-sub">{r.granted ? `${nf(r.vested)} of ${nf(r.granted)} options` : "No options recorded"}</div>
                                </td>
                                {tab === "active" && (
                                  <td>
                                    <div className="ev-nextc">
                                      {r.soon && <span className="ev-dot gold" aria-hidden="true" />}
                                      <span>{r.c.next ? fmtDay(r.c.next) : "Fully vested"}</span>
                                    </div>
                                    <div className={`ev-sub ${r.soon ? "soon" : ""}`}>{r.soon ? `In ${r.c.daysToNext} ${r.c.daysToNext === 1 ? "day" : "days"}` : r.c.next ? `Tranche ${r.c.vestedTranches + 1}` : ""}</div>
                                  </td>
                                )}
                                <td>
                                  <button
                                    className={`ev-files ${r.files ? "" : "none"}`}
                                    onClick={open}
                                    aria-label={`Files for ${r.display}: ${r.letters.length} Letter${r.letters.length === 1 ? "" : "s"} of Grant, ${r.certs.length} certificate${r.certs.length === 1 ? "" : "s"}${r.noLetter ? ". No Letter of Grant on file" : r.certMissing ? `. Tranche ${r.grants[0].certDue} certificate due` : ""}`}
                                  >
                                    <Ic n="folder" />
                                    Files <span className="ev-fc">{r.files}</span>
                                    {(r.noLetter || r.certMissing) && <span className={`ev-flag ${r.noLetter ? "red" : ""}`} aria-hidden="true" />}
                                  </button>
                                </td>
                                {showBatchCol && <td className="ev-batch">B{r.h.batch}</td>}
                                <td className="ev-go">
                                  <button onClick={open} aria-label={`Open details for ${r.display}`}>
                                    <Ic n="chev" s={16} w={2} />
                                  </button>
                                </td>
                              </tr>
                              {expanded &&
                                r.grants.map((g) => (
                                  <tr key={g.title} className="ev-grow">
                                    <td />
                                    <td className="ev-gname">
                                      <div>{g.title}</div>
                                      <div className={g.known ? "" : "warn"}>{g.sub}</div>
                                    </td>
                                    {tab === "alumni" && <td />}
                                    <td>
                                      {g.known && !r.active && <span className="ev-sub">Original schedule</span>}
                                      {g.known && r.active && (
                                        <div className="ev-vest sm">
                                          <div className="ev-vbar sm" aria-hidden="true">
                                            <div style={{ width: `${(g.done / Math.max(g.tranches.length, 1)) * 100}%` }} />
                                          </div>
                                          <span>{Math.round((g.done / Math.max(g.tranches.length, 1)) * 100)}% by schedule</span>
                                        </div>
                                      )}
                                      {!g.known && <span className="ev-unk">Schedule not recorded</span>}
                                    </td>
                                    {tab === "active" && <td className="ev-gnext">{g.next ? fmtDay(g.next) : g.known ? "Fully vested" : "—"}</td>}
                                    <td className="ev-gdocs">
                                      {g.letters.length ? "Letter" : "No letter"}
                                      {g.certs.length ? ` · ${g.certs.map((c) => `T${c.tranche}`).join(", ")}` : " · no certificates"}
                                      {g.certDue && <b> · T{g.certDue} due</b>}
                                    </td>
                                    {showBatchCol && <td />}
                                    <td />
                                  </tr>
                                ))}
                            </RowBlock>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="ev-regf">
                    <span className="ev-leg">
                      Showing {sorted.length ? `${pg * PAGE + 1}–${pg * PAGE + pageRows.length} of ${sorted.length}` : "0 of 0"}
                      <span>
                        <span className="ev-dot amber2" aria-hidden="true" />
                        Certificate due
                      </span>
                      <span>
                        <span className="ev-dot red" aria-hidden="true" />
                        No Letter of Grant
                      </span>
                      <span>Open Files to download</span>
                    </span>
                    <div className="ev-pages">
                      <button onClick={() => setPage(Math.max(0, pg - 1))} disabled={pg === 0} aria-label="Previous page">
                        <Ic n="back" s={14} w={2.2} />
                      </button>
                      <span>
                        Page {pg + 1} of {pageCount}
                      </span>
                      <button onClick={() => setPage(Math.min(pageCount - 1, pg + 1))} disabled={pg >= pageCount - 1} aria-label="Next page">
                        <Ic n="chev" s={14} w={2.2} />
                      </button>
                    </div>
                  </div>
                </section>
                <p className="ev-note">
                  {/test/i.test(company.name) || !client ? "Test data · placeholder names and option numbers · " : ""}
                  {client ? "changes save automatically" : "preview: changes are not stored"}
                </p>
              </>
            ) : (
              <DocsPage
                section={section}
                docs={docs}
                holders={holders}
                q={docQ}
                setQ={setDocQ}
                busy={busy === "zip"}
                onOpen={(d) => void openDoc(d)}
                onUpload={(k) => pickFile(null, k)}
                onZip={(list, name) => void downloadZip(list, name)}
                onHolder={(id) => setPanel({ kind: "holder", id })}
              />
            )}
          </div>
        </main>
      </div>

      {panel && (
        <>
          <button className="ev-scrim" onClick={() => setPanel(null)} aria-label="Close details" />
          {panel.kind === "holder" && sel && (
            <HolderDrawer
              key={sel.h.id + (panel.edit ? ":e" : "")}
              r={sel}
              role={role}
              batches={batches}
              useBatches={useBatches}
              editing={!!panel.edit}
              busy={busy === "zip"}
              live={!!client}
              onEdit={(on) => setPanel({ kind: "holder", id: sel.h.id, edit: on })}
              onClose={() => setPanel(null)}
              onSave={(patch, msg) => saveHolder(sel.h, patch, msg)}
              onOpen={(d) => void openDoc(d)}
              onUpload={(kind, tranche, label) => pickFile(sel.h, kind, tranche, label)}
              onZip={() => void downloadZip([...sel.letters, ...sel.certs], `${sel.display}-ESOP-documents`)}
              onVesting={(ref) => setPanel({ kind: "vesting", ref })}
              say={say}
            />
          )}
          {panel.kind === "vesting" && (
            <div role="dialog" aria-modal="true" aria-label="Vesting schedule" className="ev-drawer">
              <div className="ev-dh">
                <div className="ev-dhr">
                  <span className="ev-dav" aria-hidden="true">
                    <Ic n="esop" s={20} w={2} />
                  </span>
                  <div className="ev-dht">
                    <h2>{panel.ref ? `Batch ${panel.ref.split("-T")[0].slice(1)} · Tranche ${panel.ref.split("-T")[1]}` : "Vesting schedule"}</h2>
                    <span>
                      {panel.ref
                        ? (() => {
                            const x = sched.find((s) => `B${s.batch}-T${s.tranche}` === panel.ref);
                            return x ? `Vests ${fmtDay(x.date)}${x.daysLeft >= 0 ? ` · in ${x.daysLeft} days` : ""}` : "";
                          })()
                        : `${tasks.length} ${tasks.length === 1 ? "thing needs" : "things need"} attention · ${sched.filter((s) => s.daysLeft >= 0).length} vestings to come`}
                    </span>
                  </div>
                  <button className="ev-x" onClick={() => setPanel(null)} aria-label="Close">
                    <Ic n="close" s={16} w={2} />
                  </button>
                </div>
              </div>
              <div className="ev-dbody">
                {simTo && (
                  <div className="ev-simbar">
                    🧪 <b>Simulation is on</b>: every email goes to {simTo}. After a try, press <b>↺ Reset simulation</b> to start that vesting again.
                  </div>
                )}
                {panel.ref &&
                  (() => {
                    const x = sched.find((s) => `B${s.batch}-T${s.tranche}` === panel.ref);
                    if (!x) return <div className="ev-sub">This vesting is not in the schedule. Check the batch dates below.</div>;
                    const who = activeR.filter((r) => r.h.batch === x.batch);
                    const gone = alumniR.filter((r) => r.h.batch === x.batch);
                    return (
                      <>
                        <div className="ev-stats">
                          <div>
                            <span>Certificates</span>
                            <b>{x.certificates}</b>
                          </div>
                          <div>
                            <span>Options</span>
                            <b>{nf(who.reduce((s, r) => s + (r.h.options_per_tranche || 0), 0))}</b>
                          </div>
                          <div>
                            <span>Leavers skipped</span>
                            <b>{x.leavers}</b>
                          </div>
                        </div>
                        <div className="ev-sec">
                          <h3>Who gets a certificate</h3>
                          {who.length === 0 && <div className="ev-sub">No active holders in this batch.</div>}
                          {who.map((r) => (
                            <button key={r.h.id} className="ev-li" onClick={() => setPanel({ kind: "holder", id: r.h.id })}>
                              <span className={`ev-ini sm t${0}`}>{r.initials}</span>
                              <span style={{ flex: 1 }}>{r.display}</span>
                              <span className="ev-sub">{nf(r.h.options_per_tranche)} options</span>
                            </button>
                          ))}
                          {gone.length > 0 && <div className="ev-sub">Leavers in this batch (no certificate): {gone.map((r) => r.display).join(", ")}</div>}
                        </div>
                        <div className="ev-prep">{approvalActions(panel.ref, x.daysLeft, x.certificates, x.leavers)}</div>
                      </>
                    );
                  })()}

                {!panel.ref && tasks.length > 0 && (
                  <div className="ev-sec">
                    <h3>Needs attention</h3>
                    {tasks.map((t, i) => (
                      <div key={t.title} className={`ev-task ${t.gold ? "gold" : ""}`}>
                        <span className="ev-tn">{i + 1}</span>
                        <div className="ev-tt">
                          <div>{t.title}</div>
                          <div>{t.sub}</div>
                        </div>
                        {t.href ? (
                          <a className={`ev-tb ${t.gold ? "gold" : ""}`} href={t.href}>
                            {t.action}
                          </a>
                        ) : (
                          <button
                            className={`ev-tb ${t.gold ? "gold" : ""}`}
                            onClick={() => {
                              if (t.action === "Review") setPanel(null);
                              t.go();
                            }}
                          >
                            {t.action}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="ev-sec">
                  <h3>All vestings</h3>
                  <div className="ev-vtable">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Batch</th>
                          <th>Certificates</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sched
                          .filter((s) => s.daysLeft >= -60)
                          .map((s) => {
                            const ref = `B${s.batch}-T${s.tranche}`;
                            const st = statusOf(s.daysLeft);
                            return (
                              <tr key={ref} className={`${panel.ref === ref ? "on" : ""} ${st === "This week" ? "soon" : ""}`} onClick={() => setPanel({ kind: "vesting", ref })}>
                                <td>{fmtDay(s.date)}</td>
                                <td>
                                  B{s.batch} · T{s.tranche}
                                </td>
                                <td>
                                  {s.certificates}
                                  {s.leavers ? <span className="ev-muted"> · {s.leavers} {s.leavers === 1 ? "leaver" : "leavers"}</span> : ""}
                                </td>
                                <td>
                                  {runs.find((x) => x.ref === ref)?.sent_at ? <span className="ev-ok">✓ Approved</span> : st === "Upcoming" || st === "Vested" ? <span className="ev-muted">{st}</span> : <span className="ev-tag">{st}</span>}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {role === "admin" && (
                  <div className="ev-sec">
                    <h3>Batch dates · Founders Doc only</h3>
                    <div className="ev-sub">Tranche 1 vests one year after the vesting start, then once a year.</div>
                    {batches.map((b) => (
                      <div key={b.batch} className="ev-batchrow">
                        <b>Batch {b.batch}</b>
                        <label>
                          Vesting start
                          <input type="date" defaultValue={b.vesting_start ?? ""} key={`${b.batch}:${b.vesting_start}`} onBlur={(e) => e.target.value !== (b.vesting_start ?? "") && void saveBatch(b, { vesting_start: e.target.value || null })} />
                        </label>
                        <label>
                          Tranches
                          <input
                            type="number"
                            min={1}
                            max={10}
                            defaultValue={b.tranches}
                            key={`${b.batch}:t${b.tranches}`}
                            onBlur={(e) => {
                              const n = Number.parseInt(e.target.value, 10);
                              if (n === b.tranches) return;
                              if (!Number.isFinite(n) || n < 1 || n > 10) return void say("Tranches must be 1 to 10.");
                              void saveBatch(b, { tranches: n });
                            }}
                          />
                        </label>
                        <span className="ev-sub">{holders.filter((h) => h.batch === b.batch).length} holders</span>
                      </div>
                    ))}
                    <div className="ev-acts">
                      <button className="ev-btn sm" onClick={() => void addBatch()}>
                        <Ic n="plus" s={13} w={2.2} />
                        Add batch
                      </button>
                      <button className="ev-btn sm" onClick={() => csvRef.current?.click()} title="Add holders from a CSV with the Google Sheet's columns">
                        <Ic n="upload" s={13} />
                        Import holders (CSV)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void upload(f);
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void importCsv(f);
          e.currentTarget.value = "";
        }}
      />
      <div className={`e-toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

/** "1 March 2024" -> "2024-03-01" */
function isoLong(s: string): string | null {
  const m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const mi = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].slice(0, 3).toLowerCase());
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function RowBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function statusOf(daysLeft: number): "Vested" | "This week" | "This month" | "Upcoming" {
  return daysLeft < 0 ? "Vested" : daysLeft <= 7 ? "This week" : daysLeft <= 31 ? "This month" : "Upcoming";
}

/* ── the row details drawer ───────────────────────────────────────────── */

function HolderDrawer(p: {
  r: Row;
  role: Role;
  batches: EsopBatch[];
  useBatches: boolean;
  editing: boolean;
  busy: boolean;
  live: boolean;
  onEdit: (on: boolean) => void;
  onClose: () => void;
  onSave: (patch: Partial<EsopHolder>, msg?: string) => Promise<boolean>;
  onOpen: (d: EsopDocument) => void;
  onUpload: (kind: DocKind, tranche: number | null, label: DocLabel | null) => void;
  onZip: () => void;
  onVesting: (ref: string) => void;
  say: (t: string) => false;
}) {
  const { r } = p;
  const h = r.h;
  const lv = LEAVER[r.active ? "Active" : (h.leaver_type ?? "Good")];
  const noteParts = (h.notes ?? "").split(/(https?:\/\/\S+)/).filter(Boolean);
  const due = r.grants[0].certDue ?? (r.c.vestedTranches || null);
  const issueRef = due ? `B${h.batch}-T${due}` : null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${r.display} details`} className="ev-drawer">
      <div className="ev-dh">
        <div className="ev-dhr">
          <span className="ev-dav gold" aria-hidden="true">
            {r.initials}
          </span>
          <div className="ev-dht">
            <h2>{r.display}</h2>
            {r.known && <span>Known as {r.known}</span>}
            {h.email && <a href={`mailto:${h.email}`}>{h.email}</a>}
          </div>
          <button className="ev-x" onClick={p.onClose} aria-label="Close">
            <Ic n="close" s={16} w={2} />
          </button>
        </div>
        <div className="ev-dpills">
          <span className={`ev-lv ${lv[1]}`}>{r.active ? "Active" : lv[0]}</span>
          {p.useBatches && <span className="ev-dark">Batch {h.batch}</span>}
          {r.multi && <span className="ev-goldp">Includes top-up</span>}
        </div>
      </div>

      {p.editing ? (
        <EditForm r={r} batches={p.batches} role={p.role} live={p.live} onCancel={() => p.onEdit(false)} onSave={p.onSave} say={p.say} />
      ) : (
        <div className="ev-dbody">
          {noteParts.length > 0 && (
            <div className="ev-notecard">
              <b>Note</b>
              <span>
                {noteParts.map((t, i) =>
                  /^https?:\/\//.test(t) ? (
                    <a key={i} href={t} target="_blank" rel="noopener noreferrer">
                      {/slack\.com/.test(t) ? "Open Slack thread" : "Open link"}
                    </a>
                  ) : (
                    <span key={i}>{t}</span>
                  ),
                )}
              </span>
            </div>
          )}

          <div className="ev-stats">
            <div>
              <span>Granted</span>
              <b>{nf(r.granted)}</b>
            </div>
            <div>
              <span>Vested</span>
              <b>{nf(r.vested)}</b>
            </div>
            <div>
              <span>Unvested</span>
              <b>{nf(Math.max(0, r.granted - r.c.vested))}</b>
            </div>
          </div>

          <div className="ev-sec">
            <div className="ev-sech">
              <h3>{r.multi ? `${r.grants.length} grants` : "Grant"}</h3>
              <span>{r.active ? `Register: ${r.c.vestedTranches ? `Tranche ${r.c.vestedTranches}` : "In Progress"}` : "Original schedule"}</span>
            </div>
            {r.behind && <div className="ev-behind">The register shows {r.pct}% vested, but the schedule says more. Update the vested figure.</div>}
            {r.multi && (
              <div className="ev-info">
                {r.grants[1]?.per ? "The options above are the original grant. The top-up grant’s options are in its own card." : "The options above are the combined total. The register doesn’t split them by grant yet."}
              </div>
            )}
            {r.grants.map((g) => (
              <GrantCard key={g.title} g={g} r={r} onOpen={p.onOpen} onUpload={p.onUpload} onSchedule={() => p.onEdit(true)} />
            ))}
          </div>

          <div className="ev-dfoot">
            <button className="ev-btn lg" disabled={p.busy || r.files === 0} onClick={p.onZip}>
              Download all ({r.files})
            </button>
            <button className="ev-btn lg" onClick={() => p.onEdit(true)}>
              Edit grant
            </button>
            {r.active &&
              (p.role === "admin" ? (
                <a className="ev-btn lg gold right" href={issueRef ? `/admin/sign?ref=${encodeURIComponent(issueRef)}` : "/admin/sign"} title="Make the certificate and send it for signing in FD Sign">
                  Issue certificate
                </a>
              ) : (
                <button className="ev-btn lg gold right" onClick={() => p.onUpload("certificate", due, null)} title="Upload a signed certificate">
                  Issue certificate
                </button>
              ))}
          </div>
          {r.active && r.c.next && (
            <button className="ev-link center" onClick={() => p.onVesting(`B${h.batch}-T${r.c.vestedTranches + 1}`)}>
              Next vesting {fmtDay(r.c.next)}: open the approval →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GrantCard({ g, r, onOpen, onUpload, onSchedule }: { g: Grant; r: Row; onOpen: (d: EsopDocument) => void; onUpload: (kind: DocKind, tranche: number | null, label: DocLabel | null) => void; onSchedule: () => void }) {
  const pct = g.tranches.length ? Math.round((g.done / g.tranches.length) * 100) : 0;
  const label: DocLabel | null = g.top ? "Top-up" : null;
  return (
    <div className="ev-grant">
      <div className="ev-granth">
        <div>
          <div className="ev-gt">{g.title}</div>
          <div className={`ev-sub ${g.known ? "" : "warn"}`}>
            {g.sub}
            {g.top && g.per ? ` · ${nf(g.per)} options a tranche` : ""}
          </div>
        </div>
        <span className={`ev-badge2 ${g.known ? "" : "warn"}`}>{g.known ? (r.active ? `${pct}% by schedule` : "Original schedule") : "Schedule missing"}</span>
      </div>
      <div className="ev-grantb">
        {g.known && (
          <ol className="ev-trs">
            {g.tranches.map((t) => (
              <li key={t.n}>
                <span className={`ev-trc ${t.state}`} aria-hidden="true">
                  {t.state === "vested" && <Ic n="check" s={10} w={3.2} />}
                </span>
                <div className="ev-trl">
                  <b>Tranche {t.n}</b> <span>· {fmtDay(t.date)}</span>
                </div>
                {t.cert ? (
                  <button className="ev-trt ok" onClick={() => onOpen(t.cert!)}>
                    ✓ Certificate
                  </button>
                ) : t.state === "vested" && t.n > 1 && r.active ? (
                  <button className="ev-trt warn" onClick={() => onUpload("certificate", t.n, label)} title="Upload this tranche's certificate">
                    No certificate · Upload
                  </button>
                ) : (
                  <span className={`ev-trt ${t.tone}`}>{t.text}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {!g.known && (
          <div className="ev-unkbox">
            <span>No vesting schedule recorded for this grant. Add its start date and tranche dates from the letter below.</span>
            <button onClick={onSchedule}>Add schedule</button>
          </div>
        )}
        <div className="ev-filesl">
          {g.letters.map((d) => (
            <button key={d.id} className="ev-file" onClick={() => onOpen(d)}>
              <span className="ev-pdf red" aria-hidden="true">
                PDF
              </span>
              <span className="ev-fn">
                <span>{g.top ? "Supplemental Letter of Grant" : d.label === "Amended" ? "Letter of Grant (amended and restated)" : "Letter of Grant"}</span>
                <span>
                  {d.file_name}
                  {d.size_bytes ? ` · ${fileSize(d.size_bytes)}` : ""}
                </span>
              </span>
              <span className="ev-dl">
                <Ic n="download" s={13} w={2.2} />
                Download
              </span>
            </button>
          ))}
          {g.certs.map((d) => (
            <button key={d.id} className="ev-file" onClick={() => onOpen(d)}>
              <span className="ev-pdf" aria-hidden="true">
                PDF
              </span>
              <span className="ev-fn">
                <span>Tranche {d.tranche ?? "?"} certificate</span>
                <span>
                  {d.file_name}
                  {d.size_bytes ? ` · ${fileSize(d.size_bytes)}` : ""}
                </span>
              </span>
              <span className="ev-dl">
                <Ic n="download" s={13} w={2.2} />
                Download
              </span>
            </button>
          ))}
          {g.certs.length === 0 && <div className="ev-sub">No certificates for this grant yet.</div>}
          <div className="ev-ups">
            <button onClick={() => onUpload("letter_of_grant", null, label)}>
              <Ic n="upload" s={13} />
              {g.letters.length ? "Add another letter" : g.top ? "Upload Supplemental Letter" : "Upload Letter of Grant"}
            </button>
            <button onClick={() => onUpload("certificate", null, label)}>
              <Ic n="upload" s={13} />
              Upload certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* "Edit grant": every field the sheet had, in one form */
function EditForm({ r, batches, role, live, onCancel, onSave, say }: { r: Row; batches: EsopBatch[]; role: Role; live: boolean; onCancel: () => void; onSave: (patch: Partial<EsopHolder>, msg?: string) => Promise<boolean>; say: (t: string) => false }) {
  const h = r.h;
  const [f, setF] = useState({
    name: h.name,
    legal_name: h.legal_name ?? "",
    email: h.email ?? "",
    id_no: h.id_no ?? "",
    nationality: h.nationality ?? "",
    batch: String(h.batch),
    grant_date: h.grant_date ?? "",
    options_per_tranche: String(h.options_per_tranche ?? 0),
    top_ups: String(h.top_ups ?? 0),
    topup_start: h.topup_start ?? "",
    topup_options_per_tranche: h.topup_options_per_tranche == null ? "" : String(h.topup_options_per_tranche),
    notes: h.notes ?? "",
    status: h.status,
    leaver_type: (h.leaver_type ?? "Good") as LeaverType,
    last_day: h.last_day ?? "",
    vested_override: h.vested_override == null ? "" : String(h.vested_override),
  });
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const topLetter = r.grants[1]?.letters.length ? r.grants[1].letters : null;

  /* Fill the top-up schedule from the Supplemental Letter of Grant (FD's letter reader), for FD to check and save */
  async function readTopUp() {
    if (!live) return say("Preview: the letter reader needs the live site.");
    setReading(true);
    try {
      const res = await fetch("/api/sign/esop/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holderId: h.id, which: "top-up" }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; vestingStart?: string | null; trancheOptions?: number[]; letterDate?: string | null };
      if (!res.ok) return say(out.error ?? "Could not read the letter.");
      const start = isoLong(out.vestingStart ?? "") ?? null;
      const per = out.trancheOptions?.[0] ?? null;
      if (!start && !per) return say("The letter was read, but no vesting start or options were found. Please type them from the letter.");
      setF((x) => ({ ...x, ...(start ? { topup_start: start } : {}), ...(per ? { topup_options_per_tranche: String(per) } : {}) }));
      say(`Read from the letter: ${start ? `start ${fmtDay(start)}` : "no start date"}${per ? ` · ${per.toLocaleString("en-GB")} options a tranche` : ""}. Check, then Save.`);
    } finally {
      setReading(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const int = (v: string) => (v.trim() === "" ? null : Number.parseInt(v.replace(/[^0-9]/g, ""), 10));

  async function save() {
    if (!f.name.trim()) return say("A holder needs a name.");
    const per = int(f.options_per_tranche);
    const tops = int(f.top_ups);
    const tper = int(f.topup_options_per_tranche);
    const vo = int(f.vested_override);
    if (per === null || !Number.isFinite(per)) return say("Options per tranche must be a whole number.");
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return say("Check the email address.");
    const leaving = f.status === "Leaver";
    const patch: Partial<EsopHolder> = {
      name: f.name.trim(),
      email: f.email.trim() || null,
      id_no: f.id_no.trim() || null,
      nationality: f.nationality.trim() || null,
      batch: Number(f.batch),
      grant_date: f.grant_date || null,
      options_per_tranche: per,
      top_ups: tops ?? 0,
      notes: f.notes.trim() || null,
      status: leaving ? "Leaver" : "Active",
      leaver_type: leaving ? f.leaver_type : null,
      last_day: leaving ? f.last_day || isoDay(today()) : null,
    };
    /* the newer columns only when they changed, so a database without 110/111/121 still saves the rest */
    if ((f.legal_name.trim() || null) !== (h.legal_name ?? null)) patch.legal_name = f.legal_name.trim() || null;
    if ((f.topup_start || null) !== (h.topup_start ?? null)) patch.topup_start = f.topup_start || null;
    if (tper !== (h.topup_options_per_tranche ?? null)) patch.topup_options_per_tranche = tper;
    if (leaving && vo !== (h.vested_override ?? null)) patch.vested_override = vo;
    if (!leaving && h.vested_override != null) patch.vested_override = null;
    if (leaving && h.status === "Active" && !window.confirm(`Move ${h.name} to Alumni (${f.leaver_type} leaver)? Nothing is deleted.`)) return;
    setSaving(true);
    const ok = await onSave(patch, leaving && h.status === "Active" ? `${h.name} moved to Alumni` : !leaving && h.status === "Leaver" ? `${h.name} is back in Active` : "Saved");
    setSaving(false);
    if (ok) onCancel();
  }

  return (
    <div className="ev-dbody ev-form">
      <div className="ev-fgrid">
        <label className="w2">
          Name
          <input value={f.name} onChange={set("name")} maxLength={160} />
        </label>
        <label className="w2">
          Legal name on documents (if different)
          <input value={f.legal_name} onChange={set("legal_name")} maxLength={160} placeholder="Shown as “Known as”" />
        </label>
        <label className="w2">
          Email
          <input type="email" value={f.email} onChange={set("email")} />
        </label>
        <label>
          ID no.
          <input value={f.id_no} onChange={set("id_no")} />
        </label>
        <label>
          Nationality
          <input value={f.nationality} onChange={set("nationality")} />
        </label>
        <label>
          Batch
          <select value={f.batch} onChange={set("batch")}>
            {batches.map((b) => (
              <option key={b.batch} value={String(b.batch)}>
                Batch {b.batch}
                {b.vesting_start ? ` · from ${fmtDay(b.vesting_start)}` : ""}
              </option>
            ))}
            {!batches.some((b) => String(b.batch) === f.batch) && <option value={f.batch}>Batch {f.batch}</option>}
          </select>
        </label>
        <label>
          Grant date
          <input type="date" value={f.grant_date} onChange={set("grant_date")} />
        </label>
        <label>
          Options per tranche
          <input inputMode="numeric" value={f.options_per_tranche} onChange={set("options_per_tranche")} />
        </label>
        <label>
          Top-ups
          <input inputMode="numeric" value={f.top_ups} onChange={set("top_ups")} />
        </label>
      </div>

      <div className="ev-sec">
        <h3>Top-up grant schedule</h3>
        <div className="ev-sub">From the Supplemental Letter of Grant. Tranches vest yearly from the start, like the batch.</div>
        {role === "admin" && topLetter && (
          <div>
            <button className="ev-btn sm" type="button" disabled={reading} onClick={() => void readTopUp()}>
              {reading ? "Reading the letter…" : "Read from the Supplemental Letter"}
            </button>
          </div>
        )}
        <div className="ev-fgrid">
          <label>
            Top-up vesting start
            <input type="date" value={f.topup_start} onChange={set("topup_start")} />
          </label>
          <label>
            Top-up options per tranche
            <input inputMode="numeric" value={f.topup_options_per_tranche} onChange={set("topup_options_per_tranche")} />
          </label>
        </div>
      </div>

      <div className="ev-sec">
        <h3>Status</h3>
        <div className="ev-fgrid">
          <label>
            Status
            <select value={f.status} onChange={set("status")}>
              <option value="Active">Active</option>
              <option value="Leaver">Leaver (Alumni)</option>
            </select>
          </label>
          {f.status === "Leaver" && (
            <>
              <label>
                Leaver type
                <select value={f.leaver_type} onChange={set("leaver_type")}>
                  <option value="Good">Good leaver</option>
                  <option value="Bad">Bad leaver</option>
                  <option value="Unvested">Unvested</option>
                </select>
              </label>
              <label>
                Last day
                <input type="date" value={f.last_day} onChange={set("last_day")} />
              </label>
              <label>
                Vested at leaving (if recorded)
                <input inputMode="numeric" value={f.vested_override} onChange={set("vested_override")} placeholder="worked out from the dates" />
              </label>
            </>
          )}
        </div>
      </div>

      <label className="ev-notes">
        Note
        <textarea value={f.notes} onChange={set("notes")} rows={3} placeholder="Anything to remember, e.g. a Slack thread link" />
      </label>

      <div className="ev-dfoot">
        <button className="ev-btn lg" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="ev-btn lg gold right" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {role === "admin" && <div className="ev-sub">Founders Doc can also upload documents in the grant cards, after saving.</div>}
    </div>
  );
}

/* ── the documents pages (sidebar: ESOP rules … All documents) ────────── */

function DocsPage(p: {
  section: Exclude<Section, "esop">;
  docs: EsopDocument[];
  holders: EsopHolder[];
  q: string;
  setQ: (v: string) => void;
  busy: boolean;
  onOpen: (d: EsopDocument) => void;
  onUpload: (kind: CompanyDocKind) => void;
  onZip: (list: EsopDocument[], name: string) => void;
  onHolder: (id: string) => void;
}) {
  const title = SECTION_TITLE[p.section];
  const byId = new Map(p.holders.map((h) => [h.id, h]));
  const list = p.docs
    .filter((d) => p.section === "all" || d.kind === p.section)
    .filter((d) => {
      const s = p.q.trim().toLowerCase();
      const who = d.holder_id ? (byId.get(d.holder_id)?.name ?? "") : "company";
      const legal = d.holder_id ? (byId.get(d.holder_id)?.legal_name ?? "") : "";
      return !s || d.file_name.toLowerCase().includes(s) || who.toLowerCase().includes(s) || legal.toLowerCase().includes(s);
    })
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const companyKind: CompanyDocKind | null = p.section === "esop_rules" ? "esop_rules" : p.section === "resolution" ? "resolution" : p.section === "all" ? "other" : null;
  return (
    <>
      <header className="ev-title">
        <h1>{title}</h1>
        <span>
          {list.length} {list.length === 1 ? "document" : "documents"}
          {p.section === "letter_of_grant" || p.section === "certificate" ? " · upload them on each holder, under ESOP" : ""}
        </span>
      </header>
      <div className="ev-oh">
        <label className="ev-search wide">
          <Ic n="search" w={2} />
          <span className="ev-sr">Search documents</span>
          <input type="search" placeholder="Search file or holder" value={p.q} onChange={(e) => p.setQ(e.target.value)} />
        </label>
        <div className="ev-ohb">
          <button className="ev-btn" disabled={p.busy || !list.length} onClick={() => p.onZip(list, `${title}`)}>
            <Ic n="download" />
            Download all
          </button>
          {companyKind && (
            <button className="ev-btn gold" onClick={() => p.onUpload(companyKind)}>
              <Ic n="upload" />
              Upload {p.section === "all" ? "document" : title.replace(/s$/, "").replace(/^ESOP rule$/, "ESOP rules")}
            </button>
          )}
        </div>
      </div>
      <section className="ev-reg">
        <div className="ev-tablewrap">
          <table className="ev-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Document</th>
                <th>Holder</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th className="ev-go" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="ev-empty">
                    {companyKind ? `No ${title.toLowerCase()} yet. Upload the signed copy so everyone finds it here.` : "None on file yet."}
                  </td>
                </tr>
              )}
              {list.map((d) => {
                const h = d.holder_id ? byId.get(d.holder_id) : null;
                return (
                  <tr key={d.id}>
                    <td style={{ paddingLeft: 20 }}>
                      <button className="ev-docname" onClick={() => p.onOpen(d)}>
                        <span className={`ev-pdf ${d.kind === "letter_of_grant" ? "red" : ""}`} aria-hidden="true">
                          PDF
                        </span>
                        <span>
                          <b>{d.file_name}</b>
                          {d.size_bytes ? <span className="ev-sub">{fileSize(d.size_bytes)}</span> : null}
                        </span>
                      </button>
                    </td>
                    <td>
                      {h ? (
                        <button className="ev-link" onClick={() => p.onHolder(h.id)}>
                          {h.legal_name?.trim() || h.name}
                        </button>
                      ) : (
                        <span className="ev-muted">Company</span>
                      )}
                    </td>
                    <td>
                      {KIND_TEXT[d.kind] ?? "Document"}
                      {d.kind === "certificate" && d.tranche ? ` · T${d.tranche}` : ""}
                      {d.label && d.label !== "Original" ? ` · ${d.label}` : ""}
                    </td>
                    <td className="ev-muted">{fmtDay(d.uploaded_at.slice(0, 10))}</td>
                    <td className="ev-go">
                      <button onClick={() => p.onOpen(d)} aria-label={`Download ${d.file_name}`}>
                        <Ic n="download" s={15} w={2} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
