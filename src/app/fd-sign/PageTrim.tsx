"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openPdf } from "../sign/PdfPages";
import { Ic } from "./ui";

/* FD Sign (0213): remove pages before sending, without Adobe. Rachel asked how a
   page would be deleted; the answer was "download, open in Adobe, save again".
   Now: tick the pages to remove → a new PDF is made in the browser (pdf-lib) with
   the other pages, in the same order. Nothing is uploaded until the request is
   sent, and the file as first uploaded can be restored at any time. */

const THUMB_W = 132;

function Thumb({ doc, page, off, onToggle }: { doc: PDFDocumentProxy; page: number; off: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    void doc.getPage(page).then((p) => {
      const c = ref.current;
      if (!alive || !c) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: (THUMB_W / p.getViewport({ scale: 1 }).width) * ratio });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [doc, page]);
  return (
    <button type="button" className={`fds-pg ${off ? "off" : ""}`} onClick={onToggle} aria-pressed={off} title={off ? `Keep page ${page}` : `Remove page ${page}`}>
      <span className="fds-pg-sheet">
        <canvas ref={ref} />
        {off && (
          <span className="fds-pg-x" aria-hidden>
            <Ic n="x" s={22} w={2} />
          </span>
        )}
      </span>
      <span className="fds-pg-no">
        <span className="fds-pg-tick" aria-hidden>
          {off ? <Ic n="x" s={11} w={2.4} /> : null}
        </span>
        Page {page}
      </span>
    </button>
  );
}

export default function PageTrim({ file, onDone, onClose }: { file: File; onDone: (f: File, removed: number[]) => void; onClose: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [count, setCount] = useState(0);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    let d: PDFDocumentProxy | null = null;
    openPdf(file)
      .then((x) => {
        d = x;
        if (!alive) return;
        setDoc(x);
        setCount(x.numPages);
      })
      .catch(() => alive && setErr("This PDF could not be opened here."));
    return () => {
      alive = false;
      void d?.destroy();
    };
  }, [file]);

  const toggle = (n: number) =>
    setOff((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const kept = count - off.size;

  async function apply() {
    if (!off.size || kept < 1) return;
    setBusy(true);
    setErr("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
      const out = await PDFDocument.create();
      const keep = src.getPageIndices().filter((i) => !off.has(i + 1));
      for (const p of await out.copyPages(src, keep)) out.addPage(p);
      out.setTitle(src.getTitle() ?? file.name.replace(/\.pdf$/i, ""));
      const bytes = await out.save();
      const name = file.name.replace(/\.pdf$/i, "") + ".pdf";
      onDone(new File([bytes.buffer as ArrayBuffer], name, { type: "application/pdf" }), [...off].sort((a, b) => a - b));
    } catch (e) {
      setErr(/encrypt/i.test(e instanceof Error ? e.message : "") ? "This PDF is password-protected, so pages can't be removed here. Remove the password first." : "The pages could not be removed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fds-trim" role="dialog" aria-label="Remove pages">
      <div className="fds-trim-hd">
        <div>
          <b>Remove pages</b>
          <small>Tap the pages you don&rsquo;t want to send. The rest stay in the same order.</small>
        </div>
        <button className="fds-btn sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
      {err && <div className="fds-err">{err}</div>}
      {!doc && !err && <p className="fds-muted">Loading the pages…</p>}
      {doc && (
        <div className="fds-trim-grid">
          {Array.from({ length: count }, (_, i) => (
            <Thumb key={i} doc={doc} page={i + 1} off={off.has(i + 1)} onToggle={() => toggle(i + 1)} />
          ))}
        </div>
      )}
      <div className="fds-trim-ft">
        <span>
          {off.size ? `${off.size} ${off.size === 1 ? "page" : "pages"} to remove · ${kept} left` : `${count} ${count === 1 ? "page" : "pages"}`}
          {kept < 1 && <em> · keep at least one page</em>}
        </span>
        <button className="fds-btn ink" disabled={busy || !off.size || kept < 1} onClick={() => void apply()}>
          {busy ? "Removing…" : off.size ? `Remove ${off.size} ${off.size === 1 ? "page" : "pages"}` : "Remove pages"}
        </button>
      </div>
    </div>
  );
}
