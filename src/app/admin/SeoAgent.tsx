"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import SeoScanner from "./SeoScanner";
import type { RecStatus, ScoredKeyword, SeoFinding, SeoOverview, SeoRecommendation, SeoSettings, Weights } from "@/lib/seo-agent/types";

/**
 * Admin → SEO: the SEO agent's dashboard.
 *
 *   Overview         what needs a decision, the latest runs, the last report
 *   Recommendations  approve, reject or mark done — with evidence and how to check
 *   Keywords         scored, with the reasons; numbers only with their source
 *   Research         every finding and run, newest first
 *   Website health   the live scanner (SeoScanner)
 *   Settings         the website, markets, competitors, keywords, budget, weights
 *
 * Verified (measured) is always told apart from estimate (a guess or an
 * unsourced judgement). Nothing here publishes anything on the website.
 */

type View = "overview" | "recs" | "keywords" | "research" | "health" | "settings";
const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "recs", label: "Recommendations" },
  { id: "keywords", label: "Keywords" },
  { id: "research", label: "Research history" },
  { id: "health", label: "Website health" },
  { id: "settings", label: "Settings" },
];

const STATUS_LABEL: Record<RecStatus, string> = {
  proposed: "Awaiting approval",
  approved: "Approved",
  in_progress: "In progress",
  done: "Done",
  measuring: "Measuring",
  rejected: "Rejected",
};
const STATUS_BADGE: Record<RecStatus, string> = { proposed: "", approved: "green", in_progress: "green", done: "green", measuring: "gray", rejected: "gray" };
const KIND_LABEL: Record<SeoFinding["kind"], string> = {
  keyword: "Keyword",
  competitor: "Competitor",
  content_gap: "Content gap",
  technical: "Technical",
  question: "Question people ask",
  trend: "Trend",
  page_improvement: "Page improvement",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const Certainty = ({ c }: { c: "verified" | "estimate" }) => (
  <span className={`badge ${c === "verified" ? "green" : "gray"}`} title={c === "verified" ? "Measured or seen directly" : "A judgement or estimate — check before relying on it"}>
    {c === "verified" ? "✓ Verified" : "≈ Estimate"}
  </span>
);
const Evidence = ({ items }: { items: { url: string; title?: string; retrieved_at?: string }[] }) =>
  items.length ? (
    <span style={{ fontSize: 12 }}>
      {items.slice(0, 4).map((e, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <a href={e.url} target="_blank" rel="noreferrer">
            {e.title || (() => { try { return new URL(e.url).hostname + new URL(e.url).pathname; } catch { return "source"; } })()}
          </a>
          {e.retrieved_at && <span style={{ color: "var(--muted)" }}> ({e.retrieved_at})</span>}
        </Fragment>
      ))}
    </span>
  ) : (
    <span style={{ fontSize: 12, color: "var(--muted)" }}>No source link</span>
  );

export default function SeoAgent() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<SeoOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/seo", { cache: "no-store" });
      const j = (await res.json()) as SeoOverview & { error?: string };
      if (!res.ok || j.error) throw new Error(j.error ?? "Could not load the SEO agent.");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the SEO agent.");
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function post(body: Record<string, unknown>, label: string, done: string) {
    setBusy(label);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/seo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || j.error) throw new Error(j.error ?? "That did not work.");
      setNotice(done);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy("");
    }
  }

  const pending = useMemo(() => (data?.recommendations ?? []).filter((r) => r.status === "proposed"), [data]);

  return (
    <div className="blog-admin">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>SEO agent</h2>
            <p className="blog-help">
              Finds ways for more people to find us on Google, keeps the evidence, and waits for your approval. Free: it uses our own website, free web research and Slack. Nothing is published automatically.
            </p>
          </div>
          <div className="inline-actions">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={`btn${view === v.id ? " yellow" : ""}`} onClick={() => setView(v.id)}>
                {v.label}
                {v.id === "recs" && pending.length > 0 && ` (${pending.length})`}
              </button>
            ))}
          </div>
        </div>
        {notice && <div className="blog-notice ok" role="status" style={{ margin: "0 20px 16px" }}>{notice}</div>}
        {error && <div className="setup-note" style={{ margin: "0 20px 16px" }}><strong>{error}</strong></div>}
        {data?.missing && (
          <div className="setup-note" style={{ margin: "0 20px 16px" }}>
            <strong>The SEO agent&rsquo;s tables are missing.</strong> Run <code>supabase/104_seo_agent.sql</code> in Supabase, then reload. The Website health view works without them.
          </div>
        )}
      </section>

      {view === "health" && <SeoScanner />}
      {view !== "health" && !data && !error && <p className="blog-help">Loading…</p>}
      {data && !data.missing && view === "overview" && <Overview data={data} pending={pending} onView={setView} onSaveScan={() => void post({ action: "save_scan" }, "scan", "Scan saved to the history.")} busy={busy} />}
      {data && !data.missing && view === "recs" && <Recommendations recs={data.recommendations} busy={busy} onStatus={(id, status) => void post({ action: "status", id, status }, id, `Marked as ${STATUS_LABEL[status].toLowerCase()}.`)} />}
      {data && !data.missing && view === "keywords" && <Keywords keywords={data.keywords} />}
      {data && !data.missing && view === "research" && <Research data={data} />}
      {data && !data.missing && view === "settings" && data.settings && <Settings settings={data.settings} busy={busy === "settings"} onSave={(s) => void post({ action: "settings", settings: s }, "settings", "Settings saved.")} />}
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────────────── */

