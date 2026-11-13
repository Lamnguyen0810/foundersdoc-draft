"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Av, counts, day, Head, Ic, Pill, Side, SignCredits, signNow, useList, when, type View } from "./ui";

/* My documents: every request I sent, sorted by status and folder, plus other
   people's requests waiting for my signature. */

export default function Home() {
  const { data, err, reload } = useList();
  const router = useRouter();
  const params = useSearchParams();
  const view = (params.get("v") as View) || "all";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [now] = useState(() => Date.now());
  const setView = (v: View) => router.replace(v === "all" ? "/fd-sign" : `/fd-sign?v=${encodeURIComponent(v)}`, { scroll: false });
  const c = counts(data);
  const folder = view.startsWith("folder:") ? data?.folders.find((f) => `folder:${f.id}` === view) : null;

  const rows = useMemo(() => {
    let r = data?.docs ?? [];
    if (view === "me") r = r.filter((d) => d.status === "waiting_me");
    else if (view === "others") r = r.filter((d) => d.status === "waiting");
    else if (view === "done") r = r.filter((d) => d.status === "completed");
    else if (view === "closed") r = r.filter((d) => d.status === "cancelled" || d.status === "expired");
    else if (view.startsWith("folder:")) r = r.filter((d) => `folder:${d.folderId}` === view);
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((d) => d.title.toLowerCase().includes(s) || d.signers.some((x) => x.name.toLowerCase().includes(s) || x.email.includes(s)));
    return r;
  }, [data, view, q]);
  const forMe = (view === "all" || view === "me") && !q.trim() ? (data?.forMe ?? []) : [];
  const folders = new Map((data?.folders ?? []).map((f) => [f.id, f]));

  async function sign(signerId: string) {
    setBusy(signerId);
    const e = await signNow(signerId);
    if (e) {
      setMsg(e.text);
      setMsgOk(e.ok);
      setBusy("");
    }
  }
  async function delFolder() {
    if (!folder || !confirm(`Delete the folder "${folder.name}"? Its documents stay, in no folder.`)) return;
    await fetch("/api/fd-sign/folders", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: folder.id }) });
    setView("all");
    void reload();
  }

  const mine = data?.docs.find((d) => d.status === "waiting_me");
  const meFirst = mine ? mine.signers.find((s) => s.me && s.status === "invited") : null;
  const firstForMe = data?.forMe[0];
  const expiring = (data?.docs ?? []).filter((d) => d.expiresAt && Date.parse(d.expiresAt) - now < 3 * 86_400_000).length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const doneMonth = (data?.docs ?? []).filter((d) => d.completedAt && d.completedAt >= monthStart).length;
  const first = (data?.me.name ?? "").split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="fds">
      <Head q={q} onQ={setQ} />
      <div className="fds-shell">
        <Side data={data} view={view} onView={setView} onFolders={reload} />
        <main className="fds-main">
          {/* 0229: on a phone the sidebar's counter is hidden, so it shows here */}
          {data?.plan?.live && (
            <div className="fds-cred-mob">
              <SignCredits a={{ label: data.plan.label, used: data.today, limit: data.limit, per: data.plan.per, endsAt: data.plan.endsAt }} />
            </div>
          )}
          {err && <div className="fds-err">{err}</div>}
          {msg && (
            <div className="fds-err" style={msgOk ? { background: "var(--fds-green-soft)", color: "var(--fds-green-tx)" } : undefined}>
              {msg}
            </div>
          )}
          <div className="fds-hello">
            <h1>
              {hello}
              {first ? `, ${first}` : ""}
            </h1>
            <p>
              {data
                ? c.me || c.others
                  ? `${c.me} ${c.me === 1 ? "document needs" : "documents need"} your signature. ${c.others} ${c.others === 1 ? "is" : "are"} with other people.`
                  : "Upload a document, add who signs, and we'll email them. They don't need an account."
                : "Loading…"}
            </p>
          </div>

          <div className="fds-stats">
            <div className={`fds-st ${c.me ? "hot" : ""}`} role="button" tabIndex={0} onClick={() => setView("me")}>
              <small>
                <Ic n="pen" s={15} />
                Waiting for you
              </small>
              <b>{c.me}</b>
              <em>{mine ? mine.title : firstForMe ? firstForMe.title : "Nothing to sign"}</em>
              {(meFirst || firstForMe) && (
                <button
                  className="fds-btn sm gold go"
                  disabled={!!busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void sign((meFirst?.id ?? firstForMe?.signerId)!);
                  }}
                >
                  Sign now
                </button>
              )}
            </div>
            <div className="fds-st" role="button" tabIndex={0} onClick={() => setView("others")}>
              <small>
                <Ic n="clock" s={15} />
                Waiting for others
              </small>
              <b>{c.others}</b>
              <em style={expiring ? { color: "#b45309", fontWeight: 600 } : undefined}>{expiring ? `${expiring} expiring in 3 days` : "On their way"}</em>
            </div>
            <div className="fds-st" role="button" tabIndex={0} onClick={() => setView("done")}>
              <small>
                <Ic n="check" s={15} />
                Completed this month
              </small>
              <b>{doneMonth}</b>
              <em>{c.done} in total</em>
            </div>
            <div className="fds-st" role="button" tabIndex={0} onClick={() => setView("closed")}>
              <small>
                <Ic n="x" s={15} />
                Cancelled or expired
              </small>
              <b>{c.closed}</b>
              <em>Send again any time</em>
            </div>
          </div>

          <div className="fds-card">
            <div className="fds-tbar">
              {folder ? (
                <>
                  <span className="fds-dot" style={{ background: folder.colour }} />
                  <b style={{ marginRight: 8 }}>{folder.name}</b>
                  <span className="fds-sp" style={{ flex: 1 }} />
                  <button className="fds-btn sm ghost danger" onClick={() => void delFolder()}>
                    Delete folder
                  </button>
                </>
              ) : (
                (
                  [
                    ["all", "All", c.all],
                    ["me", "Waiting for me", c.me],
                    ["others", "Waiting for others", c.others],
                    ["done", "Completed", c.done],
                  ] as Array<[View, string, number]>
                ).map(([k, t, n]) => (
                  <button key={k} className={`fds-tab ${view === k ? "on" : ""}`} onClick={() => setView(k)}>
                    {t}
                    <i>{n}</i>
                  </button>
                ))
              )}
            </div>

            {forMe.map((w) => (
              <div className="fds-forme" key={w.signerId}>
                <span className="fds-dn" style={{ flex: 1 }}>
                  <span className="fi">
                    <Ic n="pen" s={16} />
                  </span>
                  <span>
                    <b>{w.title}</b>
                    <small>
                      From {w.from} · {when(w.at)}
                    </small>
                  </span>
                </span>
                <span className="fds-pill me">Waiting for you</span>
                <button className="fds-btn sm gold" disabled={busy === w.signerId} onClick={() => void sign(w.signerId)}>
                  {busy === w.signerId ? "Opening…" : "Sign now"}
                </button>
              </div>
            ))}

            {data && !rows.length && !forMe.length ? (
              <div className="fds-empty">
                <div className="ic">
                  <Ic n="up" s={26} />
                </div>
                <h3>{data.docs.length ? "Nothing here" : "Send your first document"}</h3>
                <p>{data.docs.length ? (q ? "No document matches your search." : "No documents in this list yet.") : "Upload a PDF, add who signs, place the signature boxes, and send."}</p>
                {!data.docs.length && (
                  <Link className="fds-btn gold" href="/fd-sign/new">
                    <Ic n="plus" s={16} w={2} />
                    New request
                  </Link>
                )}
              </div>
            ) : (
              rows.length > 0 && (
                <table className="fds-grid">
                  <thead>
                    <tr>
                      <th style={{ width: "32%" }}>Document</th>
                      <th>Folder</th>
                      <th>Status</th>
                      <th>Signed</th>
                      <th>Last activity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => {
                      const f = d.folderId ? folders.get(d.folderId) : null;
                      const meRow = d.signers.find((s) => s.me && s.status === "invited");
                      return (
                        <tr key={d.id} onClick={() => router.push(`/fd-sign/d/${d.id}`)}>
                          <td>
                            <div className="fds-dn">
                              <span className="fi">
                                <Ic n="doc" s={16} />
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <b>{d.title}</b>
                                <small>
                                  Sent {day(d.createdAt)}
                                  {d.pages ? ` · ${d.pages} ${d.pages === 1 ? "page" : "pages"}` : ""}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td className="hide-sm">
                            {f ? (
                              <span className="fds-tag">
                                <span className="fds-dot" style={{ background: f.colour }} />
                                {f.name}
                              </span>
                            ) : (
                              <span className="fds-muted">–</span>
                            )}
                          </td>
                          <td>
                            <Pill d={d} />
                          </td>
                          <td>
                            <div className="fds-prog">
                              <span className="fds-avs">
                                {d.signers.slice(0, 4).map((s, i) => (
                                  <Av key={s.id} name={s.name} i={i} state={s.status === "signed" ? "done" : s.status === "waiting" || d.status === "cancelled" ? "wait" : undefined} />
                                ))}
                              </span>
                              <span className="mini">
                                <i style={{ width: `${(d.signed / Math.max(1, d.total)) * 100}%` }} />
                              </span>
                              <span>
                                {d.signed} of {d.total}
                              </span>
                            </div>
                          </td>
                          <td className="fds-act hide-sm">
                            {d.last.text}
                            <small>
                              {when(d.last.at)}
                              {d.status === "waiting" && d.expiresAt && Date.parse(d.expiresAt) - now < 3 * 86_400_000 && <b style={{ color: "#b45309" }}> · expires {day(d.expiresAt)}</b>}
                            </small>
                          </td>
                          <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            {meRow && d.status === "waiting_me" ? (
                              <button className="fds-btn sm gold" disabled={busy === meRow.id} onClick={() => void sign(meRow.id)}>
                                {busy === meRow.id ? "Opening…" : "Sign now"}
                              </button>
                            ) : d.status === "completed" ? (
                              <a className="fds-btn sm" href={`/api/sign/file?e=${d.id}&signed=1&download=1`} title="Download the signed PDF">
                                <Ic n="dl" s={15} />
                                Signed PDF
                              </a>
                            ) : (
                              <Link className="fds-btn sm ghost" href={`/fd-sign/d/${d.id}`}>
                                Open
                                <Ic n="chev" s={14} />
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
