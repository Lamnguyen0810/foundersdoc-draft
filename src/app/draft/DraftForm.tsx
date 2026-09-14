"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocType, Field } from "@/lib/doctypes";
import { splitNotes } from "@/lib/prompt";

interface DoneInfo {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  paidBenchmarkUsd: number;
  draftId: string | null;
  saved: boolean;
}

export interface InitialDraft {
  id: string;
  docTypeSlug: string;
  answers: Record<string, string>;
  sourceText: string | null;
  output: string;
  status: "draft" | "final";
  title: string | null;
}

interface SourceInfo {
  filename: string;
  chars: number;
  kind: string;
  pages?: number;
  warning?: string;
}

function money(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function initialAnswers(docType: DocType, seed?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of docType.fields) out[f.key] = seed?.[f.key] ?? f.defaultValue ?? "";
  return out;
}

/* ------------------------------------------------------------------ field */

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="field-label">
        {field.label}
        {field.required && <span className="req">*</span>}
      </span>

      {field.type === "select" ? (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— choose —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          className="input"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input"
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.help && <span className="field-help">{field.help}</span>}
    </label>
  );
}

/* ----------------------------------------------------------------- upload */

/** Upload + extract. The file itself is never stored — only the text it yields. */
function SourceUpload({
  sourceText,
  info,
  onExtracted,
  onCleared,
  disabled,
}: {
  sourceText: string;
  info: SourceInfo | null;
  onExtracted: (text: string, info: SourceInfo) => void;
  onCleared: () => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That file could not be read.");
        return;
      }
      onExtracted(json.text ?? "", {
        filename: json.filename,
        chars: json.chars,
        kind: json.kind,
        pages: json.pages,
        warning: json.warning,
      });
      setOpen(true);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <fieldset className="group" style={{ display: "grid", gap: 12 }}>
      <legend>Source document — optional</legend>

      {!info && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            cursor: "pointer",
            borderRadius: 8,
            border: `1px dashed ${dragging ? "var(--gold-deep)" : "var(--grey-3)"}`,
            background: dragging ? "rgba(243,191,75,0.08)" : "var(--grey-1)",
            padding: "22px 16px",
            textAlign: "center",
            fontSize: 13.5,
            color: "var(--grey-5)",
            transition: "background .15s, border-color .15s",
          }}
        >
          {busy ? "Reading the file…" : "Drop a .docx or .pdf here, or click to choose"}
          <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--grey-4)" }}>
            10 MB max. The file is not stored — only the text it contains.
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      {error && <p className="note note-warn">{error}</p>}

      {info && (
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 12.5,
              color: "var(--grey-5)",
            }}
          >
            <span>
              <strong style={{ color: "var(--ink)" }}>{info.filename}</strong> ·{" "}
              {info.chars.toLocaleString()} characters
              {info.pages ? ` · ${info.pages} pages` : ""}
            </span>
            <span style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className="more"
                onClick={() => setOpen((o) => !o)}
                style={{ color: "var(--gold-deep)" }}
              >
                {open ? "Hide" : "What the AI will see"}
              </button>
              <button
                type="button"
                className="more"
                onClick={onCleared}
                style={{ color: "var(--miss)" }}
              >
                Remove
              </button>
            </span>
          </div>

          {info.warning && <p className="note note-warn">{info.warning}</p>}

          {open && (
            <pre
              style={{
                maxHeight: 260,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                borderRadius: 8,
                border: "1px solid var(--grey-2)",
                background: "var(--grey-1)",
                padding: 12,
                fontSize: 11.5,
                lineHeight: 1.65,
                color: "var(--grey-5)",
                margin: 0,
              }}
            >
              {sourceText}
            </pre>
          )}
        </div>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------- form */

