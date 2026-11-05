"use client";

import { useRef } from "react";
import PdfPages, { type PdfInfo } from "../../sign/PdfPages";
import { boxId, clamp, colour, sized, type Box, type BoxKind } from "@/lib/sign/boxes";

/* The document with its signature boxes: drag a box to move it, drag the
   corner to resize, ✕ to remove. With a box type "armed", a click on a page
   drops a new box there for the chosen signer. */

const LABEL: Record<BoxKind, string> = { signature: "Signature", date: "Date", name: "Name", initials: "Initials", text: "Text", checkbox: "Tick" };

export default function BoxEditor({
  file,
  boxes,
  onChange,
  names,
  active,
  armed,
  onPlaced,
  onInfo,
}: {
  file: Blob;
  boxes: Box[];
  onChange: (b: Box[]) => void;
  names: string[]; // index 0 = position 1
  active: number;
  armed: BoxKind | null;
  onPlaced: () => void;
  onInfo: (info: PdfInfo) => void;
}) {
  const info = useRef<PdfInfo | null>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; start: Box; rw: number; rh: number } | null>(null);

  function start(e: React.PointerEvent, b: Box, mode: "move" | "size") {
    if ((e.target as HTMLElement).closest(".fs-box-x")) return;
    e.preventDefault();
    e.stopPropagation();
    const over = (e.currentTarget as HTMLElement).closest(".fs-page-over") as HTMLElement | null;
    if (!over) return;
    const r = over.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: b.id, mode, sx: e.clientX, sy: e.clientY, start: b, rw: r.width, rh: r.height };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rw;
    const dy = (e.clientY - d.sy) / d.rh;
    const next = d.mode === "move" ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy };
    onChange(boxes.map((b) => (b.id === d.id ? clamp(next) : b)));
  }
  function end() {
    drag.current = null;
  }

  function drop(e: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!armed) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pg = info.current?.pages[page - 1] ?? { w: 595, h: 842 };
    const { w, h } = sized(armed, pg);
    const x = (e.clientX - r.left) / r.width - w / 2;
    const y = (e.clientY - r.top) / r.height - h / 2;
    onChange([...boxes, clamp({ id: boxId(), position: active, kind: armed, page, x, y, w, h })]);
    onPlaced();
  }

  return (
    <PdfPages
      src={file}
      className={armed ? "armed" : ""}
      onInfo={(i) => {
        info.current = i;
        onInfo(i);
      }}
      overlay={(page) => (
        <div className="fs-over-hit" onClick={(e) => drop(e, page)}>
          {boxes
            .filter((b) => b.page === page)
            .map((b) => (
              <div
                key={b.id}
                className={`fs-box ${b.kind} ${b.position === active ? "act" : ""}`}
                style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, ["--c" as string]: colour(b.position) }}
                onPointerDown={(e) => start(e, b, "move")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onClick={(e) => e.stopPropagation()}
                title={`${b.label || LABEL[b.kind]} · ${names[b.position - 1] || `Signer ${b.position}`} — drag to move`}
              >
                <span className="fs-box-l">
                  {b.kind === "signature" ? "✍ " : b.kind === "checkbox" ? "☑ " : ""}
                  {(b.kind === "text" || b.kind === "checkbox") && b.label ? b.label : LABEL[b.kind]} · {names[b.position - 1]?.split(/\s+/)[0] || `Signer ${b.position}`}
                </span>
                <button className="fs-box-x" aria-label="Remove this box" onClick={(e) => (e.stopPropagation(), onChange(boxes.filter((x) => x.id !== b.id)))}>
                  ✕
                </button>
                <span className="fs-box-r" onPointerDown={(e) => start(e, b, "size")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-hidden />
              </div>
            ))}
        </div>
      )}
    />
  );
}
