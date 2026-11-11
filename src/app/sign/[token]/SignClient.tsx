"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { SignView } from "@/lib/sign/service";
import { TEXT_MAX, signerSize } from "@/lib/sign/fields";

/* The signing screen: the document(s) with this signer's "Sign here" boxes on
   the signature lines. As on DocuSign (Rachel, 6 Nov: "I signed directly on the
   box"), the signer taps a box: the first tap opens "Adopt your signature"
   (draw with finger, mouse or pen, or type, and agree to sign electronically),
   and every later tap puts it on that box. A bar at the bottom (on phones) and
   the card on the right count the places left, jump to the next one and Finish. */

/**
 * A text box the signer types in (Rachel, 11 Nov: "the text I want to fill is longer than the box").
 * It wraps onto more lines and shrinks to fit the box as they type, the same way the signed PDF
 * shows it (lib/sign/pdf.ts, down to a very small size); it never spills over the document's own words.
 * Enter / Shift+Enter start a new line, and the corner handle makes the box bigger or smaller.
 */
function FitText({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tiny, setTiny] = useState(false);
  const fit = () => {
    const el = ref.current;
    if (!el || !el.clientHeight) return;
    let size = Math.min(12, el.clientHeight * 0.7);
    el.style.fontSize = `${size}px`;
    while (size > 4 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) el.style.fontSize = `${(size -= 0.5)}px`;
    setTiny(!!value.trim() && size < 7);
  };
  useLayoutEffect(fit);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit reads the latest value from the box itself
  }, []);
  return (
    <>
      <textarea
        ref={ref}
        className="fs-here-in fs-here-ta"
        value={value}
        rows={1}
        maxLength={TEXT_MAX}
        aria-label={label}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
      />
      {tiny && <span className="fs-here-warn">Small text: drag the corner to make the box bigger</span>}
    </>
  );
}

