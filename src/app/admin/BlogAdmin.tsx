"use client";
/* The photos come from Supabase storage at addresses only known at run time;
   next/image would need each host configured, and these are small previews. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  applyLinks,
  CATEGORIES,
  CTAS,
  LINK_TARGETS,
  RESERVED_SLUGS,
  slugify,
  STATIC_ARTICLES,
  type BlogLink,
  type LinkMode,
} from "@/lib/blog/html";

/**
 * The Blog tab: write an article onto the website without touching code.
 *
 *   1. Upload the article (Word, Markdown or text). Its first heading becomes
 *      the title and its first paragraph the summary; both can be changed.
 *   2. Upload a photo. It goes straight to the `blog` bucket (055).
 *   3. Choose the links: select words in the preview, pick where they go.
 *   4. Publish. The article is live at /resources/<address> within a minute
 *      and gets a card on the blog page. Take it down again at any time.
 */

export interface BlogRow {
  id: string;
  slug: string;
  title: string;
  deck: string;
  summary: string;
  category: string;
  cta: string;
  body_html: string;
  links: BlogLink[] | null;
  hero_url: string | null;
  hero_alt: string;
  hero_caption: string;
  read_minutes: number;
  source_name: string;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
}

interface Draft {
  id: string | null;
  title: string;
  slug: string;
  slugTouched: boolean;
  deck: string;
  summary: string;
  category: string;
  cta: string;
  date: string;
  body: string;
  sourceName: string;
  heroUrl: string;
  heroAlt: string;
  heroCaption: string;
  links: BlogLink[];
  suggestions: BlogLink[];
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: Draft = {
  id: null,
  title: "",
  slug: "",
  slugTouched: false,
  deck: "",
  summary: "",
  category: "contracts",
  cta: "nda",
  date: today(),
  body: "",
  sourceName: "",
  heroUrl: "",
  heroAlt: "",
  heroCaption: "",
  links: [],
  suggestions: [],
};

function fromRow(r: BlogRow): Draft {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    slugTouched: true,
    deck: r.deck,
    summary: r.summary,
    category: r.category,
    cta: r.cta,
    date: r.published_at ?? today(),
    body: r.body_html,
    sourceName: r.source_name,
    heroUrl: r.hero_url ?? "",
    heroAlt: r.hero_alt,
    heroCaption: r.hero_caption,
    links: r.links ?? [],
    suggestions: [],
  };
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BlogAdmin({
  posts,
  missing,
  supabaseUrl,
  supabaseKey,
}: {
  posts: BlogRow[];
  missing: boolean;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"" | "parse" | "photo" | "save">("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string; href?: string } | null>(null);
  const [selected, setSelected] = useState("");
  const [target, setTarget] = useState(LINK_TARGETS[0].href);
  const [custom, setCustom] = useState("");
  const [mode, setMode] = useState<LinkMode>("first");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<Draft>) => setD((prev) => (prev ? { ...prev, ...patch } : prev));

  const preview = useMemo(() => (d ? applyLinks(d.body, d.links) : { html: "", missing: [] }), [d]);

  const articleTargets = useMemo(
    () => [
      ...STATIC_ARTICLES.map((a) => ({ href: `/resources/${a.slug}/`, label: a.title })),
      ...posts
        .filter((p) => p.status === "published" && p.id !== d?.id)
        .map((p) => ({ href: `/resources/${p.slug}`, label: p.title })),
    ],
    [posts, d?.id],
  );
  const labelFor = (href: string) =>
    LINK_TARGETS.find((t) => t.href === href)?.label ?? articleTargets.find((t) => t.href === href)?.label ?? href;

  async function readArticle(file: File) {
    setBusy("parse");
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/blog/parse", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string; title?: string; slug?: string; deck?: string; summary?: string; heroAlt?: string;
        body?: string; suggestions?: BlogLink[]; sourceName?: string;
      };
      if (!res.ok || !j.body) {
        setNotice({ tone: "bad", text: j.error ?? "That file could not be read." });
        return;
      }
      setD((prev) => {
        const base = prev ?? { ...EMPTY, date: today() };
        const title = j.title ?? base.title;
        return {
          ...base,
          title,
          slug: base.slugTouched ? base.slug : (j.slug ?? slugify(title)),
          deck: j.deck || base.deck,
          summary: j.summary || base.summary,
          heroAlt: base.heroAlt || j.heroAlt || "",
          body: j.body!,
          sourceName: j.sourceName ?? file.name,
          suggestions: j.suggestions ?? [],
          category: /term sheet|investor|fundrais|valuation/i.test(`${title} ${j.body}`) ? "fundraising" : base.category,
          cta: /term sheet/i.test(title) ? "term" : base.cta,
        };
      });
      setNotice({ tone: "ok", text: `Read “${file.name}”. Check the title and summary, add a photo and choose your links.` });
    } finally {
      setBusy("");
    }
  }

