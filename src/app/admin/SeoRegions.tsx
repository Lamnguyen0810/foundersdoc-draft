"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportError, REGION_GROUPS, bandOf, isBrand, pageOf, phraseTable, readExport, regionTable, searchBands, topSearches, totals, type Band, type QueryRow, type RegionUpload } from "@/lib/seo-regions/figures";
import "./seo-regions.css";

/**
 * Admin → SEO: where we show up in Google, region by region (0247; laid out again in 0248).
 *
 * THE PAGE, TOP TO BOTTOM (each part answers one question, in plain words):
 *   the four figures   how much were we seen, and how much of it is on page one
 *   1. By region       where in the world we appear, and how far up
 *   2. Searches        what people typed: on page one · nearly there (page two) · further back
 *   3. Followed        the phrases we chose to watch; the ones nobody saw us for are folded away
 *   4. By country      the same searches inside one country, one country at a time
 * "Times shown" is Search Console's impressions, "Visits" its clicks, and a position is always said with
 * its page, because "position 34" means little and "page 4" means a lot.
 *
 * An admin drops in a Search Console export (Performance → Export → Download CSV: a zip). The file is read
 * here in the browser, and only its countries, searches and counts are sent and stored (supabase/134).
 * Each upload is kept, so the region table shows the change since the one before.
 *   - an export of every country      → the region table, and the followed searches across all regions
 *   - an export filtered to a country → the followed searches in that country
 * The figures are Google's own. Nothing here is a guess, and nothing is published.
 */

const fmt = (n: number) => n.toLocaleString("en-GB");
const pos = (p: number | null) => (p === null ? "–" : p.toFixed(1));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (d: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
};
const period = (u: RegionUpload) => (u.date_from && u.date_to ? `${shortDay(u.date_from)} to ${shortDay(u.date_to)}` : "period not in the file");

/** Countries in the order of their region groups: Singapore first. */
const ORDER = REGION_GROUPS.flatMap((g) => g.countries);

interface Fetched {
  ready: boolean;
  /** the site reads Search Console by itself each morning (0248) */
  auto: boolean;
  uploads: RegionUpload[];
}
async function fetchUploads(): Promise<Fetched> {
  const r = await fetch("/api/seo/regions", { cache: "no-store" }).catch(() => null);
  const out = (r && r.ok ? await r.json().catch(() => null) : null) as { ready?: boolean; auto?: boolean; uploads?: RegionUpload[] } | null;
  return { ready: out?.ready !== false, auto: !!out?.auto, uploads: out?.uploads ?? [] };
}

