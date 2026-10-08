"use client";
/* The thumbnails come from YouTube at addresses only known at run time;
   next/image would need the host configured, and these are small previews. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SHELF, VIDEO_CATEGORIES, VIDEO_SHELVES, type VideoRow } from "@/lib/podcast/videos";

/**
 * The Videos tab: put a YouTube video on the podcast page without touching
 * code (085).
 *
 *   1. Paste the YouTube link and press Look up. The title and thumbnail
 *      come from YouTube.
 *   2. Choose the shelf, the topic (the colour and the filter chip), the
 *      date, and whether it is featured in the carousel at the top.
 *   3. Save. It is on /podcast within a minute. Hide or remove it at any
 *      time from the list.
 */

interface Draft {
  id: string | null;
  url: string;
  youtubeId: string;
  thumbnail: string;
  title: string;
  description: string;
  category: string;
  shelf: string;
  kind: "video" | "short";
  publishedOn: string;
  featured: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

function fromRow(r: VideoRow): Draft {
  return {
    id: r.id,
    url: `https://www.youtube.com/watch?v=${r.youtube_id}`,
    youtubeId: r.youtube_id,
    thumbnail: `https://i.ytimg.com/vi/${r.youtube_id}/hqdefault.jpg`,
    title: r.title,
    description: r.description,
    category: r.category,
    shelf: r.shelf,
    kind: r.kind,
    publishedOn: r.published_on,
    featured: r.featured,
  };
}

const CAT_LABEL = Object.fromEntries(VIDEO_CATEGORIES.map((c) => [c.value, c.label]));
const SHELF_LABEL = Object.fromEntries(VIDEO_SHELVES.map((s) => [s.value, s.label]));

export default function Videos({ rows, missing }: { rows: VideoRow[]; missing: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string; href?: string } | null>(null);
  const set = (patch: Partial<Draft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));

