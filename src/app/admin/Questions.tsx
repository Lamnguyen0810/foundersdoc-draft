"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The questions a user answers before the first draft, per document type.
 *
 * Added to the AI files tab at FD's request, built from the design's own
 * parts — a .table-card with the same head, toolbar and table, and the same
 * modal for editing — so it reads as part of the page rather than a bolt-on.
 *
 * Everything is edited locally and saved whole with one button, because the
 * order of the questions is part of the form and "move this up" cannot be a
 * partial update. Until Save is pressed nothing changes for users.
 */

export interface FieldRow {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date";
  required: boolean;
  options?: string[];
  help?: string;
  placeholder?: string;
  defaultValue?: string;
  group: string;
}

const TYPE_LABEL: Record<FieldRow["type"], string> = {
  text: "Short answer",
  textarea: "Long answer",
  select: "Choice",
  number: "Number",
  date: "Date",
};

const BLANK: FieldRow = { key: "", label: "", type: "text", required: true, group: "Details" };

export default function Questions({
  docTypes,
}: {
  docTypes: { slug: string; label: string; fields: FieldRow[] }[];
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(docTypes[0]?.slug ?? "");
  const [drafts, setDrafts] = useState<Record<string, FieldRow[]>>(() =>
    Object.fromEntries(docTypes.map((d) => [d.slug, d.fields])),
  );
  const [saved, setSaved] = useState<Record<string, FieldRow[]>>(drafts);
  const [editing, setEditing] = useState<{ index: number; field: FieldRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fields = drafts[slug] ?? [];
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved[slug] ?? []);

  function update(next: FieldRow[]) {
    setDrafts((d) => ({ ...d, [slug]: next }));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/doc-fields", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, fields }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; count?: number };
      if (!res.ok || !json.ok) {
        setNotice(json.error ?? "Could not save.");
        return;
      }
      setSaved((s) => ({ ...s, [slug]: fields }));
      setNotice(`Saved — ${json.count} question${json.count === 1 ? "" : "s"} now asked before a draft.`);
      router.refresh();
    } catch {
      setNotice("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="table-card">
      <div className="table-head">
        <div className="source-table-title">
          <h2>Questions before the first draft</h2>
          <span className="source-count">
            {fields.length} question{fields.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="toolbar">
          <div className="select-wrap">
            <select aria-label="Document type" style={{ width: 240 }} value={slug} onChange={(e) => setSlug(e.target.value)}>
              {docTypes.map((d) => (
                <option key={d.slug} value={d.slug}>{d.label}</option>
              ))}
            </select>
          </div>
          <button className="btn" type="button" onClick={() => setEditing({ index: -1, field: { ...BLANK } })}>
            Add question
          </button>
          <button className="btn yellow" type="button" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? "Saving…" : dirty ? "Save questions" : "Saved"}
          </button>
        </div>
      </div>

      {notice && (
        <p className="empty" style={{ textAlign: "left", padding: "0 14px 10px" }}>{notice}</p>
      )}

      <div className="table-wrap">
        <table style={{ minWidth: 920 }}>
          <thead>
            <tr>
              <th style={{ width: 42 }}>#</th>
              <th>Question</th>
              <th>Key</th>
              <th>Type</th>
              <th>Group</th>
              <th>Required</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr>
                <td colSpan={7}><div className="empty">No questions yet. Add the first one.</div></td>
              </tr>
            )}
            {fields.map((f, i) => (
              <tr key={f.key || i}>
                <td>{i + 1}</td>
                <td>
                  <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                    <span>{f.label}</span>
                    {f.help && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>{f.help}</span>}
                  </div>
                </td>
                <td><code style={{ fontSize: 11 }}>{f.key}</code></td>
                <td>
                  <span className="pill">{TYPE_LABEL[f.type] ?? f.type}</span>
                  {f.type === "select" && f.options && (
                    <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>
                      {f.options.length} options
                    </span>
                  )}
                </td>
                <td>{f.group}</td>
                <td>
                  {f.required ? <span className="badge green">Required</span> : <span className="badge gray">Optional</span>}
                </td>
                <td>
                  <div className="inline-actions">
                    <button className="icon-btn" type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className="icon-btn" type="button" title="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className="approve-btn" data-action="review" type="button" onClick={() => setEditing({ index: i, field: { ...f } })}>
                      Edit
                    </button>
                    <button
                      className="icon-btn remove-file"
                      type="button"
                      title="Remove"
                      onClick={() => update(fields.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <QuestionModal
          field={editing.field}
          isNew={editing.index < 0}
          existingKeys={fields.filter((_, j) => j !== editing.index).map((f) => f.key)}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            if (editing.index < 0) update([...fields, f]);
            else update(fields.map((x, j) => (j === editing.index ? f : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function QuestionModal({
  field,
  isNew,
  existingKeys,
  onClose,
  onSave,
}: {
  field: FieldRow;
  isNew: boolean;
  existingKeys: string[];
  onClose: () => void;
  onSave: (f: FieldRow) => void;
}) {
  const [f, setF] = useState<FieldRow>(field);
  const [optionsText, setOptionsText] = useState((field.options ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FieldRow>(k: K, v: FieldRow[K]) => setF((x) => ({ ...x, [k]: v }));

  /* The key is what the answer is stored under and what the prompt refers
     to. New questions get one from the label; existing keys are left alone,
     because changing one would orphan every answer already saved under it. */
  function keyFromLabel(label: string) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "question";
  }

  function submit() {
    const key = isNew && !f.key ? keyFromLabel(f.label) : f.key;
    if (!f.label.trim()) return setError("Give the question a label.");
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) return setError("The key must be lower-case letters, digits and underscores.");
    if (existingKeys.includes(key)) return setError(`Another question already uses the key "${key}".`);
    const options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (f.type === "select" && options.length < 2) return setError("A choice needs at least two options, one per line.");
    onSave({
      ...f,
      key,
      label: f.label.trim(),
      group: f.group.trim() || "Details",
      options: f.type === "select" ? options : undefined,
      help: f.help?.trim() || undefined,
      placeholder: f.placeholder?.trim() || undefined,
      defaultValue: f.defaultValue?.trim() || undefined,
    });
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>{isNew ? "Add question" : "Edit question"}</h3>
            <p>What the user is asked before the first draft.</p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field-label">Question</label>
          <input className="input" style={{ width: "100%" }} value={f.label} onChange={(e) => set("label", e.target.value)} />

          <div className="upload-meta">
            <div>
              <label className="field-label">Type</label>
              <select style={{ width: "100%" }} value={f.type} onChange={(e) => set("type", e.target.value as FieldRow["type"])}>
                {(Object.keys(TYPE_LABEL) as FieldRow["type"][]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Group</label>
              <input className="input" style={{ width: "100%" }} value={f.group} onChange={(e) => set("group", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Key</label>
              <input
                className="input"
                style={{ width: "100%" }}
                value={f.key}
                placeholder={isNew ? keyFromLabel(f.label) : ""}
                disabled={!isNew}
                onChange={(e) => set("key", e.target.value)}
              />
            </div>
          </div>

          {f.type === "select" && (
            <div style={{ marginTop: 12 }}>
              <label className="field-label">Options — one per line</label>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
            </div>
          )}

          <div className="upload-meta">
            <div>
              <label className="field-label">Help text</label>
              <input className="input" style={{ width: "100%" }} value={f.help ?? ""} onChange={(e) => set("help", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Placeholder</label>
              <input className="input" style={{ width: "100%" }} value={f.placeholder ?? ""} onChange={(e) => set("placeholder", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Default answer</label>
              <input className="input" style={{ width: "100%" }} value={f.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value)} />
            </div>
          </div>

          <label className="upload-permission">
            <input type="checkbox" checked={f.required} onChange={(e) => set("required", e.target.checked)} />
            <span>Required — the user must answer this before drafting</span>
          </label>

          {error && <p className="queue-warning duplicate">{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn dark" type="button" onClick={submit}>{isNew ? "Add" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
