"use client";

/**
 * The drafting screens on phones and tablets.
 *
 * Every drafting screen (DraftChat, Employment, Ssa …) is the same three
 * columns: the rail (new draft, past drafts, credits) on the left, the
 * conversation in the middle, the progress pane on the right. On a narrow
 * screen the side columns used to be hidden outright — so on a phone there
 * was no way to see the progress, "Skip the rest", the answers beside a
 * draft, past drafts or credits.
 *
 * The way ChatGPT, Claude and Notion handle the same problem: the left
 * column becomes a drawer behind a menu button, the right one a bottom
 * sheet. This adds the two buttons to the strip above the conversation
 * (≤900px: menu; ≤1180px: progress) and opens the existing rail and pane in
 * place — no screen has to change. Escape, the backdrop, or choosing
 * anything inside closes them again.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Open = null | "rail" | "pane";

export default function MobileDraftBar() {
  const [strip, setStrip] = useState<HTMLElement | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [open, setOpen] = useState<Open>(null);

  /* The strip appears after the screen mounts and is replaced when the
     screen changes (catalogue → questions → draft): follow it. */
  useEffect(() => {
    const find = () => {
      const s = document.querySelector<HTMLElement>("#scr-chat .strip");
      const scr = document.getElementById("scr-chat");
      setStrip((prev) => (prev === s ? prev : s));
      setIsDraft(Boolean(scr?.classList.contains("is-draft")));
    };
    find();
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* The open panel is a class on the screen, so the CSS does the work. */
  useEffect(() => {
    const scr = document.getElementById("scr-chat");
    if (!scr) return;
    scr.classList.toggle("m-rail", open === "rail");
    scr.classList.toggle("m-pane", open === "pane");
    if (!open) return;
    const panel = scr.querySelector<HTMLElement>(open === "rail" ? ".rail" : ".pane");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    /* Choosing anything inside — a past draft, a step, Generate — closes it. */
    const onPick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      /* The steps in the progress list are divs with role="button". */
      if (t?.closest('a, button, [role="button"]') && !t.closest(".m-keep")) setTimeout(() => setOpen(null), 0);
    };
    document.addEventListener("keydown", onKey);
    panel?.addEventListener("click", onPick);
    return () => {
      document.removeEventListener("keydown", onKey);
      panel?.removeEventListener("click", onPick);
    };
  }, [open, strip]);

  /* A wider window closes whatever is open: the columns are back. */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1181px)");
    const onChange = () => mq.matches && setOpen(null);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scr = typeof document !== "undefined" ? document.getElementById("scr-chat") : null;
  if (!strip || !scr) return null;

  return (
    <>
      {createPortal(
        <button type="button" className="m-btn m-menu" aria-label="Menu" aria-expanded={open === "rail"} onClick={() => setOpen(open === "rail" ? null : "rail")}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>,
        strip,
        "m-menu",
      )}
      {createPortal(
        <button type="button" className="m-btn m-prog" aria-label={isDraft ? "Answers" : "Progress"} aria-expanded={open === "pane"} onClick={() => setOpen(open === "pane" ? null : "pane")}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="m-prog-t">{isDraft ? "Answers" : "Progress"}</span>
        </button>,
        strip,
        "m-prog",
      )}
      {open &&
        createPortal(<div className="m-backdrop" onClick={() => setOpen(null)} aria-hidden="true" />, scr, "m-backdrop")}
      {open === "pane" &&
        createPortal(
          <button type="button" className="m-close m-keep" aria-label="Close" onClick={() => setOpen(null)}>
            ×
          </button>,
          scr.querySelector(".pane") ?? scr,
          "m-close",
        )}
    </>
  );
}
