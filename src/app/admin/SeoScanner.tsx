"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { Finding, Level } from "@/lib/seo-audit/checks";
import type { ScanReport } from "@/lib/seo-audit/scan";
import { findingName } from "@/lib/seo-audit/summary";

/**
 * The SEO tab: a scanner that reads our own website the way Google does and
 * lists what to fix, most important first, in plain English. It scans when
 * the tab opens and on "Scan again". Free: it only reads our own pages.
 */

const LEVEL: Record<Level, { label: string; badge: string; icon: string }> = {
  problem: { label: "Problem", badge: "red", icon: "🔴" },
  improve: { label: "To improve", badge: "", icon: "🟡" },
  idea: { label: "Idea", badge: "gray", icon: "💡" },
};
const ORDER: Level[] = ["problem", "improve", "idea"];


type Group = { code: string; level: Level; items: Finding[] };

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export default function SeoScanner() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Level | "all">("all");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openPage, setOpenPage] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/seo-scan", { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as (ScanReport & { error?: string }) | null;
      if (!res.ok || !j || j.error) throw new Error(j?.error ?? "The scan could not finish.");
      setReport(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The scan could not finish.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void scan(), 0);
    return () => clearTimeout(t);
  }, [scan]);

  const groups = useMemo<Group[]>(() => {
    if (!report) return [];
    const all = [...report.site, ...report.pages.flatMap((p) => p.findings)];
    const by = new Map<string, Group>();
    for (const f of all) {
      const g = by.get(f.code) ?? { code: f.code, level: f.level, items: [] };
      g.items.push(f);
      by.set(f.code, g);
    }
    return Array.from(by.values()).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || b.items.length - a.items.length);
  }, [report]);

  const shown = groups.filter((g) => show === "all" || g.level === show);
  const scoreTone = !report ? "" : report.score >= 85 ? "green" : report.score >= 60 ? "" : "red";

  return (
    <div className="blog-admin">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>SEO scanner</h2>
            <p className="blog-help">
              Reads every page of our website the way Google does, and lists what to fix so more people find us. It also runs by itself every morning at 9am and posts a summary in Slack. Free — it only reads our own pages, and changes nothing.
            </p>
          </div>
          <button className="btn yellow" type="button" disabled={busy} onClick={() => void scan()}>
            {busy ? "Scanning…" : "Scan again"}
          </button>
        </div>
        {busy && !report && <p className="blog-help" style={{ padding: "0 20px 20px" }}>Reading the website… this takes up to a minute.</p>}
        {error && (
          <div className="setup-note" style={{ margin: "0 20px 20px" }}>
            <strong>{error}</strong>
          </div>
        )}
      </section>

      {report && (
        <>
          <div className="summary">
            <div className="summary-card">
              <div className="summary-label">SEO score</div>
              <div className="summary-value">
                {report.score}
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}> / 100</span>
              </div>
              <div className="summary-note">
                <span className={`badge ${scoreTone}`}>{report.score >= 85 ? "Good" : report.score >= 60 ? "Fair" : "Needs work"}</span> · {report.counts.pages} pages checked
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">🔴 Problems</div>
              <div className="summary-value">{report.counts.problem}</div>
              <div className="summary-note">Google may not show these pages properly</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">🟡 To improve</div>
              <div className="summary-value">{report.counts.improve}</div>
              <div className="summary-note">Working, but could rank better</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">💡 Ideas</div>
              <div className="summary-value">{report.counts.idea + report.opportunities.length}</div>
              <div className="summary-note">Small extras and new pages to add</div>
            </div>
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>What to fix, most important first</h2>
                <p className="blog-help">
                  Scanned {new Date(report.scannedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {report.truncated ? " · first 120 pages only" : ""}. Click a row to see the pages.
                </p>
              </div>
              <div className="inline-actions">
                {(["all", ...ORDER] as const).map((l) => (
                  <button key={l} type="button" className={`btn${show === l ? " yellow" : ""}`} onClick={() => setShow(l)}>
                    {l === "all" ? "All" : `${LEVEL[l].icon} ${LEVEL[l].label}`}
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="blog-help" style={{ padding: "0 20px 20px" }}>Nothing here. 🎉</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Level</th>
                      <th>What</th>
                      <th style={{ width: 80 }}>Pages</th>
                      <th>How to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((g) => (
                      <Fragment key={g.code}>
                        <tr onClick={() => setOpenGroup(openGroup === g.code ? null : g.code)} style={{ cursor: "pointer" }}>
                          <td>
                            <span className={`badge ${LEVEL[g.level].badge}`}>
                              {LEVEL[g.level].icon} {LEVEL[g.level].label}
                            </span>
                          </td>
                          <td>
                            <strong>{findingName(g.code)}</strong>
                            {g.items.length === 1 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{g.items[0].what}</div>}
                          </td>
                          <td>{g.items.some((f) => f.url) ? g.items.filter((f) => f.url).length : "Whole site"}</td>
                          <td style={{ fontSize: 12.5 }}>{g.items[0].fix}</td>
                        </tr>
                        {openGroup === g.code && g.items.length > 1 && (
                          <tr>
                            <td colSpan={4} style={{ background: "#FAFAFA" }}>
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
                                {g.items.map((f, i) => (
                                  <li key={i}>
                                    {f.url && <code style={{ fontSize: 11.5 }}>{shortPath(f.url)}</code>} {f.what}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {report.opportunities.length > 0 && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>💡 Ideas to get more visitors</h2>
                  <p className="blog-help">Searches people make that we have no page for yet.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Idea</th>
                      <th>Why it helps</th>
                      <th>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.opportunities.map((o) => (
                      <tr key={o.title}>
                        <td>
                          <strong>{o.title}</strong>
                        </td>
                        <td style={{ fontSize: 12.5 }}>{o.why}</td>
                        <td style={{ fontSize: 12.5 }}>
                          {o.action}
                          {o.link && (
                            <>
                              {" "}
                              <a href={o.link} target="_blank" rel="noreferrer">
                                Document link
                              </a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Every page</h2>
                <p className="blog-help">Lowest score first. Click a page to see its findings.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Score</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Words</th>
                    <th>Load</th>
                    <th>Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pages.map((p) => (
                    <Fragment key={p.url}>
                      <tr onClick={() => setOpenPage(openPage === p.url ? null : p.url)} style={{ cursor: "pointer" }}>
                        <td>
                          <code style={{ fontSize: 11.5 }}>{p.path}</code>
                          {p.status !== 200 && <span className="badge red" style={{ marginLeft: 6 }}>{p.status || "no answer"}</span>}
                        </td>
                        <td>
                          <span className={`badge ${p.score >= 85 ? "green" : p.score >= 60 ? "" : "red"}`}>{p.score}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{p.title ? `${p.title.length} chars` : "—"}</td>
                        <td style={{ fontSize: 12 }}>{p.description ? `${p.description.length} chars` : "—"}</td>
                        <td style={{ fontSize: 12 }}>{p.words}</td>
                        <td style={{ fontSize: 12 }}>{(p.ms / 1000).toFixed(1)}s</td>
                        <td style={{ fontSize: 12 }}>{p.findings.length}</td>
                      </tr>
                      {openPage === p.url && (
                        <tr>
                          <td colSpan={7} style={{ background: "#FAFAFA" }}>
                            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                              <div>
                                <b>Title:</b> {p.title || "—"}
                              </div>
                              <div>
                                <b>Description:</b> {p.description || "—"}
                              </div>
                              {p.findings.length > 0 ? (
                                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                  {p.findings.map((f, i) => (
                                    <li key={i}>
                                      {LEVEL[f.level].icon} {f.what} <i>{f.fix}</i>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div style={{ marginTop: 6 }}>✅ Nothing to fix.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
