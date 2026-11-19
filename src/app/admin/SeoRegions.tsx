"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportError, phraseTable, readExport, regionTable, type PhraseRow, type RegionUpload } from "@/lib/seo-regions/figures";

/**
 * Admin → SEO: where we show up in Google, region by region (0247).
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

interface Fetched {
  ready: boolean;
  uploads: RegionUpload[];
}
async function fetchUploads(): Promise<Fetched> {
  const r = await fetch("/api/seo/regions", { cache: "no-store" }).catch(() => null);
  const out = (r && r.ok ? await r.json().catch(() => null) : null) as { ready?: boolean; uploads?: RegionUpload[] } | null;
  return { ready: out?.ready !== false, uploads: out?.uploads ?? [] };
}

export default function SeoRegions() {
  const [uploads, setUploads] = useState<RegionUpload[] | null>(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /* the uploads are fetched outside React and set when they arrive (first on opening, then after each upload) */
  const show = useCallback((out: Fetched) => {
    setReady(out.ready);
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
    /* the newest export of each single country */
    const byCountry = new Map<string, RegionUpload>();
    for (const u of uploads ?? []) if (u.country && u.queries.length && !byCountry.has(u.country)) byCountry.set(u.country, u);
    return { latest, regions: latest ? regionTable(latest, all[1] ?? null) : [], compared: all[1] ?? null, phrases: latest ? phraseTable(latest) : [], countries: [...byCountry.values()] };
  }, [uploads]);

  return (
    <div className="table-card" style={{ marginBottom: 16 }}>
      <div className="table-head">
        <div className="head-text">
          <h2>Where we show up, by region</h2>
          <p>
            Google&rsquo;s own figures from Search Console. To refresh: Search Console → Performance → last 7 days → Export → Download CSV, then drop the zip here. For one country&rsquo;s searches, add a Country filter
            before exporting.
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
      ) : !view.latest ? (
        <div className="empty">No all-countries export yet. Upload one to see each region.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Showing?</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Average position</th>
                  <th>{view.compared ? "Change in impressions" : "Change"}</th>
                  <th>Countries</th>
                </tr>
              </thead>
              <tbody>
                {view.regions.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td>{r.showing ? <span className="badge green">Showing</span> : <span className="badge gray">Not showing</span>}</td>
                    <td>{fmt(r.impressions)}</td>
                    <td>{fmt(r.clicks)}</td>
                    <td>{pos(r.position)}</td>
                    <td className={r.change && r.change < 0 ? "bad" : r.change && r.change > 0 ? "good" : undefined}>{r.change === null ? "–" : r.change === 0 ? "no change" : `${r.change > 0 ? "▲ +" : "▼ "}${fmt(r.change)}`}</td>
                    <td className="muted-cell">{r.from.slice(0, 4).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted-cell" style={{ padding: "10px 18px 4px" }}>
            Source: Google Search Console, {period(view.latest)}, uploaded {shortDay(view.latest.uploaded_at)}
            {view.compared ? `; compared with the upload of ${shortDay(view.compared.uploaded_at)}` : ""}. An impression is one time a page of ours appeared in someone&rsquo;s results.
          </p>

          <Phrases title="The searches we follow, all regions" rows={view.phrases} />
          {view.countries.map((u) => (
            <Phrases key={u.country} title={`The searches we follow, in ${u.country}`} sub={`${period(u)}, uploaded ${shortDay(u.uploaded_at)}`} rows={phraseTable(u)} />
          ))}
        </>
      )}
    </div>
  );
}

function Phrases({ title, sub, rows }: { title: string; sub?: string; rows: PhraseRow[] }) {
  const seen = rows.filter((r) => r.impressions > 0).length;
  return (
    <>
      <div className="table-head" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="head-text">
          <h2>{title}</h2>
          <p>
            {seen} of {rows.length} had impressions{sub ? ` · ${sub}` : ""}. A search counts when it has every word of the phrase.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Search</th>
              <th>Showing?</th>
              <th>Average position</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>Mostly from</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.phrase}>
                <td>
                  {r.phrase}
                  {r.brand && <span className="badge gray" style={{ marginLeft: 8 }}>Brand</span>}
                </td>
                <td>{r.impressions > 0 ? <span className="badge green">Showing</span> : <span className="badge gray">No impressions</span>}</td>
                <td>{pos(r.position)}</td>
                <td>{fmt(r.impressions)}</td>
                <td>{fmt(r.clicks)}</td>
                <td className="muted-cell">{r.mostly ?? (r.matches > 1 ? `${r.matches} searches` : "–")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
