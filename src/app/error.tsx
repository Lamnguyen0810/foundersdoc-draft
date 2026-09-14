"use client";

import Link from "next/link";

/**
 * The last line of defence against a white screen.
 *
 * If anything throws while rendering a page, Next.js swaps in this component.
 * Without it the user gets an empty page and nobody — not them, not us — can
 * tell whether the app crashed, the network died, or they are simply looking at
 * a page that renders nothing. That ambiguity costs more time than the bug.
 */

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the browser console and, on Vercel, to the function logs.
    console.error("[FD AI] render failed:", error);
  }, [error]);

  return (
    <main className="wrap" style={{ maxWidth: 640, padding: "72px 24px" }}>
      <p className="kicker">FD AI</p>
      <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", marginTop: 10 }}>
        Something went wrong on this screen.
      </h1>
      <p className="sub" style={{ marginTop: 12 }}>
        No draft or answer has been lost — this is the page failing to render, not the
        drafting service failing. Try again, and if it keeps happening send the reference
        below to whoever maintains the app.
      </p>

      <div
        style={{
          marginTop: 22,
          padding: "14px 16px",
          border: "1px solid var(--grey-2)",
          borderLeft: "2px solid var(--gold)",
          borderRadius: 10,
          background: "var(--grey-1)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <b style={{ fontWeight: 500 }}>Reference</b>
        <div style={{ marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
          {error.digest ?? error.message ?? "no detail available"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-gold" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-white" href="/draft">
          Start a new draft
        </Link>
        <a className="btn btn-white" href="/">
          Back to the site
        </a>
      </div>
    </main>
  );
}
