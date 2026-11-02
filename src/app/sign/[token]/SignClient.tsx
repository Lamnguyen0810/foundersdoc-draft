"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SignView } from "@/lib/sign/service";

/* The signing screen: the document(s) on the left, the signature on the right.
   Draw (mouse, finger or pen) or type; tick the consent box; Sign. */

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function SignClient({ token, view }: { token: string; view: SignView }) {
  const router = useRouter();
  const [doc, setDoc] = useState(0);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState(view.signerName);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const d = view.documents[doc];
  const n = view.documents.length;
  const done = d?.status === "completed";
  const fileUrl = (i: number, signed: boolean, download = false) =>
    `/api/sign/file?e=${view.documents[i].envelopeId}&t=${encodeURIComponent(token)}${signed ? "&signed=1" : ""}${download ? "&download=1" : ""}`;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * ratio;
    c.height = r.height * ratio;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0d1a59";
    }
  }, [mode, view.state]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = pos(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    if (!drawn) setDrawn(true);
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function clear() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  }

  async function sign() {
    setErr("");
    if (!consent) return setErr("Please tick the box to agree to sign electronically.");
    if (mode === "draw" && !drawn) return setErr("Please draw your signature in the box.");
    if (mode === "type" && typed.trim().length < 2) return setErr("Please type your full name.");
    setBusy(true);
    try {
      const res = await fetch("/api/sign/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consent, kind: mode, png: mode === "draw" ? canvas.current?.toDataURL("image/png") : undefined, typed: mode === "type" ? typed : undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not sign. Please try again.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not sign.");
      setBusy(false);
    }
  }

  return (
    <main className="fdsign">
      <header className="fs-head">
        <span className="fs-pill">FD SIGN</span>
        <span className="fs-by">Founders Doc</span>
        <span className="fs-me">
          {view.signerName} · {view.signerRole}
        </span>
      </header>

      <div className="fs-wrap">
        <section className="fs-doc">
          <div className="fs-doc-top">
            <div>
              <h1>{view.state === "signed" ? "Thank you, you've signed" : n > 1 ? `Please review and sign ${n} documents` : "Please review and sign"}</h1>
              <p className="fs-sub">
                {view.state === "signed"
                  ? done
                    ? "Everyone has signed. Download the signed copy below."
                    : "We'll email you the signed copy once everyone has signed."
                  : "Read the document, then sign on the right. Your signature is added on a signature page at the end, with a record of when and how you signed."}
              </p>
            </div>
          </div>
          {n > 1 && (
            <div className="fs-tabs" role="tablist">
              {view.documents.map((x, i) => (
                <button key={x.envelopeId} role="tab" aria-selected={i === doc} className={i === doc ? "on" : ""} onClick={() => setDoc(i)}>
                  {i + 1}. {x.title}
                </button>
              ))}
            </div>
          )}
          <div className="fs-people">
            {d.signers.map((s, i) => (
              <span key={i} className={`fs-chip ${s.status}`}>
                {s.status === "signed" ? "✓" : s.status === "invited" ? "✍" : "⏳"} {s.name} · {s.role}
                {s.me ? " (you)" : ""}
                {s.signedAt ? ` · ${fmt(s.signedAt)}` : ""}
              </span>
            ))}
          </div>
          <iframe key={`${d.envelopeId}-${view.state}`} className="fs-frame" title={d.title} src={fileUrl(doc, view.state === "signed")} />
          <div className="fs-doc-actions">
            <a className="fs-btn ghost" href={fileUrl(doc, view.state === "signed", true)}>
              ⬇ {view.state === "signed" ? (done ? "Download signed copy" : "Download copy so far") : "Download to read"}
            </a>
          </div>
        </section>

        <aside className="fs-side">
          {view.message && (
            <div className="fs-note">
              <b>Message from Founders Doc</b>
              <p>{view.message}</p>
            </div>
          )}
          {view.state === "ready" && (
            <div className="fs-card">
              <h2>Your signature</h2>
              <div className="fs-seg">
                <button className={mode === "draw" ? "on" : ""} onClick={() => setMode("draw")}>
                  Draw
                </button>
                <button className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>
                  Type
                </button>
              </div>
              {mode === "draw" ? (
                <div className="fs-pad">
                  <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Draw your signature here" />
                  <span className="fs-pad-hint">{drawn ? "" : "Sign here with your mouse or finger"}</span>
                  <button className="fs-clear" onClick={clear}>
                    Clear
                  </button>
                </div>
              ) : (
                <div className="fs-typed">
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" maxLength={80} />
                  <div className="fs-typed-preview">{typed || " "}</div>
                </div>
              )}
              <label className="fs-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  I agree to sign {n > 1 ? `these ${n} documents` : "this document"} electronically, and that my electronic signature has the same effect as my handwritten signature.
                </span>
              </label>
              {err && <p className="fs-err">{err}</p>}
              <button className="fs-btn primary" disabled={busy} onClick={() => void sign()}>
                {busy ? "Signing…" : n > 1 ? `Sign all ${n} documents` : "Sign"}
              </button>
              <p className="fs-small">
                Signing as <b>{view.signerName}</b> ({view.signerEmail}). We record the time, your IP address and browser in the audit trail.
              </p>
            </div>
          )}
          {view.state === "waiting" && (
            <div className="fs-card">
              <h2>Not your turn yet</h2>
              <p className="fs-small">{view.waitingFor} signs first. We&rsquo;ll email you when it&rsquo;s your turn.</p>
            </div>
          )}
          {view.state === "signed" && (
            <div className="fs-card done">
              <h2>✓ Signed</h2>
              <p className="fs-small">{done ? "All parties have signed." : "Waiting for the other signers. You'll get the signed copy by email."}</p>
            </div>
          )}
          {view.state === "voided" && (
            <div className="fs-card">
              <h2>This request was cancelled</h2>
              <p className="fs-small">Founders Doc cancelled this signing request. Nothing more is needed from you.</p>
            </div>
          )}
          <p className="fs-legal">Electronic signatures are recognised in Singapore under the Electronic Transactions Act 2010.</p>
        </aside>
      </div>
    </main>
  );
}
