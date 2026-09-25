"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stepsFor, type Group } from "@/lib/doctypes";
import TermQuestions from "./TermQuestions";

/**
 * The questions a user answers before the first draft, per document type —
 * shown as the STEPS the user meets, in the order they meet them.
 *
 * ── WHY STEPS ──────────────────────────────────────────────────────────────
 * The form does not ask its questions one after another; it groups them into
 * steps, each with a title and a question line of its own ("Who's involved —
 * Who are the parties?"). An editor that listed the questions flat could not
 * show that: moving one question moved its whole step, and the words at the
 * top of each step were nowhere to be seen. Now the list IS the steps, built
 * by the same function the drafting screen uses, so step 3 here is step 3
 * there. The two fixed NDA steps at the end are shown greyed, so the
 * sequence on screen is the whole sequence.
 *
 * ── SAVE, PUBLISH, UNDO ─────────────────────────────────────────────────────
 * Every edit is local until a button is pressed. Save draft keeps the work
 * without touching the form; Publish makes it live; Revert throws the draft
 * away. Undo and redo walk the edits made in this sitting (Ctrl+Z, Ctrl+Y).
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

export type GroupRow = Group;

export interface DocTypeForEditor {
  slug: string;
  label: string;
  /** What is live. */
  fields: FieldRow[];
  groups: GroupRow[] | null;
  /** Saved but not published, if any. */
  draft: { fields: FieldRow[]; groups: GroupRow[] | null } | null;
  draftSavedAt: string | null;
  publishedAt: string | null;
}

const TYPE_LABEL: Record<FieldRow["type"], string> = {
  text: "Short answer",
  textarea: "Long answer",
  select: "Choice",
  number: "Number",
  date: "Date",
};

const BLANK: FieldRow = { key: "", label: "", type: "text", required: true, group: "" };

/** One editable state of the form: its questions and its steps. */
interface Work {
  fields: FieldRow[];
  groups: GroupRow[];
}

/** The steps a form has, fully written out — stored ones first, then any a
 *  question names that the stored list lacks. */
function normalise(fields: FieldRow[], groups: GroupRow[] | null): Work {
  const steps = stepsFor({ fields, groups: groups ?? undefined }).map((st) => st.group);
  return { fields, groups: steps };
}

function same(a: Work, b: Work): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** "16 Sep, 10:12" in Singapore time. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Singapore" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" }).format(d);
  return `${day}, ${time}`;
}

/* The NDA form ends with two steps that are not questions in the list: the
   comprehensiveness slider and the source upload. They are part of what the
   user meets, so they are shown — greyed, not editable. */
const FIXED_STEPS: Record<string, { title: string; question: string }[]> = {
  nda: [
    { title: "Comprehensiveness", question: "How comprehensive and how long should the first NDA be?" },
    { title: "Your document", question: "Do you have a document to start from? Upload it, or skip." },
  ],
};

