"use client";

import { useCallback, useRef, useState } from "react";
import { FIRM_WIDE, MAX_PLAYBOOK_CHARS, documentLook, type PlaybookVersion } from "@/lib/playbook";
import { stamp } from "./parts";

/**
 * The playbook panel: the firm's drafting rules, per document type and
 * firm-wide.
 *
 * ── WHY THIS IS NOT THE LIBRARY ─────────────────────────────────────────────
 * The training library above this panel holds sample documents, which the
 * model imitates. This holds RULES, which the model obeys — and is told they
 * beat the samples where the two disagree. A rule pasted into the library
 * would be read as a badly shaped NDA; a sample pasted here would be read
 * as a rule to reproduce the sample. Two doors, two kinds of thing.
 *
 * ── HOW IT IS USED ──────────────────────────────────────────────────────────
 * Pick a scope (firm-wide, or one document type). Paste the rules or drop a
 * file; Save makes that text the live version. Every save is kept: the
 * history lists them, any can be read, any can be restored (which saves it
 * again as a new version, so the log stays honest). "Switch off" retires the
 * live one without losing it.
 */

type Scope = { slug: string; label: string };

interface Loaded {
  /** Which scope this answer is for; the panel shows "Loading…" while it
   *  differs from the one selected. */
  scope: string;
  live: (PlaybookVersion & { content: string }) | null;
  versions: PlaybookVersion[];
}

export interface PlaybookInitial extends Loaded {
  /** 044 has not been run: the table is not there. */
  missing: boolean;
}