function Overview({ data, pending, onView, onSaveScan, busy }: { data: SeoOverview; pending: SeoRecommendation[]; onView: (v: View) => void; onSaveScan: () => void; busy: string }) {
  const lastResearch = data.runs.find((r) => r.source === "daily_research");
  const lastScan = data.runs.find((r) => r.source === "website_scan");
  const weekly = data.runs.find((r) => r.source === "weekly_summary");
  const done = data.recommendations.filter((r) => r.status === "done" || r.status === "measuring").length;
  const setup: [boolean | null, string][] = [
    [data.hasKey, "Private SEO key set in the database (select public.set_seo_ingest_key('…'))"],
    [Boolean(lastScan), "Website scan saved at least once (SEO_INGEST_KEY in Vercel, then Save today's scan)"],
    [Boolean(lastResearch), "Daily research has sent findings (foundersdoc.com allowed in Claude's network settings)"],
  ];
  return (
    <>
      <div className="summary">
        <div className="summary-card">
          <div className="summary-label">Awaiting approval</div>
          <div className="summary-value">{pending.length}</div>
          <div className="summary-note"><button className="link-btn" type="button" onClick={() => onView("recs")}>Review recommendations ›</button></div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Done or measuring</div>
          <div className="summary-value">{done}</div>
          <div className="summary-note">of {data.recommendations.filter((r) => r.status !== "rejected").length} recommendations</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Keywords tracked</div>
          <div className="summary-value">{data.keywords.length}</div>
          <div className="summary-note">{data.keywords.filter((k) => k.measured).length} with measured numbers</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Last website scan</div>
          <div className="summary-value">{typeof lastScan?.stats?.score === "number" ? `${lastScan.stats.score}` : "—"}<span style={{ fontSize: 14, color: "var(--muted)" }}>{lastScan ? " / 100" : ""}</span></div>
          <div className="summary-note">
            {lastScan ? when(lastScan.created_at) : "Not saved yet"} ·{" "}
            <button className="link-btn" type="button" disabled={busy === "scan"} onClick={onSaveScan}>{busy === "scan" ? "Scanning…" : "Save today's scan"}</button>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>Latest report</h2><p className="blog-help">The newest research run and weekly summary, as they arrived.</p></div></div>
        <div style={{ padding: "0 20px 20px", fontSize: 13.5, lineHeight: 1.6 }}>
          {lastResearch ? (
            <>
              <p><b>Daily research · {when(lastResearch.created_at)}</b>{lastResearch.status !== "ok" && <span className="badge gray" style={{ marginLeft: 6 }}>{lastResearch.status}</span>}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{lastResearch.summary || "No summary."}</p>
              {lastResearch.limitations && <p style={{ color: "var(--muted)" }}><b>Could not check:</b> {lastResearch.limitations}</p>}
            </>
          ) : (
            <p style={{ color: "var(--muted)" }}>No research has arrived yet. Until it does, the daily research still posts in #fdai-analytics.</p>
          )}
          {weekly && (
            <>
              <p style={{ marginTop: 14 }}><b>Weekly summary · {when(weekly.created_at)}</b></p>
              <p style={{ whiteSpace: "pre-wrap" }}>{weekly.summary}</p>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Set-up</h2><p className="blog-help">What the agent needs to work fully. See SEO_AGENT.md for the steps.</p></div></div>
        <ul style={{ margin: 0, padding: "0 20px 20px 40px", fontSize: 13.5, lineHeight: 1.9 }}>
          {setup.map(([ok, label]) => (
            <li key={label}>{ok ? "✅" : ok === null ? "❔" : "⬜"} {label}</li>
          ))}
          <li>⏳ Google Search Console (next phase): real searches, clicks and positions</li>
        </ul>
      </section>
    </>
  );
}

/* ── Recommendations ───────────────────────────────────────────────── */

function Recommendations({ recs, busy, onStatus }: { recs: SeoRecommendation[]; busy: string; onStatus: (id: string, s: RecStatus) => void }) {
  const [show, setShow] = useState<"open" | "done" | "rejected">("open");
  const [open, setOpen] = useState<string | null>(null);
  const list = recs.filter((r) => (show === "open" ? ["proposed", "approved", "in_progress"].includes(r.status) : show === "done" ? ["done", "measuring"].includes(r.status) : r.status === "rejected"));
  const P = ["", "High", "Medium", "Low"];
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Recommendations</h2><p className="blog-help">Highest priority and least effort first. Click one for the evidence, steps and how to check it worked.</p></div>
        <div className="inline-actions">
          {(["open", "done", "rejected"] as const).map((s) => (
            <button key={s} type="button" className={`btn${show === s ? " yellow" : ""}`} onClick={() => setShow(s)}>{s === "open" ? "To do" : s === "done" ? "Done" : "Rejected"}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="blog-help" style={{ padding: "0 20px 20px" }}>Nothing here.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Priority</th><th>Recommendation</th><th>Impact · effort</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                    <td><span className={`badge ${r.priority === 1 ? "red" : r.priority === 3 ? "gray" : ""}`}>{P[r.priority]}</span></td>
                    <td><strong>{r.title}</strong>{r.keyword && <div style={{ fontSize: 12, color: "var(--muted)" }}>Keyword: {r.keyword}{r.intent ? ` · ${r.intent}` : ""}</div>}</td>
                    <td style={{ fontSize: 12.5 }}>{r.impact} impact (estimate) · {r.effort} effort</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {r.status === "proposed" && (
                        <>
                          <button className="btn yellow" type="button" disabled={busy === r.id} onClick={() => onStatus(r.id, "approved")}>Approve</button>{" "}
                          <button className="btn" type="button" disabled={busy === r.id} onClick={() => onStatus(r.id, "rejected")}>Reject</button>
                        </>
                      )}
                      {(r.status === "approved" || r.status === "in_progress") && <button className="btn" type="button" disabled={busy === r.id} onClick={() => onStatus(r.id, "done")}>Mark done</button>}
                      {r.status === "done" && <button className="btn" type="button" disabled={busy === r.id} onClick={() => onStatus(r.id, "measuring")}>Measuring</button>}
                      {r.status === "rejected" && <button className="btn" type="button" disabled={busy === r.id} onClick={() => onStatus(r.id, "proposed")}>Reopen</button>}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={5} style={{ background: "#FAFAFA", fontSize: 13, lineHeight: 1.6 }}>
                        {r.description && <p>{r.description}</p>}
                        {r.why && <p><b>Why it may help:</b> {r.why}</p>}
                        <p><b>Page:</b> {r.page_url || (r.new_page ? "New page" : "—")}</p>
                        {r.steps.length > 0 && (<><b>Steps</b><ol style={{ margin: "4px 0 8px", paddingLeft: 22, listStyle: "decimal" }}>{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>)}
                        {r.validation && <p><b>How we&rsquo;ll know it worked:</b> {r.validation}</p>}
                        {r.cost_note && <p><b>Cost:</b> {r.cost_note}</p>}
                        <p><b>Evidence:</b> <Evidence items={r.evidence ?? []} /></p>
                        {r.status_note && <p><b>Note:</b> {r.status_note}</p>}
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
  );
}

/* ── Keywords ──────────────────────────────────────────────────────── */

function Keywords({ keywords }: { keywords: ScoredKeyword[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const countries = Array.from(new Set(keywords.map((k) => k.country))).sort();
  const list = keywords.filter((k) => (!q || k.keyword.toLowerCase().includes(q.toLowerCase())) && (!country || k.country === country));
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Keyword opportunities</h2><p className="blog-help">Scored 0–100 from relevance, intent, demand, position, competition and effort (weights in Settings). Numbers appear only with their source. Click a keyword for the reasons.</p></div>
        <div className="inline-actions">
          <input className="input" placeholder="Search keywords" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="blog-help" style={{ padding: "0 20px 20px" }}>No keywords yet. The daily research adds them once it can send findings in.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Score</th><th>Keyword</th><th>Country</th><th>Intent</th><th>Searches / month</th><th>Our position</th><th>Next action</th></tr></thead>
            <tbody>
              {list.map((k) => (
                <Fragment key={k.id}>
                  <tr onClick={() => setOpen(open === k.id ? null : k.id)} style={{ cursor: "pointer" }}>
                    <td><span className={`badge ${k.score >= 70 ? "green" : k.score < 45 ? "gray" : ""}`}>{k.score}</span> {k.measured ? <Certainty c="verified" /> : <Certainty c="estimate" />}</td>
                    <td><strong>{k.keyword}</strong></td>
                    <td style={{ fontSize: 12.5 }}>{k.country}</td>
                    <td style={{ fontSize: 12.5 }}>{k.intent}</td>
                    <td style={{ fontSize: 12.5 }}>{k.search_volume != null ? <>{k.search_volume.toLocaleString("en-GB")} <span style={{ color: "var(--muted)" }}>({k.volume_source})</span></> : "No reliable data"}</td>
                    <td style={{ fontSize: 12.5 }}>{k.our_position != null ? <>{k.our_position} <span style={{ color: "var(--muted)" }}>({k.position_source})</span></> : "Not measured"}</td>
                    <td style={{ fontSize: 12.5 }}>{k.next_action || "—"}</td>
                  </tr>
                  {open === k.id && (
                    <tr><td colSpan={7} style={{ background: "#FAFAFA", fontSize: 12.5, lineHeight: 1.6 }}>
                      <b>Why this score:</b>
                      <ul style={{ margin: "4px 0", paddingLeft: 20, listStyle: "disc" }}>{k.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                      {k.page_url && <div><b>Our page:</b> {k.page_url}</div>}
                      {k.competitor_pages.length > 0 && <div><b>Competitor pages:</b> {k.competitor_pages.map((u, i) => <Fragment key={u}>{i > 0 && " · "}<a href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\//, "").slice(0, 60)}</a></Fragment>)}</div>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Research history ──────────────────────────────────────────────── */

function Research({ data }: { data: SeoOverview }) {
  const [kind, setKind] = useState<SeoFinding["kind"] | "">("");
  const list = data.findings.filter((f) => !kind || f.kind === kind);
  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><h2>Findings</h2><p className="blog-help">Everything the research and the website scans found, newest first. A repeat is counted, not added again.</p></div>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as SeoFinding["kind"] | "")}>
            <option value="">All kinds</option>
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {list.length === 0 ? (
          <p className="blog-help" style={{ padding: "0 20px 20px" }}>No findings yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Seen</th><th>Kind</th><th>Finding</th><th>How sure</th><th>Sources</th></tr></thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{when(f.last_seen_at)}{f.seen_count > 1 && <div style={{ color: "var(--muted)" }}>seen {f.seen_count}×</div>}</td>
                    <td style={{ fontSize: 12.5 }}>{KIND_LABEL[f.kind]}</td>
                    <td><strong>{f.title}</strong>{f.detail && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{f.detail}</div>}</td>
                    <td><Certainty c={f.certainty} /> <span className="badge gray">{f.confidence} confidence</span></td>
                    <td><Evidence items={f.evidence ?? []} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Runs</h2><p className="blog-help">Each research run, website scan and weekly summary, with what it could not check.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>What</th><th>Result</th><th>Summary</th><th>Could not check</th></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                  <td style={{ fontSize: 12.5 }}>{r.source.replace("_", " ")}</td>
                  <td><span className={`badge ${r.status === "ok" ? "green" : r.status === "failed" ? "red" : ""}`}>{r.status}</span></td>
                  <td style={{ fontSize: 12.5 }}>{r.summary ? r.summary.slice(0, 200) : "—"}{typeof r.stats?.findings_new === "number" && <div style={{ color: "var(--muted)" }}>{String(r.stats.findings_new)} new · {String(r.stats.findings_repeated ?? 0)} repeated · {String(r.stats.recommendations_new ?? 0)} new recommendations</div>}</td>
                  <td style={{ fontSize: 12.5 }}>{r.limitations || "—"}</td>
                </tr>
              ))}
              {data.runs.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ── Settings ──────────────────────────────────────────────────────── */

function Settings({ settings, busy, onSave }: { settings: SeoSettings; busy: boolean; onSave: (s: Record<string, unknown>) => void }) {
  const [s, setS] = useState(() => ({
    ...settings,
    countries: settings.countries.join("\n"),
    languages: settings.languages.join("\n"),
    categories: settings.categories.join("\n"),
    competitors: settings.competitors.join("\n"),
    seed_keywords: settings.seed_keywords.join("\n"),
  }));
  const set = (patch: Partial<typeof s>) => setS((x) => ({ ...x, ...patch }));
  const setW = (k: keyof Weights, v: string) => set({ scoring: { ...s.scoring, [k]: Number(v) } });
  const area = (label: string, key: "countries" | "languages" | "categories" | "competitors" | "seed_keywords", hint: string) => (
    <label className="blog-wide"><span className="field-label">{label}</span><textarea className="input" rows={4} value={s[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<typeof s>)} /><span className="blog-help">{hint}</span></label>
  );
  return (
    <section className="card">
      <div className="card-head"><div><h2>Settings</h2><p className="blog-help">What the agent researches. The daily research reads these; change them any time.</p></div></div>
      <div className="blog-step" style={{ borderTop: "none", paddingTop: 0 }}>
        <div className="blog-fields">
          <label className="blog-wide"><span className="field-label">Website</span><input className="input" value={s.site_url} onChange={(e) => set({ site_url: e.target.value })} /></label>
          <label className="blog-wide"><span className="field-label">What the business does</span><textarea className="input" rows={2} value={s.business} onChange={(e) => set({ business: e.target.value })} /></label>
          <label><span className="field-label">Audience</span><input className="input" value={s.audience} onChange={(e) => set({ audience: e.target.value })} /></label>
          <label><span className="field-label">Goal</span><input className="input" value={s.goals} onChange={(e) => set({ goals: e.target.value })} /></label>
          {area("Countries", "countries", "One per line")}
          {area("Languages", "languages", "One per line")}
          {area("Products / categories", "categories", "One per line")}
          {area("Competitors", "competitors", "Websites, one per line (e.g. lawdepot.com)")}
          {area("Seed keywords", "seed_keywords", "Searches to start from, one per line")}
          <label><span className="field-label">Research frequency</span>
            <select className="input" value={s.frequency} onChange={(e) => set({ frequency: e.target.value as SeoSettings["frequency"] })}>
              <option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="paused">Paused</option>
            </select>
          </label>
          <label><span className="field-label">Monthly budget for paid tools (S$)</span><input className="input" type="number" min={0} value={s.monthly_budget_sgd} onChange={(e) => set({ monthly_budget_sgd: Number(e.target.value) })} /><span className="blog-help">0 = free tools only</span></label>
          <label className="blog-wide"><span className="field-label">Website platform</span><input className="input" value={s.platform} onChange={(e) => set({ platform: e.target.value })} /></label>
          <div className="blog-wide">
            <span className="field-label">Scoring weights (0–10): how much each factor counts</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
              {(Object.keys(s.scoring) as (keyof Weights)[]).map((k) => (
                <label key={k} style={{ fontSize: 12, minWidth: 0 }}>{k}<input className="input" style={{ width: "100%", minWidth: 0 }} type="number" min={0} max={10} value={s.scoring[k]} onChange={(e) => setW(k, e.target.value)} /></label>
              ))}
            </div>
          </div>
        </div>
        <div className="blog-actions" style={{ marginTop: 16 }}>
          <button className="btn yellow" type="button" disabled={busy} onClick={() => onSave(s)}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      </div>
    </section>
  );
}
