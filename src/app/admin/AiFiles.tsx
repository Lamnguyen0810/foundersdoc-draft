"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import {
  JURISDICTIONS,
  describeFlags,
  type FolderRow,
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
}: {
  sources: SourceRow[];
  folders: FolderRow[];
  docTypes: { slug: string; label: string }[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [folders, setFolders] = useState(initialFolders);
  const [stage, setStage] = useState<Stage>("all");
  const [folder, setFolder] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  /* The document window. Any row opens it; it reads and reviews in one place. */
  const [viewing, setViewing] = useState<SourceRow | null>(null);
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

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sources) m.set(s.folder_id ?? UNFILED, (m.get(s.folder_id ?? UNFILED) ?? 0) + 1);
    return m;
  }, [sources]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (stage !== "all" && s.status !== STAGE_STATUS[stage]) return false;
      if (folder === UNFILED && s.folder_id) return false;
      if (folder !== ALL && folder !== UNFILED && s.folder_id !== folder) return false;
      if (q && !`${s.title} ${s.filename} ${s.doc_type_slug} ${s.jurisdiction}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, stage, folder, search]);

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
        setNotice(json.error ?? "Could not save.");
        return false;
      }
      setSources((rows) => rows.map((r) => (r.id === id ? { ...r, ...json.source } : r)));
      return true;
    } catch {
      setNotice("Could not reach the server.");
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
        setNotice(json.error ?? "Could not delete.");
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
        setNotice(json.error ?? "Could not approve.");
        return;
      }
      const skipped = new Set(json.skipped ?? []);
      const now = new Date().toISOString();
      setSources((rows) =>
        rows.map((r) => (ids.includes(r.id) && !skipped.has(r.id) ? { ...r, status: "ready", approved_at: now } : r)),
      );
      setSelected(new Set());
      if (skipped.size > 0) setNotice(`${skipped.size} not approved — review them first.`);
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
          <p className="empty" style={{ textAlign: "left", padding: "0 14px 10px", color: "var(--danger)" }}>
            {notice}
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
                  <td colSpan={10}>
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
                    onClick={() => setViewing(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewing(s);
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
                            onClick={() => setViewing(s)}
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
          onDone={(added, message) => {
            setUploadOpen(false);
            setNotice(message);
            if (added > 0) router.refresh();
          }}
        />
      )}

      {viewing && (
        <ViewModal
          key={viewing.id}
          source={viewing}
          busy={busy}
          onClose={() => setViewing(null)}
          onSave={async (privacy, note) => {
            if (await patch(viewing.id, { action: "review", privacy, note })) setViewing(null);
          }}
          onApprove={async () => {
            if (await patch(viewing.id, { action: "approve" })) setViewing(null);
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
  onDone: (added: number, message: string) => void;
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
        results?: { filename: string; ok: boolean; error?: string }[];
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
      const msg =
        `${json.added ?? 0} added to the library, awaiting review.` +
        (failed.length ? ` Not added: ${failed.map((f) => `${f.filename} (${f.error})`).join("; ")}` : "");
      onDone(json.added ?? 0, msg);
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
            <p>PDF, Word or text documents.</p>
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
              accept=".pdf,.doc,.docx,.txt"
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
                <option value="">Unfiled</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
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
function ViewModal({
  source,
  busy,
  onClose,
  onSave,
  onApprove,
}: {
  source: SourceRow;
  busy: boolean;
  onClose: () => void;
  onSave: (privacy: "clear" | "redacted" | "needs_redaction", note: string) => void;
  onApprove: () => void;
}) {
  const [privacy, setPrivacy] = useState<"clear" | "redacted" | "needs_redaction">(
    source.privacy === "redacted" || source.privacy === "needs_redaction" ? source.privacy : "clear",
  );
  const [note, setNote] = useState(source.note ?? "");
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const flags = describeFlags(source.privacy_flags ?? {});

  /* The text is fetched when the window opens, not with the table: a hundred
     rows carrying their documents would make the tab slow for the ninety-nine
     nobody opened. */
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/ai-sources/${source.id}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { source?: { content?: string }; error?: string };
        if (!live) return;
        if (!res.ok) setFailed(json.error ?? "Could not open this document.");
        else setText(json.source?.content ?? "");
      })
      .catch(() => live && setFailed("Could not reach the server."));
    return () => {
      live = false;
    };
  }, [source.id]);

  /* Escape closes it, as it does every other window on this screen. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const live = source.status === "ready";

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={source.title}>
        <div className="modal-head">
          <div>
            <h3>{source.title}</h3>
            <p>
              {source.filename} · {source.jurisdiction}
              {source.version ? ` · ${source.version}` : ""} · {statusPill(source).text}
            </p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="doc-caption">
            This is the text FD AI reads when it drafts — exactly as stored, with anything the
            upload scan recognised marked in yellow. Scan found: {flags}.
          </p>

          <div className="doc-view">
            {failed ? (
              <p className="doc-state">{failed}</p>
            ) : text === null ? (
              <p className="doc-state">Opening…</p>
            ) : text.trim() === "" ? (
              <p className="doc-state">This document has no stored text.</p>
            ) : (
              highlight(text)
            )}
          </div>

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

          {live && (
            <p className="queue-warning" style={{ marginBottom: 0 }}>
              This document is in use. Saving a new review takes it out of use until you approve it again.
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn" type="button" disabled={busy} onClick={() => onSave(privacy, note)}>
            {busy ? "Saving…" : "Save review"}
          </button>
          {source.status === "reviewed" && (
            <button className="btn yellow" type="button" disabled={busy} onClick={onApprove}>
              Approve for AI
            </button>
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
