"use client";

import { Fragment } from "react";
import { CLN_QUESTIONNAIRE } from "@/lib/cln/data/questionnaire";
import { CORRECTIONS, JURISDICTIONS, MASTER_VERSION, SECTIONS } from "@/lib/cln/data/master";
import { ALL_QUESTIONS, defaultsBy, showIf, type Condition, type Question } from "@/lib/cln/questions";

/**
 * The convertible loan agreement's questions, as the user meets them —
 * read-only, as the other assembled documents' are.
 *
 * The questions are the master's square-bracketed choices and drafting
 * notes; the governing-law question is its Jurisdiction Rider, shown below
 * row by row. Where the usual answer depends on the user's side (Company or
 * Investor), both are shown. Beneath: the FD supplementary wording and the
 * master's slips fixed.
 */

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
};

/** What each answer does to the contract. */
const SHAPES: Record<string, string> = {
  CL1: "The side's usual answers below (discount, missed payment, round documents, share count)",
  CL2: "Investor party wording, the Investor's capacity warranty, signature block",
  CL3: "Jurisdiction Rider: data protection law, Business Day city and local time, Liquidity Event exchange, third-party rights statute, securities law, governing law, arbitration seat / rules / institution or courts",
  CL3a: "Governing law (own wording); the Rider entries are [●] and flagged",
  CL4: "Agreed Currency; amounts and words",
  CL5: "Recital (A), Advance of Loan (figures and words), Schedule 2 example",
  CL6: "Purpose clause: general, own wording (flagged) or none", CL6a: "Purpose (own wording)",
  CL7: "Interest clauses (simple, compounded annually) or No Interest (FD); interest wording in Repayment, Liability, Schedules", CL7a: "Interest rate",
  CL8: "Maturity Date", CL8a: "Maturity Date (years)",
  CL9: "Event of Default (c): missed payment within 5 / 10 Business Days, or removed",
  CL10: "Voluntary Early Repayment (b): integral multiples, or removed", CL10a: "The multiple",
  CL11: "Valuation Cap in the Conversion Price definition and Schedule 2",
  CL12: "Pre-money / post-money in the Conversion Price definition, the down-round test and Schedule 2",
  CL13: "Discount in Conversion Price (b)(ii) and Schedule 2, or removed", CL13a: "Discount (%)",
  CL14: "Qualified Equity Financing Event: minimum raise, or a round below the Valuation Cap", CL14a: "Minimum raise",
  CL15: "Option share plan carve-out in the Qualified Equity Financing Event definition",
  CL16: "Co-Founders definition (own wording), else persons identified by the Board",
  CL17: "Automatic conversion on a Qualified Equity Financing Event (FD, from the master's drafting note), or election only",
  CL18: "Terms of Conversion (a): the Exercise Notice period",
  CL19: "Conversion Documentation (a): no less favourable than the round's terms, or removed",
  CL20: "Schedule 2 Fully Diluted Share Capital: including or excluding options and the option pool",
  CL21: "Investor's Representations (e): accredited / institutional / professional investor under the Rider's securities law, or removed (flagged)",
  CL22: "Governing Law & Dispute Resolution (c): arbitration under the Rider, or the courts",
};

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
  const by = defaultsBy(q.id);
  if (by) {
    const label = (x: unknown) => (q.options.find((o) => o.value === x)?.label ?? String(x)).split(" – ")[0];
    return Object.entries(by.map).map(([k, v]) => `${k === "company" ? "Company" : k === "investor" ? "Investor" : k}: ${label(v)}`).join(" · ");
  }
  const d = q.defaultValue;
  if (d === undefined || d === null) return "—";
  const label = (x: string) => (q.options.find((o) => o.value === x)?.label ?? x).split(" – ")[0];
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "parties" };

export default function ClnQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "CL4") rows.push({ kind: "parties" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd).map((c) => c.text.match(/^\*\*(.+?)\.\*\*/)?.[1] ?? c.id));
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The deal";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Beta — questionnaire v${CLN_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · company or investor, five laws or another`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The wording is the Founders Doc master convertible loan agreement; the questions are its bracketed
          choices and drafting notes. Upload the master into AI files → Convertible Loan Agreements.
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
                            <span>Who are the Company and the Investor?</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              Two boxes, the user&rsquo;s own side filled from the company profile: name*, registration or ID number, type of company, where incorporated, address, notice email (the Company&rsquo;s also for data protection queries), signatory, title and attention.
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>parties</code></td>
                        <td><span className="pill">Party boxes</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>Parties, signature blocks, notices — anything blank is [●]</td>
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
        <span className="badge">Jurisdiction Rider (master Schedule 3) — filled from the governing law</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Not printed in the agreement. &ldquo;Another country&rdquo; leaves these as [●] and flags them.</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th>Law</th>
              <th>Data protection</th>
              <th>Third-party rights</th>
              <th>Arbitration</th>
              <th>Courts</th>
              <th>Securities law</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(JURISDICTIONS).map(([k, j]) => (
              <tr key={k}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{j.law}</td>
                <td style={{ fontSize: 12 }}>{j.dpLaw}</td>
                <td style={{ fontSize: 12 }}>{j.tpStatute || "No statute — the express wording only"}</td>
                <td style={{ fontSize: 12 }}>{`Seated in ${j.seat}, ${j.rules}`}</td>
                <td style={{ fontSize: 12 }}>{j.courts}</td>
                <td style={{ fontSize: 12 }}>{j.securitiesLaw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Wording not in the master, written in its style for the answers given: {fdClauses.join(", ")}.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the master, fixed</span>
      </div>
      <ul style={{ fontSize: 12, margin: "8px 0 0 18px" }}>
        {CORRECTIONS.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </>
  );
}
