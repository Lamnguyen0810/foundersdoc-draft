"use client";

import { Fragment } from "react";
import { IA_QUESTIONNAIRE } from "@/lib/ia/data/questionnaire";
import { ADAPTATIONS, CORRECTIONS, MASTER_VERSION, SECTIONS } from "@/lib/ia/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/ia/questions";

/**
 * The investment agreement's questions, as the user meets them — read-only,
 * as the SSA's are.
 *
 * There is no FD Lite question bank: the questions are the choices that
 * differ between the two FD samples Rachel shared (a simple investor; a lead
 * investor). Beneath the list: where a sample clause was generalised, the
 * FD supplementary wording, and the samples' slips fixed.
 */

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
};

/** What each answer does to the contract. */
/** Which clause each question reaches, from the master's own `question` notes. */
const SHAPES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const sec of SECTIONS) {
    for (const c of sec.clauses) {
      for (const q of (c.question ?? "").split("/").map((x) => x.trim())) {
        if (/^IA\d+[a-z]?$/.test(q)) out[q] = [out[q], `${c.title}${c.fd || sec.fd ? " (FD)" : ""}`].filter(Boolean).join("; ");
      }
    }
  }
  out.IA1 = "The structure: simple (company and investor; company warranties in the body; investor undertakings — sample A) or lead (founders sign; conditions precedent; board seat; Schedule 4 warranties; founder caps; capitalisation — sample B). For a lead investor the agreement reads \u201cthe Lead Investor\u201d";
  out.IA1a = "Number of founder boxes; Schedule 1; read in the singular for one founder";
  out.IA2 = "S$ or US$ in the Investment Amount, price per share and founder cap";
  out.IA3 = "Subscription Shares; Terms; the preference share schedule and its definitions";
  out.IA3a = "The class name throughout"; out.IA3b = "The class name throughout (flagged as your own wording)";
  out.IA16 = "Share terms: Liquidation Preference, or Return of Capital (FD)";
  out.IA17 = "Share terms: Voting Rights (as-converted — sample B; non-voting — sample A)";
  out.IA18 = "Share terms: Convertibility (1:1 — FD; full ratchet and IPO adjustment — sample B; none)";
  out.IA4a = "Definition of Completion Date";
  out.IA5 = "Conditions Precedent section; Completion 10 Business Days after the CP Confirmation Certificate; \u201cNone\u201d completes on signing";
  out.IA5a = "Right to Terminate (long-stop)";
  out.IA6 = "Definition; investor's delivery at completion; board resolution; Precedence; transfer covenant; further assurances";
  out.IA7 = "Definition of Amended Constitution; board and shareholders' resolutions; \u201cagreed form\u201d";
  out.IA8 = "Form 45 delivery; board resolution appointing the nominee director";
  out.IA9 = "Investor's Obligations on Completion (b) and (c)";
  out.IA10 = "Recital (D), definitions, Acknowledgement, Entry into Transaction Documents";
  out.IA11 = "Recital, definition of Lead Investor, other investors on different terms, negotiation led by the lead";
  out.IA12 = "Warranties; Qualifications; Time Limit; Founders' Liability; definition of Warrantors";
  out.IA12a = "Warranties (severally — sample B — or jointly and severally); several-liability interpretation rule";
  out.IA13l = "Time Limit for Claims"; out.IA14a = "Founders' Liability";
  out.IA15 = "Investor Covenants, Investor Acknowledgements, Non-Disparagement"; out.IA15l = "As IA15, for the lead investor";
  return out;
})();

function listText(v: readonly unknown[] | undefined): string {
  return (v ?? []).map(String).join(", ").replace(/, ([^,]*)$/, " or $1");
}

function when(c: Condition | undefined): string {
  if (!c) return "Always";
  if ("all" in c) return c.all.map(when).join(", and ");
  if ("any" in c) return c.any.map(when).join(", or ");
  if ("eq" in c) return `${c.q} is ${String(c.eq)}`;
  if ("in" in c) return `${c.q} is ${listText(c.in)}`;
  if ("not_in" in c) return `${c.q} is not ${listText(c.not_in)}`;
  if ("has" in c) return `${c.q} includes ${String(c.has)}`;
  if ("lacks" in c) return `${c.q} is not ${String(c.lacks)}`;
  return "—";
}

