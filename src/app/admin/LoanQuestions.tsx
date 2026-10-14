"use client";

import { Fragment } from "react";
import { LOAN_QUESTIONNAIRE } from "@/lib/loan/data/questionnaire";
import { ADAPTATIONS, CORRECTIONS, MASTER_VERSION, SECTIONS } from "@/lib/loan/data/master";
import { ALL_QUESTIONS, defaultsBy, showIf, type Condition, type Question } from "@/lib/loan/questions";

/**
 * The loan agreement's questions, as the user meets them — read-only, as
 * the services agreement's are.
 *
 * There is no FD Lite question bank: the base is the Founders Doc master
 * loan agreement, and the questions are the choices the four reference
 * loan agreements show (one or several Lenders, an individual or company
 * Borrower, the interest model, repayment, defaults, security). Where the
 * usual answer depends on the user's side, both are shown. Beneath the
 * list: what was generalised, the FD supplementary wording and the
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
  LN1: "The side's usual answers below (repayment, defaults, the Borrower's cap); payments applied to principal first (Borrower, master) or costs and interest first (Lender, B); announcements approved by the Borrower (master) or both",
  LN2: "One Lender as party (2), or the Lenders in Schedule 1 Part 1 with each one's amount, jointly and severally, through the Lenders' Authorised Representative (Schedule 1 Part 2, master)",
  LN3: "Party (1) wording; a company Borrower adds its incorporation warranty and board approval as a condition precedent (B); the company warranties, reporting and change of control then concern the Borrower",
  LN4: "The Company definition, the Company's warranties, quarterly reporting and change of control (master) — or none for a personal loan",
  LN5: "Agreed Currency; S$ or US$ throughout",
  LN6: "Recital (A), the advance, the tier and flat interest amounts, instalments",
  LN7: "Purpose clause (B), own wording",
  LN8: "Drawdown Date: the Effective Date, within five Business Days (FD default) or a set date", LN8a: "Drawdown Date (own wording)",
  LN9: "Maturity Date (master: 12 months)", LN9a: "Maturity Date",
  LN10: "Repayment: within 30 days of a request served on or after the Maturity Date or on a Change of Control (master), in full on the Maturity Date (B, C), or equal instalments",
  LN10a: "Instalments: monthly or quarterly",
  LN11: "Voluntary Early Repayment without penalty (master), or only with consent; the Date of Repayment rule for tiered or annual interest",
  LN12: "Interest: tiered totals at 3 and 6 months (master), a rate a year, 365-day basis (B, C), a flat charge, or interest-free (FD)",
  LN12a: "The three tiers and the default tier (master 20 / 25 / 30%)", LN12b: "The three tiers",
  LN12c: "Rate a year", LN12d: "Settlement of Interest: with the principal (master) or quarterly in arrears (B)", LN12e: "Flat charge",
  LN13: "Default Interest: 2% a year above the rate (B), a set rate, or none — with tiered interest the top tier applies instead (master)", LN13a: "Default rate",
  LN14: "Security clause, Security Document condition precedent, enforcement and release; a share pledge adds certificates, undated transfers and consents (C) — flagged", LN14a: "Security (own wording)", LN14b: "Pledged Shares (own wording)",
  LN15: "Events of Default and consequences: the master's three events, 30-day fix and 90-day cure; or C's strict list (3 / 15 Business Days, misrepresentation, cross-default, insolvency steps, illegality)",
  LN16: "Change of Control clause and repayment trigger (75%, master)",
  LN17: "Company warranties (accounts, no off-balance-sheet items, no material adverse change, compliance) and quarterly reporting (master)", LN17a: "Financial Statements period", LN17b: "The round in the Reporting clause",
  LN18: "Lender's assignment: 30 days' notice, not to a competitor (master); freely (B); or with the Borrower's consent",
  LN19: "Limitation of Liability: the Borrower's cap at twice the Principal Amount (master) or none",
  LN20: "Costs: the Borrower up to a cap (master), each its own (B) or the Borrower in full (B)", LN20a: "Costs cap",
  LN21: "Dispute Resolution: consultation or mediation for 30 days, then SIAC arbitration in Singapore (master) or the Singapore courts",
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
    return Object.entries(by.map).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${label(v)}`).join(" · ");
  }
  const d = q.defaultValue;
  if (d === undefined || d === null) return "—";
  const label = (x: string) => (q.options.find((o) => o.value === x)?.label ?? x).split(" – ")[0];
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "parties" };

export default function LoanQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "LN5") rows.push({ kind: "parties" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd || s.fd).map((c) => c.text.match(/^\*\*(.+?)\.\*\*/)?.[1] ?? c.id));
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The loan";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Beta — questionnaire v${LOAN_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · FD master loan agreement, lender or borrower`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. There is no FD Lite question bank for the loan agreement: the wording is the Founders Doc master loan
          agreement, and the questions are the permutations shown by four reference loan agreements (B: a short-form facility
          agreement; C: a term loan with a share pledge; D and E: a bank loan and security agreement and an amendment) — their
          wording kept to the master&rsquo;s style. The share pledge is an option, never the usual answer. Redacted copies go in AI files.
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
                            <span>Who are the Borrower and the Lender(s)?</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              The Borrower (kind from LN3) and its bank account; the connected Company (LN4); each Lender — individual or company, name*, ID or UEN, citizenship or place of incorporation, address, email, signatory, and with several Lenders the amount each puts in (up to 10); the Lenders&rsquo; Authorised Representative. The user&rsquo;s own side is filled from the company profile when it is a company.
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>parties</code></td>
                        <td><span className="pill">Party boxes</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>Parties, Borrower Bank Account, Company definition, signature blocks, Schedule 1 — anything blank is [●]</td>
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
        <span className="badge">Where the master was generalised — for FD review</span>
      </div>
      <ul style={{ fontSize: 12, margin: "6px 0 0 18px" }}>
        {ADAPTATIONS.map((c) => (
          <li key={c} style={{ marginBottom: 4 }}>{c}</li>
        ))}
      </ul>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Wording in none of the five documents, written in the master&rsquo;s style for the answers given: {fdClauses.join(", ")}.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the master, fixed</span>
      </div>
      <ul style={{ fontSize: 12, margin: "6px 0 0 18px" }}>
        {CORRECTIONS.map((c) => (
          <li key={c} style={{ marginBottom: 4 }}>{c}</li>
        ))}
      </ul>
    </>
  );
}
