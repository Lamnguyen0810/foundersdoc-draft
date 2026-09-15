"use client";

/**
 * FD AI — the drafting workspace.
 *
 * A React implementation of the confirmed Ver_30 design: an opening splash, a
 * document catalogue, then a guided conversation with a live progress pane and
 * a draft view. The markup and class names match the design file exactly, so
 * the appended design layer in globals.css styles this without a single
 * bespoke rule here. If a class looks odd, it is the design's, not an
 * invention — check FDAI_Ver_30_100926.html before renaming anything.
 *
 * THREE THINGS THIS DOES THAT THE PROTOTYPE ONLY MIMED
 *   1. Skip. Every question can be deferred. A skipped answer is stored as the
 *      SKIPPED marker, not as an empty string, so the prompt can tell "asked
 *      and deferred" from "never reached" and place a [[TO CONFIRM]].
 *   2. Draft with what I have. Marks every remaining question skipped and
 *      generates immediately — a real API call, not a canned document.
 *   3. It talks to the real endpoints: /api/generate (streamed), /api/extract
 *      for an uploaded source, /api/export for the Word file.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocType, Field } from "@/lib/doctypes";
import { track } from "@/lib/track";
import DocumentEditor from "./DocumentEditor";
import DraftReady from "./DraftReady";
import { SKIPPED } from "@/lib/prompt";

/* ────────────────────────────────────────────────────── the catalogue */

/** id, label, blurb, ready, search terms. Ready is decided by the live
 *  catalogue, not by this table — a row flips to Ready the moment its slug
 *  exists in Supabase, with no code change. */
type CatDoc = [string, string, string, boolean, string];
type CatFolder = [string, CatDoc[]];

const CATALOGUE: CatFolder[] = [
  [
    "Confidentiality",
    [
      [
        "nda",
        "Non-Disclosure Agreement",
        "Keep shared information confidential — mutual or one-way",
        true,
        "nda confidentiality secrecy partner investor vendor",
      ],
    ],
  ],
  [
    "Commercial",
    [
      ["services", "Services Agreement", "Engage or provide services on agreed terms", false, "msa consulting client work"],
      ["terms", "Terms & Conditions", "Terms for your product or website", false, "t&c tos website app saas"],
      ["supply", "Supply Agreement", "Buy or supply goods on standing terms", false, "goods purchase vendor"],
    ],
  ],
  [
    "Company",
    [
      ["sha", "Shareholders’ Agreement", "How founders and investors run the company", false, "sha founders investors board"],
      ["vesting", "Share Vesting Letter", "Vest founder shares over time", false, "cliff equity founders"],
      ["esop", "Employee Share Option Plan", "Grant options to your team", false, "esop options equity staff"],
    ],
  ],
  [
    "People",
    [
      ["employment", "Employment Agreement", "Hire an employee in Singapore", false, "hiring job offer staff"],
      ["contractor", "Contractor Agreement", "Engage a freelancer or consultant", false, "freelancer consultant independent"],
    ],
  ],
  [
    "Fundraising",
    [
      ["safe", "SAFE Note", "Raise early money with a simple agreement", false, "fundraising seed investment convertible"],
      ["term", "Term Sheet", "Key terms for a funding round", false, "fundraising round investors valuation"],
    ],
  ],
];

/* ─────────────────────────────────────────────────────── the questions */

/** Group name → how FD AI asks for it. Keyed by group rather than by index so
 *  adding a field, or a whole group, cannot silently shift every question by
 *  one. An unlisted group falls back to its own name, which reads acceptably. */
const ASK: Record<string, { name: string; question: string }> = {
  "The shape of it": {
    name: "Direction",
    question: "Which direction are we going — mutual, or one-way?",
  },
  Parties: {
    name: "Who’s involved",
    question: "Who are the parties? Just provide each person’s or organisation’s name.",
  },
  "The deal": {
    name: "The deal",
    question: "What’s the deal about, and what will be shared?",
  },
  Terms: {
    name: "How long and how strict",
    question:
      "How long should confidentiality last, and how strict should it be? I’ve set sensible Singapore defaults — change only what you need.",
  },
  "Anything else": {
    name: "Anything else",
    question: "Anything else you’d like included?",
  },
};

/** The five comprehensiveness steps, in order. One list, used by the slider, the
 *  echoed summary and the progress pane — three places that used to drift apart.
 *  The NUMBER is what reaches the prompt; these words are only how it reads. */
const DETAIL_LABELS = ["Minimal", "Basic", "Standard", "Detailed", "Comprehensive"] as const;

const DETAIL_LENGTHS = [
  "about 500–800 words",
  "about 750–1,050 words",
  "about 1,000–1,400 words",
  "about 1,250–1,750 words",
  "about 1,500–2,200 words",
] as const;

const SOURCE_STEP = {
  id: "__source__",
  name: "Existing document",
  question: "Do you have an existing NDA or term sheet I should work from?",
};

interface Step {
  id: string;
  name: string;
  question: string;
  fields: Field[];
  /** chips: one select, answered by tapping. card: a panel of inputs.
   *  detail: the NDA depth slider. source: the upload question. */
  kind: "chips" | "card" | "detail" | "source";
}

function buildSteps(docType: DocType): Step[] {
  const order: string[] = [];
  const byGroup = new Map<string, Field[]>();
  for (const f of docType.fields) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  const steps: Step[] = order.map((g) => {
    const fields = byGroup.get(g)!;
    const ask = ASK[g] ?? { name: g, question: g };
    // A lone select is a tap, not a form. That is what makes the first question
    // feel like a conversation rather than a questionnaire.
    const kind: Step["kind"] = fields.length === 1 && fields[0].type === "select" ? "chips" : "card";
    return { id: g, name: ask.name, question: ask.question, fields, kind };
  });
  if (docType.slug === "nda") {
    steps.push({
      id: "__detail__",
      name: "Comprehensiveness",
      question: "How comprehensive and how long should the first NDA be?",
      kind: "detail",
      fields: [{
        key: "_nda_detail_level",
        label: "Comprehensiveness",
        type: "number",
        required: true,
        group: "Comprehensiveness",
        defaultValue: "3",
      }],
    });
  }
  steps.push({ ...SOURCE_STEP, fields: [], kind: "source" });
  return steps;
}

/* ──────────────────────────────────────────────────────────── helpers */

type Status = "done" | "skp" | undefined;

interface Msg {
  who: "fd" | "me";
  text: string;
  label?: string;
  skipped?: boolean;
}

export interface RecentDraft {
  id: string;
  title: string;
  when: string;
}

function initialAnswers(docType: DocType): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of docType.fields) out[f.key] = f.defaultValue ?? "";
  if (docType.slug === "nda") out._nda_detail_level = "3";
  return out;
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)) || "FD";
  return letters.toUpperCase();
}

/* ═══════════════════════════════════════════════════════════ component */

/** What the workspace needs to know about credits. Deliberately not the whole
 *  wallet: the rail shows a number and a link, nothing more. */
export interface WalletView {
  credits: number;
  inTrial: boolean;
}