  async function uploadPhoto(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setNotice({ tone: "bad", text: "The photo must be a PNG, JPG or WEBP." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ tone: "bad", text: "That photo is over 5 MB. Try a smaller one." });
      return;
    }
    if (!supabaseUrl || !supabaseKey) {
      setNotice({ tone: "bad", text: "Supabase is not configured here, so photos cannot be uploaded." });
      return;
    }
    setBusy("photo");
    try {
      const client = createBrowserClient(supabaseUrl, supabaseKey);
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${new Date().getFullYear()}/${slugify(d?.slug || d?.title || "post") || "post"}-${Date.now()}.${ext}`;
      const { error } = await client.storage.from("blog").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (error) {
        setNotice({
          tone: "bad",
          text: /bucket/i.test(error.message)
            ? "Photo storage is not set up yet — run supabase/055_blog_posts.sql."
            : `Could not upload that photo: ${error.message}`,
        });
        return;
      }
      const { data } = client.storage.from("blog").getPublicUrl(path);
      set({ heroUrl: data.publicUrl, heroAlt: d?.heroAlt || d?.title || "" });
    } finally {
      setBusy("");
    }
  }

  function captureSelection() {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || !previewRef.current || !sel.anchorNode || !previewRef.current.contains(sel.anchorNode)) return;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length >= 2 && text.length <= 100) setSelected(text);
  }

  function addLink(link: BlogLink) {
    if (!d) return;
    const others = d.links.filter((l) => l.phrase.toLowerCase() !== link.phrase.toLowerCase());
    set({ links: [...others, link] });
  }

  function addSelected() {
    const href = target === "custom" ? custom.trim() : target;
    if (!selected) return;
    if (!/^(https?:\/\/|\/|mailto:)/.test(href)) {
      setNotice({ tone: "bad", text: "Enter a web address starting with https:// or /." });
      return;
    }
    addLink({ phrase: selected, href, mode });
    setSelected("");
    window.getSelection()?.removeAllRanges();
  }

  async function save(status: "published" | "draft") {
    if (!d) return;
    setBusy("save");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: d.id,
          title: d.title,
          slug: d.slug,
          deck: d.deck,
          summary: d.summary,
          category: d.category,
          cta: d.cta,
          publishedAt: d.date,
          body: d.body,
          sourceName: d.sourceName,
          heroUrl: d.heroUrl,
          heroAlt: d.heroAlt,
          heroCaption: d.heroCaption,
          links: d.links,
          status,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string; slug?: string; missing?: string[] };
      if (!res.ok || !j.id) {
        setNotice({ tone: "bad", text: j.error ?? "Could not save the article." });
        return;
      }
      set({ id: j.id });
      const missed = j.missing?.length ? ` These words were not found, so they are not linked: ${j.missing.join(", ")}.` : "";
      setNotice(
        status === "published"
          ? { tone: "ok", text: `Published. It will be live within a minute.${missed}`, href: `/resources/${j.slug}` }
          : { tone: "ok", text: `Saved as a draft. It is not on the website yet.${missed}` },
      );
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function setStatus(p: BlogRow, status: "published" | "draft") {
    const res = await fetch("/api/admin/blog", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, status }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setNotice(
      res.ok
        ? { tone: "ok", text: status === "published" ? `“${p.title}” is live again.` : `“${p.title}” was taken off the website.` }
        : { tone: "bad", text: j.error ?? "Could not change it." },
    );
    router.refresh();
  }

  async function remove(p: BlogRow) {
    if (!window.confirm(`Delete “${p.title}” for good? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/blog?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    setNotice(res.ok ? { tone: "ok", text: `Deleted “${p.title}”.` } : { tone: "bad", text: "Could not delete it." });
    if (d?.id === p.id) setD(null);
    router.refresh();
  }