export default function SeoRegions() {
  const [uploads, setUploads] = useState<RegionUpload[] | null>(null);
  const [ready, setReady] = useState(true);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /* the uploads are fetched outside React and set when they arrive (first on opening, then after each upload) */
  const show = useCallback((out: Fetched) => {
    setReady(out.ready);
    setAuto(out.auto);
    setUploads(out.uploads);
  }, []);
  useEffect(() => {
    let gone = false;
    void fetchUploads().then((out) => {
      if (!gone) show(out);
    });
    return () => {
      gone = true;
    };
  }, [show]);

  async function take(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setNote("");
    setFailed(false);
    try {
      const files: Record<string, string> = {};
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) {
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await f.arrayBuffer());
          for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir && /\.csv$/i.test(name)) files[name] = await entry.async("string");
        } else if (/\.csv$/i.test(f.name)) files[f.name] = await f.text();
      }
      const upload = readExport(files);
      const r = await fetch("/api/seo/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(upload) });
      const out = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!out.ok) throw new ExportError(out.error ?? "Could not save the export.");
      setNote(`Saved: ${upload.country ?? "all countries"}, ${period(upload)}, ${fmt(upload.countries.length)} countries and ${fmt(upload.queries.length)} searches.`);
      show(await fetchUploads());
    } catch (e) {
      setFailed(true);
      setNote(e instanceof ExportError ? e.message : "That file couldn't be read. Use Search Console's Export → Download CSV and drop the zip here.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const view = useMemo(() => {
    const all = (uploads ?? []).filter((u) => !u.country && u.countries.length > 0);
    const latest = all[0] ?? null;
    /* the newest figures of each single country */
    const byCountry = new Map<string, RegionUpload>();
    for (const u of uploads ?? []) if (u.country && u.queries.length && !byCountry.has(u.country)) byCountry.set(u.country, u);
    if (!latest) return null;
    const followed = phraseTable(latest);
    return { latest, compared: all[1] ?? null, sum: totals(latest), regions: regionTable(latest, all[1] ?? null), bands: searchBands(latest), followed, countries: [...byCountry.values()].sort((x, y) => ORDER.indexOf(x.country ?? "") - ORDER.indexOf(y.country ?? "")) };
  }, [uploads]);

  return (
    <div className="table-card seo-reg" style={{ marginBottom: 16 }}>
      <div className="table-head">
        <div className="head-text">
          <h2>Where we show up in Google</h2>
          <p>
            {view ? `Google Search Console, ${period(view.latest)}. ` : "Google's own figures, from Search Console. "}
            {auto ? "Read automatically every morning at 8:30am Singapore time." : "Automatic reading is off, so refresh by hand: Search Console → Performance → last 7 days → Export → Download CSV, then upload the zip."}
          </p>
        </div>
        <label className="btn" style={{ cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>
          {busy ? "Reading…" : "Upload export"}
          <input ref={input} type="file" accept=".zip,.csv" multiple hidden disabled={busy} onChange={(e) => void take(e.target.files)} />
        </label>
      </div>

      {!ready && (
        <div className="setup-note" style={{ margin: "0 18px 16px" }}>
          <strong>One database file is needed.</strong> Run <code>supabase/134_seo_regions.sql</code> in Supabase, then reload.
        </div>
      )}
      {note &&
        (failed ? (
          <div className="setup-note" style={{ margin: "0 18px 16px" }}>
            {note}
          </div>
        ) : (
          <p className="good" role="status" style={{ margin: "0 18px 14px", fontSize: 12 }}>
            {note}
          </p>
        ))}

      {uploads === null ? (
        <div className="empty">Loading…</div>
      ) : !view ? (
        <div className="empty">No figures yet. Upload an export made with no country filter to see each region.</div>
      ) : (
        <>
          <div className="seo-reg-tiles">
            <div className="seo-reg-tile">
              <b>{fmt(view.sum.impressions)}</b>
              <span>Times shown</span>
              <small>How often a page of ours appeared in someone&rsquo;s results</small>
            </div>
            <div className="seo-reg-tile">
              <b>{fmt(view.sum.clicks)}</b>
              <span>Visits from Google</span>
              <small>{view.sum.impressions ? `${((view.sum.clicks / view.sum.impressions) * 100).toFixed(1)}% of the times we were shown` : "–"}</small>
            </div>
            <div className="seo-reg-tile">
              <b>
                {view.sum.regionsShowing} of {view.sum.regions}
              </b>
              <span>Regions we show up in</span>
              <small>{view.regions.filter((r) => !r.showing).map((r) => r.name).join(", ") || "Every region"}{view.regions.some((r) => !r.showing) ? ": not showing" : ""}</small>
            </div>
            <div className="seo-reg-tile">
              <b>{fmt(view.sum.pageOne)}</b>
              <span>Searches on page one</span>
              <small>{fmt(view.sum.nearly)} more on page two, the nearest to win. Our own name is not counted.</small>
            </div>
          </div>

          <div className="seo-reg-part">
            <h3>
              <span className="seo-reg-n">1</span>By region
            </h3>
            <p>Where in the world we appear. &ldquo;Where we sit&rdquo; is the average over every search we appeared for in that region, so it is a health figure for the region, not our rank for one search.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Showing?</th>
                    <th className="num">Times shown</th>
                    <th className="num">Visits</th>
                    <th>Where we sit, on average</th>
                    <th>{view.compared ? `Times shown, since ${shortDay(view.compared.uploaded_at)}` : "Change"}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.regions.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.name}</b>
                        {/* the countries behind a group; a region that is one country needs no second line */}
                        {(r.from.length > 1 || r.id === "other") && r.from.length > 0 && <small>{r.from.slice(0, 5).join(", ")}</small>}
                      </td>
                      <td>{r.showing ? <span className="badge green">Showing</span> : <span className="badge gray">Not showing</span>}</td>
                      <td className="num">{fmt(r.impressions)}</td>
                      <td className="num">{fmt(r.clicks)}</td>
                      <td>
                        <Place position={r.position} />
                      </td>
                      <td className={r.change && r.change < 0 ? "bad" : r.change && r.change > 0 ? "good" : "muted-cell"}>
                        {r.change === null ? "First figures" : r.change === 0 ? "No change" : `${r.change > 0 ? "▲ +" : "▼ "}${fmt(r.change)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="seo-reg-part">
            <h3>
              <span className="seo-reg-n">2</span>What people searched when they saw us
            </h3>
            <p>The real words, all regions together, in three groups. Page two is where a better title or a little more on the page most often pays off.</p>
            <Searches band="one" title="On page one" hint="People can see us. Keep these." rows={view.bands.one} />
            <Searches band="near" title="Nearly there: page two" hint="The quickest wins." rows={view.bands.near} />
            <Searches band="far" title="Further back: page three or later" hint="Seen by very few; worth a page of their own only if the search matters." rows={view.bands.far} />
          </div>

          <div className="seo-reg-part">
            <h3>
              <span className="seo-reg-n">3</span>The searches we follow
            </h3>
            <p>
              The {view.followed.length} phrases we chose to watch. A phrase counts every search that has all of its words. {view.followed.filter((f) => f.impressions > 0).length} of them were seen; the rest are the ones nobody
              saw us for, which usually means people use different words (see part 2).
            </p>
            <Searches
              rows={view.followed.filter((f) => f.impressions > 0).map((f) => ({ query: f.phrase, clicks: f.clicks, impressions: f.impressions, position: f.position ?? 0 }))}
              most={99}
              empty="Nobody saw us for any of the followed phrases in this period."
            />
            <details>
              <summary>
                <b>{view.followed.filter((f) => f.impressions === 0).length} not seen</b>: show the list
              </summary>
              <p className="seo-reg-more" style={{ margin: "0 2px 12px" }}>
                {view.followed.filter((f) => f.impressions === 0).map((f) => f.phrase).join(" · ")}
              </p>
            </details>
          </div>

          {view.countries.length > 0 && (
            <div className="seo-reg-part">
              <h3>
                <span className="seo-reg-n">4</span>By country
              </h3>
              <p>The same searches inside one country. Open a country to see our real rank for each search there.</p>
              {view.countries.map((u) => {
                const rows = topSearches(u, 12).filter((q) => q.impressions > 0);
                const one = rows.filter((q) => bandOf(q.position) === "one").length;
                return (
                  <details key={u.country}>
                    <summary>
                      <b>{u.country}</b>: {fmt(u.queries.reduce((n, q) => n + q.impressions, 0))} times shown across {fmt(u.queries.filter((q) => q.impressions > 0).length)} searches, {one} of the busiest {rows.length} on page one
                    </summary>
                    <Searches rows={rows} most={12} empty="No searches recorded for this country in this period." />
                  </details>
                );
              })}
            </div>
          )}

          <p className="seo-reg-key">
            <b>How to read it.</b> Times shown = how often a page of ours appeared in someone&rsquo;s Google results (Search Console calls this an impression). Visits = how often someone then clicked through. Where we sit = our place in
            the results: page 1 is positions 1 to 10, page 2 is 11 to 20. Google hides very rare searches, so the search lists add up to less than the totals. Figures are about 3 days behind.
            {view.latest.uploaded_at ? ` Last updated ${shortDay(view.latest.uploaded_at)}${view.latest.uploaded_by ? ` (${view.latest.uploaded_by})` : ""}.` : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** A position, said as its page first: "Page 2" then "position 10.9". */
function Place({ position }: { position: number | null }) {
  const page = pageOf(position);
  if (page === null) return <span className="muted-cell">–</span>;
  return (
    <>
      <span className={`seo-place ${bandOf(position) ?? ""}`}>Page {page}</span>
      <span className="seo-place-at">position {pos(position)}</span>
    </>
  );
}

/** One list of searches: the search, how often we were shown, visits, and where we sit. */
function Searches({ rows, title, hint, band, most = 8, empty }: { rows: QueryRow[]; title?: string; hint?: string; band?: Band; most?: number; empty?: string }) {
  const shown = rows.slice(0, most);
  return (
    <>
      {title && (
        <div className="seo-reg-group">
          <span className={`seo-place ${band ?? ""}`}>{title}</span>
          <small>
            {fmt(rows.length)} {rows.length === 1 ? "search" : "searches"}. {hint}
          </small>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="seo-reg-more">{empty ?? "None in this period."}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Search</th>
                <th className="num">Times shown</th>
                <th className="num">Visits</th>
                <th>Where we sit</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.query}>
                  <td>
                    {q.query}
                    {isBrand(q.query) && (
                      <span className="badge gray" style={{ marginLeft: 8 }}>
                        Our name
                      </span>
                    )}
                  </td>
                  <td className="num">{fmt(q.impressions)}</td>
                  <td className="num">{fmt(q.clicks)}</td>
                  <td>
                    <Place position={q.position || null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown.length && <p className="seo-reg-more">and {fmt(rows.length - shown.length)} more, less busy.</p>}
    </>
  );
}
