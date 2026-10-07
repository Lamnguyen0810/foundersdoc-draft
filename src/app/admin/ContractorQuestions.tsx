"use client";

import { Fragment } from "react";
import { CONTRACTOR_QUESTIONNAIRE } from "@/lib/contractor/data/questionnaire";
import { MASTER_LOADED, MASTER_MENU, MASTER_VERSION } from "@/lib/contractor/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/contractor/questions";

/**
 * The contractor agreement's questions, as the user meets them — read-only,
 * as the employment agreement's are (EmploymentQuestions.tsx).
 *
 * They are the firm's "Proposed Amendments to Questionnaire" (15 questions).
 * Beneath the list: the master menu — which answer reaches which clause of
 * the FD Master Contractor Agreement — for FD to check against the master
 * when it is uploaded.
 */

const TYPE_LABEL: Record<string, string> = {
  jurisdiction: "Jurisdiction",
  single_choice: "Choice",
  multi_choice: "Several choices",
  date: "Date",
  free_text: "Typed answer",
  free_text_list: "Typed list",
};

/** What each answer does to the contract. */
const SHAPES: Record<string, string> = {
  C1a: "Governing law and courts; the registration label (UEN, Company Number …)",
  C1b: "Different place from the Company → flagged (tax, permits, employee status)",
  C2: "Parties and signature block: an individual, or a company (number, signatory)",
  C3: "Obligations clause, (a)–(d) each in or out",
  C4: "Exclusivity clause; exclusive → flagged as a mark of employment",
  C5: "Representation of no conflicting commitments in or out",
  C6: "Expenses clause: Contractor bears, or Company reimburses pre-approved",
  C7: "IP clause: full assignment, or licence to the Company",
  C8a: "Term clause: until completion, fixed end date (C8b), or until terminated",
  C9a: "Termination clause: notice (C9b days), payment in lieu, or none ⚑",
  C10: "Termination for cause, grounds (a)–(g) each in or out",
  C11: "Remedies on breach: immediate termination, damages, replacement",
  C12: "Continuing obligations: data return, non-disparagement",
  C13a: "Restrictive covenants in or out ⚑; C13b months; C13c territory — “worldwide” refused",
  C14: "Probation clause in or out ⚑ (flagged as a mark of employment)",
  C15: "Confidentiality duration; none → flagged",
  C16: "Data clause; GDPR places flagged (consent is not the right basis)",
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
  const d = q.defaultValue;
  if (d === undefined || d === null) return "—";
  const label = (x: string) => (x === "same" ? "Same as the Company" : q.options.find((o) => o.value === x)?.label ?? x);
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "people" } | { kind: "job" };

export default function ContractorQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "C1b") rows.push({ kind: "people" }, { kind: "job" });
  }
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The parties and the engagement";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className={`badge ${MASTER_LOADED ? "green" : ""}`}>
          {MASTER_LOADED ? `Live — questionnaire v${CONTRACTOR_QUESTIONNAIRE.version} · master ${MASTER_VERSION}` : `Beta — questionnaire v${CONTRACTOR_QUESTIONNAIRE.version} · master not loaded`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The contractor agreement asks the firm&rsquo;s fifteen questions (TF Qns, 11 March 2025, proposed
          amendments), built into the assembler. {MASTER_LOADED
            ? "The answers switch clauses of the FD Master Contractor Agreement on and off."
            : "Until the FD Master Contractor Agreement is uploaded (AI files → Contractor Agreements) and transcribed, FD AI saves the answers and the points for the lawyer, and the firm sends the draft by hand; no credit is taken."}
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
                          {r.q.allowSame && <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>+ Same as the Company</span>}
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
                            <span>{r.kind === "people" ? "Who are the Company and the Contractor?" : "Tell me about the engagement."}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "people"
                                ? "Company: legal name*, registration number, address, signatory (name, title, email). Contractor: name*, address, passport/ID number or company number and signatory, email. The Company is filled from Settings."
                                : "The services*, fee and currency, per month/day/hour/project/milestone, payment terms, start date, working arrangement, where the work is done, other benefits."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "people" ? "Party details" : "Engagement details"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "people" ? "The parties and the signature blocks" : "The schedule of services and the fee"} — anything blank is [●]
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
        <span className="badge">Master menu — which answer reaches which clause</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          The clauses the questionnaire expects to find in the FD Master Contractor Agreement. When the master is uploaded,
          FD checks this map against it and the clauses are transcribed into the assembler.
        </span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 160 }}>Question</th>
              <th style={{ width: 220 }}>Clause id in the master</th>
              <th>What the answer decides</th>
            </tr>
          </thead>
          <tbody>
            {MASTER_MENU.map((m) => (
              <tr key={m.question}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{m.question}</td>
                <td><code style={{ fontSize: 11 }}>{m.clause}</code></td>
                <td style={{ fontSize: 12 }}>{m.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
