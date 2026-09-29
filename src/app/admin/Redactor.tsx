"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { PLACEHOLDER_RE, REDACTION_LABEL, applyRedactions, proposeRedactions, type Redaction } from "@/lib/ai-library";

/**
 * Black out the private details in a file before it is used as feedback.
 *
 * The same redaction the AI files tab uses (lib/ai-library.ts): every UEN,
 * NRIC, email, phone number, company name, signatory and address the
 * detector can find is already drawn as a black bar. Click a bar to keep
 * that text; select anything it missed and press "Redact selection". Only
 * the redacted text leaves this window — the original is read in the
 * browser and never saved anywhere.
 */
export default function Redactor({
  filename,
  text,
  onDone,
  onClose,
}: {
  filename: string;
  text: string;
  onDone: (redacted: string, count: number) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Redaction[]>(() => proposeRedactions(text));
  const [autoCount] = useState(() => proposeRedactions(text).length);
  const [selection, setSelection] = useState("");
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function readSelection() {
    const sel = window.getSelection();
    const t = sel?.toString().trim() ?? "";
    const inside = sel && sel.rangeCount > 0 && docRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer);
    setSelection(inside && t.length >= 2 && t.length <= 300 ? t : "");
  }

  function markSelection() {
    if (!selection) return;
    setItems((list) => (list.some((r) => r.text === selection) ? list : [...list, { text: selection, kind: "custom" }]));
    setSelection("");
    window.getSelection()?.removeAllRanges();
  }

  function finish() {
    const { text: redacted, count } = applyRedactions(text, items);
    onDone(redacted, count);
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={`Redact ${filename}`}>
        <div className="modal-head">
          <div>
            <h3>Redact — {filename}</h3>
            <p>Only the redacted text is sent with your feedback. The file itself is not kept.</p>
          </div>
          <button className="close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="redact-bar-row">
            <p className="doc-caption" style={{ margin: 0 }}>
              <strong>{items.length}</strong> marked for redaction
              {autoCount > 0 ? ` (${autoCount} found automatically)` : ""}. Click a black bar to keep that text. Select any
              words the detector missed — a name in a clause, say — and press Redact selection.
            </p>
            <button className="btn" type="button" disabled={!selection} onClick={markSelection}>
              Redact selection{selection ? ` “${selection.length > 24 ? `${selection.slice(0, 24)}…` : selection}”` : ""}
            </button>
          </div>
          <div className="doc-view redacting" ref={docRef} onMouseUp={readSelection} onKeyUp={readSelection}>
            {text.trim() ? marked(text, items, (item) => setItems((list) => list.filter((r) => r.text !== item.text))) : (
              <p className="doc-state">This file has no text FD AI can read.</p>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          {items.length !== autoCount && (
            <button className="btn" type="button" onClick={() => setItems(proposeRedactions(text))}>
              Reset to auto-found
            </button>
          )}
          <button className="btn yellow" type="button" disabled={!text.trim()} onClick={finish}>
            {items.length ? `Redact ${items.length} and attach` : "Attach without redacting"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The text with each marked string as a black bar; a click keeps it. */
function marked(text: string, items: Redaction[], onKeep: (item: Redaction) => void): React.ReactNode[] {
  const bars = (part: string, key: string): React.ReactNode[] => {
    /* Placeholders already in the text (a file redacted before) as done bars. */
    const out: React.ReactNode[] = [];
    const re = new RegExp(PLACEHOLDER_RE.source, "g");
    let last = 0;
    let k = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(part)) !== null) {
      if (m.index > last) out.push(part.slice(last, m.index));
      out.push(
        <span className="redact-bar done" key={`${key}d${k++}`}>
          {m[0].replace(/^\[REDACTED ?/, "").replace(/\]$/, "") || "TEXT"}
        </span>,
      );
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push(part.slice(last));
    return out;
  };
  if (!items.length) return bars(text, "t");
  const ordered = [...items].sort((a, b) => b.text.length - a.text.length);
  const re = new RegExp(`(${ordered.map((r) => r.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const byText = new Map(ordered.map((r) => [r.text, r]));
  const out: React.ReactNode[] = [];
  text.split(re).forEach((part, i) => {
    if (!part) return;
    const item = byText.get(part);
    if (item) {
      out.push(
        <button
          type="button"
          className="redact-bar"
          key={`r${i}`}
          title={`${REDACTION_LABEL[item.kind]} — click to keep this text`}
          onClick={() => onKeep(item)}
        >
          {part}
        </button>,
      );
    } else {
      out.push(...bars(part, `p${i}`));
    }
  });
  return out;
}
