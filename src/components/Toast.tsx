"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * A notification in the bottom-right corner.
 *
 * ── IT DOES NOT DISMISS ITSELF ──────────────────────────────────────────────
 * The usual two-second toast is right for "Copied" and wrong for anything the
 * person needs to read. This one names the address the firm will write to and
 * offers a way to reach a human — snatching that away after two seconds would
 * be a small, avoidable rudeness. It stays until it is closed.
 *
 * ── IT IS PORTALLED TO <body> ───────────────────────────────────────────────
 * Rendered where it is written — inside the sign-in card — it looked correct
 * and was NOT CLICKABLE. The card sits in its own stacking context (it is
 * animated, and the stage around it sets `isolation: isolate`), so a
 * `position: fixed` child with z-index 200 is still trapped beneath the card,
 * which then swallows every click aimed at the close button. A browser test
 * caught it; the portal fixes it.
 *
 * The entrance and exit are CSS animations rather than a state flag toggled in
 * an effect: fewer moving parts, and nothing to go wrong if React re-renders
 * mid-transition.
 *
 * `role="status"` rather than `alert` — this is good news, not an emergency, so
 * a screen reader mentions it without interrupting.
 *
 * ── THE CLASS IS `fd-corner`, NOT `fd-toast` ────────────────────────────────
 * `.fd-toast` is already taken: the Ver_30 design layer uses it for the small
 * dark pill that appears in the drafting workspace ("Attached contract.docx").
 * Reusing the name meant silently inheriting its `opacity: 0` and
 * `pointer-events: none`, which is exactly how this component came to render in
 * the wrong place, invisible, and unclickable. A distinct name is the fix; the
 * appended design layer owns a large namespace and it is worth checking before
 * inventing a class.
 */
export default function Toast({
  title,
  body,
  onClose,
}: {
  title: string;
  body: ReactNode;
  onClose?: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);

  // No document during server rendering, and nothing to portal into.
  if (gone || typeof document === "undefined") return null;

  function close() {
    setClosing(true);
    setTimeout(() => {
      setGone(true);
      onClose?.();
    }, 200);
  }

  return createPortal(
    <div className={`fd-corner${closing ? " out" : ""}`} role="status" aria-live="polite">
      <div className="fd-corner-body">
        <b>{title}</b>
        <p>{body}</p>
      </div>
      <button type="button" className="fd-corner-x" onClick={close} aria-label="Dismiss">
        ×
      </button>
    </div>,
    document.body,
  );
}
