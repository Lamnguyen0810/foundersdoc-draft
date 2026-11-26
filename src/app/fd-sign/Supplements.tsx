"use client";

import { useRef, useState } from "react";
import type { PdfInfo } from "@/lib/sign/boxes";
import { findPages, insertPdfs, placeText, type Place } from "@/lib/sign/supplements";
import { openPdf, readPdf } from "../sign/PdfPages";
import { Ic } from "./ui";

/**
 * 0296 (Rachel): "Add a supplemental document" and choose where it goes in the main document: at the end, after
 * a page number, or after the page that says e.g. "Appendix B". Nothing is sent from here: "Insert" makes one PDF
 * in the browser, which then goes through the Fields step like any upload (so supplemental pages can be signed).
 */

const MAX = 10 * 1024 * 1024;
type Mode = "end" | "page" | "text";
interface Item {
  key: string;
  file: File;
  pages: number;
  mode: Mode;
  page: string;
  text: string;
  /** which match, when the words are on several pages */
  hit: number | null;
}
let seq = 0;

export default function Supplements({ file, info, toPdf, onInserted }: { file: File; info: PdfInfo; toPdf: (f: File) => Promise<File | null>; onInserted: (f: File, lines: string[], pages: number) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const n = info.pages.length;

  const set = (k: string, patch: Partial<Item>) => setItems((l) => l.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const hits = (it: Item) => (it.mode === "text" ? findPages(info, it.text) : []);
  const placeOf = (it: Item): Place => {
    if (it.mode === "end") return { mode: "end" };
    if (it.mode === "page") return { mode: "page", page: Number(it.page) };
    const h = hits(it);
    return { mode: "text", text: it.text, page: it.hit && h.includes(it.hit) ? it.hit : (h[0] ?? null) };
  };
  const problem = (it: Item): string | null => {
    if (it.mode === "page") {
      const p = Number(it.page);
      if (!it.page.trim() || !Number.isInteger(p) || p < 1 || p > n) return `Choose a page from 1 to ${n}.`;
    }
    if (it.mode === "text") {
      if (it.text.trim().length < 2) return "Type the words to look for, e.g. Appendix B.";
      if (!hits(it).length) return `“${it.text.trim()}” is not in the document. Check the spelling, or choose a page number.`;
    }
    return null;
  };

  async function add(list: FileList | null) {
    setErr("");
    for (const raw of [...(list ?? [])].slice(0, 5)) {
      let f: File | null = raw;
      if (f.size > MAX) {
        setErr(`${f.name} is over 10 MB.`);
        continue;
      }
      setBusy(f.name);
      const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b && /\.docx$/i.test(f.name)) f = await toPdf(f);
      if (!f) {
        setBusy("");
        continue;
      }
      try {
        const doc = await openPdf(f);
        const i = await readPdf(doc);
        void doc.destroy();
        const it: Item = { key: `s${Date.now().toString(36)}${seq++}`, file: f, pages: i.pages.length, mode: "end", page: "", text: "", hit: null };
        setItems((l) => [...l, it].slice(0, 10));
      } catch {
        setErr(`${f.name} could not be opened. Upload a PDF or Word file (.docx); if it has a password, remove it first.`);
      }
      setBusy("");
    }
    if (input.current) input.current.value = "";
  }

  async function insert() {
    setErr("");
    const bad = items.map(problem).find(Boolean);
    if (bad) return setErr(bad);
    setBusy("insert");
    try {
      const out = await insertPdfs(
        new Uint8Array(await file.arrayBuffer()),
        await Promise.all(items.map(async (it) => ({ name: it.file.name.replace(/\.pdf$/i, ""), bytes: new Uint8Array(await it.file.arrayBuffer()), place: placeOf(it) }))),
      );
      const merged = new File([out.bytes as BlobPart], file.name, { type: "application/pdf" });
      if (merged.size > MAX) throw new Error("Together the documents are over 10 MB. Please make the files smaller and try again.");
      onInserted(merged, out.lines, out.pages);
      setItems([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The documents could not be put together.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fds-supp">
      <div className="fds-supp-h">
        <span>
          <b>Supplemental documents</b>
          <small>e.g. the Constitution after Appendix A, or a share resolution after Appendix B. You choose where each one goes.</small>
        </span>
        <button className="fds-btn sm" disabled={!!busy || items.length >= 10} onClick={() => input.current?.click()}>
          <Ic n="plus" s={14} /> Add a document
        </button>
        <input ref={input} type="file" multiple hidden accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void add(e.target.files)} />
      </div>
      {busy && busy !== "insert" && <p className="fds-muted">Reading {busy}…</p>}
      {items.map((it, i) => {
        const h = hits(it);
        const pr = problem(it);
        return (
          <div className="fds-supp-row" key={it.key}>
            <span className="fds-supp-n">{i + 1}</span>
            <div className="fds-supp-main">
              <b>{it.file.name}</b>
              <small>
                {it.pages} {it.pages === 1 ? "page" : "pages"}
              </small>
              <div className="fds-supp-where" role="radiogroup" aria-label={`Where ${it.file.name} goes`}>
                <span>Insert</span>
                <select className="fds-inp" value={it.mode} aria-label="Where" onChange={(e) => set(it.key, { mode: e.target.value as Mode })}>
                  <option value="end">at the end</option>
                  <option value="page">after page…</option>
                  <option value="text">after the page that says…</option>
                </select>
                {it.mode === "page" && <input className="fds-inp num" inputMode="numeric" value={it.page} placeholder={`1–${n}`} aria-label="Page number" onChange={(e) => set(it.key, { page: e.target.value.replace(/\D/g, "").slice(0, 4) })} />}
                {it.mode === "text" && <input className="fds-inp" value={it.text} maxLength={80} placeholder="e.g. Appendix B" aria-label="Words on the page" onChange={(e) => set(it.key, { text: e.target.value, hit: null })} />}
                {it.mode === "text" && h.length > 1 && (
                  <select className="fds-inp" value={String(it.hit ?? h[0])} aria-label="Which page" onChange={(e) => set(it.key, { hit: Number(e.target.value) })}>
                    {h.map((p) => (
                      <option key={p} value={p}>
                        page {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <small className={pr ? "fds-supp-bad" : "fds-supp-ok"}>{pr ?? `Goes ${placeText(placeOf(it), n)}${it.mode === "text" && h.length > 1 ? ` · found on pages ${h.join(", ")}` : ""}`}</small>
            </div>
            <span className="ops">
              <button className="fds-ico" aria-label="Move up" disabled={i === 0} onClick={() =>
                  setItems((l) => {
                    const c = [...l];
                    [c[i - 1], c[i]] = [c[i]!, c[i - 1]!];
                    return c;
                  })
                }>
                <Ic n="arrowUp" s={15} />
              </button>
              <button className="fds-ico" aria-label="Remove" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                <Ic n="x" s={15} />
              </button>
            </span>
          </div>
        );
      })}
      {items.length > 0 && (
        <div className="fds-supp-go">
          <button className="fds-btn ink" disabled={!!busy} onClick={() => void insert()}>
            {busy === "insert" ? "Putting them together…" : `Insert ${items.length === 1 ? "it" : `all ${items.length}`} into the document`}
          </button>
          <small>Page numbers are those of your document as it is now ({n} pages). You can place signature boxes on the new pages in step 3.</small>
        </div>
      )}
      {err && <div className="fds-err">{err}</div>}
    </div>
  );
}
