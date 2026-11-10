"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { DocRow, DocStatus } from "@/lib/sign/mine";
import { colour } from "@/lib/sign/boxes";

/* Shared bits for the FD Sign pages: icons, the header strip, the sidebar,
   status pills, avatars, dates, and the My documents data. */

const P: Record<string, ReactNode> = {
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>,
  inbox: <><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" /></>,
  pen: <><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  dl: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  up: <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.7-3 3-4.6 5.5-4.6s4.8 1.6 5.5 4.6" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.6c2.3.2 4 1.6 4.6 4.1" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></>,
  back: <path d="M15 6l-6 6 6 6" />,
  chev: <path d="M9 6l6 6-6 6" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  type: <path d="M5 6h14M12 6v13M9 19h6" />,
  box: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  textbox: <><rect x="3.5" y="7" width="17" height="10" rx="2" /><path d="M7 12h6" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
};
export function Ic({ n, s = 18, w = 1.7 }: { n: keyof typeof P | string; s?: number; w?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[n]}
    </svg>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
export function Av({ name, i, state, s = 26 }: { name: string; i: number; state?: "done" | "wait"; s?: number }) {
  return (
    <span className={`fds-av ${state ?? ""}`} style={{ background: colour(i + 1), width: s, height: s }} title={name}>
      {initials(name)}
    </span>
  );
}

export const STATUS_TEXT: Record<DocStatus, string> = { waiting_me: "Waiting for you", waiting: "Waiting", completed: "Completed", cancelled: "Cancelled", expired: "Expired" };
export function Pill({ d }: { d: Pick<DocRow, "status" | "waitingFor" | "signed" | "total"> }) {
  const cls = d.status === "waiting_me" ? "me" : d.status;
  const text = d.status === "waiting" && d.waitingFor ? `Waiting for ${d.waitingFor}` : STATUS_TEXT[d.status];
  return <span className={`fds-pill ${cls}`}>{text}</span>;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`.replace(/^1 hours/, "1 hour");
  if (s < 172800) return "yesterday";
  return day(iso);
}
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "");
export const dayTime = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}` : "";
export const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

export interface Folder {
  id: string;
  name: string;
  colour: string;
  count: number;
}
export interface ForMe {
  signerId: string;
  id: string;
  title: string;
  from: string | null;
  at: string | null;
  pages: number | null;
}
export interface ListData {
  me: { name: string; email: string };
  folders: Folder[];
  docs: DocRow[];
  forMe: ForMe[];
  today: number;
  limit: number;
}

export function useList() {
  const [data, setData] = useState<ListData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/fd-sign/list", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load your documents.");
      setData(j as ListData);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load your documents.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    void load();
  }, [load]);
  return { data, err, reload: load };
}

export type View = "all" | "me" | "others" | "done" | "closed" | `folder:${string}`;

export function counts(d: ListData | null) {
  const docs = d?.docs ?? [];
  return {
    all: docs.length,
    me: docs.filter((x) => x.status === "waiting_me").length + (d?.forMe.length ?? 0),
    others: docs.filter((x) => x.status === "waiting").length,
    done: docs.filter((x) => x.status === "completed").length,
    closed: docs.filter((x) => x.status === "cancelled" || x.status === "expired").length,
  };
}

/** "Sign now": my own request opens my signing page; someone else's is emailed to me again. Returns a message to show, or null when leaving. */
export async function signNow(signerId: string): Promise<{ text: string; ok: boolean } | null> {
  const r = await fetch("/api/fd-sign/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signerId }) });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.url) {
    window.location.href = j.url;
    return null;
  }
  if (r.ok && j.emailed) return { ok: true, text: `We've emailed a fresh signing link to ${j.emailed}. Open it to read and sign.` };
  return { ok: false, text: j.error || "Could not open it. Please use the link in your email." };
}

export function Head({ q, onQ, tab = "docs" }: { q?: string; onQ?: (v: string) => void; tab?: "docs" | "check" }) {
  return (
    <div className="fds-head">
      <Link href="/fd-sign" className="fds-brand">
        <i>FD</i>FD Sign <span className="fds-beta">Beta</span>
      </Link>
      {/* 0201: the signing-ready check is its own tab (Rachel, 6 Nov) */}
      <nav className="fds-tabs2" aria-label="FD Sign">
        <Link href="/fd-sign" className={tab === "docs" ? "on" : ""} aria-current={tab === "docs" ? "page" : undefined}>
          My documents
        </Link>
        <Link href="/fd-sign/check" className={tab === "check" ? "on" : ""} aria-current={tab === "check" ? "page" : undefined}>
          Signing-ready check <em>New</em>
        </Link>
      </nav>
      {onQ ? (
        <label className="fds-search">
          <Ic n="search" s={16} />
          <input value={q ?? ""} onChange={(e) => onQ(e.target.value)} placeholder="Search documents or people" aria-label="Search documents or people" />
        </label>
      ) : (
        <span className="fds-sp" />
      )}
      {onQ && <span className="fds-sp" />}
      <Link href="/fd-sign/new" className="fds-btn gold">
        <Ic n="plus" s={16} w={2} />
        New request
      </Link>
    </div>
  );
}

export function Side({ data, view, onView, onFolders }: { data: ListData | null; view: View | null; onView: (v: View) => void; onFolders?: () => void }) {
  const c = counts(data);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const items: Array<[View, string, string, number, boolean]> = [
    ["all", "inbox", "All documents", c.all, false],
    ["me", "pen", "Waiting for me", c.me, c.me > 0],
    ["others", "clock", "Waiting for others", c.others, false],
    ["done", "check", "Completed", c.done, false],
    ["closed", "x", "Cancelled or expired", c.closed, false],
  ];
  async function add() {
    const n = name.trim();
    if (!n) return setAdding(false);
    const r = await fetch("/api/fd-sign/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Could not add the folder.");
    setName("");
    setAdding(false);
    setErr("");
    onFolders?.();
  }
  const limit = data?.limit ?? 20;
  return (
    <aside className="fds-side">
      {items.map(([k, i, t, n, g]) => (
        <button key={k} className={`fds-ni ${view === k ? "on" : ""}`} onClick={() => onView(k)}>
          <Ic n={i} s={17} />
          {t}
          <span className={`ct ${g ? "g" : ""}`}>{n}</span>
        </button>
      ))}
      <div className="fds-sh">Folders</div>
      {(data?.folders ?? []).map((f) => (
        <button key={f.id} className={`fds-ni ${view === `folder:${f.id}` ? "on" : ""}`} onClick={() => onView(`folder:${f.id}`)}>
          <span className="fds-dot" style={{ background: f.colour }} />
          {f.name}
          <span className="ct">{f.count}</span>
        </button>
      ))}
      {adding ? (
        <div className="fds-newf">
          <input autoFocus value={name} maxLength={60} placeholder="Folder name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? void add() : e.key === "Escape" ? setAdding(false) : undefined)} />
          <button className="fds-btn sm" onClick={() => void add()}>
            Add
          </button>
        </div>
      ) : (
        <button className="fds-ni fds-muted" onClick={() => setAdding(true)}>
          <Ic n="plus" s={16} />
          New folder
        </button>
      )}
      {err && <div className="fds-err">{err}</div>}
      <div className="fds-quota">
        <b>Free during Beta</b>
        <small>
          {data?.today ?? 0} of {limit} requests sent today · PDF files up to 10 MB
        </small>
        <div className="fds-bar">
          <i style={{ width: `${Math.min(100, ((data?.today ?? 0) / limit) * 100)}%` }} />
        </div>
      </div>
    </aside>
  );
}