export default function DraftForm({
  docTypes,
  initial,
  presetSlug,
}: {
  docTypes: DocType[];
  initial?: InitialDraft;
  /**
   * Preselected document type, from `/draft?type=nda`. It is how the marketing
   * site's per-document links ("NDAs", "Employment agreements") land people on
   * the right form instead of on a picker they have to work out. Reopening an
   * existing draft always wins over it.
   */
  presetSlug?: string;
}) {
  const router = useRouter();

  const [slug, setSlug] = useState(
    initial?.docTypeSlug ?? presetSlug ?? docTypes[0]?.slug ?? "",
  );
  const docType = useMemo(
    () => docTypes.find((d) => d.slug === slug) ?? docTypes[0],
    [docTypes, slug],
  );

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    initialAnswers(docType, initial?.answers),
  );
  const [sourceText, setSourceText] = useState(initial?.sourceText ?? "");
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(
    initial?.sourceText
      ? { filename: "Saved with this draft", chars: initial.sourceText.length, kind: "saved" }
      : null,
  );

  const [output, setOutput] = useState(initial?.output ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<"draft" | "final">(initial?.status ?? "draft");
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const f of docType.fields) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group)!.push(f);
    }
    return [...map.entries()];
  }, [docType]);

  // Warn before losing an unsaved edit — a lawyer's twenty minutes of tidying
  // should not vanish on a stray browser back.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function setAnswer(key: string, v: string) {
    setAnswers((a) => ({ ...a, [key]: v }));
    setDirty(true);
  }

  function reset() {
    setAnswers(initialAnswers(docType));
    setOutput("");
    setSourceText("");
    setSourceInfo(null);
    setDone(null);
    setError(null);
    setNotice(null);
    setDraftId(null);
    setStatus("draft");
    setDirty(false);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setDone(null);
    setOutput("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docTypeSlug: docType.slug, answers, sourceText }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `Request failed (${res.status}).`);
        return;
      }
      if (!res.body) {
        setError("The server returned an empty response.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let msg: { t: string; v?: string } & Partial<DoneInfo>;
          try {
            msg = JSON.parse(raw);
          } catch {
            continue;
          }
          if (msg.t === "text" && msg.v) {
            acc += msg.v;
            setOutput(acc);
          } else if (msg.t === "error") {
            setError(msg.v ?? "Drafting failed.");
          } else if (msg.t === "done") {
            setDone({
              provider: msg.provider ?? "",
              model: msg.model ?? "",
              inputTokens: msg.inputTokens ?? 0,
              outputTokens: msg.outputTokens ?? 0,
              costUsd: msg.costUsd ?? 0,
              paidBenchmarkUsd: msg.paidBenchmarkUsd ?? 0,
              draftId: msg.draftId ?? null,
              saved: Boolean(msg.saved),
            });
            if (msg.draftId) setDraftId(msg.draftId);
            setStatus("draft");
            setDirty(false);
          }
        }
      }
    } catch {
      setError("Could not reach the drafting service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(nextStatus: "draft" | "final") {
    if (!draftId) {
      setError("This draft has not been saved yet. Generate it first, or sign in to enable saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ output, answers, status: nextStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "Could not save.");
        return;
      }
      setStatus(nextStatus);
      setDirty(false);
      setNotice(nextStatus === "final" ? "Marked final and saved." : "Saved.");
      router.refresh();
    } catch {
      setError("Could not save. Check your connection.");
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 2500);
    }
  }

  async function exportDocx(includeNotes: boolean) {
    setExporting(true);
    setError(null);
    try {
      const title =
        [answers.party_a, answers.party_b]
          .map((s) => (s ?? "").split("(")[0].trim())
          .filter(Boolean)
          .join(" and ") || docType.label;

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: output, title, includeNotes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "draft.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Check your connection.");
    } finally {
      setExporting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy. Select the text and copy manually.");
    }
  }

  const { notes } = splitNotes(output);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
        gap: 28,
        alignItems: "start",
      }}
      className="draft-grid"
    >
      {/* ---------------------------------------------------------- the form */}
      <section style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "block" }}>
          <span className="field-label">Document type</span>
          <select
            className="input"
            value={slug}
            disabled={Boolean(initial)}
            onChange={(e) => {
              const next = e.target.value;
              setSlug(next);
              const d = docTypes.find((x) => x.slug === next);
              if (d) setAnswers(initialAnswers(d));
              setOutput("");
              setDone(null);
              setDraftId(null);
            }}
          >
            {docTypes.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="field-help">{docType.description}</span>
        </label>

        {groups.map(([group, fields]) => (
          <fieldset key={group} className="group" style={{ display: "grid", gap: 14 }}>
            <legend>{group}</legend>
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={answers[f.key] ?? ""}
                onChange={(v) => setAnswer(f.key, v)}
              />
            ))}
          </fieldset>
        ))}

        <SourceUpload
          sourceText={sourceText}
          info={sourceInfo}
          disabled={busy}
          onExtracted={(text, info) => {
            setSourceText(text);
            setSourceInfo(info);
            setDirty(true);
          }}
          onCleared={() => {
            setSourceText("");
            setSourceInfo(null);
            setDirty(true);
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-gold" onClick={generate} disabled={busy}>
            {busy ? "Drafting…" : output ? "Regenerate" : "Generate draft"}
          </button>
          <button className="btn btn-quiet" onClick={reset} disabled={busy}>
            Clear
          </button>
        </div>
      </section>

      {/* -------------------------------------------------------- the output */}
      <section
        style={{ display: "grid", gap: 12, position: "sticky", top: 84, alignSelf: "start" }}
        className="draft-output"
      >
        {error && <div className="note note-warn">{error}</div>}
        {notice && <div className="note note-ok">{notice}</div>}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--grey-5)" }}>
            {output ? `${output.length.toLocaleString()} characters` : "No draft yet"}
            {busy && " · writing"}
            {dirty && !busy && " · unsaved changes"}
            {status === "final" && " · marked final"}
          </span>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn btn-quiet btn-sm" onClick={copy} disabled={!output}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="btn btn-black btn-sm"
              onClick={() => exportDocx(false)}
              disabled={!output || exporting}
            >
              {exporting ? "Preparing…" : "Download Word"}
            </button>
            {draftId && (
              <>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => save("draft")}
                  disabled={saving || busy}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn btn-gold btn-sm"
                  onClick={() => save("final")}
                  disabled={saving || busy || status === "final"}
                >
                  Mark final
                </button>
              </>
            )}
          </div>
        </div>

        <div className="doc-shell" style={{ padding: 4 }}>
          <textarea
            className="doc"
            value={output}
            onChange={(e) => {
              setOutput(e.target.value);
              setDirty(true);
            }}
            placeholder="Fill in the form and press Generate draft. The result appears here and is editable."
            spellCheck={false}
            style={{
              width: "100%",
              height: "31rem",
              resize: "vertical",
              border: "none",
              outline: "none",
              background: "transparent",
              padding: "22px 26px",
              color: "var(--ink)",
            }}
          />
        </div>

        {notes && (
          <div className="note" style={{ borderLeftColor: "var(--gold)" }}>
            <strong
              style={{
                display: "block",
                marginBottom: 6,
                color: "var(--gold-deep)",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Drafter&apos;s notes — read before sending
            </strong>
            <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{notes}</pre>
            <button
              type="button"
              className="more"
              style={{ marginTop: 10, color: "var(--gold-deep)" }}
              onClick={() => exportDocx(true)}
              disabled={exporting}
            >
              Download Word with these notes attached <span className="arr">→</span>
            </button>
            <span style={{ display: "block", marginTop: 4, fontSize: 11.5 }}>
              The plain download excludes them, so nothing internal leaves by accident.
            </span>
          </div>
        )}

        {done && (
          <dl
            className="card"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 16,
              padding: "14px 18px",
              margin: 0,
            }}
          >
            {[
              ["Model", done.model],
              [
                "Tokens",
                `${done.inputTokens.toLocaleString()} in / ${done.outputTokens.toLocaleString()} out`,
              ],
              ["Cost now", money(done.costUsd)],
              ["On a paid model", money(done.paidBenchmarkUsd)],
              ["Saved", done.saved ? "yes" : "not signed in"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--grey-4)",
                  }}
                >
                  {k}
                </dt>
                <dd style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