  async function lookUp() {
    setBusy("lookup");
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/videos?url=${encodeURIComponent(url.trim())}`);
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string; title?: string; thumbnail?: string; url?: string };
      if (!res.ok || !j.id) {
        setNotice({ tone: "bad", text: j.error ?? "Could not read that link." });
        return;
      }
      const already = rows.find((r) => r.youtube_id === j.id);
      if (already) {
        setD(fromRow(already));
        setNotice({ tone: "ok", text: "That video is already on the page — this is its entry. Change it and save." });
        return;
      }
      const category = "general";
      setD({
        id: null,
        url: j.url ?? url.trim(),
        youtubeId: j.id,
        thumbnail: j.thumbnail ?? "",
        title: j.title ?? "",
        description: "",
        category,
        shelf: DEFAULT_SHELF[category],
        kind: "video",
        publishedOn: today(),
        featured: true,
      });
      if (!j.title) setNotice({ tone: "bad", text: "YouTube did not give a title (it may be slow). Type it in." });
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!d) return;
    setBusy("save");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...d, status: "live" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok || !j.id) {
        setNotice({ tone: "bad", text: j.error ?? "Could not save the video." });
        return;
      }
      setD(null);
      setUrl("");
      setNotice({ tone: "ok", text: "Saved. It is on the podcast page within a minute.", href: "/podcast" });
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function patch(r: VideoRow, body: { status?: "live" | "hidden"; featured?: boolean }) {
    setBusy(r.id);
    try {
      const res = await fetch("/api/admin/videos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setNotice({ tone: "bad", text: j.error ?? "Could not change it." });
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function remove(r: VideoRow) {
    if (!window.confirm(`Remove “${r.title}” from the podcast page? The video stays on YouTube.`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/admin/videos?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setNotice({ tone: "bad", text: j.error ?? "Could not remove it." });
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  const canSave = Boolean(d && d.youtubeId && d.title.trim() && busy === "");

  return (
    <div className="blog-admin">
      {missing && (
        <div className="setup-note">
          <strong>The videos table is missing.</strong> Run <code>supabase/085_podcast_videos.sql</code> in the Supabase SQL editor
          (press “Run without RLS”). Until then nothing can be added here.
        </div>
      )}
      {notice && (
        <div className={`blog-notice ${notice.tone}`} role="status">
          {notice.text}{" "}
          {notice.href && (
            <a href={notice.href} target="_blank" rel="noopener">
              Open the page
            </a>
          )}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Add a video</h2>
            <p className="blog-help">Paste the YouTube link. The title and thumbnail come from YouTube; you choose where it sits.</p>
          </div>
        </div>
        <div className="blog-step" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="blog-fields">
            <label className="blog-wide">
              <span className="field-label">YouTube link</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url.trim()) void lookUp();
                  }}
                />
                <button className="btn yellow" type="button" disabled={!url.trim() || busy !== ""} onClick={() => void lookUp()}>
                  {busy === "lookup" ? "Looking up…" : "Look up"}
                </button>
              </div>
            </label>
          </div>

          {d && (
            <>
              <div className="blog-photo" style={{ marginTop: 16 }}>
                {d.thumbnail ? <img src={d.thumbnail} alt="" /> : <div className="blog-photo-empty">No thumbnail yet</div>}
                <div className="blog-photo-side">
                  <span className="field-label">Video</span>
                  <a href={d.url} target="_blank" rel="noopener" style={{ fontSize: 13 }}>
                    {d.url}
                  </a>
                  <small style={{ color: "var(--muted)", fontSize: 11.5 }}>
                    The thumbnail is YouTube’s own. Change it on YouTube and the page follows.
                  </small>
                </div>
              </div>
              <div className="blog-fields">
                <label className="blog-wide">
                  <span className="field-label">Title</span>
                  <input className="input" value={d.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="blog-wide">
                  <span className="field-label">One or two lines under the title</span>
                  <textarea className="input" rows={2} maxLength={600} value={d.description} onChange={(e) => set({ description: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">Topic (colour and filter)</span>
                  <select
                    className="input"
                    value={d.category}
                    onChange={(e) => set({ category: e.target.value, shelf: d.id ? d.shelf : (DEFAULT_SHELF[e.target.value] ?? d.shelf) })}
                  >
                    {VIDEO_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Shelf on the page</span>
                  <select className="input" value={d.shelf} onChange={(e) => set({ shelf: e.target.value, kind: e.target.value === "shorts" ? "short" : d.kind })}>
                    {VIDEO_SHELVES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Date shown</span>
                  <input className="input" type="date" value={d.publishedOn} onChange={(e) => set({ publishedOn: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">Kind</span>
                  <select className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value === "short" ? "short" : "video" })}>
                    <option value="video">Video</option>
                    <option value="short">Short</option>
                  </select>
                </label>
                <label style={{ alignSelf: "end" }}>
                  <span className="field-label">Carousel at the top</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 36 }}>
                    <input type="checkbox" checked={d.featured} onChange={(e) => set({ featured: e.target.checked })} /> Featured (newest featured video is “Latest episode”)
                  </span>
                </label>
              </div>
              <div className="blog-actions" style={{ marginTop: 16 }}>
                <button className="btn" type="button" disabled={busy !== ""} onClick={() => setD(null)}>Cancel</button>
                <button className="btn yellow" type="button" disabled={!canSave} onClick={() => void save()}>
                  {busy === "save" ? "Saving…" : d.id ? "Save changes" : "Put it on the page"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Videos added here</h2>
            <p className="blog-help">
              {rows.length === 0 ? "None yet. The videos built into the page stay as they are." : `${rows.length} video${rows.length === 1 ? "" : "s"}. The ones built into the page are not listed; they stay as they are.`}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Date</th>
                  <th>Topic · shelf</th>
                  <th>Carousel</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="blog-row-title">
                        <img src={`https://i.ytimg.com/vi/${r.youtube_id}/default.jpg`} alt="" />
                        <span>
                          <a href={`https://www.youtube.com/watch?v=${r.youtube_id}`} target="_blank" rel="noopener">{r.title}</a>
                          <small>{r.kind === "short" ? "Short" : "Video"} · {r.youtube_id}</small>
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.published_on}</td>
                    <td style={{ fontSize: 12 }}>{CAT_LABEL[r.category] ?? r.category} · {SHELF_LABEL[r.shelf] ?? r.shelf}</td>
                    <td>{r.featured ? <span className="badge green">Featured</span> : <span className="badge gray">—</span>}</td>
                    <td>{r.status === "live" ? <span className="badge green">Live</span> : <span className="badge gray">Hidden</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn" type="button" disabled={busy !== ""} onClick={() => { setD(fromRow(r)); setNotice(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>{" "}
                      <button className="btn" type="button" disabled={busy !== ""} onClick={() => void patch(r, { featured: !r.featured })}>{r.featured ? "Unfeature" : "Feature"}</button>{" "}
                      <button className="btn" type="button" disabled={busy !== ""} onClick={() => void patch(r, { status: r.status === "live" ? "hidden" : "live" })}>{r.status === "live" ? "Hide" : "Show"}</button>{" "}
                      <button className="btn" type="button" disabled={busy !== ""} onClick={() => void remove(r)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
