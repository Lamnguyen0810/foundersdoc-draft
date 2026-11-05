"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PdfPages from "../sign/PdfPages";
import type { DocEvent, DocRow } from "@/lib/sign/mine";
import { Av, day, dayTime, Head, Ic, Pill, Side, signNow, time, useList, when, type View } from "./ui";

/* One request: where it is (each person's progress), what happened (activity),
   and what I can do (remind, download, move to a folder, cancel). */

interface Detail {
  doc: DocRow & { message: string | null; sha256: string };
  copies: Array<{ email: string; sentAt: string | null }>;
  events: DocEvent[];
  folders: Array<{ id: string; name: string; colour: string }>;
}

export default function DetailPage({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const list = useList();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await fetch(`/api/fd-sign/${id}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Could not load this request.");
    setD(j as Detail);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    void load();
    const sent = params.get("sent");
    if (sent) {
      setToast(`Sent. ${sent} has been emailed.`);
      try {
        setPreview(sessionStorage.getItem("fds-preview-link") ?? "");
        sessionStorage.removeItem("fds-preview-link");
      } catch {
        /* preview only */
      }
      router.replace(`/fd-sign/d/${id}`, { scroll: false });
    }
  }, [load, params, router, id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function act(action: "remind" | "cancel" | "move", folderId?: string | null) {
    if (action === "cancel" && !confirm("Cancel this request? Nobody will be able to sign it any more.")) return;
    setBusy(action);
    setErr("");
    const r = await fetch(`/api/fd-sign/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, folderId }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setErr(j.error || "Could not do that.");
    setToast(action === "remind" ? `Reminder sent to ${j.to}.` : action === "cancel" ? "Request cancelled." : "Moved.");
    void load();
    void list.reload();
  }

  const doc = d?.doc;
  const folder = doc?.folderId ? d?.folders.find((f) => f.id === doc.folderId) : null;
  const meNow = doc?.status === "waiting_me" ? doc.signers.find((s) => s.me && s.status === "invited") : null;
  const view: View | null = folder ? `folder:${folder.id}` : null;

  return (
    <div className="fds">
      <Head />
      <div className="fds-shell">
        <Side data={list.data} view={view} onView={(v) => router.push(v === "all" ? "/fd-sign" : `/fd-sign?v=${encodeURIComponent(v)}`)} onFolders={list.reload} />
        <main className="fds-main">
          {err && <div className="fds-err">{err}</div>}
          {preview && (
            <div className="fds-err" style={{ background: "var(--fds-gold-soft)", color: "var(--fds-gold-tx)" }}>
              Preview (no emails): <a href={preview} style={{ textDecoration: "underline" }}>open the signing page</a>
            </div>
          )}
          {!doc ? (
            !err && <p className="fds-muted">Loading…</p>
          ) : (
            <>
              <div className="fds-crumb">
                <Link href="/fd-sign">My documents</Link>
                <Ic n="chev" s={13} />
                {folder && (
                  <>
                    <Link href={`/fd-sign?v=folder:${folder.id}`}>{folder.name}</Link>
                    <Ic n="chev" s={13} />
                  </>
                )}
                <span>{doc.title}</span>
              </div>
              <div className="fds-dh">
                <h1>{doc.title}</h1>
                <Pill d={doc} />
                <span className="fds-sp" />
                {meNow && (
                  <button className="fds-btn sm gold" disabled={!!busy} onClick={() => void signNow(meNow.id).then((e) => e && (e.ok ? setToast(e.text) : setErr(e.text)))}>
                    <Ic n="pen" s={15} />
                    Sign now
                  </button>
                )}
                {(doc.status === "waiting" || doc.status === "waiting_me") && !meNow && (
                  <button className="fds-btn sm" disabled={!!busy} onClick={() => void act("remind")}>
                    <Ic n="bell" s={15} />
                    {busy === "remind" ? "Sending…" : `Remind ${doc.waitingFor?.split(/\s+/)[0] ?? ""}`}
                  </button>
                )}
                <a className="fds-btn sm" href={`/api/sign/file?e=${doc.id}${doc.status === "completed" ? "&signed=1" : ""}&download=1`}>
                  <Ic n="dl" s={15} />
                  {doc.status === "completed" ? "Signed PDF" : "Original PDF"}
                </a>
                <select className="fds-sel" aria-label="Folder" value={doc.folderId ?? ""} disabled={!!busy} onChange={(e) => void act("move", e.target.value || null)}>
                  <option value="">No folder</option>
                  {d.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {(doc.status === "waiting" || doc.status === "waiting_me" || doc.status === "expired") && (
                  <button className="fds-btn sm ghost danger" disabled={!!busy} onClick={() => void act("cancel")}>
                    Cancel request
                  </button>
                )}
              </div>

              <div className="fds-dgrid">
                <div className="fds-card fds-pv">
                  <PdfPages src={`/api/sign/file?e=${doc.id}${doc.status === "completed" ? "&signed=1&doc=1" : ""}`} />
                  <div className="fds-meta">
                    <div>
                      Pages <b>{doc.pages ?? "–"}</b>
                    </div>
                    <div>
                      Folder <b>{folder?.name ?? "None"}</b>
                    </div>
                    <div>
                      Sent <b>{dayTime(doc.createdAt)}</b>
                    </div>
                    {doc.completedAt && (
                      <div>
                        Completed <b>{dayTime(doc.completedAt)}</b>
                      </div>
                    )}
                    {doc.expiresAt && (
                      <div>
                        Link expires <b>{day(doc.expiresAt)}</b>
                      </div>
                    )}
                  </div>
                  {doc.status === "completed" && (
                    <a className="fds-btn" style={{ width: "100%", marginTop: 10 }} href={`/api/sign/file?e=${doc.id}&signed=1&download=1`}>
                      <Ic n="shield" s={15} />
                      Signed PDF with audit trail
                    </a>
                  )}
                </div>

                <div className="fds-card fds-trk">
                  <h3>
                    Progress · {doc.signed} of {doc.total} signed
                  </h3>
                  {doc.signers.map((s, i) => {
                    const now = s.status === "invited" && (doc.status === "waiting" || doc.status === "waiting_me");
                    return (
                      <div key={s.id} className={`fds-stepv ${s.status === "signed" ? "done" : now ? "now" : ""}`}>
                        <span className="cir">{s.status === "signed" ? <Ic n="check" s={15} w={2.4} /> : i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <b>{s.me ? `${s.name} (you)` : s.name}</b>
                          <small>{s.email}</small>
                          {(s.invitedAt || s.viewedAt || s.signedAt) && (
                            <div className="fds-subs">
                              {s.invitedAt && <span>Emailed {when(s.invitedAt)}</span>}
                              {s.viewedAt && <span>Opened {when(s.viewedAt)}</span>}
                              {s.signedAt && <span>Signed {dayTime(s.signedAt)}</span>}
                            </div>
                          )}
                        </div>
                        <span className="side">
                          {s.status === "signed" ? (
                            <span className="fds-pill completed">Signed</span>
                          ) : now ? (
                            <span className="fds-pill waiting">{s.viewedAt ? "Opened" : "Emailed"}</span>
                          ) : doc.status === "cancelled" ? (
                            "–"
                          ) : (
                            "Waiting"
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {d.copies.map((c) => (
                    <div key={c.email} className="fds-stepv">
                      <span className="cir" style={{ borderStyle: "dashed" }}>
                        <Ic n="mail" s={14} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <b>{c.email}</b>
                        <small>{c.sentAt ? `Copy sent ${when(c.sentAt)}` : "Gets the signed PDF at the end"}</small>
                      </div>
                      <span className="side">Copy</span>
                    </div>
                  ))}
                  {doc.message && (
                    <div className="fds-sha" style={{ wordBreak: "normal", whiteSpace: "pre-line" }}>
                      <b>Your message:</b> {doc.message}
                    </div>
                  )}
                </div>

                <div className="fds-card fds-tl">
                  <h3>Activity</h3>
                  {d.events.slice(0, 30).map((e, i) => (
                    <div className="fds-ev" key={i}>
                      <time title={dayTime(e.at)}>{now - Date.parse(e.at) < 86_400_000 ? time(e.at) : day(e.at)}</time>
                      <div>
                        <b>
                          {e.who ? `${e.who}: ` : ""}
                          {e.text}
                        </b>
                        {e.ip && <small>IP {e.ip}</small>}
                      </div>
                    </div>
                  ))}
                  <div className="fds-sha">
                    <Ic n="shield" s={14} /> Fingerprint of the original (SHA-256): {doc.sha256.slice(0, 12)}…{doc.sha256.slice(-6)}. The signed PDF ends with an audit trail page listing every step above.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Av name={list.data?.me.name ?? "You"} i={1} s={22} />
                <span className="fds-muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
                  Only you can see this page. People who sign see only the document and their own step.
                </span>
              </div>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="fds-toast" role="status">
          <span className="k">
            <Ic n="check" s={13} w={2.4} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