  const slugProblem = d
    ? !d.slug
      ? "Add a web address."
      : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)
        ? "Use lower-case letters, numbers and hyphens only."
        : RESERVED_SLUGS.has(d.slug)
          ? "An article on the site already uses this address."
          : posts.some((p) => p.slug === d.slug && p.id !== d.id)
            ? "Another post already uses this address."
            : ""
    : "";
  const canSave = Boolean(d && d.title.trim().length >= 3 && d.body && !slugProblem && busy === "");

  return (
    <div className="blog-admin">
      {missing && (
        <div className="setup-note">
          <strong>The blog is not switched on yet.</strong> Run <code>supabase/055_blog_posts.sql</code> in the Supabase SQL
          editor. It creates the posts table and the photo storage.
        </div>
      )}

      {notice && (
        <div className={`blog-notice ${notice.tone}`} role="status">
          {notice.text}{" "}
          {notice.href && (
            <a href={notice.href} target="_blank" rel="noreferrer">
              View it on the website ↗
            </a>
          )}
        </div>
      )}

      <div className="table-card">
        <div className="table-head">
          <div className="source-table-title">
            <h2>Blog articles</h2>
            <span className="source-count">
              {posts.length} written here · {STATIC_ARTICLES.length} built into the site
            </span>
          </div>
          <div className="toolbar">
            <button
              className="btn yellow"
              type="button"
              disabled={missing}
              onClick={() => {
                setD({ ...EMPTY, date: today() });
                setSelected("");
                setNotice(null);
              }}
            >
              New article
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Article</th>
                <th>Topic</th>
                <th>Status</th>
                <th>Date</th>
                <th>Links</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">No articles written here yet. Press New article to add the first one.</div>
                  </td>
                </tr>
              )}
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="blog-row-title">
                      {p.hero_url ? <img src={p.hero_url} alt="" /> : <span className="blog-thumb-empty" />}
                      <span>
                        <b>{p.title}</b>
                        <small>/resources/{p.slug}</small>
                      </span>
                    </div>
                  </td>
                  <td>{CATEGORIES.find((c) => c.id === p.category)?.label ?? p.category}</td>
                  <td>
                    {p.status === "published" ? <span className="badge green">Live</span> : <span className="badge gray">Draft</span>}
                  </td>
                  <td>{stamp(p.published_at)}</td>
                  <td>{(p.links ?? []).length}</td>
                  <td>
                    <div className="blog-actions">
                      <button className="link-btn" type="button" onClick={() => { setD(fromRow(p)); setSelected(""); setNotice(null); }}>
                        Edit
                      </button>
                      {p.status === "published" ? (
                        <>
                          <a className="link-btn" href={`/resources/${p.slug}`} target="_blank" rel="noreferrer">View ↗</a>
                          <button className="link-btn" type="button" onClick={() => void setStatus(p, "draft")}>Take down</button>
                        </>
                      ) : (
                        <button className="link-btn" type="button" onClick={() => void setStatus(p, "published")}>Publish</button>
                      )}
                      <button className="link-btn danger" type="button" onClick={() => void remove(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {d && (
        <div className="table-card blog-editor">
          <div className="table-head">
            <div className="source-table-title">
              <h2>{d.id ? "Edit article" : "New article"}</h2>
              <span className="source-count">Goes live on foundersdoc.com/resources/{d.slug || "…"}</span>
            </div>
            <div className="toolbar">
              <button className="btn" type="button" onClick={() => setD(null)} disabled={busy !== ""}>
                Close
              </button>
              <button className="btn" type="button" disabled={!canSave} onClick={() => void save("draft")}>
                Save as draft
              </button>
              <button className="btn yellow" type="button" disabled={!canSave} onClick={() => void save("published")}>
                {busy === "save" ? "Publishing…" : "Publish to website"}
              </button>
            </div>
          </div>

          <div className="blog-steps">
            {/* 1 ── the article */}
            <section className="blog-step">
              <h3><span>1</span> Article file</h3>
              <div className="dropzone slim">
                <span>{d.sourceName ? `Using “${d.sourceName}”` : "Word (.docx), Markdown (.md) or text (.txt)"}</span>
                <button className="btn" type="button" disabled={busy !== ""} onClick={() => fileRef.current?.click()}>
                  {busy === "parse" ? "Reading…" : d.body ? "Replace file" : "Upload article"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".docx,.md,.markdown,.txt,.html,.htm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void readArticle(f);
                  }}
                />
              </div>
              <div className="blog-fields">
                <label className="blog-wide">
                  <span className="field-label">Title</span>
                  <input
                    className="input"
                    value={d.title}
                    onChange={(e) => set({ title: e.target.value, slug: d.slugTouched ? d.slug : slugify(e.target.value) })}
                  />
                </label>
                <label className="blog-wide">
                  <span className="field-label">Web address</span>
                  <div className="blog-slug">
                    <span>/resources/</span>
                    <input
                      className="input"
                      value={d.slug}
                      onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"), slugTouched: true })}
                    />
                  </div>
                  {slugProblem && <small className="blog-err">{slugProblem}</small>}
                </label>
                <label className="blog-wide">
                  <span className="field-label">Summary under the title</span>
                  <textarea rows={2} value={d.deck} onChange={(e) => set({ deck: e.target.value })} />
                </label>
                <label className="blog-wide">
                  <span className="field-label">“In brief” box (optional)</span>
                  <textarea rows={2} value={d.summary} onChange={(e) => set({ summary: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">Topic</span>
                  <select style={{ width: "100%" }} value={d.category} onChange={(e) => set({ category: e.target.value })}>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Date shown</span>
                  <input className="input" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">Box at the end</span>
                  <select style={{ width: "100%" }} value={d.cta} onChange={(e) => set({ cta: e.target.value })}>
                    {CTAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* 2 ── the photo */}
            <section className="blog-step">
              <h3><span>2</span> Photo</h3>
              <div className="blog-photo">
                {d.heroUrl ? <img src={d.heroUrl} alt={d.heroAlt} /> : <div className="blog-photo-empty">No photo yet — shown at the top of the article and on its card (16:9 works best).</div>}
                <div className="blog-photo-side">
                  <button className="btn" type="button" disabled={busy !== ""} onClick={() => photoRef.current?.click()}>
                    {busy === "photo" ? "Uploading…" : d.heroUrl ? "Replace photo" : "Upload photo"}
                  </button>
                  {d.heroUrl && (
                    <button className="link-btn danger" type="button" onClick={() => set({ heroUrl: "" })}>Remove photo</button>
                  )}
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadPhoto(f);
                    }}
                  />
                  <label>
                    <span className="field-label">Describe the photo (for screen readers)</span>
                    <input className="input" value={d.heroAlt} onChange={(e) => set({ heroAlt: e.target.value })} />
                  </label>
                  <label>
                    <span className="field-label">Caption (optional)</span>
                    <input className="input" value={d.heroCaption} placeholder="Illustration: Founders Doc" onChange={(e) => set({ heroCaption: e.target.value })} />
                  </label>
                </div>
              </div>
            </section>

            {/* 3 ── the links */}
            <section className="blog-step">
              <h3><span>3</span> Links</h3>
              <p className="blog-help">
                Select any word or phrase in the article below, choose where it should go, and press <b>Add link</b>.
                Linked words show in yellow, as they will on the website.
              </p>

              <div className={`blog-linkbar${selected ? " on" : ""}`}>
                <span className="blog-sel">{selected ? <>Link <b>“{selected}”</b> to</> : "Select words in the article to link them"}</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!selected}>
                  <optgroup label="FD AI and pages">
                    {LINK_TARGETS.map((t) => (
                      <option key={t.href} value={t.href}>{t.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Articles">
                    {articleTargets.map((t) => (
                      <option key={t.href} value={t.href}>{t.label}</option>
                    ))}
                  </optgroup>
                  <option value="custom">Another web address…</option>
                </select>
                {target === "custom" && (
                  <input className="input" placeholder="https://…" value={custom} disabled={!selected} onChange={(e) => setCustom(e.target.value)} />
                )}
                <select value={mode} onChange={(e) => setMode(e.target.value as LinkMode)} disabled={!selected}>
                  <option value="first">First time it appears</option>
                  <option value="all">Every time it appears</option>
                </select>
                <button className="btn yellow" type="button" disabled={!selected} onClick={addSelected}>Add link</button>
              </div>

              {d.links.length > 0 && (
                <ul className="blog-links">
                  {d.links.map((l) => (
                    <li key={l.phrase} className={preview.missing.includes(l.phrase) ? "missing" : ""}>
                      <b>“{l.phrase}”</b> → {labelFor(l.href)} <small>{l.mode === "all" ? "every time" : "first time"}</small>
                      {preview.missing.includes(l.phrase) && <small className="blog-err"> not found in the article</small>}
                      <button type="button" aria-label={`Remove the link on ${l.phrase}`} onClick={() => set({ links: d.links.filter((x) => x !== l) })}>×</button>
                    </li>
                  ))}
                </ul>
              )}

              {d.suggestions.filter((s) => !d.links.some((l) => l.phrase.toLowerCase() === s.phrase.toLowerCase())).length > 0 && (
                <div className="blog-suggest">
                  <span>Suggested:</span>
                  {d.suggestions
                    .filter((s) => !d.links.some((l) => l.phrase.toLowerCase() === s.phrase.toLowerCase()))
                    .map((s) => (
                      <button key={s.phrase} type="button" onClick={() => addLink(s)}>
                        + “{s.phrase}” → {labelFor(s.href)}
                      </button>
                    ))}
                </div>
              )}

              {d.body ? (
                <div className="blog-preview-wrap">
                  <div className="blog-preview-head">
                    {d.heroUrl && <img src={d.heroUrl} alt="" />}
                    <h1>{d.title || "Untitled"}</h1>
                    {d.deck && <p className="deck">{d.deck}</p>}
                  </div>
                  <div
                    ref={previewRef}
                    className="blog-preview"
                    onMouseUp={captureSelection}
                    onClick={(e) => {
                      /* The preview's links are for looking at, not for leaving the page. */
                      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
                    }}
                    onKeyUp={captureSelection}
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
              ) : (
                <div className="empty">Upload the article file to see it here.</div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