export default function Playbook({
  docTypes,
  initial,
}: {
  docTypes: { slug: string; label: string }[];
  /** The first scope's playbook, read on the server with the rest of the
   *  page, so the panel opens filled rather than fetching on arrival. Later
   *  scopes are fetched when chosen. */
  initial: PlaybookInitial;
}) {
  const scopes: Scope[] = [{ slug: FIRM_WIDE, label: "Firm-wide — every document" }, ...docTypes];
  const [scope, setScope] = useState<string>(initial.scope);
  const [answer, setAnswer] = useState<Loaded | null>(initial);
  const [missing, setMissing] = useState(initial.missing);
  const [text, setText] = useState(initial.live?.content ?? "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [reading, setReading] = useState<(PlaybookVersion & { content: string }) | null>(null);
  const input = useRef<HTMLInputElement>(null);

  /* Fetch first, set state after: nothing here touches state before the
     network answers, so a scope change simply shows the old answer as
     "Loading…" (see `loaded` below) until the new one lands. */
  const load = useCallback(async (s: string) => {
    let next: Loaded = { scope: s, live: null, versions: [] };
    let problem: string | null = null;
    let absent = false;
    try {
      const res = await fetch(`/api/admin/playbooks?scope=${encodeURIComponent(s)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<Loaded> & { error?: string };
      if (!res.ok) {
        if (/044_playbook/.test(json.error ?? "")) absent = true;
        else problem = json.error ?? "Could not load the playbook.";
      } else {
        next = { scope: s, live: json.live ?? null, versions: json.versions ?? [] };
      }
    } catch {
      problem = "Could not load the playbook.";
    }
    setMissing(absent);
    setNotice(problem ? { text: problem, tone: "err" } : null);
    setAnswer(next);
    setText(next.live?.content ?? "");
    setFile(null);
    setNote("");
  }, []);

  /* Choosing a scope fetches it; a slower answer for a scope no longer
     selected is ignored by the `loaded` check below. */
  function choose(s: string) {
    setScope(s);
    void load(s);
  }

  const loaded = answer && answer.scope === scope ? answer : null;
  const live = loaded?.live ?? null;
  const dirty = file !== null || text.trim() !== (live?.content ?? "").trim();
  const chars = text.length;
  const tooLong = chars > MAX_PLAYBOOK_CHARS;
  const label = scopes.find((s) => s.slug === scope)?.label ?? scope;
  /* What the page will be set in, read from the text in the box — so the
     effect of a "Font: Arial, 11pt" line is visible before it is saved. */
  const look = documentLook([text]);

  function takeFile(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setFile(f);
    setNotice(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set("scope", scope);
        form.set("note", note);
        form.set("file", file);
        res = await fetch("/api/admin/playbooks", { method: "POST", body: form });
      } else {
        res = await fetch("/api/admin/playbooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope, note, content: text }),
        });
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: PlaybookVersion & { content: string } };
      if (!res.ok || !json.ok || !json.version) {
        setNotice({ text: json.error ?? "Could not save.", tone: "err" });
        return;
      }
      await load(scope);
      setNotice({
        text: `Saved as version ${json.version.version} and live now — the next draft of this kind follows it.`,
        tone: "ok",
      });
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, string>, done: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/playbooks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "That did not work.", tone: "err" });
        return;
      }
      setReading(null);
      await load(scope);
      setNotice({ text: done, tone: "ok" });
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    const res = await fetch(`/api/admin/playbooks?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { version?: PlaybookVersion & { content: string }; error?: string };
    if (!res.ok || !json.version) {
      setNotice({ text: json.error ?? "Could not open that version.", tone: "err" });
      return;
    }
    setReading(json.version);
  }

  return (
    <div className="table-card playbook-card">
      <div className="table-head">
        <div className="source-table-title">
          <h2>Playbook</h2>
          <span className="source-count">
            {live ? `Version ${live.version} live · ${live.chars.toLocaleString("en-GB")} characters` : "Nothing live"}
          </span>
        </div>
        <div className="toolbar">
          <div className="select-wrap">
            <select aria-label="Playbook scope" style={{ width: 260 }} value={scope} onChange={(e) => choose(e.target.value)}>
              {scopes.map((s) => (
                <option key={s.slug} value={s.slug}>{s.label}</option>
              ))}
            </select>
          </div>
          {live && (
            <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "retire", scope }, "Switched off. The model no longer reads this playbook; every version is still in the history.")}>
              Switch off
            </button>
          )}
          <button className="btn yellow" type="button" disabled={busy || missing || !dirty || (!file && (text.trim().length < 20 || tooLong))} onClick={() => void save()}>
            {busy ? "Saving…" : live ? "Save as new version" : "Save and switch on"}
          </button>
        </div>
      </div>

      {missing && (
        <div className="setup-note" style={{ margin: "0 18px 14px" }}>
          <strong>The playbook table is missing.</strong> Run <code>supabase/044_playbook.sql</code> in the
          Supabase SQL editor. Until then drafting runs on the system prompt and the sample documents alone.
        </div>
      )}

      <p className="playbook-why">
        <b>Rules, not samples.</b> The training documents above show the model what a finished document looks
        like. The playbook tells it what the firm always does — numbering, defined terms, clauses that are never
        dropped, wording it must use or avoid. While a playbook is live it is the <b>only</b> authority on style and
        structure: it outranks the built-in house style, the clause order and the samples wherever they differ. What
        it cannot switch off are the guardrails — no invented facts, [[TO CONFIRM]] placeholders, the hard rules,
        the user’s detail level and the output format. Write it as instructions: short lines, one rule each.
      </p>

      <div className="playbook-grid">
        <div className="playbook-editor">
          <div className="playbook-editor-head">
            <label className="field-label" htmlFor="playbookText">{label}</label>
            <span className={tooLong ? "playbook-count over" : "playbook-count"}>
              {chars.toLocaleString("en-GB")} / {MAX_PLAYBOOK_CHARS.toLocaleString("en-GB")}
            </span>
          </div>
          <p className="playbook-look">
            Page set in <b>{look.font} {look.sizePt}pt</b>, title {look.titlePt}pt, {look.justify ? "justified" : "left-aligned"},
            line spacing {look.lineSpacing}, {look.spaceAfterPt}pt after paragraphs, headings {look.headingBeforePt}/{look.headingAfterPt}pt
            {look.source === "playbook"
              ? " — read from this playbook (a house_style block with font, body_size_pt, title_size_pt, line_spacing, space_after_pt, heading_space_before_pt, heading_space_after_pt, alignment_body — or the same in prose)."
              : " — the defaults. State them in the playbook to change them; the firm-wide playbook is read when this one says nothing."}
          </p>
          {file ? (
            <div className="playbook-file">
              <div className="filetype">{(file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4)}</div>
              <div>
                <div className="queue-name">{file.name}</div>
                <div className="queue-size">{(file.size / 1024).toFixed(0)} KB · replaces the text below when saved</div>
              </div>
              <button className="icon-btn remove-file" type="button" title="Remove" disabled={busy} onClick={() => setFile(null)}>×</button>
            </div>
          ) : null}
          <textarea
            id="playbookText"
            rows={16}
            placeholder={loaded ? `No playbook yet for ${label.toLowerCase()}. Paste the rules here, or drop a file.` : "Loading…"}
            value={text}
            disabled={busy || !loaded || missing}
            onChange={(e) => setText(e.target.value)}
          />
          <div
            className={drag ? "dropzone slim drag" : "dropzone slim"}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); takeFile(e.dataTransfer.files); }}
          >
            <span>Drop a file here — Word, PDF, Markdown or text — or</span>
            <button className="btn" type="button" disabled={busy || missing} onClick={() => input.current?.click()}>Browse</button>
            <input ref={input} accept=".pdf,.docx,.md,.txt" type="file" onChange={(e) => { takeFile(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="playbook-note">
            <label className="field-label" htmlFor="playbookNote">What changed (optional)</label>
            <input id="playbookNote" className="input" style={{ width: "100%" }} maxLength={200} placeholder="e.g. Added the 3-year survival rule" value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </div>
          {notice && (
            <p className="empty" role="status" style={{ textAlign: "left", padding: "8px 0 0", color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
              {notice.text}
            </p>
          )}
        </div>

        <div className="playbook-history">
          <h3>History</h3>
          {!loaded ? (
            <div className="empty">Loading…</div>
          ) : loaded.versions.length === 0 ? (
            <div className="empty">No versions saved yet.</div>
          ) : (
            <ol>
              {loaded.versions.map((v) => (
                <li key={v.id} className={v.live ? "live" : ""}>
                  <div className="playbook-v-head">
                    <b>Version {v.version}</b>
                    {v.live ? <span className="badge green">Live</span> : null}
                  </div>
                  <div className="playbook-v-meta">
                    {stamp(v.created_at)}
                    {v.saved_by_email ? ` · ${v.saved_by_email}` : ""}
                    {` · ${v.chars.toLocaleString("en-GB")} chars`}
                    {v.filename ? ` · ${v.filename}` : ""}
                  </div>
                  {v.note ? <div className="playbook-v-note">{v.note}</div> : null}
                  <div className="inline-actions">
                    <button className="link-btn" type="button" onClick={() => void open(v.id)}>Read</button>
                    {!v.live && (
                      <button className="link-btn" type="button" disabled={busy} onClick={() => void act({ action: "restore", id: v.id }, `Version ${v.version} is live again, saved as a new version.`)}>
                        Restore
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {reading && (
        <div className="overlay show" onClick={(e) => e.target === e.currentTarget && setReading(null)}>
          <div className="modal wide">
            <div className="modal-head">
              <div>
                <h3>Version {reading.version}{reading.live ? " — live" : ""}</h3>
                <p>
                  {stamp(reading.created_at)}
                  {reading.saved_by_email ? ` · ${reading.saved_by_email}` : ""}
                  {reading.note ? ` · ${reading.note}` : ""}
                </p>
              </div>
              <button className="close" type="button" onClick={() => setReading(null)}>×</button>
            </div>
            <div className="modal-body">
              <pre className="playbook-read">{reading.content}</pre>
            </div>
            <div className="modal-foot">
              <button className="btn" type="button" onClick={() => setReading(null)}>Close</button>
              {!reading.live && (
                <button className="btn dark" type="button" disabled={busy} onClick={() => void act({ action: "restore", id: reading.id }, `Version ${reading.version} is live again, saved as a new version.`)}>
                  Restore this version
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