function defaultText(q: Question): string {
  const d = q.defaultValue;
  if (d === undefined || d === null) return "—";
  const label = (x: string) => (q.options.find((o) => o.value === x)?.label ?? x).split(" – ")[0];
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "company" } | { kind: "people" };

export default function IaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "IA2") rows.push({ kind: "company" }, { kind: "people" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd || s.fd).map((c) => c.title));
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "Investment";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Beta — questionnaire v${IA_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · simple investor and lead investor`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. There is no FD Lite question bank for the investment agreement: the questions are the choices that
          differ between the two Founders Doc investment agreements shared as the reference (A: a simple investor; B: a
          lead investor, with the founders), and the wording is theirs, generalised. Redacted copies are in AI files.
        </span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>#</th>
              <th>Question</th>
              <th>ID</th>
              <th>Type</th>
              <th>Asked when</th>
              <th>Default</th>
              <th>What it changes in the contract</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              n += 1;
              const stepNo = n;
              return (
                <Fragment key={sec.name}>
                  <tr className="step-row">
                    <td>{stepNo}</td>
                    <td colSpan={6}>
                      <div className="step-title"><strong>{sec.name}</strong></div>
                    </td>
                  </tr>
                  {sec.rows.map((r, i) =>
                    r.kind === "q" ? (
                      <tr key={r.q.id}>
                        <td className="sub-no">{stepNo}.{i + 1}</td>
                        <td>
                          <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                            <span>{r.q.text}</span>
                            {r.q.help && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>{r.q.help}</span>}
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.q.id}</code></td>
                        <td>
                          <span className="pill">{TYPE_LABEL[r.q.type] ?? r.q.type}</span>
                          {r.q.options.length > 0 && (
                            <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>
                              {r.q.options.length} option{r.q.options.length === 1 ? "" : "s"}
                            </span>
                          )}
                          {r.q.options.some((o) => o.exclusive) && <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>· “None” stands alone</span>}
                          {!r.q.required && <span className="badge gray" style={{ marginLeft: 6 }}>Optional</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{when(showIf(r.q.id))}</td>
                        <td style={{ fontSize: 12 }}>{defaultText(r.q)}</td>
                        <td style={{ fontSize: 12 }}>{SHAPES[r.q.id] ?? "—"}</td>
                      </tr>
                    ) : (
                      <tr key={r.kind}>
                        <td className="sub-no">{stepNo}.{i + 1}</td>
                        <td>
                          <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                            <span>{r.kind === "company" ? "Tell me about the company issuing the shares, and who signs for it." : "Who is investing — and, for a lead investor, who are the founders?"}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "company"
                                ? "Legal name*, UEN, registered office, issued shares and capital before the investment, (lead) date of incorporation and directors, signatory (name, title, notice email), bank account and SWIFT code for the investment money."
                                : "The investor (name*): company or individual, ID, where incorporated, address, email, signatory, shares subscribed, investment amount. For a lead investor, one box per founder (as many as IA1a): name, address, email."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "company" ? "Company details" : "Party boxes"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "company" ? "Company party, Recital (B), bank details, signature block, Schedule 2 (lead)" : "Parties, Investment Amount and price per share, Schedule 1 founders and capitalisation (lead), signature blocks"} — anything blank is [●]
                        </td>
                      </tr>
                    ),
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Where a sample clause was generalised — for FD review</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 320 }}>Where</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {ADAPTATIONS.map((c) => (
              <tr key={c.where}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{c.where}</td>
                <td style={{ fontSize: 12 }}>{c.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Wording in neither sample, written in their style for the answers given: {fdClauses.length ? `${fdClauses.join(", ")}; ` : ""}an
          individual investor&rsquo;s capacity warranty, ordinary shares, no liquidation preference (return of capital pari
          passu), 1:1 conversion without a ratchet, a set completion date, completion on signing for a lead investor,
          transfers with Board approval when there is no shareholders&rsquo; agreement, and the lead investor&rsquo;s undertakings
          (taken from the simple-investor form).
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the samples, fixed</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Where</th>
              <th>Was</th>
              <th>Now</th>
            </tr>
          </thead>
          <tbody>
            {CORRECTIONS.map((c, i) => (
              <tr key={i}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{c.where}</td>
                <td style={{ fontSize: 12 }}>{c.was}</td>
                <td style={{ fontSize: 12 }}>{c.now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
