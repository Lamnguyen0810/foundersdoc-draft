"use client";

import { useState } from "react";
import type { ShareInput } from "@/lib/share/conversation-pdf";

/**
 * "Share" in the top bar of every drafting screen: the conversation so far —
 * answers, questions and replies, things to fill in or check — as a PDF to
 * send on. The PDF is made in the browser (lib/share/conversation-pdf.ts);
 * the input is read at the moment of pressing, so it is never stale.
 */
export default function ShareButton({ getInput }: { getInput: () => ShareInput }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function run() {
    if (state === "busy") return;
    setState("busy");
    try {
      const { shareConversation } = await import("@/lib/share/conversation-pdf");
      const out = await shareConversation(getInput());
      setState(out === "cancelled" ? "idle" : "done");
      if (out !== "cancelled") setTimeout(() => setState("idle"), 2200);
    } catch (err) {
      console.error("[share] could not make the PDF:", err);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      type="button"
      className="chg share"
      title="Share this conversation as a PDF"
      aria-live="polite"
      disabled={state === "busy"}
      onClick={() => void run()}
    >
      {state === "busy" ? "Preparing PDF…" : state === "done" ? "PDF ready" : state === "error" ? "Couldn’t make the PDF" : "Share"}
    </button>
  );
}