export default function Questions({
  docTypes,
  versioning = true,
}: {
  docTypes: DocTypeForEditor[];
  /** False until 017 has been run: Publish only, no draft. */
  versioning?: boolean;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(docTypes[0]?.slug ?? "");
  const current = docTypes.find((d) => d.slug === slug);

  /* Per type: what is live, what was saved as a draft, the working copy, and
     the undo/redo history of this sitting. The working copy starts from the
     draft when there is one — that is what "save" was for. */
  const [live, setLive] = useState<Record<string, Work>>(() =>
    Object.fromEntries(docTypes.map((d) => [d.slug, normalise(d.fields, d.groups)])),
  );
  const [draftSaved, setDraftSaved] = useState<Record<string, { work: Work; at: string } | null>>(() =>
    Object.fromEntries(
      docTypes.map((d) => [d.slug, d.draft ? { work: normalise(d.draft.fields, d.draft.groups), at: d.draftSavedAt ?? "" } : null]),
    ),
  );
  const [publishedAt, setPublishedAt] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(docTypes.map((d) => [d.slug, d.publishedAt])),
  );
  const [history, setHistory] = useState<Record<string, { past: Work[]; present: Work; future: Work[] }>>(() =>
    Object.fromEntries(
      docTypes.map((d) => [
        d.slug,
        { past: [], present: d.draft ? normalise(d.draft.fields, d.draft.groups) : normalise(d.fields, d.groups), future: [] },
      ]),
    ),
  );

  const [editing, setEditing] = useState<{ index: number; field: FieldRow } | null>(null);
  const [editingStep, setEditingStep] = useState<{ index: number; group: GroupRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const h = history[slug] ?? { past: [], present: { fields: [], groups: [] }, future: [] };
  const work = h.present;
  const steps = stepsFor({ fields: work.fields, groups: work.groups });
  const liveWork = live[slug];
  const draft = draftSaved[slug];
  const unsaved = draft ? !same(work, draft.work) : liveWork ? !same(work, liveWork) : false;
  const differsFromLive = liveWork ? !same(work, liveWork) : false;

  /* Every change goes through here, so every change can be undone. */
  const commit = useCallback(
    (next: Work) => {
      setHistory((all) => {
        const cur = all[slug];
        if (!cur || same(cur.present, next)) return all;
        return { ...all, [slug]: { past: [...cur.past.slice(-49), cur.present], present: next, future: [] } };
      });
    },
    [slug],
  );
  const undo = useCallback(() => {
    setHistory((all) => {
      const cur = all[slug];
      if (!cur || cur.past.length === 0) return all;
      const previous = cur.past[cur.past.length - 1];
      return { ...all, [slug]: { past: cur.past.slice(0, -1), present: previous, future: [cur.present, ...cur.future] } };
    });
  }, [slug]);
  const redo = useCallback(() => {
    setHistory((all) => {
      const cur = all[slug];
      if (!cur || cur.future.length === 0) return all;
      const [next, ...rest] = cur.future;
      return { ...all, [slug]: { past: [...cur.past, cur.present], present: next, future: rest } };
    });
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || editingStep) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, editing, editingStep]);

  /* ── edits ── */
  function setFields(fields: FieldRow[]) {
    commit(normalise(fields, work.groups));
  }
  function moveField(key: string, delta: -1 | 1) {
    /* Within its step: the neighbour in the same group, wherever the two sit
       in the flat list. */
    const f = work.fields.find((x) => x.key === key);
    if (!f) return;
    const siblings = work.fields.filter((x) => x.group === f.group);
    const i = siblings.findIndex((x) => x.key === key);
    const j = i + delta;
    if (j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    const a = work.fields.findIndex((x) => x.key === key);
    const b = work.fields.findIndex((x) => x.key === other.key);
    const next = [...work.fields];
    [next[a], next[b]] = [next[b], next[a]];
    setFields(next);
  }
  function moveStep(name: string, delta: -1 | 1) {
    const i = work.groups.findIndex((g) => g.name === name);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= work.groups.length) return;
    const groups = [...work.groups];
    [groups[i], groups[j]] = [groups[j], groups[i]];
    commit({ fields: work.fields, groups });
  }
  function removeStep(name: string) {
    if (work.fields.some((f) => f.group === name)) return;
    commit({ fields: work.fields, groups: work.groups.filter((g) => g.name !== name) });
  }
  function saveStep(index: number, g: GroupRow) {
    const groups = [...work.groups];
    if (index < 0) groups.push(g);
    else {
      const old = groups[index];
      groups[index] = g;
      /* Renaming a step carries its questions with it. */
      if (old.name !== g.name) {
        commit({ fields: work.fields.map((f) => (f.group === old.name ? { ...f, group: g.name } : f)), groups });
        return;
      }
    }
    commit({ fields: work.fields, groups });
  }

  /* ── server ── */
  async function send(mode: "save" | "publish" | "discard") {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/doc-fields", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, mode, fields: work.fields, groups: work.groups }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; count?: number; steps?: number; at?: string };
      if (!res.ok || !json.ok) {
        setNotice({ text: json.error ?? "Could not save.", tone: "err" });
        return;
      }
      const at = json.at ?? new Date().toISOString();
      if (mode === "save") {
        setDraftSaved((d) => ({ ...d, [slug]: { work, at } }));
        setNotice({ text: `Draft saved ${stamp(at)}. The form users see has not changed — press Publish when it is ready.`, tone: "ok" });
      } else if (mode === "publish") {
        setLive((l) => ({ ...l, [slug]: work }));
        setDraftSaved((d) => ({ ...d, [slug]: null }));
        setPublishedAt((p) => ({ ...p, [slug]: at }));
        setNotice({ text: `Published. ${json.steps} step${json.steps === 1 ? "" : "s"}, ${json.count} question${json.count === 1 ? "" : "s"} — the next person who starts this document sees them.`, tone: "ok" });
        router.refresh();
      } else {
        setDraftSaved((d) => ({ ...d, [slug]: null }));
        if (liveWork) setHistory((all) => ({ ...all, [slug]: { past: [...(all[slug]?.past ?? []), work], present: liveWork, future: [] } }));
        setNotice({ text: "Draft discarded. The editor shows what is live.", tone: "ok" });
      }
    } catch {
      setNotice({ text: "Could not reach the server.", tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  /* What the status line says. */
  const status = !current
    ? ""
    : unsaved
      ? "Unsaved changes"
      : draft
        ? `Draft saved ${draft.at ? stamp(draft.at) : ""} — not yet live`
        : differsFromLive
          ? "Unsaved changes"
          : publishedAt[slug]
            ? `Live — published ${stamp(publishedAt[slug]!)}`
            : "Live";

  /* The term sheet's questions are its questionnaire.json, built into the
     assembler: listed as asked, not edited here. See TermQuestions. */
  if (slug === "term") {
    return (
      <div className="table-card questions-card">
        <div className="table-head">
          <div className="source-table-title">
            <h2>Questions before the first draft</h2>
          </div>
          <div className="toolbar">
            <div className="select-wrap">
              <select aria-label="Document type" style={{ width: 240 }} value={slug} onChange={(e) => setSlug(e.target.value)}>
                {docTypes.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <TermQuestions />
      </div>
    );
  }

  return (
    <div className="table-card questions-card">
      <div className="table-head">
        <div className="source-table-title">
          <h2>Questions before the first draft</h2>
          <span className="source-count">
            {steps.length} step{steps.length === 1 ? "" : "s"} · {work.fields.length} question{work.fields.length === 1 ? "" : "s"}
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
          <button className="icon-btn" type="button" title="Undo (Ctrl+Z)" disabled={busy || h.past.length === 0} onClick={undo}>↶</button>
          <button className="icon-btn" type="button" title="Redo (Ctrl+Y)" disabled={busy || h.future.length === 0} onClick={redo}>↷</button>
          <button className="btn" type="button" disabled={busy} onClick={() => setEditingStep({ index: -1, group: { name: "", title: "", question: "" } })}>
            Add step
          </button>
          <button className="btn" type="button" disabled={busy || steps.length === 0} onClick={() => setEditing({ index: -1, field: { ...BLANK, group: steps[0]?.group.name ?? "" } })}>
            Add question
          </button>
          {versioning && (
            <button className="btn" type="button" disabled={busy || !unsaved} onClick={() => void send("save")}>
              {busy ? "Saving…" : "Save draft"}
            </button>
          )}
          <button className="btn yellow" type="button" disabled={busy || (!differsFromLive && !draft)} onClick={() => void send("publish")}>
            Publish
          </button>
        </div>
      </div>

      <div className="questions-status">
        <span className={unsaved || draft ? "badge" : "badge green"}>{status}</span>
        {draft && !busy && (
          <button className="link-btn" type="button" onClick={() => void send("discard")}>
            Revert to published
          </button>
        )}
      </div>

      {notice && (
        <p className="empty" role="status" style={{ textAlign: "left", padding: "0 14px 10px", color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
          {notice.text}
        </p>
      )}

      <div className="table-wrap">
        <table style={{ minWidth: 920 }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>#</th>
              <th>Question</th>
              <th>Key</th>
              <th>Type</th>
              <th>Required</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {steps.length === 0 && (
              <tr>
                <td colSpan={6}><div className="empty">No steps yet. Add a step, then its first question.</div></td>
              </tr>
            )}
            {steps.map((st, si) => {
              const stepNo = si + 1;
              return [
                <tr className="step-row" key={`step-${st.group.name}`}>
                  <td>{stepNo}</td>
                  <td colSpan={4}>
                    <div className="step-title">
                      <strong>{st.group.title}</strong>
                      <span className="step-question">“{st.group.question}”</span>
                      {st.fields.length === 0 && <span className="badge red">No questions — will not publish</span>}
                      {st.fields.length === 1 && st.fields[0].type === "select" && <span className="badge gray" title="A step with one choice is asked as tap-to-answer chips">Chips</span>}
                    </div>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button className="icon-btn" type="button" title="Move step up" disabled={busy || si === 0} onClick={() => moveStep(st.group.name, -1)}>↑</button>
                      <button className="icon-btn" type="button" title="Move step down" disabled={busy || si === steps.length - 1} onClick={() => moveStep(st.group.name, 1)}>↓</button>
                      <button className="approve-btn" data-action="review" type="button" disabled={busy} onClick={() => setEditingStep({ index: work.groups.findIndex((g) => g.name === st.group.name), group: st.group })}>
                        Edit
                      </button>
                      <button className="icon-btn remove-file" type="button" title={st.fields.length ? "Move or remove its questions first" : "Remove step"} disabled={busy || st.fields.length > 0} onClick={() => removeStep(st.group.name)}>×</button>
                    </div>
                  </td>
                </tr>,
                ...st.fields.map((f, fi) => (
                  <tr key={f.key}>
                    <td className="sub-no">{stepNo}.{fi + 1}</td>
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
                        <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>{f.options.length} options</span>
                      )}
                    </td>
                    <td>{f.required ? <span className="badge green">Required</span> : <span className="badge gray">Optional</span>}</td>
                    <td>
                      <div className="inline-actions">
                        <button className="icon-btn" type="button" title="Move up within the step" disabled={busy || fi === 0} onClick={() => moveField(f.key, -1)}>↑</button>
                        <button className="icon-btn" type="button" title="Move down within the step" disabled={busy || fi === st.fields.length - 1} onClick={() => moveField(f.key, 1)}>↓</button>
                        <button className="approve-btn" data-action="review" type="button" disabled={busy} onClick={() => setEditing({ index: work.fields.findIndex((x) => x.key === f.key), field: { ...f } })}>
                          Edit
                        </button>
                        <button className="icon-btn remove-file" type="button" title="Remove" disabled={busy} onClick={() => setFields(work.fields.filter((x) => x.key !== f.key))}>×</button>
                      </div>
                    </td>
                  </tr>
                )),
              ];
            })}
            {(FIXED_STEPS[slug] ?? []).map((fx, i) => (
              <tr className="step-row fixed" key={`fixed-${i}`} title="Part of the form, not editable here">
                <td>{steps.length + i + 1}</td>
                <td colSpan={4}>
                  <div className="step-title">
                    <strong>{fx.title}</strong>
                    <span className="step-question">“{fx.question}”</span>
                    <span className="badge gray">Fixed</span>
                  </div>
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <QuestionModal
          field={editing.field}
          isNew={editing.index < 0}
          existingKeys={work.fields.filter((_, j) => j !== editing.index).map((f) => f.key)}
          steps={work.groups}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            if (editing.index < 0) setFields([...work.fields, f]);
            else setFields(work.fields.map((x, j) => (j === editing.index ? f : x)));
            setEditing(null);
          }}
        />
      )}

      {editingStep && (
        <StepModal
          group={editingStep.group}
          isNew={editingStep.index < 0}
          existingNames={work.groups.filter((_, j) => j !== editingStep.index).map((g) => g.name)}
          onClose={() => setEditingStep(null)}
          onSave={(g) => {
            saveStep(editingStep.index, g);
            setEditingStep(null);
          }}
        />
      )}
    </div>
  );
}

/** A step's words: its name (what questions point at), its title in the
 *  progress list, and the question line the user reads when it opens. */
function StepModal({
  group,
  isNew,
  existingNames,
  onClose,
  onSave,
}: {
  group: GroupRow;
  isNew: boolean;
  existingNames: string[];
  onClose: () => void;
  onSave: (g: GroupRow) => void;
}) {
  const [g, setG] = useState<GroupRow>(group);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof GroupRow>(k: K, v: GroupRow[K]) => setG((x) => ({ ...x, [k]: v }));

  function submit() {
    const name = (g.name || g.title).trim();
    if (!name) return setError("Give the step a name.");
    if (existingNames.includes(name)) return setError(`Another step is already called "${name}".`);
    onSave({ name, title: g.title.trim() || name, question: g.question.trim() || name });
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small">
        <div className="modal-head">
          <div>
            <h3>{isNew ? "Add step" : "Edit step"}</h3>
            <p>What the user sees at the top of this step.</p>
          </div>
          <button className="close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field-label">Title — shown in the progress list</label>
          <input className="input" style={{ width: "100%" }} value={g.title} placeholder="Who’s involved" onChange={(e) => set("title", e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Question — what the assistant asks when the step opens</label>
            <textarea value={g.question} placeholder="Who are the parties? Just provide each person’s or organisation’s name." onChange={(e) => set("question", e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Internal name</label>
            <input className="input" style={{ width: "100%" }} value={g.name} placeholder={g.title || "Parties"} onChange={(e) => set("name", e.target.value)} />
            <p className="doc-caption" style={{ margin: "6px 0 0" }}>Questions belong to a step by this name. Renaming carries them along.</p>
          </div>
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

function QuestionModal({
  field,
  isNew,
  existingKeys,
  steps,
  onClose,
  onSave,
}: {
  field: FieldRow;
  isNew: boolean;
  existingKeys: string[];
  /** The steps the question can belong to, in form order. */
  steps: GroupRow[];
  onClose: () => void;
  onSave: (f: FieldRow) => void;
}) {
  const [f, setF] = useState<FieldRow>(field);
  const [newStep, setNewStep] = useState(false);
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
    if (!f.group.trim()) return setError("Choose the step this question belongs to.");
    onSave({
      ...f,
      key,
      label: f.label.trim(),
      group: f.group.trim(),
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
              <label className="field-label">Step</label>
              {newStep ? (
                <input
                  className="input"
                  style={{ width: "100%" }}
                  autoFocus
                  placeholder="Name of the new step"
                  value={f.group}
                  onChange={(e) => set("group", e.target.value)}
                />
              ) : (
                <select
                  style={{ width: "100%" }}
                  value={f.group}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setNewStep(true);
                      set("group", "");
                    } else set("group", e.target.value);
                  }}
                >
                  {steps.map((g) => (
                    <option key={g.name} value={g.name}>{g.title}</option>
                  ))}
                  <option value="__new__">New step…</option>
                </select>
              )}
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
