"use client";

import { useRef, useState, type ReactNode } from "react";
import type { DocKind, EsopDocument, EsopHolder } from "@/lib/esop/vesting";
import { matchFile } from "@/lib/esop/match";

/**
 * "Bulk upload (FD)" — Founders Doc admins only (the CEO never sees it).
 * Pick many PDFs at once; each is matched to a holder and a column by its
 * file name (lib/esop/match.ts), shown for checking, and uploaded on Confirm
 * through the dashboard's normal upload (same private storage, same rules).
 *
 * TO REMOVE: delete this file, lib/esop/match.ts, and the one <BulkUpload …/>
 * line in EsopSheet.tsx (in the toolbar, after Download Excel).
 */

interface Row {
  key: string;
  file: File;
  holderId: string;
  kind: DocKind | "";
  tranche: string;
  why: string;
  done: "" | "ok" | "fail" | "skip";
}

export default function BulkUpload({
  holders,
  docs,
  onUpload,
  className = "e-btn",
  children,
}: {
  holders: EsopHolder[];
  docs: EsopDocument[];
  onUpload: (holder: EsopHolder, kind: DocKind, file: File, tranche: number | null) => Promise<boolean>;
  /** the button's look and content (the dashboard's own "Bulk upload" button) */
  className?: string;
  children?: ReactNode;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const sorted = [...holders].sort((a, b) => a.name.localeCompare(b.name));

  function choose(files: FileList) {
    setRows(
      Array.from(files).map((file, i) => {
        const m = matchFile(file.name, holders);
        const already = m.holderId && docs.some((d) => d.holder_id === m.holderId && d.file_name === file.name.slice(0, 200));
        return {
          key: `${i}-${file.name}`,
          file,
          holderId: m.holderId ?? "",
          kind: m.kind ?? "",
          tranche: m.tranche ? String(m.tranche) : "",
          why: already ? "already on file — will be skipped" : m.why,
          done: already ? "skip" : "",
        };
      }),
    );
  }

  const set = (key: string, patch: Partial<Row>) => setRows((l) => (l ? l.map((r) => (r.key === key ? { ...r, ...patch } : r)) : l));
  const ready = (r: Row) => r.done === "" && r.holderId && r.kind;

  async function confirm() {
    if (!rows) return;
    setBusy(true);
    for (const r of rows) {
      if (!ready(r)) continue;
      const h = holders.find((x) => x.id === r.holderId);
      if (!h) continue;
      const n = Number.parseInt(r.tranche, 10);
      const ok = await onUpload(h, r.kind as DocKind, r.file, r.kind === "certificate" && n >= 1 && n <= 10 ? n : null);
      set(r.key, { done: ok ? "ok" : "fail" });
    }
    setBusy(false);
  }

  const count = rows?.filter(ready).length ?? 0;
  const finished = rows?.every((r) => r.done !== "") ?? false;

  return (
    <>
      <button className={className} onClick={() => pick.current?.click()} title="Founders Doc only: upload many Letters of Grant / Option Certificates at once">
        {children ?? "⬆ Bulk upload (FD)"}
      </button>
      <input
        ref={pick}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        hidden
        onChange={(e) => {
          if (e.currentTarget.files?.length) choose(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      {rows && (
        <div className="e-modal" role="dialog" aria-label="Bulk upload">
          <div className="e-modal-box">
            <h2>Bulk upload · {rows.length} file(s)</h2>
            <p>Check each line. Matched from the file name; change anything that is wrong. Lines without a holder or a column are not uploaded.</p>
            <div className="e-modal-list">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Holder</th>
                    <th>Column</th>
                    <th>Tranche</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={!r.holderId || !r.kind ? "miss" : ""}>
                      <td title={r.file.name}>{r.file.name}</td>
                      <td>
                        <select value={r.holderId} disabled={busy || r.done !== ""} onChange={(e) => set(r.key, { holderId: e.target.value })}>
                          <option value="">— pick holder —</option>
                          {sorted.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} (Batch {h.batch}){h.status === "Leaver" ? " · leaver" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={r.kind} disabled={busy || r.done !== ""} onChange={(e) => set(r.key, { kind: e.target.value as DocKind | "" })}>
                          <option value="">— pick —</option>
                          <option value="letter_of_grant">Letter of Grant</option>
                          <option value="certificate">Option certificate</option>
                        </select>
                      </td>
                      <td>
                        {r.kind === "certificate" && (
                          <input value={r.tranche} disabled={busy || r.done !== ""} onChange={(e) => set(r.key, { tranche: e.target.value })} placeholder="–" size={2} />
                        )}
                      </td>
                      <td className="st">{r.done === "ok" ? "✅" : r.done === "fail" ? "❌" : r.done === "skip" ? "⏭" : !r.holderId || !r.kind ? "⚠️" : ""} <small>{r.done === "" || r.done === "skip" ? r.why : ""}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="e-modal-foot">
              <button className="e-btn" disabled={busy} onClick={() => setRows(null)}>
                {finished ? "Close" : "Cancel"}
              </button>
              {!finished && (
                <button className="e-btn g" disabled={busy || count === 0} onClick={() => void confirm()}>
                  {busy ? "Uploading…" : `Upload ${count} file(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
