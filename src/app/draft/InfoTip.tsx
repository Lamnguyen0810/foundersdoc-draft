"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The "i" beside a question.
 *
 * Point at it and a grey box opens with what the question means; move away
 * and it closes. Click or tap it and the box stays open until clicked again,
 * a click elsewhere, or Escape — which is also how it works on a phone,
 * where there is no pointing.
 *
 * The box floats over the page: drawn at the end of <body> (a portal) and
 * placed from the "i" itself, so it never pushes the question down, and is
 * never cut off or thrown out of place by the animated card around it.
 *
 * A span, not a button, because it sits inside the question's <label> and a
 * button there would become the thing the label points at.
 */

const WIDTH = 320;
const GAP = 8;

export default function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const iRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | null>(null);

  const place = useCallback(() => {
    const el = iRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(WIDTH, vw - 2 * GAP);
    const left = Math.max(GAP, Math.min(r.left - 14, vw - w - GAP));
    const boxH = boxRef.current?.offsetHeight ?? 120;
    const above = r.bottom + GAP + boxH > vh && r.top - GAP - boxH > 0;
    setPos({ top: above ? r.top - GAP - boxH : r.bottom + GAP, left, above });
  }, []);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  /* A short grace period, so the pointer can travel from the "i" to the box. */
  const closeSoon = () => {
    cancelClose();
    if (pinned) return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };

  useEffect(() => cancelClose, []);

  /* Keep the box beside the "i" while open: measure once shown (to know its
     height) and again on scroll or resize. */
  useEffect(() => {
    if (!open) return;
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  /* A pinned box closes on a click anywhere else, or Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (iRef.current?.contains(t) || boxRef.current?.contains(t)) return;
      setPinned(false);
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!text) return null;

  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelClose();
    if (pinned) {
      setPinned(false);
      setOpen(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  };

  return (
    <span className="q-info-wrap" onMouseEnter={show} onMouseLeave={closeSoon}>
      <span
        ref={iRef}
        role="button"
        tabIndex={0}
        className={`q-info${open ? " on" : ""}`}
        aria-expanded={open}
        aria-label={`What “${label}” means`}
        onClick={toggle}
        onFocus={show}
        onBlur={closeSoon}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(e)}
      >
        i
      </span>
      {open &&
        createPortal(
          <span
            ref={boxRef}
            role="tooltip"
            className={`q-info-pop${pos?.above ? " above" : ""}`}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseEnter={show}
            onMouseLeave={closeSoon}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