export default function DraftChat({
  docTypes,
  presetSlug,
  userEmail,
  recent,
  wallet,
  isAdmin = false,
}: {
  docTypes: DocType[];
  presetSlug?: string;
  userEmail?: string | null;
  recent?: RecentDraft[];
  wallet?: WalletView | null;
  isAdmin?: boolean;
}) {
  const liveSlugs = useMemo(() => new Set(docTypes.map((d) => d.slug)), [docTypes]);

  /* The balance is STATE, not just the server's prop.
     It arrives rendered by the server, but a draft is made client-side, so if
     it stayed a prop the number would sit unchanged until a full page reload —
     credit spent, database correct, screen lying. The generate endpoint returns
     the new figure with the finished draft, and this is where it lands. */
  const [live, setLive] = useState<WalletView | null>(wallet ?? null);

  const spendCredit = useCallback((creditsLeft: number | null) => {
    setLive((w) => {
      if (!w) return w;
      // Prefer the server's figure; fall back to decrementing if it did not send one.
      const next = creditsLeft === null ? Math.max(0, w.credits - 1) : creditsLeft;
      return next === w.credits ? w : { ...w, credits: next };
    });
  }, []);

  // The top of the funnel. Every later number is a fraction of this one, so it
  // is recorded once per arrival — not per render, not per document chosen.
  useEffect(() => {
    track("ai_opened");
  }, []);

  const [screen, setScreen] = useState<"select" | "chat">(presetSlug ? "chat" : "select");
  const [chosen, setChosen] = useState<DocType | null>(
    presetSlug ? (docTypes.find((d) => d.slug === presetSlug) ?? null) : null,
  );

  // Belt and braces: "chat" with nothing chosen would render an empty page, and
  // a blank screen is the one failure a user cannot report usefully. Fall back
  // to the catalogue instead.
  const view = screen === "chat" && chosen ? "chat" : "select";

  if (docTypes.length === 0) {
    return (
      <main className="wrap" style={{ maxWidth: 640, padding: "72px 24px" }}>
        <p className="kicker">FD AI</p>
        <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", marginTop: 10 }}>
          No document types are loaded.
        </h1>
        <p className="sub" style={{ marginTop: 12 }}>
          The catalogue is empty, so there is nothing to draft. If Supabase is connected,
          check that <code>doc_types</code> has at least one row with{" "}
          <code>is_active = true</code> — run <code>supabase/002_seed_doctypes.sql</code>{" "}
          again if in doubt.
        </p>
      </main>
    );
  }

  return (
    <>
      <Intro />
      <div className="fdai-screens">
        {view === "select" && (
          <Catalogue
            liveSlugs={liveSlugs}
            isAdmin={isAdmin}
            wallet={live}
            onPick={(slug) => {
              const d = docTypes.find((x) => x.slug === slug);
              if (!d) return;
              track("doc_selected", { doc_type: d.slug });
              setChosen(d);
              setScreen("chat");
            }}
          />
        )}
        {view === "chat" && chosen && (
          <Chat
            key={chosen.slug}
            docType={chosen}
            userEmail={userEmail ?? null}
            recent={recent ?? []}
            wallet={live}
            onCreditSpent={spendCredit}
            onChangeDocument={() => setScreen("select")}
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── opening */

function Intro() {
  const [state, setState] = useState<"in" | "out" | "gone">("in");
  const [fast, setFast] = useState(false);

  // Reduced motion is handled in CSS (`.fd-intro { display:none }`), not here —
  // the design file does it that way and it avoids a hydration mismatch.
  useEffect(() => {
    const t = setTimeout(() => setState("out"), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "out") return;
    const t = setTimeout(() => setState("gone"), fast ? 650 : 1200);
    return () => clearTimeout(t);
  }, [state, fast]);

  if (state === "gone") return null;
  return (
    <div
      className={`fd-intro${state === "out" ? " is-out" : ""}${fast ? " is-fast" : ""}`}
      role="presentation"
      onClick={() => {
        setFast(true);
        setState("out");
      }}
    >
      <div className="in">
        <p className="k">FoundersDoc</p>
        <h2>
          Welcome to <em>FD AI</em>
        </h2>
        <div className="rule" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── catalogue */

const FDEFS = (
  <svg className="fdefs" aria-hidden="true">
    <defs>
      <linearGradient id="fdFbk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7d47e" />
        <stop offset="1" stopColor="#e0a52c" />
      </linearGradient>
      <linearGradient id="fdFfr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbe7b4" />
        <stop offset="1" stopColor="#f3bf4b" />
      </linearGradient>
    </defs>
  </svg>
);

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        d="M3 9.5A4.5 4.5 0 0 1 7.5 5h13.9a4.5 4.5 0 0 1 3.2 1.3l3.6 3.6A4.5 4.5 0 0 0 31.4 11H52.5A4.5 4.5 0 0 1 57 15.5v6H3z"
        fill="url(#fdFbk)"
      />
      <path
        d="M3.2 19h53.6a3 3 0 0 1 2.9 3.8l-4.4 17A4.5 4.5 0 0 1 51 43H6.7a4.5 4.5 0 0 1-4.4-3.4L.3 22.8A3 3 0 0 1 3.2 19z"
        fill="url(#fdFfr)"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        d="M3 9.5A4.5 4.5 0 0 1 7.5 5h13.9a4.5 4.5 0 0 1 3.2 1.3l3.6 3.6A4.5 4.5 0 0 0 31.4 11H52.5A4.5 4.5 0 0 1 57 15.5V39a4.5 4.5 0 0 1-4.5 4.5h-45A4.5 4.5 0 0 1 3 39z"
        fill="url(#fdFbk)"
      />
      <path
        d="M7 14.5h46a4 4 0 0 1 4 4V39a4.5 4.5 0 0 1-4.5 4.5h-45A4.5 4.5 0 0 1 3 39V18.5a4 4 0 0 1 4-4z"
        fill="url(#fdFfr)"
      />
      <path d="M7 14.5h46a4 4 0 0 1 4 4v1.1H3v-1.1a4 4 0 0 1 4-4z" fill="#fff" opacity=".5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 60 48" aria-hidden="true">
      <path
        className="sh-face sh-edge"
        d="M17 3.5h17.2L45 14.3V43a1.5 1.5 0 0 1-1.5 1.5h-26A1.5 1.5 0 0 1 16 43V5a1.5 1.5 0 0 1 1-1.5z"
        strokeWidth="1"
      />
      <path className="sh-fold" d="M34.2 3.5L45 14.3h-9.3a1.5 1.5 0 0 1-1.5-1.5z" />
      <rect className="sh-line" x="21" y="21" width="19" height="1.8" rx=".9" />
      <rect className="sh-line" x="21" y="26" width="19" height="1.8" rx=".9" />
      <rect className="sh-line" x="21" y="31" width="13" height="1.8" rx=".9" />
      <rect x="21" y="36" width="9" height="2.4" rx="1.2" fill="#c9962a" />
    </svg>
  );
}

function Catalogue({
  liveSlugs,
  isAdmin,
  wallet,
  onPick,
}: {
  liveSlugs: Set<string>;
  isAdmin: boolean;
  wallet: WalletView | null;
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState(0);
  const [showSoon, setShowSoon] = useState(true);
  const [typed, setTyped] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // A row is draftable only if the running catalogue actually has it.
  const ready = useCallback((d: CatDoc) => d[3] && liveSlugs.has(d[0]), [liveSlugs]);

  useEffect(() => {
    const text = "Choose your starting point.";
    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (reduce) {
        setTyped(text);
        return;
      }
      setTyped(text.slice(0, i));
      if (i < text.length) {
        const c = text.charAt(i);
        i++;
        timer = setTimeout(tick, c === " " ? 54 : c === "." ? 150 : 38);
      }
    };
    // The headline waits for the opening splash to clear before it starts typing.
    timer = setTimeout(tick, reduce ? 0 : 2400);
    return () => clearTimeout(timer);
  }, []);

  const query = q.trim().toLowerCase();
  const visible = (d: CatDoc) => ready(d) || showSoon;
  const hit = (d: CatDoc, g: CatFolder) =>
    `${d[1]} ${d[2]} ${g[0]} ${d[4]}`.toLowerCase().includes(query);
  const readyOf = (g: CatFolder) => g[1].filter(ready).length;

  const totalDocs = CATALOGUE.reduce((t, g) => t + g[1].length, 0);
  const totalReady = CATALOGUE.reduce((t, g) => t + readyOf(g), 0);

  /* ── WHAT "HIDE COMING SOON" HIDES ────────────────────────────────────────
     It used to hide coming-soon DOCUMENTS and leave their folders standing —
     so pressing it emptied four folders and left four rows reading "Coming
     soon" in a list whose whole point was to be shorter. A folder with nothing
     ready in it is a coming-soon folder, and goes with them.

     Folders are carried with their real index because `folder` points into
     CATALOGUE, not into this filtered view; renumbering here would select the
     wrong folder the moment anything is hidden. */
  const folderIndices = CATALOGUE.map((_, i) => i).filter(
    (i) => showSoon || readyOf(CATALOGUE[i]) > 0,
  );
  const hiddenFolders = CATALOGUE.length - folderIndices.length;

  /* Toggling off can hide the folder being looked at. Moving the selection is
     done HERE, in the handler, rather than in an effect that watches showSoon:
     an effect would set state during render and flash the empty folder first. */
  const toggleSoon = () => {
    const next = !showSoon;
    /* Worked out before either setState, not inside the updater: an updater
       has to be pure, and React runs it twice in development to prove it. */
    if (!next && readyOf(CATALOGUE[folder]) === 0) {
      const firstReady = CATALOGUE.findIndex((g) => readyOf(g) > 0);
      if (firstReady >= 0) setFolder(firstReady);
    }
    setShowSoon(next);
  };

  const results: { doc: CatDoc; group: string }[] = [];
  if (query) {
    for (const g of CATALOGUE) {
      for (const d of g[1]) if (visible(d) && hit(d, g)) results.push({ doc: d, group: g[0] });
    }
  }
  const current = CATALOGUE[folder];
  const rows = current[1].filter(visible);

  function row(d: CatDoc, group: string) {
    const rdy = ready(d);
    return (
      <button
        key={d[0]}
        type="button"
        className={`drow${rdy ? "" : " soon"}`}
        disabled={!rdy}
        onClick={() => rdy && onPick(d[0])}
      >
        <span className="ic">
          <FileIcon />
        </span>
        <span className="tx">
          <b>{d[1]}</b>
          <small>
            {d[2]}
            {group ? <i className="in"> · {group}</i> : null}
          </small>
        </span>
        <span className={`pill${rdy ? " rdy" : ""}`}>{rdy ? "Ready" : "Coming soon"}</span>
      </button>
    );
  }

  return (
    <div id="scr-select" className="scr step on fade-in">
      <div className="step-in">
        <div className="crumbs">
          <button type="button">FD AI</button>
          <span className="sep">›</span>
          <b>New draft</b>
        </div>

        <aside className="select-intro">
          <p className="select-k">Document catalogue</p>
          <h2 className="typed">
            <span className="tw">{typed}</span>
            <i className="caret" aria-hidden="true" />
          </h2>
          <p className="sub">Pick a document. FD AI shapes the questions around it.</p>
          <p className="select-tip">Upcoming templates stay listed, marked Coming soon.</p>

          {/* The balance belongs HERE as much as in the workspace rail. This is
              the first screen after signing in, and until now it said nothing
              about credits at all — so the first a person heard of a limit was
              the paywall, after they had answered every question. Telling them
              up front is both fairer and less work to act on. */}
          {wallet && (
            <div className="cat-credits">
              <span className="cat-credits-n">{wallet.credits}</span>
              <span className="cat-credits-t">
                <b>{wallet.credits === 1 ? "document" : "documents"} left</b>
                <small>
                  {wallet.inTrial
                    ? "Free week — trial credits expire"
                    : wallet.credits === 0
                      ? "Add credits to draft again"
                      : "These do not expire"}
                </small>
              </span>
              <a className="cat-credits-a" href="/billing">
                {wallet.credits === 0 ? "Add credits" : "Manage"}
              </a>
            </div>
          )}

          {/* Admins only, and only ever rendered for them: the button is not
              hidden with CSS, it is absent from the HTML a normal user
              receives. The page behind it checks again on the server, because
              a missing button is a courtesy, not a lock. */}
          {isAdmin && (
            <a className="admin-open" href="/admin">
              <span className="admin-open-ic" aria-hidden="true" />
              <span>
                <b>Admin workspace</b>
                <small>Documents and analytics</small>
              </span>
            </a>
          )}

          <div className="intro-foot">
            <a className="alt-link" href="https://foundersdoc.com/contact">
              Review an agreement
            </a>
            <a className="alt-link" href="https://foundersdoc.com/contact">
              Ask a lawyer
            </a>
          </div>
        </aside>

        <section className="cat">
          <div className="search">
            <input
              ref={searchRef}
              type="search"
              placeholder="Search documents or business needs"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) setQ("");
              }}
            />
          </div>

          <div className="cat-bar">
            <span className="ex-count">
              {query ? (
                <>
                  <b>Search</b> · {results.length} of {totalDocs} documents
                </>
              ) : (
                <>
                  <b>Documents</b> · {folderIndices.length}{" "}
                  {folderIndices.length === 1 ? "folder" : "folders"} · {totalReady} ready to
                  draft{" "}
                  {showSoon ? (
                    <>· {totalDocs - totalReady} coming soon</>
                  ) : hiddenFolders > 0 ? (
                    <>
                      · {hiddenFolders} {hiddenFolders === 1 ? "folder" : "folders"} hidden
                    </>
                  ) : null}
                </>
              )}
            </span>
            <button type="button" className="show-soon" onClick={toggleSoon}>
              {showSoon ? "Hide coming soon" : "Show coming soon"}
            </button>
          </div>

          <div className="exwrap">
            <nav className="flist" aria-label="Document folders">
              {FDEFS}
              {folderIndices.map((gi) => {
                const g = CATALOGUE[gi];
                const matches = g[1].filter((d) => visible(d) && (!query || hit(d, g)));
                const r = readyOf(g);
                const soonN = g[1].length - r;
                const on = !query && gi === folder;
                const dim = query ? matches.length === 0 : r === 0;
                const bits: React.ReactNode[] = [];
                if (r) bits.push(<em key="r">{r} ready</em>);
                if (soonN) bits.push(<span key="s">{bits.length ? " · " : ""}Coming soon</span>);
                return (
                  <button
                    key={g[0]}
                    type="button"
                    className={`frow${on ? " on" : ""}${dim ? " mute" : ""}`}
                    onClick={() => {
                      setFolder(gi);
                      setQ("");
                    }}
                  >
                    <span className="ic">
                      <FolderIcon open={on} />
                    </span>
                    <span className="tx">
                      <b>{g[0]}</b>
                      <small title={g[1].map((d) => d[1]).join(", ")}>
                        {query
                          ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
                          : bits}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>

            <section className="dpanel" aria-live="polite">
              {query ? (
                <>
                  <div className="dp-head">
                    <span>
                      <b>Search results</b>
                      <p>Matches across every folder.</p>
                    </span>
                    <span className="n">
                      {results.length} {results.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  {results.length ? (
                    results.map((r) => row(r.doc, r.group))
                  ) : (
                    <p className="empty">Nothing matches “{q}”. Try another search.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="dp-head">
                    <span>
                      <b>{current[0]}</b>
                      <p>
                        {readyOf(current)
                          ? `Select a document to begin the drafting flow.${
                              current[1].length - readyOf(current)
                                ? " Items marked Coming soon are not draftable yet."
                                : ""
                            }`
                          : rows.length
                            ? "Every template here is still in preparation — listed so you can see what is coming."
                            : "Nothing here is ready to draft yet."}
                      </p>
                    </span>
                    <span className="n">
                      {rows.length} {rows.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  {rows.length ? (
                    rows.map((d) => row(d, ""))
                  ) : (
                    <p className="empty">
                      Upcoming templates are hidden.{" "}
                      <button type="button" className="peek" onClick={() => setShowSoon(true)}>
                        Show coming soon
                      </button>
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ chat */

function Chat({
  docType,
  userEmail,
  recent,
  wallet,
  onCreditSpent,
  onChangeDocument,
}: {
  docType: DocType;
  userEmail: string | null;
  recent: RecentDraft[];
  wallet: WalletView | null;
  onCreditSpent: (creditsLeft: number | null) => void;
  onChangeDocument: () => void;
}) {
  const steps = useMemo(() => buildSteps(docType), [docType]);

  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(docType));
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      who: "fd",
      text: `Let’s build your ${docType.label}. I’ll ask ${steps.length} focused questions and carry your answers forward as we go. Skip anything you’re unsure about — you can return to it later.`,
    },
  ]);
  const [i, setI] = useState(0);
  const [status, setStatus] = useState<Status[]>(() => steps.map(() => undefined));
  const [typedAnswer, setTypedAnswer] = useState("");

  // source document
  const [sourceText, setSourceText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // draft
  const [view, setView] = useState<"chat" | "draft">("chat");
  const [output, setOutput] = useState("");
  const editorExportRef = useRef<{ html: string; plain: string } | null>(null);
  const captureEditorContent = useCallback((html: string, plain: string) => {
    editorExportRef.current = { html, plain };
  }, []);
  const [busy, setBusy] = useState(false);
  /** Immediate re-entrancy guard for generate(); see the comment there. */
  const generatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /* Out of credits is not an error, it is a state. Rendering it as a red box
     next to "something went wrong" would tell a customer their document broke
     when in fact nothing broke and they simply need to buy more. */
  const [paywalled, setPaywalled] = useState(false);
  /* The saved row this draft belongs to, so edits can be written back. Null
     until the generate endpoint reports it — and it stays null when Supabase
     is not configured, in which case the Save button simply does nothing
     rather than pretending. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState<string | null>(null);
  /* Generating lands in the conversation, not in the document: the person has
     just answered six questions and deserves to be told what was done with
     them before being handed a wall of contract. The document opens beside the
     chat when they ask for it — and closing it leaves the chat untouched. */
  const [docOpen, setDocOpen] = useState(false);
  const [follow, setFollow] = useState<{
    who: "me" | "fd";
    text: string;
    version?: number;
    fileName?: string;
    documentText?: string;
    detailLevel?: number;
  }[]>([]);
  const [revising, setRevising] = useState(false);
  /** State disables the controls; the ref also closes the same-tick double-click window. */
  const revisingRef = useRef(false);
  const [ndaDetailLevel, setNdaDetailLevel] = useState(3);
  const [documentVersion, setDocumentVersion] = useState(1);
  const versionCounterRef = useRef(1);
  const [documentVersions, setDocumentVersions] = useState<{
    documentText: string;
    version: number;
    detailLevel: number;
    fileName: string;
  }[]>([]);
  const [skippedLabels, setSkippedLabels] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* What the person actually said, for the summary in their own message.
     Built from the same `summarise` the chat uses, so the wording they see
     here is the wording they saw when they answered. */
  const answerSummary = useMemo(
    () =>
      steps
        .map((s, k) => ({ label: s.name, value: status[k] === "done" ? summarise(s) : "" }))
        .filter((a) => a.value && a.value !== "—"),
    // summarise reads the current answers; recomputing per render is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, status, answers, attachments],
  );

  const finished = i >= steps.length;
  const step = finished ? null : steps[i];

  const fileNameFor = useCallback(
    (version: number, detailLevel: number) => {
      const clean = (value: string) =>
        (value === SKIPPED ? "" : value.split("(")[0])
          .replace(/[^a-zA-Z0-9 -]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 28);
      const parties = [clean(answers.party_a ?? ""), clean(answers.party_b ?? "")].filter(Boolean);
      const detailName = DETAIL_LABELS[detailLevel - 1] ?? "Revised";
      return ["NDA", ...parties, `V${version}`, detailName].join("-") + ".docx";
    },
    [answers.party_a, answers.party_b],
  );
  const currentFileName = fileNameFor(documentVersion, ndaDetailLevel);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, i]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── where people give up ─────────────────────────────────────────────────
     The most useful number in the whole system is the question people stop at,
     and it is the hardest to collect: by the time it matters the tab is
     closing. So the current position is kept in refs (a listener registered
     once cannot read state that changed after it), and the event goes out on
     `pagehide`/`visibilitychange` — not `beforeunload`, which mobile Safari
     never fires. track() uses sendBeacon, which the browser delivers after the
     page is gone.

     It fires once, and only for someone who started answering and never got a
     draft: leaving after you have your document is success, not abandonment. */
  const progressRef = useRef({ step: 0, total: 0, generated: false, started: false });
  progressRef.current = {
    step: i,
    total: steps.length,
    generated: output.length > 0,
    started: i > 0,
  };

  useEffect(() => {
    let sent = false;
    const leave = () => {
      const p = progressRef.current;
      if (sent || !p.started || p.generated) return;
      sent = true;
      track("draft_abandoned", {
        doc_type: docType.slug,
        step: p.step + 1,
        total_steps: p.total,
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [docType.slug]);

  // Click anywhere else, or press Escape, and the account menu closes — the
  // same behaviour as the nav's dropdowns.
  useEffect(() => {
    if (!acctOpen) return;
    const close = () => setAcctOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  function setAnswer(key: string, v: string) {
    setAnswers((a) => ({ ...a, [key]: v }));
  }

  /** Every required field on this step has something in it. A step with no
   *  required fields is always ready — that is what makes Terms tappable
   *  straight through on its defaults. */
  function ready(s: Step): boolean {
    return s.fields.filter((f) => f.required).every((f) => (answers[f.key] ?? "").trim() !== "");
  }

  /** One line summarising what the user just said, echoed back as their message.
   *  `override` carries a value chosen this very tick — a tapped chip commits on a
   *  timer, so without it the echo is built from the previous render's answers
   *  and reads "—". */
  function summarise(s: Step, override?: Record<string, string>): string {
    if (s.kind === "source") {
      return attachments.length ? `Attached: ${attachments.join(", ")}` : "No — start fresh";
    }
    const src = { ...answers, ...(override ?? {}) };
    if (s.kind === "detail") {
      const level = Math.min(5, Math.max(1, Number(src._nda_detail_level) || 3));
      const label = DETAIL_LABELS[level - 1];
      return `${level}/5 · ${label} · ${DETAIL_LENGTHS[level - 1]}`;
    }
    const parts: string[] = [];
    for (const f of s.fields) {
      const v = (src[f.key] ?? "").trim();
      if (!v || v === SKIPPED) continue;
      parts.push(s.kind === "chips" ? v : `${f.label}: ${v}`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  /** Move on. `skipped` marks every field on this step with the SKIPPED marker
   *  so the prompt knows the difference between deferred and never-asked. */
  const commit = useCallback(
    (skipped: boolean, atIndex?: number, extra?: string) => {
      const idx = atIndex ?? i;
      const s = steps[idx];
      if (!s) return;

      const override: Record<string, string> = {};
      if (!skipped && extra !== undefined && s.fields.length === 1) {
        override[s.fields[0].key] = extra;
      }

      setAnswers((prev) => {
        const next = { ...prev, ...override };
        if (skipped) {
          for (const f of s.fields) if (!(next[f.key] ?? "").trim()) next[f.key] = SKIPPED;
        }
        return next;
      });

      setStatus((prev) => {
        const next = [...prev];
        next[idx] = skipped ? "skp" : "done";
        return next;
      });

      setMsgs((prev) => [
        ...prev,
        { who: "fd", text: s.question },
        {
          who: "me",
          label: s.name,
          text: skipped ? "Skipped for now" : summarise(s, override),
          skipped,
        },
      ]);
      /* The funnel, recorded where the decision actually happens.
         `question_skipped` carries the field KEY, never what was typed — see
         the rule at the top of lib/events.ts. */
      if (idx === 0) track("draft_started", { doc_type: docType.slug, total_steps: steps.length });
      if (skipped) {
        for (const f of s.fields) {
          track("question_skipped", { doc_type: docType.slug, question_key: f.key, step: idx + 1 });
        }
      }

      setTypedAnswer("");
      setI(idx + 1);
    },
    // summarise reads current answers/attachments; recreating the callback each
    // render is cheaper than threading them through and getting a stale echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i, steps, answers, attachments],
  );

  /** Skip everything still outstanding, then draft. */
  function draftWithWhatIHave() {
    const from = i;
    const detailIndex = steps.findIndex((item) => item.kind === "detail");
    const mustChooseDetail = detailIndex >= 0 && status[detailIndex] !== "done";
    const stopAt = mustChooseDetail ? detailIndex : steps.length;

    track("draft_with_what_i_have", {
      doc_type: docType.slug,
      step: from + 1,
      total_steps: steps.length,
      count: Math.max(0, stopAt - from),
    });
    setAnswers((prev) => {
      const next = { ...prev };
      for (let k = from; k < stopAt; k++) {
        for (const f of steps[k].fields) if (!(next[f.key] ?? "").trim()) next[f.key] = SKIPPED;
      }
      return next;
    });
    setStatus((prev) => {
      const next = [...prev];
      for (let k = from; k < stopAt; k++) next[k] = "skp";
      return next;
    });
    setMsgs((prev) => [
      ...prev,
      { who: "me", label: "Drafting now", text: "Draft with what I have", skipped: true },
      {
        who: "fd",
        text: mustChooseDetail
          ? "Before I draft, choose how comprehensive you want the NDA to be."
          : "Drafting from what you’ve given me. Everything you skipped comes back as [[TO CONFIRM]] so nothing is quietly invented.",
      },
    ]);
    setI(stopAt);
    if (!mustChooseDetail) setTimeout(() => void generate(), 40);
  }

  /** Re-open a question that was skipped earlier. */
  function revisit(k: number) {
    setStatus((prev) => {
      const next = [...prev];
      next[k] = undefined;
      return next;
    });
    setAnswers((prev) => {
      const next = { ...prev };
      for (const f of steps[k].fields) if (next[f.key] === SKIPPED) next[f.key] = f.defaultValue ?? "";
      return next;
    });
    setMsgs((prev) => [
      ...prev,
      { who: "fd", text: `Let’s go back to ${steps[k].name.toLowerCase()}.` },
    ]);
    setView("chat");
    setI(k);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const j = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !j?.text) {
        setError(j?.error ?? "Could not read that file.");
        return;
      }
      setSourceText(j.text);
      /* The file NAME is never recorded — "Project Dragonfly NDA.docx" names a
         matter. Only that an upload happened, and roughly how much text. */
      track("source_uploaded", { doc_type: docType.slug, words: j.text.trim().split(/\s+/).length });
      setAttachments((a) => [...a, file.name]);
      setToast(`Attached ${file.name}`);
      if (step?.kind === "source") commit(false);
    } catch {
      setError("Could not upload that file. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    /* One generation at a time, enforced with a ref rather than the `busy`
       state. The buttons are disabled on `busy`, but React applies state
       asynchronously, so two clicks landing in the same tick both see the old
       value and both get through. Each one reserves its own credit and both
       queue against the same rate limit, making a slow draft slower. A ref
       updates immediately, which is exactly what a guard needs. */
    if (generatingRef.current) return;
    generatingRef.current = true;

    const startedAt = Date.now();
    setFollow([]);
    setDocumentVersions([]);
    setDocumentVersion(1);
    versionCounterRef.current = 1;
    setDocOpen(false);
    setBusy(true);
    setError(null);
    editorExportRef.current = null;
    setOutput("");
    setSkippedLabels([]);
    setView("draft");

    // Read the freshest answers rather than the closure's snapshot: the caller
    // may have marked several fields skipped microseconds ago.
    const payload = await new Promise<Record<string, string>>((resolve) => {
      setAnswers((a) => {
        resolve(a);
        return a;
      });
    });

    const initialDetailLevel = Math.min(
      5,
      Math.max(1, Number(payload._nda_detail_level) || 3),
    ) as 1 | 2 | 3 | 4 | 5;
    setNdaDetailLevel(initialDetailLevel);

    /* ── DON'T SPIN FOREVER ──────────────────────────────────────────────
       If the function is killed by the platform it never closes the stream,
       and fetch simply waits: the page sat on "Working" indefinitely, with no
       error and no way back. The server now sends a line every few seconds
       whether or not it has text yet, so silence really does mean the
       connection is gone. Give up after a spell of it. */
    const STALL_MS = 30_000;
    const giveUp = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(stall);
      stall = setTimeout(() => giveUp.abort(new Error("stalled")), STALL_MS);
    };
    heard();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docTypeSlug: docType.slug,
          answers: payload,
          sourceText,
          detailLevel: initialDetailLevel,
        }),
        signal: giveUp.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;

        if (res.status === 402 || j?.code === "no_credits") {
          track("paywall_hit", { doc_type: docType.slug });
          // Whatever the rail was showing, the true answer is none.
          onCreditSpent(0);
          setPaywalled(true);
          setView("chat");
          return;
        }

        track("draft_failed", { doc_type: docType.slug, reason: `http_${res.status}` });
        setError(j?.error ?? `Request failed (${res.status}).`);
        setView("chat");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        heard();
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let msg: {
            t: string;
            v?: string;
            skipped?: string[];
            creditsLeft?: number | null;
            draftId?: string | null;
            partial?: boolean;
          };
          try {
            msg = JSON.parse(raw);
          } catch {
            continue;
          }
          if (msg.t === "ping") {
            // Proof of life only; heard() above has already done the work.
            continue;
          }
          if (msg.t === "text" && msg.v) {
            acc += msg.v;
            setOutput(acc);
          } else if (msg.t === "error") {
            /* Come back to the conversation. Without this the drafting pane
               stays up saying "Drafting your document…" while the error sits
               unread on a view nobody is looking at — which reads as the app
               having hung, for as long as the person is willing to wait. The
               HTTP-error branch above has always done this; the streamed-error
               branch did not, and that is the difference between an error and
               an apparent freeze. */
            setError(msg.v ?? "Drafting failed.");
            setView("chat");
          } else if (msg.t === "done") {
            setSkippedLabels(msg.skipped ?? []);
            setDraftId(msg.draftId ?? null);
            setSavedHtml(null); // a fresh generation replaces any saved edits
            if (!msg.partial && acc.trim()) {
              setDocumentVersions([{
                documentText: acc,
                version: 1,
                detailLevel: initialDetailLevel,
                fileName: fileNameFor(1, initialDetailLevel),
              }]);
              setDocumentVersion(1);
              setNdaDetailLevel(initialDetailLevel);
              versionCounterRef.current = 1;
            }
            if (msg.partial) {
              /* Cut short. Say so where it cannot be missed, and do not let
                 the credit counter tick down for a document that is not whole. */
              setError(
                "This draft was cut off before it finished, so it is incomplete and nothing was " +
                  "charged. It is here to read, not to send — generate again for a full document.",
              );
            }
            // The credit was spent on the server; reflect it here immediately.
            // A partial draft was refunded, so this puts the number back up.
            onCreditSpent(msg.creditsLeft ?? null);
          }
        }
      }
      /* Seconds-to-draft is the number that decides whether this feels like a
         tool or a wait. Recorded on success only — a failure has its own
         event and would drag the average somewhere meaningless. */
      track("draft_generated", {
        doc_type: docType.slug,
        seconds: (Date.now() - startedAt) / 1000,
        words: acc.trim().split(/\s+/).length,
      });
    } catch {
      if (giveUp.signal.aborted) {
        track("draft_failed", { doc_type: docType.slug, reason: "stalled" });
        setError(
          "The drafting service stopped responding, so this was abandoned rather than left " +
            "spinning. Check the credit count before trying again — if it has not come back, " +
            "that draft was charged for.",
        );
      } else {
        track("draft_failed", { doc_type: docType.slug, reason: "network" });
        setError("Could not reach the drafting service. Check your connection and try again.");
      }
    } finally {
      clearTimeout(stall);
      generatingRef.current = false;
      setBusy(false);
    }
  }

  /**
   * Persist the edited document.
   *
   * The lawyer's HTML goes to `output_html`; `output` — the model's own text —
   * is deliberately left alone, so a later revision still starts from what was
   * generated rather than from someone's half-finished edit.
   */
  const saveDocument = useCallback(
    async (html: string, plain: string) => {
      if (!draftId) {
        // Nothing to save against: no account, or the draft was never stored.
        setSavedHtml(html);
        return;
      }
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outputHtml: html }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not save your changes.");
        throw new Error("save failed");
      }
      setSavedHtml(html);
      setToast("Saved");
      void plain;
    },
    [draftId],
  );

  /**
   * Ask FD AI to change the draft that already exists.
   *
   * The whole revised document comes back and replaces the old one — which is
   * why the editor is keyed on the output's length: a new document must be a
   * new editor, or the pages would still be showing the previous text.
   */
  async function revise(
    instruction: string,
    options?: {
      targetDetailLevel?: 1 | 2 | 3 | 4 | 5;
    },
  ) {
    if (revisingRef.current || generatingRef.current || revising || busy) return;
    revisingRef.current = true;
    setRevising(true);
    setError(null);

    /* ── DON'T SPIN FOREVER ────────────────────────────────────────────────
       Identical to generate(). A killed function never closes its stream, so
       fetch waits indefinitely and the page sits on "Revising…" with no error
       and no way back. The server now sends a line every few seconds whether
       or not it has text, so silence really does mean the connection is gone. */
    const REVISE_STALL_MS = 30_000;
    const giveUp = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(stall);
      stall = setTimeout(() => giveUp.abort(new Error("stalled")), REVISE_STALL_MS);
    };
    heard();
    setPaywalled(false);
    setFollow((f) => [...f, { who: "me", text: instruction }]);

    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: giveUp.signal,
        body: JSON.stringify({
          draftId,
          instruction,
          text: output,
          targetDetailLevel: options?.targetDetailLevel,
          currentDetailLevel: ndaDetailLevel,
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        if (res.status === 402 || j?.code === "no_credits") {
          onCreditSpent(0);
          setPaywalled(true);
          return;
        }
        setError(j?.error ?? "Could not revise the draft.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let failed = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        heard();
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let msg: { t: string; v?: string; charged?: boolean; creditsLeft?: number | null };
          try {
            msg = JSON.parse(raw);
          } catch {
            continue;
          }
          if (msg.t === "ping") {
            // Proof of life only; heard() above has already done the work.
            continue;
          }
          if (msg.t === "retry") {
            acc = "";
            failed = false;
            setError(null);
          } else if (msg.t === "text" && msg.v) acc += msg.v;
          else if (msg.t === "error") {
            failed = true;
            setError(msg.v ?? "Could not revise the draft.");
          } else if (msg.t === "done") {
            if (msg.charged) onCreditSpent(msg.creditsLeft ?? null);
          }
        }
      }

      const normalise = (value: string) => value.replace(/\s+/g, " ").trim();
      const materiallyChanged = (before: string, after: string) => {
        const a = normalise(before).split(" ");
        const b = normalise(after).split(" ");
        const lengthDelta = Math.abs(a.length - b.length) / Math.max(a.length, 1);
        const overlap = Math.min(a.length, b.length);
        let changedAtPosition = Math.abs(a.length - b.length);
        for (let index = 0; index < overlap; index += 1) {
          if (a[index] !== b[index]) changedAtPosition += 1;
        }
        return lengthDelta >= 0.03 || changedAtPosition / Math.max(a.length, b.length, 1) >= 0.06;
      };
      const changed = options?.targetDetailLevel
        ? materiallyChanged(output, acc)
        : normalise(acc) !== normalise(output);
      if (!failed && acc.trim() && changed) {
        const nextVersion = versionCounterRef.current + 1;
        const nextDetailLevel = options?.targetDetailLevel ?? ndaDetailLevel;
        const nextFileName = fileNameFor(nextVersion, nextDetailLevel);
        versionCounterRef.current = nextVersion;
        editorExportRef.current = null;
        setOutput(acc);
        setSavedHtml(null); // the lawyer's edits are superseded by the revision
        if (options?.targetDetailLevel) setNdaDetailLevel(options.targetDetailLevel);
        setDocumentVersion(nextVersion);
        setDocOpen(true);
        setDocumentVersions((versions) => [
          ...versions,
          {
            documentText: acc,
            version: nextVersion,
            detailLevel: nextDetailLevel,
            fileName: nextFileName,
          },
        ]);
        setFollow((f) => [
          ...f,
          {
            who: "fd",
            text: options?.targetDetailLevel
              ? `Version ${nextVersion} is ready. I rewrote the NDA at comprehensiveness level ${options.targetDetailLevel} and updated the document beside the chat.`
              : `Version ${nextVersion} is ready. I revised the NDA following your request and updated the document beside the chat.`,
            version: nextVersion,
            fileName: nextFileName,
            documentText: acc,
            detailLevel: nextDetailLevel,
          },
        ]);
        track("draft_revised", { doc_type: docType.slug });
      } else if (!failed && acc.trim()) {
        setError("The revision did not materially change the document. Please try again.");
      }
    } catch {
      if (giveUp.signal.aborted) {
        setError(
          "The drafting service stopped responding, so the revision was abandoned rather than " +
            "left spinning. Your document is unchanged. Check the credit count before trying " +
            "again — if it has not come back, that revision was charged for.",
        );
      } else {
        setError("Could not reach the drafting service. Check your connection and try again.");
      }
    } finally {
      clearTimeout(stall);
      revisingRef.current = false;
      setRevising(false);
    }
  }

  async function exportDocx(documentText = output, fileName = currentFileName) {
    setExporting(true);
    setError(null);
    try {
      const clean = (v: string) => (v === SKIPPED ? "" : v.split("(")[0].trim());
      const title =
        [answers.party_a, answers.party_b].map((v) => clean(v ?? "")).filter(Boolean).join(" and ") ||
        docType.label;
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: documentText === output ? editorExportRef.current?.plain ?? documentText : documentText,
          html: documentText === output ? editorExportRef.current?.html : undefined,
          title,
          fileName,
          includeNotes: false,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "draft.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      /* The one that counts. A draft nobody downloads did not help anybody,
         so this — not draft_generated — is the denominator for "did it work". */
      track("draft_exported", { doc_type: docType.slug, format: "docx" });
      setToast("Downloading Word file");
    } catch {
      setError("Export failed. Check your connection.");
    } finally {
      setExporting(false);
    }
  }

  const answered = status.filter((s) => s === "done").length;
  const skippedCount = status.filter((s) => s === "skp").length;
  const settled = answered + skippedCount;
  const pct = Math.round((settled / steps.length) * 100);

  /* ───────────────────────────────────────────────────── render pieces */

  function stepAnswerUI(s: Step) {
    if (s.kind === "detail") {
      const level = Math.min(5, Math.max(1, Number(answers._nda_detail_level) || 3));
      const labels = DETAIL_LABELS;
      return (
        <>
          <div className="gd">
            <div className="gd-head">
              <span className="gd-title">
                Comprehensiveness
                <i
                  className="gd-info"
                  title={`Level ${level} of 5 — ${labels[level - 1]}. ${DETAIL_LENGTHS[level - 1]}. Changes drafting detail, never the commercial position.`}
                  aria-hidden="true"
                >
                  i
                </i>
              </span>
              <span className="gd-readout">
                <b>{level} / 5</b>
                <em>{labels[level - 1]}</em>
              </span>
            </div>

            <div className="gd-track">
              <span className="gd-rail" aria-hidden="true">
                <span className="gd-fill" style={{ width: `${((level - 1) / 4) * 100}%` }} />
              </span>
              <span className="gd-dots" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((mark) => (
                  <span
                    key={mark}
                    className={`gd-dot${mark <= level ? " on" : ""}${mark === level ? " now" : ""}`}
                  />
                ))}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={level}
                aria-label="Initial NDA comprehensiveness"
                aria-valuetext={`Level ${level}: ${labels[level - 1]}`}
                onChange={(event) => setAnswer("_nda_detail_level", event.target.value)}
              />
            </div>

            <div className="gd-scale" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((mark) => (
                <span key={mark} className={mark === level ? "on" : ""}>
                  <b>{mark}</b>
                  <em>{labels[mark - 1]}</em>
                </span>
              ))}
            </div>

            <p className="gd-length">{DETAIL_LENGTHS[level - 1]}</p>
          </div>
          <div className="chips">
            <button type="button" className="go" onClick={() => commit(false)}>
              Use this level →
            </button>
          </div>
        </>
      );
    }

    if (s.kind === "chips") {
      const f = s.fields[0];
      return (
        <>
          <div className="chips">
            {(f.options ?? []).map((o) => (
              <button
                key={o}
                type="button"
                className={`chip${answers[f.key] === o ? " on" : ""}`}
                onClick={() => {
                  setAnswer(f.key, o);
                  setTimeout(() => commit(false, i, o), 260);
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="chips">
            <button type="button" className="chip later" onClick={() => commit(true)}>
              Skip for now
            </button>
            {i > 0 && (
              <button type="button" className="chip early" onClick={draftWithWhatIHave}>
                Draft with what I have
              </button>
            )}
          </div>
        </>
      );
    }

    if (s.kind === "source") {
      return (
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Reading…" : "➕ Attach a document"}
          </button>
          <button type="button" className="chip" onClick={() => commit(false)}>
            No — start fresh
          </button>
          <button type="button" className="chip later" onClick={() => commit(true)}>
            Skip for now
          </button>
        </div>
      );
    }

    const isExtra = s.fields.every((f) => !f.required);
    return (
      <>
        <div className={`card${isExtra ? "" : " two"}`}>
          {s.fields.map((f) => (
            <label key={f.key}>
              <span className="field-label">
                {f.label}
                {f.required && <span className="req">*</span>}
              </span>
              {f.type === "select" ? (
                <select
                  className="input"
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                >
                  <option value="">— choose —</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="input"
                  placeholder={f.placeholder}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                />
              ) : (
                <input
                  className="input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  placeholder={f.placeholder}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswer(f.key, e.target.value)}
                />
              )}
              {f.help && <span className="field-help">{f.help}</span>}
            </label>
          ))}
        </div>
        <div className="chips">
          <button
            type="button"
            className="go"
            disabled={!ready(s)}
            onClick={() => commit(false)}
          >
            {isExtra ? "Add this →" : "That’s right →"}
          </button>
          {isExtra ? (
            <button type="button" className="chip" onClick={() => commit(true)}>
              Nothing else
            </button>
          ) : (
            <button type="button" className="chip later" onClick={() => commit(true)}>
              Skip for now
            </button>
          )}
          {i > 0 && (
            <button type="button" className="chip early" onClick={draftWithWhatIHave}>
              Draft with what I have
            </button>
          )}
        </div>
      </>
    );
  }

  const sheetParagraphs = output
    .trim()
    .split(/\n\s*\n/)
    .map((b, k) => {
      const t = b.replace(/\n {8}/g, " ").replace(/\n {4}(?!\()/g, " ").replace(/\n {2}/g, " ");
      const firstLine = t.split("\n")[0];
      let cls = "";
      if (/^[A-Z0-9 .()'"—-]{3,}$/.test(firstLine) && t.length < 40) cls = "h";
      if (/DRAFTER'S NOTES/.test(t)) cls = "h";
      if (/^•/.test(t)) cls = "note";
      return (
        <p key={k} className={cls || undefined}>
          {t}
        </p>
      );
    });

  return (
    <div
      id="scr-chat"
      className={`scr on fade-in${view === "draft" ? " is-draft" : ""}${
        view === "draft" && docOpen ? " doc-open" : ""
      }`}
    >
      {/* ── the strip ── */}
      <div className="strip">
        <span className="dot" />
        <span>
          <b>{docType.label}</b> · Singapore precedent
        </span>
        <span>
          Focused setup{" "}
          <button type="button" className="chg" onClick={onChangeDocument}>
            Change document
          </button>
        </span>
      </div>

      {/* ── the conversation ── */}
      <div className="convo">
        <div className="chat" ref={threadRef}>
          <div className="chat-in">
            {msgs.map((m, k) =>
              m.who === "fd" ? (
                <div className="m" key={k}>
                  <div className="av">FD</div>
                  <div>
                    <div className="txt">{m.text}</div>
                    <div className="ans" />
                  </div>
                </div>
              ) : (
                <div className="m me" key={k}>
                  <div className={`txt${m.skipped ? " skipped" : ""}`}>
                    <b>{m.label}</b>
                    {m.text}
                  </div>
                </div>
              ),
            )}

            {step && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">{step.question}</div>
                  <div className="ans">{stepAnswerUI(step)}</div>
                </div>
              </div>
            )}

            {finished && !busy && view === "chat" && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">
                    That’s everything. Ready when you are — you can still change any answer
                    afterwards.
                  </div>
                  <div className="ans">
                    <div className="chips">
                      <button type="button" className="go" onClick={() => void generate()}>
                        Generate draft
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {paywalled && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">
                    <b style={{ fontWeight: 500 }}>You&rsquo;ve used your free documents.</b>
                    <p style={{ margin: "8px 0 0" }}>
                      Your answers are still here — nothing is lost. Add credits and this draft
                      generates straight away.
                    </p>
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--grey-5)" }}>
                      Everything you have already drafted stays yours to read and download.
                    </p>
                    <p style={{ margin: "14px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a className="btn btn-gold" href="/billing">Add credits</a>
                      <a className="btn btn-white" href="/history">Past drafts</a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="m">
                <div className="av">FD</div>
                <div>
                  <div className="txt">{error}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── the composer ── */}
        <div className="composer">
          <div className="box">
            <button
              type="button"
              className="ic"
              title="Attach"
              onClick={() => fileRef.current?.click()}
            >
              +
            </button>
            <textarea
              rows={1}
              placeholder={step ? "Use the options above, or type here" : "Ready to generate"}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (step && typedAnswer.trim()) {
                    const f = step.fields[step.fields.length - 1];
                    if (f) setAnswer(f.key, typedAnswer.trim());
                    commit(false, i, typedAnswer.trim());
                  }
                }
              }}
            />
            <button
              type="button"
              className="ic send"
              title="Send"
              disabled={!step || !typedAnswer.trim()}
              onClick={() => {
                if (!step || !typedAnswer.trim()) return;
                const f = step.fields[step.fields.length - 1];
                if (f) setAnswer(f.key, typedAnswer.trim());
                commit(false, i, typedAnswer.trim());
              }}
            >
              ↑
            </button>
          </div>
          <p className="fine">
            AI-generated first draft — reviewed by a qualified lawyer before use.{" "}
            <a href="https://foundersdoc.com/terms-conditions/">Terms</a>
          </p>
        </div>
      </div>

      {/* ── the draft ── */}
      <div className="dview">
        <DraftReady
          docLabel={docType.label}
          state={busy || !output ? "drafting" : "ready"}
          answers={answerSummary}
          skippedCount={
            skippedLabels.length ||
            docType.fields.filter((field) => answers[field.key] === SKIPPED).length
          }
          docOpen={docOpen}
          busy={busy || revising}
          onOpenDocument={() => setDocOpen(true)}
          onOpenVersion={({ documentText, version, detailLevel }) => {
            editorExportRef.current = null;
            setOutput(documentText);
            setDocumentVersion(version);
            setNdaDetailLevel(detailLevel);
            setSavedHtml(null);
            setDocOpen(true);
          }}
          onAsk={(prompt) => void revise(prompt)}
          fileName={currentFileName}
          initialVersion={documentVersions[0]}
          ndaDetailLevel={ndaDetailLevel}
          error={error}
          paywalled={paywalled}
          onChangeNdaDetailLevel={(level) =>
            void revise(`Rewrite this NDA at comprehensiveness level ${level} of 5.`, {
              targetDetailLevel: level,
            })
          }
          follow={follow}
          conversation={msgs}
        />

        {/* The document is not rendered at all until it exists and the person
            asks for it. Hiding it with CSS would still build seven A4 pages
            from a half-streamed document — and would still let a stray click
            reach a "Download Word" button for a file that is not written yet. */}
        {docOpen && output && !busy && (
        <section className="gen-right">
        <div className="dbar">
          <span className="dstat">
            <i />
            {busy
              ? "Drafting…"
              : `${output.length.toLocaleString()} characters · Version ${documentVersion} · Detail ${ndaDetailLevel}/5${
                  skippedLabels.length ? ` · ${skippedLabels.length} to confirm` : ""
                }`}
          </span>
          <div className="dacts">
            <button type="button" className="dbtn" onClick={() => setView("chat")}>
              Edit answers
            </button>
            <button
              type="button"
              className="dbtn"
              disabled={!output}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sheetRef.current?.innerText ?? output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch {
                  setError("Could not copy. Select the text and copy manually.");
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="dbtn gold"
              disabled={!output || exporting}
              onClick={() => void exportDocx()}
            >
              {exporting ? "Preparing…" : "Download Word"}
            </button>
            <button
              type="button"
              className="dbtn d-close"
              aria-label="Close document"
              title="Close document"
              onClick={() => setDocOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
        {/* While the draft is still streaming, show the raw text: the parser
            needs whole blocks and pagination needs a finished document, so
            building pages on every chunk would flicker and mis-split. The
            editor takes over the moment generation finishes. */}
        {busy || revising || !output ? (
          <div className="dscroll">
            <div className="sheet" ref={sheetRef}>
              {output ? sheetParagraphs : <p>{busy ? "Drafting…" : "Nothing drafted yet."}</p>}
            </div>
          </div>
        ) : (
          <DocumentEditor
            key={`${draftId ?? "unsaved"}:v${documentVersion}`}
            text={output}
            savedHtml={savedHtml}
            onContentChange={captureEditorContent}
            onSave={saveDocument}
          />
        )}
        </section>
        )}
      </div>

      {/* ── the rail ── */}
      <aside className="rail" aria-label="FD AI">
        <button type="button" className="sb-new" onClick={onChangeDocument}>
          + New draft
        </button>
        <p className="k">FD AI</p>
        <nav className="nav2">
          <a className="on" onClick={onChangeDocument}>
            <i />
            New draft
          </a>
          <a href="/history">
            <i />
            Past drafts
          </a>
          <a href="/billing">
            <i />
            Credits
          </a>
          <a href="/usage">
            <i />
            Usage
          </a>
        </nav>

        {/* The balance, where it can be seen BEFORE the questions are answered.
            Finding out you have run out only at the moment you press Generate
            — after ten minutes of typing — is the version of this that makes
            people angry. */}
        {wallet && (
          <div className="rail-credits">
            <span>
              <b>{wallet.credits}</b> {wallet.credits === 1 ? "document" : "documents"} left
            </span>
            {wallet.inTrial ? (
              <small>Free week · trial credits expire</small>
            ) : wallet.credits === 0 ? (
              <a href="/billing">Add credits</a>
            ) : (
              <a href="/billing">Add more</a>
            )}
          </div>
        )}
        {recent.length > 0 && (
          <>
            <p className="k" style={{ paddingTop: 12 }}>
              Past drafts
            </p>
            <div className="hist">
              {recent.map((r) => (
                <a key={r.id} href={`/draft/${r.id}`}>
                  {r.title}
                  <small>{r.when}</small>
                </a>
              ))}
            </div>
          </>
        )}
        <div className="rail-bottom">
          {/* The same account menu as the one in the nav. Two places show who
              is signed in, so both must do the same thing when clicked —
              a chip that looks like a button and does nothing is worse than
              no chip at all. */}
          <div className={`acct-wrap${acctOpen ? " on" : ""}`}>
            {acctOpen && (
              <div className="acct-menu" onClick={() => setAcctOpen(false)}>
                <a href="/history">Past drafts</a>
                <a href="/billing">Credits</a>
                <a href="/usage">Usage</a>
                <a href="/settings">Settings</a>
                <form action="/auth/signout" method="post">
                  <button type="submit">Log out</button>
                </form>
              </div>
            )}
            <button
              type="button"
              className="acct"
              aria-haspopup="true"
              aria-expanded={acctOpen}
              onClick={(e) => {
                e.stopPropagation();
                setAcctOpen((v) => !v);
              }}
            >
              <i>{initials(userEmail ?? "FD")}</i>
              <div>
                {(userEmail ?? "Signed out").split("@")[0]}
                <small>{userEmail ? userEmail.split("@")[1] : "Founders Doc"}</small>
              </div>
              <span className="caret" aria-hidden="true">
                ⌃
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── the progress pane ── */}
      <section className="pane">
        <div className="pane-h">
          Progress<span className="pct">{pct}%</span>
        </div>
        <div className="studio-body">
          <div className="prog-h">
            <b className="cnt">
              {answered} of {steps.length} answered
              {skippedCount ? ` · ${skippedCount} skipped` : ""}
            </b>
            <span className="eta">
              {finished
                ? "Ready to generate"
                : `About ${Math.max(1, Math.ceil((steps.length - settled) * 0.5))} min`}
            </span>
          </div>
          <div className="segs" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
            {steps.map((s, k) => (
              <i key={s.id} className={status[k] ?? (k === i ? "now" : "")} />
            ))}
          </div>
          <div className="notes">
            {steps.map((s, k) => {
              const st = status[k] ?? (k === i ? "now" : "");
              const sm =
                st === "done"
                  ? summarise(s).slice(0, 60)
                  : st === "skp"
                    ? "Skipped — tap to answer"
                    : st === "now"
                      ? "Answering now"
                      : "Not yet";
              return (
                <div
                  key={s.id}
                  className={`inst ${st}`}
                  onClick={() => st === "skp" && revisit(k)}
                >
                  <i>{st === "done" ? "✓" : k + 1}</i>
                  <div>
                    <b>{s.name}</b>
                    <small>{sm}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="studio-foot">
          <button
            type="button"
            className="btn s-gen"
            disabled={busy}
            onClick={() => (view === "draft" ? setView("chat") : void generate())}
          >
            {busy ? "Drafting…" : view === "draft" ? "Edit answers" : "Generate draft"}
          </button>
          <button
            type="button"
            className="btn btn-quiet s-skipall"
            disabled={busy || finished}
            onClick={draftWithWhatIHave}
          >
            Skip the rest and draft
          </button>
          <small>Skipped answers become [[TO CONFIRM]] in the draft</small>
        </div>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      {toast && <div className="fd-toast on">{toast}</div>}
    </div>
  );
}