const PdfPages = dynamic(() => import("../PdfPages"), { ssr: false, loading: () => <div className="fs-pages-wait">Loading the document…</div> });
const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/** The drawing cropped to the ink (plus a little margin), so it fills its box on the line. */
function trimmed(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d");
  if (!ctx) return c.toDataURL("image/png");
  const { width: w, height: h } = c;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return c.toDataURL("image/png");
  const pad = Math.round(6 * (window.devicePixelRatio || 1));
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export default function SignClient({
  token,
  view,
  code = { required: false, verified: true, to: "" },
}: {
  token: string;
  view: SignView;
  code?: { required: boolean; verified: boolean; to: string };
}) {
  /* email code before signing (lib/sign/code.ts) */
  const [ok, setOk] = useState(!code.required || code.verified);
  const [codeSent, setCodeSent] = useState(false);
  const [codeVal, setCodeVal] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeErr, setCodeErr] = useState("");
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function askCode() {
    setCodeErr("");
    setCodeBusy(true);
    try {
      const res = await fetch("/api/sign/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
      if (!res.ok) throw new Error(j.error || "Could not send a code.");
      setCodeSent(true);
      setCodeVal("");
      setDevCode(j.devCode ?? "");
      setWait(30);
    } catch (e) {
      setCodeErr(e instanceof Error ? e.message : "Could not send a code.");
    } finally {
      setCodeBusy(false);
    }
  }
  async function checkCode() {
    setCodeErr("");
    if (codeVal.replace(/\D/g, "").length !== 6) return setCodeErr("Enter the 6 digits from the email.");
    setCodeBusy(true);
    try {
      const res = await fetch("/api/sign/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code: codeVal }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "That code isn't right.");
      setOk(true);
    } catch (e) {
      setCodeErr(e instanceof Error ? e.message : "That code isn't right.");
    } finally {
      setCodeBusy(false);
    }
  }
  const router = useRouter();
  const [doc, setDoc] = useState(0);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState(view.signerName);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* text boxes and checkboxes on my lines (FD Sign, SQL 120): field id -> what I typed, or "yes" */
  const [vals, setVals] = useState<Record<string, string>>({});
  /* text boxes the signer resized (fractions of the page); sent with the signature, kept in the signed PDF */
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  function grip(e: React.PointerEvent<HTMLSpanElement>, f: { id?: string; x: number; y: number; w: number; h: number }) {
    const id = f.id;
    const page = (e.currentTarget.parentElement?.offsetParent ?? null) as HTMLElement | null;
    if (!id || !page) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, ...(sizes[id] ?? { w: f.w, h: f.h }) };
    const pw = page.clientWidth || 1;
    const ph = page.clientHeight || 1;
    const move = (ev: PointerEvent) => {
      const s = signerSize(f, start.w + (ev.clientX - start.x) / pw, start.h + (ev.clientY - start.y) / ph);
      if (s) setSizes((m) => ({ ...m, [id]: s }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  const setVal = (id: string, v: string) => setVals((m) => ({ ...m, [id]: v }));
  /* 0199: the adopted signature (from the "Adopt your signature" sheet) and the boxes it is on */
  const [adopted, setAdopted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetErr, setSheetErr] = useState("");
  const [applied, setApplied] = useState<Set<string>>(() => new Set());
  const pending = useRef<string | null>(null);
  const [jump, setJump] = useState<string | null>(null);
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
  }, [mode, view.state, ok, sheet]);

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
  const ready = view.state === "ready";
  const mine = ready ? (d?.fields ?? []) : [];
  const places = mine.filter((f) => f.kind === "signature").length;
  /* every question on every document of this link (a batch can have several) */
  const asks = ready ? view.documents.flatMap((x) => x.fields.filter((f) => f.id && (f.kind === "text" || f.kind === "checkbox"))) : [];
  const initials = (mode === "type" ? typed : view.signerName)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);
  /* every place I sign or initial, on every document of this link, in order */
  const key = (di: number, fi: number) => `${di}:${fi}`;
  const signSpots = ready
    ? view.documents.flatMap((x, di) => x.fields.map((f, fi) => ({ f, di, k: key(di, fi) })).filter((o) => o.f.kind === "signature" || o.f.kind === "initials"))
    : [];
  const askLeft = (f: { id?: string; required?: boolean }) => !!f.id && f.required !== false && !(vals[f.id] ?? "").trim();
  const askSpots = ready
    ? view.documents.flatMap((x, di) => x.fields.map((f, fi) => ({ f, di, k: key(di, fi) })).filter((o) => (o.f.kind === "text" || o.f.kind === "checkbox") && askLeft(o.f)))
    : [];
  const signLeft = signSpots.filter((o) => !applied.has(o.k));
  const todo = [...signLeft, ...askSpots].sort((a, b) => a.di - b.di || Number(a.k.split(":")[1]) - Number(b.k.split(":")[1]));

  /* scroll to a box once its document is showing (pages draw a moment after a tab change) */
  useEffect(() => {
    if (!jump) return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.querySelector(`[data-key="${jump}"]`);
      if (el || ++tries > 25) {
        clearInterval(t);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        setJump(null);
      }
    }, 120);
    return () => clearInterval(t);
  }, [jump, doc]);
  function goTo(k: string) {
    const di = Number(k.split(":")[0]);
    if (di !== doc) setDoc(di);
    setJump(k);
  }
  function gotoBox() {
    const next = todo[0] ?? signSpots[0];
    if (next) goTo(next.k);
  }
  function openSheet(target: string | null) {
    pending.current = target;
    setSheetErr("");
    setDrawn(false); /* a fresh pad each time; the adopted signature stays until a new one is adopted */
    setSheet(true);
  }
  /* "Adopt and sign": keep the signature, put it on the box that was tapped */
  function adopt() {
    setSheetErr("");
    if (mode === "draw" && !drawn && !png) return setSheetErr("Please draw your signature in the box.");
    if (mode === "type" && typed.trim().length < 2) return setSheetErr("Please type your full name.");
    if (!consent) return setSheetErr("Please tick the box to agree to sign electronically.");
    if (mode === "draw" && drawn && canvas.current) setPng(trimmed(canvas.current));
    setAdopted(true);
    setSheet(false);
    const k = pending.current;
    pending.current = null;
    if (k) setApplied((a) => new Set(a).add(k));
    const after = todo.filter((o) => o.k !== k);
    if (after[0]) setTimeout(() => goTo(after[0].k), 250);
  }
  /* tap on a signature or initials box */
  function tapSign(k: string) {
    if (!adopted) return openSheet(k);
    if (applied.has(k)) return openSheet(null); /* tap a signed box again: change the signature */
    setApplied((a) => new Set(a).add(k));
    const after = todo.filter((o) => o.k !== k);
    if (after[0]) setTimeout(() => goTo(after[0].k), 250);
  }
  /* the bottom bar / card button: next place, or Finish when nothing is left */
  function nextOrFinish() {
    if (!adopted) return openSheet(signLeft[0]?.k ?? null);
    if (todo[0]) return goTo(todo[0].k);
    void sign();
  }

  async function sign() {
    setErr("");
    if (!adopted || !consent) return openSheet(signLeft[0]?.k ?? null);
    if (signLeft.length) {
      goTo(signLeft[0].k);
      return setErr(`Tap the remaining ${signLeft.length === 1 ? "place" : `${signLeft.length} places`} to sign.`);
    }
    const missing = asks.find((f) => f.required !== false && !(vals[f.id!] ?? "").trim());
    if (missing) {
      document.querySelector(`[data-field="${missing.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return setErr(missing.kind === "checkbox" ? `Please tick “${missing.label || "the box"}”.` : `Please fill in “${missing.label || "the text box"}”.`);
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sign/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          consent,
          kind: mode,
          png: mode === "draw" ? png || undefined : undefined,
          typed: mode === "type" ? typed : undefined,
          ...(asks.length ? { values: vals } : {}),
          ...(Object.keys(sizes).length ? { sizes } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; needCode?: boolean };
      if (j.needCode) {
        setOk(false);
        setCodeSent(false);
      }
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
        <span className="fs-by">{view.sender ? `from ${view.sender}` : "Founders Doc"}</span>
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
                  : "Read the document, then sign on the right. Your signature goes on the highlighted lines, with a record of when and how you signed added at the end."}
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
          {ready && (
            <div className="fs-goto">
              <span>
                {places
                  ? `You sign in ${places === 1 ? "1 place" : `${places} places`} in this document. Tap each yellow box to sign.`
                  : "There is no signature line marked for you here: your signature is added on the record page at the end."}
              </span>
              {places > 0 && (
                <button className="fs-textbtn" onClick={gotoBox}>
                  Show me where ↓
                </button>
              )}
            </div>
          )}
          <div className="fs-viewer">
            <PdfPages
              key={`${d.envelopeId}-${view.state}`}
              src={fileUrl(doc, view.state === "signed")}
              overlay={(page) =>
                mine
                  .map((f, fi) => ({ f, k: key(doc, fi) }))
                  .filter(({ f }) => f.page === page)
                  .map(({ f, k }, i) => {
                    const v = f.id ? (vals[f.id] ?? "") : "";
                    const tapToSign = f.kind === "signature" || f.kind === "initials";
                    const on = applied.has(k);
                    const filled =
                      f.kind === "text" ? !!v.trim() || f.required === false : f.kind === "checkbox" ? v === "yes" || f.required === false : !tapToSign || on;
                    return (
                      <div
                        key={i}
                        data-field={f.id}
                        data-key={k}
                        role={tapToSign ? "button" : undefined}
                        tabIndex={tapToSign ? 0 : undefined}
                        onKeyDown={tapToSign ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), tapSign(k)) : undefined}
                        className={`fs-here ${filled ? "filled" : ""} ${on ? "signed" : ""} ${f.kind === "text" || f.kind === "checkbox" ? "ask" : ""} ${todo[0]?.k === k ? "next" : ""}`}
                        style={{
                          left: `${f.x * 100}%`,
                          top: `${f.y * 100}%`,
                          width: `${((f.id && sizes[f.id]?.w) || f.w) * 100}%`,
                          height: `${((f.id && sizes[f.id]?.h) || f.h) * 100}%`,
                        }}
                        onClick={f.kind === "checkbox" ? () => f.id && setVal(f.id, v === "yes" ? "" : "yes") : f.kind === "text" ? undefined : tapToSign ? () => tapSign(k) : undefined}
                        title={f.kind === "text" || f.kind === "checkbox" ? (f.label ?? "") : tapToSign ? (on ? "Tap to change your signature" : "Tap to sign here") : ""}
                      >
                        {f.kind === "text" && (
                          <>
                            {!v && <span className="fs-here-l">{f.label || "Type here"}{f.required === false ? " (optional)" : ""}</span>}
                            <FitText value={v} label={f.label || "Text"} onChange={(nv) => f.id && setVal(f.id, nv)} />
                            <span className="fs-here-grip" role="presentation" title="Drag to make the box bigger or smaller" onPointerDown={(e) => grip(e, f)} />
                          </>
                        )}
                        {f.kind === "checkbox" && <span className="fs-here-cb" role="checkbox" aria-checked={v === "yes"} aria-label={f.label || "Tick"}>{v === "yes" ? "✓" : ""}</span>}
                        {f.kind === "checkbox" && v !== "yes" && f.required !== false && <span className="fs-here-l">Tick</span>}
                        {f.kind === "initials" && !on && <span className="fs-here-l">Initial here</span>}
                        {f.kind === "initials" && on && <span className="fs-here-t" style={{ ["--n" as string]: 4 }}>{initials}</span>}
                        {f.kind === "signature" && !on && <span className="fs-here-l">{adopted ? "Tap to sign" : "Sign here"}</span>}
                        {f.kind === "signature" && !on && <span className="fs-here-tap" aria-hidden="true">✍</span>}
                        {f.kind === "signature" && on && (mode === "draw" ? /* eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signature being drawn */
                          <img src={png} alt="Your signature" /> : <span className="fs-here-t" style={{ ["--n" as string]: Math.max(typed.trim().length, 4) }}>{typed}</span>)}
                        {f.kind === "date" && <span className="fs-here-d">{today()}</span>}
                        {f.kind === "name" && <span className="fs-here-d">{view.signerName}</span>}
                      </div>
                    );
                  })
              }
            />
          </div>
          <div className="fs-doc-actions">
            {done ? (
              <>
                <a className="fs-btn ghost" href={`${fileUrl(doc, true, true)}&doc=1`}>
                  ⬇ Download {/certificate/i.test(d.title) ? "certificate" : "document"} only
                </a>
                <a className="fs-btn ghost" href={fileUrl(doc, true, true)}>
                  ⬇ With audit trail
                </a>
              </>
            ) : (
              <a className="fs-btn ghost" href={fileUrl(doc, view.state === "signed", true)}>
                ⬇ {view.state === "signed" ? "Download copy so far" : "Download to read"}
              </a>
            )}
          </div>
        </section>

        <aside className="fs-side">
          {view.message && (
            <div className="fs-note">
              <b>Message from {view.sender ?? "Founders Doc"}</b>
              <p>{view.message}</p>
            </div>
          )}
          {view.state === "ready" && !ok && (
            <div className="fs-card">
              <h2>First, confirm it&rsquo;s you</h2>
              <p className="fs-small fs-tight">
                We&rsquo;ll email a 6-digit code to <b>{code.to}</b>. It works for 10 minutes.
              </p>
              {!codeSent ? (
                <button className="fs-btn primary" disabled={codeBusy} onClick={() => void askCode()}>
                  {codeBusy ? "Sending…" : "Email me a code"}
                </button>
              ) : (
                <>
                  <input
                    className="fs-code"
                    value={codeVal}
                    onChange={(e) => setCodeVal(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && void checkCode()}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    aria-label="6-digit code from the email"
                    autoFocus
                  />
                  {devCode && <p className="fs-small">Preview only (no email sent): the code is {devCode}</p>}
                  <button className="fs-btn primary" disabled={codeBusy} onClick={() => void checkCode()}>
                    {codeBusy ? "Checking…" : "Confirm"}
                  </button>
                  <p className="fs-small">
                    Didn&rsquo;t get it? Check spam, or{" "}
                    {wait > 0 ? (
                      <span>send again in {wait}s</span>
                    ) : (
                      <button className="fs-textbtn" onClick={() => void askCode()}>
                        send a new code
                      </button>
                    )}
                    .
                  </p>
                </>
              )}
              {codeErr && <p className="fs-err">{codeErr}</p>}
            </div>
          )}
          {view.state === "ready" && ok && asks.length > 0 && (
            <div className="fs-card fs-asks">
              <h2>Fill in</h2>
              {asks.map((f) =>
                f.kind === "checkbox" ? (
                  <label key={f.id} className="fs-consent">
                    <input type="checkbox" checked={vals[f.id!] === "yes"} onChange={(e) => setVal(f.id!, e.target.checked ? "yes" : "")} />
                    <span>
                      {f.label || "I agree"}
                      {f.required === false ? " (optional)" : ""}
                    </span>
                  </label>
                ) : (
                  <label key={f.id} className="fs-ask">
                    <span>
                      {f.label || "Text"}
                      {f.required === false ? " (optional)" : ""}
                    </span>
                    <textarea value={vals[f.id!] ?? ""} rows={2} maxLength={TEXT_MAX} onChange={(e) => setVal(f.id!, e.target.value)} />
                  </label>
                ),
              )}
            </div>
          )}
          {view.state === "ready" && ok && (
            <div className="fs-card fs-sigcard">
              <h2>Your signature</h2>
              {code.required && <p className="fs-verified">✓ Email confirmed</p>}
              {adopted ? (
                <button className="fs-adopted" onClick={() => openSheet(null)} aria-label="Change your signature">
                  {mode === "draw" && png ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signature just drawn */
                    <img src={png} alt="Your signature" />
                  ) : (
                    <span className="fs-typed-sig">{typed}</span>
                  )}
                  <small>Change</small>
                </button>
              ) : (
                <p className="fs-small fs-tight">Tap a yellow <b>Sign here</b> box on the document, or start here.</p>
              )}
              <div className="fs-progress" aria-live="polite">
                <span>
                  {signSpots.length
                    ? `${signSpots.length - signLeft.length} of ${signSpots.length} ${signSpots.length === 1 ? "place" : "places"} signed`
                    : "Your signature goes on the record page at the end."}
                  {askSpots.length ? ` · ${askSpots.length} to fill in` : ""}
                </span>
                {signSpots.length > 0 && (
                  <i>
                    <b style={{ width: `${Math.round(((signSpots.length - signLeft.length) / signSpots.length) * 100)}%` }} />
                  </i>
                )}
              </div>
              {err && <p className="fs-err">{err}</p>}
              <button className="fs-btn primary" disabled={busy} onClick={nextOrFinish}>
                {busy ? "Signing…" : !adopted ? "Start signing" : todo.length ? `Next: ${todo[0].f.kind === "text" || todo[0].f.kind === "checkbox" ? "fill in" : "sign here"} ↓` : n > 1 ? `Finish: sign all ${n} documents` : "Finish"}
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
          {view.state === "expired" && (
            <div className="fs-card">
              <h2>This link has expired</h2>
              <p className="fs-small">{view.sender ? `Signing links work for 30 days. Reply to the email to ask ${view.sender} for a new one.` : <>Signing links work for 30 days. Reply to the email from Founders Doc and we&rsquo;ll send you a new one.</>}</p>
            </div>
          )}
          {view.state === "voided" && (
            <div className="fs-card">
              <h2>This request was cancelled</h2>
              <p className="fs-small">{view.sender ?? "Founders Doc"} cancelled this signing request. Nothing more is needed from you.</p>
            </div>
          )}
          <p className="fs-legal">Electronic signatures are recognised in Singapore under the Electronic Transactions Act 2010.</p>
        </aside>
      </div>

      {view.state === "ready" && ok && (
        <div className="fs-mbar">
          <span>{!adopted ? "Tap Start, or a yellow box" : todo.length ? `${todo.length} left` : "All done"}</span>
          <button className="fs-btn primary" disabled={busy} onClick={nextOrFinish}>
            {busy ? "Signing…" : !adopted ? "Start signing" : todo.length ? "Next ↓" : "Finish"}
          </button>
        </div>
      )}

      {sheet && (
        <div className="fs-sheet-bg" onClick={() => setSheet(false)}>
          <div className="fs-sheet" role="dialog" aria-modal="true" aria-label="Adopt your signature" onClick={(e) => e.stopPropagation()}>
            <div className="fs-sheet-top">
              <h2>Adopt your signature</h2>
              <button className="fs-icon" onClick={() => setSheet(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="fs-seg">
              <button
                className={mode === "draw" ? "on" : ""}
                onClick={() => {
                  setMode("draw");
                  setDrawn(false);
                }}
              >
                Draw
              </button>
              <button className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>
                Type
              </button>
            </div>
            {mode === "draw" ? (
              <div className="fs-pad">
                <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Draw your signature here" />
                <span className="fs-pad-hint">{drawn ? "" : png && adopted ? "Draw a new one, or press Adopt to keep yours" : "Sign here with your finger or mouse"}</span>
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
            {sheetErr && <p className="fs-err">{sheetErr}</p>}
            <button className="fs-btn primary" onClick={adopt}>
              Adopt and sign
            </button>
            <p className="fs-small">You can still check everything before you press Finish.</p>
          </div>
        </div>
      )}
    </main>
  );
}
