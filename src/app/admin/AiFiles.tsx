"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import {
  JURISDICTIONS,
  PLACEHOLDER_RE,
  REDACTION_LABEL,
  describeFlags,
  proposeRedactions,
  type FolderRow,
  type Redaction,
  type SourcePrivacy,
  type SourceRow,
  type SourceStatus,
} from "@/lib/ai-library";

/**
 * The AI files tab — the design's "AI source library", wired to real rows.
 *
 * Every element here is the designer's: the head, the pipeline filter, the
 * checks row, the folders, the table and the three modals. What changed is
 * only that the rows come from ai_sources, the counts are counted, and the
 * buttons call the API instead of mutating a demo table.
 *
 * ── THE STATUS MACHINE ──────────────────────────────────────────────────────
 *   needs_review  → "Review" opens the privacy dialog
 *   reviewed      → "Approve" makes it ready
 *   ready         → "Ready", disabled; this is what Gemini reads
 * "Processing" is kept as a filter because the design has it, but a source
 * never sits there: text is extracted on upload, so approval is immediate.
 */

type Stage = "all" | "needs-review" | "reviewed" | "processing" | "ready";

const STAGE_STATUS: Record<Exclude<Stage, "all">, SourceStatus> = {
  "needs-review": "needs_review",
  reviewed: "reviewed",
  processing: "processing",
  ready: "ready",
};

const UNFILED = "__unfiled__";
const ALL = "__all__";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusPill(s: SourceRow): { cls: string; text: string } {
  if (s.status === "ready") return { cls: "status-ready", text: "AI Ready" };
  if (s.status === "processing") return { cls: "status-processing", text: "Processing" };
  if (s.status === "reviewed") return { cls: "status-reviewed", text: "Reviewed" };
  return s.privacy === "needs_redaction"
    ? { cls: "status-needs-redaction", text: "Needs Redaction" }
    : { cls: "status-review", text: "Needs Review" };
}

/* The same patterns the upload scan counts — UEN, NRIC/FIN, email, Singapore
   phone — as one expression, so the viewer can mark them in the text. The scan
   gives a reviewer a number; this shows them where. */
const SENSITIVE =
  /\b(?:\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])\b|\b[STFGM]\d{7}[A-Z]\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+65[\s-]?)?\b[3689]\d{3}[\s-]?\d{4}\b/gi;

/** The document's text, with anything the scan recognises wrapped in a mark. */
function highlight(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = new RegExp(SENSITIVE.source, "gi");
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={key++}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function privacyPill(p: SourcePrivacy): { cls: string; text: string } {
  switch (p) {
    case "clear": return { cls: "privacy-clear", text: "Clear" };
    case "redacted": return { cls: "privacy-redacted", text: "Redacted" };
    case "needs_redaction": return { cls: "privacy-needs-redaction", text: "Needs redaction" };
    default: return { cls: "privacy-pending", text: "Pending" };
  }
}

export default function AiFiles({
  sources: initialSources,
  folders: initialFolders,
  docTypes,
  ranking = true,
}: {
  sources: SourceRow[];
  folders: FolderRow[];
  docTypes: { slug: string; label: string }[];
  /** False until 016 has been run: no Rank column, no Redact button. */
  ranking?: boolean;
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [folders, setFolders] = useState(initialFolders);
  /* Document types whose order has been changed and not yet saved. */
  const [dirtyOrder, setDirtyOrder] = useState<Set<string>>(new Set());

  /* ── the table follows the server ─────────────────────────────────────
     The rows live in state so a click can change them without a round trip.
     But state set from a prop is set ONCE, on mount: when the page re-rendered
     on the server — after an upload's refresh, or the "Review AI files" link
     at the top — the fresh rows arrived and the table kept showing the old
     ones. Opening another tab and coming back "fixed" it only because that
     remounted the component. This is React's own pattern for adjusting state
     when a prop changes: compare with what was last seen, and re-sync. */
  const [seenSources, setSeenSources] = useState(initialSources);
  const [seenFolders, setSeenFolders] = useState(initialFolders);
  if (initialSources !== seenSources) {
    setSeenSources(initialSources);
    setSources(initialSources);
    setDirtyOrder(new Set());
  }
  if (initialFolders !== seenFolders) {
    setSeenFolders(initialFolders);
    setFolders(initialFolders);
  }
  const [stage, setStage] = useState<Stage>("all");
  const [folder, setFolder] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  /* The document window. Any row opens it to read and review; the Redact
     button opens the same window with the private details already marked. */
  const [viewing, setViewing] = useState<{ source: SourceRow; mode: "read" | "redact" } | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? "Unfiled";

  /* ── counts, counted ─────────────────────────────────────────────────── */
  const counts = useMemo(() => {
    const c = { all: sources.length, "needs-review": 0, reviewed: 0, processing: 0, ready: 0 };
    for (const s of sources) {
      if (s.status === "needs_review") c["needs-review"]++;
      else if (s.status === "reviewed") c.reviewed++;
      else if (s.status === "processing") c.processing++;
      else if (s.status === "ready") c.ready++;
    }
    return c;
  }, [sources]);

  /* How many ready sources each document type has: Gemini reads at most the
     top eight of a type, and the "AI ready" card says so. */
  const readyByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sources) if (s.status === "ready") m.set(s.doc_type_slug, (m.get(s.doc_type_slug) ?? 0) + 1);
    return [...m.entries()];
  }, [sources]);

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sources) m.set(s.folder_id ?? UNFILED, (m.get(s.folder_id ?? UNFILED) ?? 0) + 1);
    return m;
  }, [sources]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources
      .filter((s) => {
        if (stage !== "all" && s.status !== STAGE_STATUS[stage]) return false;
        if (folder === UNFILED && s.folder_id) return false;
        if (folder !== ALL && folder !== UNFILED && s.folder_id !== folder) return false;
        if (q && !`${s.title} ${s.filename} ${s.doc_type_slug} ${s.jurisdiction}`.toLowerCase().includes(q)) return false;
        return true;
      })
      /* Best first within a type — the order Gemini reads them in. */
      .sort((a, b) =>
        a.doc_type_slug === b.doc_type_slug
          ? (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.created_at.localeCompare(b.created_at)
          : a.doc_type_slug.localeCompare(b.doc_type_slug),
      );
  }, [sources, stage, folder, search]);

  /* ── ordering ────────────────────────────────────────────────────────────
     Moves change ranks in local state only; "Save order" writes them. A row
     moves among the rows of its own type — every one of them, filtered out
     of view or not — so a rank always means the same thing. */
  const typeRows = (slug: string) =>
    sources
      .filter((s) => s.doc_type_slug === slug)
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.created_at.localeCompare(b.created_at));

  function placeAt(id: string, position: number) {
    const row = sources.find((s) => s.id === id);
    if (!row) return;
    const rows = typeRows(row.doc_type_slug).filter((s) => s.id !== id);
    const at = Math.max(0, Math.min(rows.length, position - 1));
    rows.splice(at, 0, row);
    const newRank = new Map(rows.map((s, i) => [s.id, i + 1]));
    setSources((prev) => prev.map((s) => (newRank.has(s.id) ? { ...s, rank: newRank.get(s.id)! } : s)));
    setDirtyOrder((d) => new Set(d).add(row.doc_type_slug));
  }

  function nudge(id: string, delta: -1 | 1) {
    const row = sources.find((s) => s.id === id);
    if (!row) return;
    const rows = typeRows(row.doc_type_slug);
    const i = rows.findIndex((s) => s.id === id);
    placeAt(id, i + 1 + delta);
  }

  function discardOrder() {
    const server = new Map(seenSources.map((s) => [s.id, s.rank]));
    setSources((prev) => prev.map((s) => (server.has(s.id) ? { ...s, rank: server.get(s.id) ?? null } : s)));
    setDirtyOrder(new Set());
  }

  async function saveOrder() {
    setBusy(true);
    setNotice(null);
    try {
      const orders = [...dirtyOrder].map((slug) => ({ slug, ids: typeRows(slug).map((s) => s.id) }));
      const res = await fetch("/api/admin/ai-sources/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; saved?: number; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "Could not save the order.", tone: "err" });
        return;
      }
      setDirtyOrder(new Set());
      setNotice({ text: "Order saved. Gemini now reads the top-ranked examples first.", tone: "ok" });
      router.refresh();
    } catch {
      setNotice({ text: "Could not reach the server.", tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  const visibleIds = visible.map((s) => s.id);
  const allTicked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const tickedRows = sources.filter((s) => selected.has(s.id));
  const canBulkApprove = tickedRows.length > 0 && tickedRows.every((s) => s.status === "reviewed");

  /* ── API calls ───────────────────────────────────────────────────────── */
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/ai-sources/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; source?: Partial<SourceRow> };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "Could not save.", tone: "err" });
        return false;
      }
      setSources((rows) => rows.map((r) => (r.id === id ? { ...r, ...json.source } : r)));
      return true;
    } catch {
      setNotice({ text: "Could not reach the server.", tone: "err" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: string[]) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/ai-sources/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "Could not delete.", tone: "err" });
        return;
      }
      setSources((rows) => rows.filter((r) => !ids.includes(r.id)));
      setSelected(new Set());
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    const ids = tickedRows.map((s) => s.id);
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/ai-sources/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; approved?: number; skipped?: string[]; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "Could not approve.", tone: "err" });
        return;
      }
      const skipped = new Set(json.skipped ?? []);
      const now = new Date().toISOString();
      setSources((rows) =>
        rows.map((r) => (ids.includes(r.id) && !skipped.has(r.id) ? { ...r, status: "ready", approved_at: now } : r)),
      );
      setSelected(new Set());
      if (skipped.size > 0) setNotice({ text: `${skipped.size} not approved — review them first.`, tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* ── head ──────────────────────────────────────────────────────── */}
      <div className="ai-library-head">
        <div>
          <span className="ai-kicker">AI SOURCE LIBRARY</span>
          <h2>Training documents</h2>
        </div>
        <div className="toolbar ai-library-actions">
          <input
            className="input"
            placeholder="Search sources"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn" type="button" onClick={() => setFolderOpen(true)}>
            New folder
          </button>
          <button className="btn yellow" type="button" onClick={() => setUploadOpen(true)}>
            Add documents
          </button>
        </div>
      </div>

      {/* ── pipeline ──────────────────────────────────────────────────── */}
      <div aria-label="Training document status filters" className="training-pipeline">
        {(
          [
            ["all", "All sources"],
            ["needs-review", "Needs review"],
            ["reviewed", "Reviewed"],
            ["processing", "Processing"],
            ["ready", "AI ready"],
          ] as [Stage, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={stage === id ? "training-stage active" : "training-stage"}
            onClick={() => setStage(id)}
          >
            <span>{label}</span>
            <strong>{counts[id]}</strong>
            {id === "ready" && ranking && (
              <small className="stage-note">
                {readyByType.length === 1
                  ? `${Math.min(8, readyByType[0][1])} of ${readyByType[0][1]} read by AI`
                  : "top 8 of each type read by AI"}
              </small>
            )}
          </button>
        ))}
      </div>

      <div className="ai-check-row">
        <span>Before AI ready</span>
        <div className="ai-checks">
          <span>✓ Source permitted</span>
          <span>✓ Privacy reviewed</span>
          <span>✓ Correct version</span>
          <span>✓ Jurisdiction tagged</span>
        </div>
      </div>

      {/* ── folders ───────────────────────────────────────────────────── */}
      <div className="folder-section">
        <div className="section-row">
          <h2>Folders</h2>
        </div>
        <div className="folder-grid">
          <div
            className={folder === ALL ? "folder selected" : "folder"}
            onClick={() => setFolder(ALL)}
            role="button"
            tabIndex={0}
          >
            <div className="folder-icon" />
            <div>
              <h3>All files</h3>
              <p>{sources.length} document{sources.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          {folders.map((f) => {
            const n = folderCounts.get(f.id) ?? 0;
            return (
              <div
                key={f.id}
                className={folder === f.id ? "folder selected" : "folder"}
                onClick={() => setFolder(f.id)}
                role="button"
                tabIndex={0}
              >
                <div className="folder-icon" />
                <div>
                  <h3>{f.name}</h3>
                  <p>{n} document{n === 1 ? "" : "s"}</p>
                </div>
              </div>
            );
          })}
          <div
            className={folder === UNFILED ? "folder selected" : "folder"}
            onClick={() => setFolder(UNFILED)}
            role="button"
            tabIndex={0}
          >
            <div className="folder-icon" />
            <div>
              <h3>Unfiled</h3>
              <p>{folderCounts.get(UNFILED) ?? 0} document{(folderCounts.get(UNFILED) ?? 0) === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── table ─────────────────────────────────────────────────────── */}
      <div className="table-card ai-source-table">
        <div className="table-head">
          <div className="source-table-title">
            <h2>
              {folder === ALL ? "All sources" : folder === UNFILED ? "Unfiled" : folderName(folder)}
            </h2>
            <span className="source-count">
              {visible.length} file{visible.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="toolbar">
            {dirtyOrder.size > 0 && (
              <>
                <button className="btn" type="button" disabled={busy} onClick={discardOrder}>
                  Discard
                </button>
                <button className="btn dark" type="button" disabled={busy} onClick={() => void saveOrder()}>
                  {busy ? "Saving…" : "Save order"}
                </button>
              </>
            )}
            <button className="btn yellow" type="button" disabled={!canBulkApprove || busy} onClick={() => void bulkApprove()}>
              Approve
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={tickedRows.length === 0 || busy}
              onClick={() => setDeleting(tickedRows.map((s) => s.id))}
            >
              Delete
            </button>
          </div>
        </div>

        {notice && (
          <p
            className="empty"
            role="status"
            style={{ textAlign: "left", padding: "0 14px 10px", color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}
          >
            {notice.text}
          </p>
        )}

        <div className="table-wrap">
          <table style={{ minWidth: 1160 }}>
            <thead>
              <tr>
                <th className="select-col">
                  <input
                    className="file-select"
                    type="checkbox"
                    checked={allTicked}
                    onChange={() =>
                      setSelected(allTicked ? new Set() : new Set(visibleIds))
                    }
                  />
                </th>
                <th>Name</th>
                {ranking && <th className="rank-col" title="1 is the firm's preferred example. Gemini reads the top 8 of each type, best first.">Rank</th>}
                <th>Folder</th>
                <th>Type</th>
                <th>Jurisdiction</th>
                <th>Version</th>
                <th>Privacy</th>
                <th>AI status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={ranking ? 11 : 10}>
                    <div className="empty">
                      {sources.length === 0
                        ? "No documents in the library yet. Add the firm's sample documents to begin."
                        : "Nothing matches this filter."}
                    </div>
                  </td>
                </tr>
              )}
              {visible.map((s) => {
                const st = statusPill(s);
                const pv = privacyPill(s.privacy);
                /* The design's type tags are short — "NDA", "SHA". A slug that
                   short is shown as its own tag; a longer one gets its label. */
                const typeLabel =
                  s.doc_type_slug.length <= 5
                    ? s.doc_type_slug.toUpperCase()
                    : (docTypes.find((d) => d.slug === s.doc_type_slug)?.label ?? s.doc_type_slug);
                return (
                  <tr
                    key={s.id}
                    className={selected.has(s.id) ? "selected-row openable" : "openable"}
                    tabIndex={0}
                    title="Open to read and review"
                    onClick={() => setViewing({ source: s, mode: "read" })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewing({ source: s, mode: "read" });
                      }
                    }}
                  >
                    <td className="select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="file-select row-select"
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                    </td>
                    <td>
                      <div className="filename" title={s.filename}>
                        <div className="filetype">{s.file_ext.toUpperCase().slice(0, 4)}</div>
                        {s.title}
                      </div>
                    </td>
                    {ranking && (
                      <td className="rank-col" onClick={(e) => e.stopPropagation()}>
                        <div className="rank-cell">
                          <button className="icon-btn rank-btn" type="button" title="Move up" disabled={busy || (s.rank ?? 1) <= 1} onClick={() => nudge(s.id, -1)}>↑</button>
                          <button className="icon-btn rank-btn" type="button" title="Move down" disabled={busy || (s.rank ?? 0) >= typeRows(s.doc_type_slug).length} onClick={() => nudge(s.id, 1)}>↓</button>
                          <input
                            className="rank-input"
                            type="number"
                            min={1}
                            max={typeRows(s.doc_type_slug).length}
                            value={s.rank ?? ""}
                            aria-label="Rank"
                            onChange={(e) => {
                              const v = Number.parseInt(e.target.value, 10);
                              if (Number.isFinite(v) && v >= 1) placeAt(s.id, v);
                            }}
                          />
                        </div>
                      </td>
                    )}
                    <td>{folderName(s.folder_id)}</td>
                    <td><span className="pill">{typeLabel}</span></td>
                    <td><span className="pill">{s.jurisdiction}</span></td>
                    <td>{s.version ?? "—"}</td>
                    <td>
                      <span className={`privacy-pill ${pv.cls}`} title={describeFlags(s.privacy_flags ?? {})}>
                        {pv.text}
                      </span>
                    </td>
                    <td><span className={`status-pill ${st.cls}`}>{st.text}</span></td>
                    <td>{day(s.updated_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="inline-actions">
                        {ranking && (
                          <button
                            className="approve-btn"
                            data-action="redact"
                            type="button"
                            title={s.redacted_at ? `Redacted — ${s.redaction_count} item${s.redaction_count === 1 ? "" : "s"} blacked out. Open to redact more.` : "Black out the private details"}
                            disabled={busy}
                            onClick={() => setViewing({ source: s, mode: "redact" })}
                          >
                            Redact
                          </button>
                        )}
                        {s.status === "ready" ? (
                          <button className="approve-btn" data-action="ready" type="button" disabled>Ready</button>
                        ) : s.status === "reviewed" ? (
                          <button
                            className="approve-btn"
                            data-action="approve"
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(s.id, { action: "approve" })}
                          >
                            Approve
                          </button>
                        ) : s.status === "processing" ? (
                          <button className="approve-btn" data-action="processing" type="button" disabled>Processing</button>
                        ) : (
                          <button
                            className="approve-btn"
                            data-action="review"
                            type="button"
                            disabled={busy}
                            onClick={() => setViewing({ source: s, mode: "read" })}
                          >
                            Review
                          </button>
                        )}
                        <button
                          className="icon-btn remove-file"
                          type="button"
                          title="Delete"
                          disabled={busy}
                          onClick={() => setDeleting([s.id])}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {uploadOpen && (
        <UploadModal
          folders={folders}
          docTypes={docTypes}
          onClose={() => setUploadOpen(false)}
          onDone={(rows, message, allOk) => {
            setUploadOpen(false);
            /* The rows the server wrote go straight into the table. The refresh
               behind it re-counts the utility strip; the person is not made to
               wait for it to see what they just added. */
            if (rows.length > 0) setSources((prev) => [...rows, ...prev]);
            setNotice({ text: message, tone: allOk ? "ok" : "err" });
            if (rows.length > 0) router.refresh();
          }}
        />
      )}

      {viewing && (
        <ViewModal
          key={`${viewing.source.id}:${viewing.mode}`}
          source={sources.find((s) => s.id === viewing.source.id) ?? viewing.source}
          mode={viewing.mode}
          busy={busy}
          onClose={() => setViewing(null)}
          onSave={async (privacy, note) => {
            if (await patch(viewing.source.id, { action: "review", privacy, note })) setViewing(null);
          }}
          onApprove={async () => {
            if (await patch(viewing.source.id, { action: "approve" })) setViewing(null);
          }}
          onRedact={async (items, expectedLength) => {
            const ok = await patch(viewing.source.id, { action: "redact", items, expectedLength });
            if (ok) setNotice({ text: `Redacted. ${items.length} item${items.length === 1 ? "" : "s"} blacked out; the original words are gone.`, tone: "ok" });
            return ok;
          }}
        />
      )}

      {deleting && (
        <div className="overlay show" onClick={(e) => e.target === e.currentTarget && setDeleting(null)}>
          <div className="modal small">
            <div className="modal-head">
              <div>
                <h3>Delete files?</h3>
                <p>This cannot be undone.</p>
              </div>
              <button className="close" type="button" onClick={() => setDeleting(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                {deleting.length === 1
                  ? `Delete "${sources.find((s) => s.id === deleting[0])?.title ?? "this document"}" from the library? Gemini will stop reading it immediately.`
                  : `Delete ${deleting.length} documents from the library? Gemini will stop reading them immediately.`}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" type="button" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn danger" type="button" disabled={busy} onClick={() => void remove(deleting)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {folderOpen && (
        <FolderModal
          onClose={() => setFolderOpen(false)}
          onCreated={(f) => {
            setFolders((all) => [...all, f].sort((a, b) => a.name.localeCompare(b.name)));
            setFolderOpen(false);
          }}
        />
      )}
    </>
  );
}

/* ── upload ──────────────────────────────────────────────────────────────── */
function UploadModal({
  folders,
  docTypes,
  onClose,
  onDone,
}: {
  folders: FolderRow[];
  docTypes: { slug: string; label: string }[];
  onClose: () => void;
  onDone: (rows: SourceRow[], message: string, allOk: boolean) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState(docTypes[0]?.slug ?? "");
  const [jurisdiction, setJurisdiction] = useState<string>(JURISDICTIONS[0]);
  const [folderId, setFolderId] = useState("");
  const [permitted, setPermitted] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.set("docType", docType);
    fd.set("jurisdiction", jurisdiction);
    fd.set("folderId", folderId);
    fd.set("permitted", permitted ? "1" : "0");
    try {
      const res = await fetch("/api/admin/ai-sources", { method: "POST", body: fd });
      /* Read the body once as text, then try it as JSON: a crash on the server
         or a proxy in the way answers with HTML or plain text, and the person
         should see the status and the first line of it, not a shrug. */
      const raw = await res.text().catch(() => "");
      let json: {
        added?: number;
        results?: { filename: string; ok: boolean; error?: string; row?: SourceRow }[];
        error?: string;
      } = {};
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        json = {};
      }
      if (!res.ok) {
        const firstLine = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        setError(json.error ?? `Upload failed (HTTP ${res.status})${firstLine ? `: ${firstLine}` : "."}`);
        return;
      }
      if (!json.results && json.added === undefined) {
        setError(`Upload failed: the server answered with something other than a result (HTTP ${res.status}). If you were signed out, sign in again and retry.`);
        return;
      }
      const failed = (json.results ?? []).filter((r) => !r.ok);
      const rows = (json.results ?? []).flatMap((r) => (r.ok && r.row ? [r.row] : []));
      const msg =
        `${json.added ?? 0} added to the library, awaiting review.` +
        (failed.length ? ` Not added: ${failed.map((f) => `${f.filename} (${f.error})`).join("; ")}` : "");
      onDone(rows, msg, failed.length === 0);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = files.length > 0 && docType && permitted && !busy;

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Add training documents</h3>
            <p>PDF, Word (.docx) or text documents.</p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div
            className={drag ? "dropzone drag" : "dropzone"}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          >
            <div className="upload-symbol">↑</div>
            <h4>Drag and drop files here</h4>
            <p>or browse from your computer</p>
            <button className="btn" type="button" onClick={() => input.current?.click()}>Browse</button>
            <input
              ref={input}
              accept=".pdf,.docx,.txt"
              multiple
              type="file"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="upload-meta">
            <div>
              <label className="field-label">Document type</label>
              <select style={{ width: "100%" }} value={docType} onChange={(e) => setDocType(e.target.value)}>
                {docTypes.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Jurisdiction</label>
              <select style={{ width: "100%" }} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
                {JURISDICTIONS.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Folder</label>
              <select style={{ width: "100%" }} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">By document type (NDAs, Term Sheets…)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
                <option value="none">Unfiled</option>
              </select>
            </div>
          </div>

          <label className="upload-permission">
            <input type="checkbox" checked={permitted} onChange={(e) => setPermitted(e.target.checked)} />
            <span>Source is permitted for internal AI use</span>
          </label>

          <div className="queue">
            <div className="queue-title">
              <strong>Selected files</strong>
              <span>{files.length} file{files.length === 1 ? "" : "s"}</span>
            </div>
            {files.length === 0 ? (
              <div className="empty">No files selected.</div>
            ) : (
              files.map((f) => (
                <div className="queue-item" key={`${f.name}-${f.size}`}>
                  <div className="filetype">{(f.name.split(".").pop() ?? "").toUpperCase().slice(0, 4)}</div>
                  <div>
                    <div className="queue-name">{f.name}</div>
                    <div className="queue-size">{(f.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Remove"
                    onClick={() => setFiles(files.filter((x) => x !== f))}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {error && <p className="queue-warning duplicate">{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn dark" type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Adding…" : "Add to library"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── review ──────────────────────────────────────────────────────────────── */
/**
 * One document, open on the screen — the window a reviewer actually needs.
 *
 * The table row tells you a file exists; this tells you what is in it. The
 * text shown is the text stored in the database, which is the text Gemini is
 * given verbatim when it drafts, so what a reviewer reads here and what the
 * model reads are the same thing by construction.
 *
 * Anything the upload scan recognised as personal or identifying — UENs,
 * NRICs, emails, phone numbers — is marked in the text, so the eye goes
 * straight to the parts that decide the privacy question instead of hunting
 * for them in ten pages of boilerplate.
 */
/**
 * Text with placeholders drawn as bars. Both modes use it: the read mode
 * for a document that has already been redacted, and the redact mode after
 * Apply, when the placeholders have just been written.
 */
function withBars(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...highlight(text.slice(last, m.index)));
    const label = m[0].replace(/^\[REDACTED ?/, "").replace(/\]$/, "") || "TEXT";
    out.push(
      <span className="redact-bar done" key={`p${key++}`} title={`Redacted ${label.toLowerCase()}`}>
        {label}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...highlight(text.slice(last)));
  return out;
}

/**
 * The redaction preview: the text with every marked string drawn as a black
 * bar that still occupies its own width, so the page keeps its shape and the
 * reviewer can see what is about to go. Clicking a bar keeps that text —
 * everywhere it occurs, since a name that is not private in one clause is
 * not private in the next.
 */
function withProposals(text: string, items: Redaction[], onKeep: (item: Redaction) => void): React.ReactNode[] {
  if (items.length === 0) return withBars(text);
  const ordered = [...items].sort((a, b) => b.text.length - a.text.length);
  const escaped = ordered.map((r) => r.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const byText = new Map(ordered.map((r) => [r.text, r]));
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const part of text.split(re)) {
    if (part === "") continue;
    const item = byText.get(part);
    if (item) {
      out.push(
        <button
          type="button"
          className="redact-bar"
          key={`r${key++}`}
          title={`${REDACTION_LABEL[item.kind]} — click to keep this text`}
          onClick={() => onKeep(item)}
        >
          {part}
        </button>,
      );
    } else {
      out.push(...withBars(part));
    }
  }
  return out;
}

/**
 * One document, open on the screen — the window a reviewer actually needs.
 *
 * READ: the stored text, which is the text Gemini is given verbatim, with
 * anything the upload scan recognised marked, and the privacy decision under
 * it. What a reviewer reads here and what the model reads are the same thing
 * by construction.
 *
 * REDACT: the same text with every private detail the detector could find
 * already drawn as a black bar — UENs, NRICs, emails, phones, company names,
 * signatories, addresses. The reviewer un-marks a bar by clicking it, marks
 * anything the detector missed by selecting it, and applies. Applying
 * replaces the words in the database with typed placeholders; there is no
 * copy of the original to go back to, which is the point.
 */
function ViewModal({
  source,
  mode: initialMode,
  busy,
  onClose,
  onSave,
  onApprove,
  onRedact,
}: {
  source: SourceRow;
  mode: "read" | "redact";
  busy: boolean;
  onClose: () => void;
  onSave: (privacy: "clear" | "redacted" | "needs_redaction", note: string) => void;
  onApprove: () => void;
  onRedact: (items: Redaction[], expectedLength: number) => Promise<boolean>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [privacy, setPrivacy] = useState<"clear" | "redacted" | "needs_redaction">(
    source.privacy === "redacted" || source.privacy === "needs_redaction" ? source.privacy : "clear",
  );
  const [note, setNote] = useState(source.note ?? "");
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /* Redaction: what is marked, and where each mark came from. */
  const [items, setItems] = useState<Redaction[] | null>(null);
  const [autoCount, setAutoCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [selection, setSelection] = useState("");
  const docRef = useRef<HTMLDivElement>(null);
  const flags = describeFlags(source.privacy_flags ?? {});

  /* The text is fetched when the window opens, not with the table: a hundred
     rows carrying their documents would make the tab slow for the ninety-nine
     nobody opened. In redact mode the detector runs on it as it arrives. */
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/ai-sources/${source.id}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { source?: { content?: string }; error?: string };
        if (!live) return;
        if (!res.ok) {
          setFailed(json.error ?? "Could not open this document.");
          return;
        }
        const content = json.source?.content ?? "";
        setText(content);
        if (initialMode === "redact") {
          const proposed = proposeRedactions(content);
          setItems(proposed);
          setAutoCount(proposed.length);
        }
      })
      .catch(() => live && setFailed("Could not reach the server."));
    return () => {
      live = false;
    };
  }, [source.id, initialMode, reload]);

  /* Escape closes it, as it does every other window on this screen. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /* Text the reviewer has selected inside the document, if any. */
  function readSelection() {
    const sel = window.getSelection();
    const t = sel?.toString().trim() ?? "";
    const inside = sel && sel.rangeCount > 0 && docRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer);
    setSelection(inside && t.length >= 2 && t.length <= 300 ? t : "");
  }

  function markSelection() {
    if (!selection) return;
    setItems((prev) => {
      const list = prev ?? [];
      if (list.some((r) => r.text === selection)) return list;
      return [...list, { text: selection, kind: "custom" }];
    });
    setSelection("");
    window.getSelection()?.removeAllRanges();
  }

  const live = source.status === "ready";
  const marked = items ?? [];

  async function apply() {
    if (text === null || marked.length === 0) return;
    const ok = await onRedact(marked, text.length);
    if (ok) {
      /* Read it back as stored: what the window shows now is what Gemini
         will be given, placeholders and all. */
      setConfirming(false);
      setItems(null);
      setSelection("");
      setText(null);
      setMode("read");
      setPrivacy("redacted");
      setReload((n) => n + 1);
    }
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={source.title}>
        <div className="modal-head">
          <div>
            <h3>{mode === "redact" ? `Redact — ${source.title}` : source.title}</h3>
            <p>
              {source.filename} · {source.jurisdiction}
              {source.version ? ` · ${source.version}` : ""} · {statusPill(source).text}
              {source.redacted_at ? ` · ${source.redaction_count} item${source.redaction_count === 1 ? "" : "s"} redacted` : ""}
            </p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {mode === "redact" ? (
            <div className="redact-bar-row">
              <p className="doc-caption" style={{ margin: 0 }}>
                <strong>{marked.length}</strong> marked for redaction
                {autoCount > 0 ? ` (${autoCount} found automatically)` : ""}. Click a black bar to keep that text.
                Select any words the detector missed — a name in a clause, say — and press Redact selection.
              </p>
              <button className="btn" type="button" disabled={!selection || busy} onClick={markSelection}>
                Redact selection{selection ? ` “${selection.length > 24 ? `${selection.slice(0, 24)}…` : selection}”` : ""}
              </button>
            </div>
          ) : (
            <p className="doc-caption">
              This is the text FD AI reads when it drafts — exactly as stored, with anything the
              upload scan recognised marked in yellow. Scan found: {flags}.
            </p>
          )}

          <div
            className={mode === "redact" ? "doc-view redacting" : "doc-view"}
            ref={docRef}
            onMouseUp={mode === "redact" ? readSelection : undefined}
            onKeyUp={mode === "redact" ? readSelection : undefined}
          >
            {failed ? (
              <p className="doc-state">{failed}</p>
            ) : text === null ? (
              <p className="doc-state">Opening…</p>
            ) : text.trim() === "" ? (
              <p className="doc-state">This document has no stored text.</p>
            ) : mode === "redact" ? (
              withProposals(text, marked, (item) => setItems((prev) => (prev ?? []).filter((r) => r.text !== item.text)))
            ) : (
              withBars(text)
            )}
          </div>

          {mode === "read" && (
            <div className="doc-review">
              <div>
                <label className="field-label" htmlFor="reviewPrivacy">Privacy / confidentiality</label>
                <select
                  id="reviewPrivacy"
                  style={{ width: "100%" }}
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                >
                  <option value="clear">Clear — no sensitive data</option>
                  <option value="redacted">Redacted — sensitive data removed</option>
                  <option value="needs_redaction">Needs redaction</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="reviewNote">Internal note</label>
                <textarea id="reviewNote" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}

          {mode === "read" && live && (
            <p className="queue-warning" style={{ marginBottom: 0 }}>
              This document is in use. Saving a new review takes it out of use until you approve it again.
            </p>
          )}
          {mode === "redact" && confirming && (
            <p className="queue-warning duplicate" style={{ marginBottom: 0 }}>
              Permanently black out {marked.length} item{marked.length === 1 ? "" : "s"}? The original words are
              replaced in the database and are not kept anywhere in FD AI.
              {live ? " The document leaves AI use until it is approved again." : ""}
            </p>
          )}
        </div>
        <div className="modal-foot">
          {mode === "redact" ? (
            confirming ? (
              <>
                <button className="btn" type="button" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
                <button className="btn dark" type="button" disabled={busy} onClick={() => void apply()}>
                  {busy ? "Applying…" : "Yes, black them out"}
                </button>
              </>
            ) : (
              <>
                <button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button>
                {autoCount > 0 && marked.length !== autoCount && text !== null && (
                  <button className="btn" type="button" disabled={busy} onClick={() => setItems(proposeRedactions(text))}>
                    Reset to auto-found
                  </button>
                )}
                <button className="btn yellow" type="button" disabled={busy || text === null || marked.length === 0} onClick={() => setConfirming(true)}>
                  Apply redaction{marked.length ? ` (${marked.length})` : ""}
                </button>
              </>
            )
          ) : (
            <>
              <button className="btn" type="button" onClick={onClose} disabled={busy}>Close</button>
              <button className="btn" type="button" disabled={busy} onClick={() => onSave(privacy, note)}>
                {busy ? "Saving…" : "Save review"}
              </button>
              {source.status === "reviewed" && (
                <button className="btn yellow" type="button" disabled={busy} onClick={onApprove}>
                  Approve for AI
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── new folder ──────────────────────────────────────────────────────────── */
function FolderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (f: FolderRow) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; folder?: FolderRow; error?: string };
      if (!res.ok || !json.ok || !json.folder) {
        setError(json.error ?? "Could not create the folder.");
        return;
      }
      onCreated(json.folder);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal small">
        <div className="modal-head">
          <div>
            <h3>New folder</h3>
            <p>A folder only groups documents; it changes nothing about what the AI reads.</p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field-label" htmlFor="folderName">Folder name</label>
          <input
            id="folderName"
            className="input"
            style={{ width: "100%" }}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()}
          />
          {error && <p className="queue-warning duplicate">{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn dark" type="button" disabled={!name.trim() || busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
