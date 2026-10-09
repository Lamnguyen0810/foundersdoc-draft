"use client";

import { Fragment } from "react";
import { COFOUNDER_QUESTIONNAIRE } from "@/lib/cofounder/data/questionnaire";
import { MASTER_LOADED, MASTER_MENU, MASTER_VERSION } from "@/lib/cofounder/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/cofounder/questions";

/**
 * The co-founder agreement's questions, as the founders meet them —
 * read-only, as the contractor agreement's are (ContractorQuestions.tsx).
 *
 * They are the firm's "FDL CFA I TF Questions" (4 June 2025, 25 questions)
 * with the June 2025 bug-test changes. Beneath the list: the master menu —
 * which answer reaches which clause of the FD Master Co-Founders Agreement —
 * for FD to check against the master when it is uploaded.
 */

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
};

/** What each answer does to the contract. */
const SHAPES: Record<string, string> = {
  F1: "Number of parties and signature blocks (pro tip: no more than 3) ⚑ over 3",
  F2: "1.2 Interpretation and 3.3 Decision-making: CEO, Co-Founders by majority, Board or shareholders",
  F3: "2.1(a) Conditions to recognition; None → the no-conditions wording. Capital with no investment (F4) ⚑",
  F3a: "2.1(a)(C) the other condition, as typed",
  F4: "2.1 Initial Capital: subscription of shares, a loan, or external funding",
  F5: "2.3 Initial Working Structure; part-time with a conflict clause (F17) ⚑",
  F6: "3.1 Board Appointment Rights; reminder of the resident-director rule (s 145 Companies Act)",
  F7: "3.4 Reserved Matters, listed (a), (b) … ; none ⚑",
  F8: "3.6 Deadlock; an even split, voting and good faith only ⚑",
  F9: "3.6 Deadlock buy-out price; S$1 ⚑",
  F9a: "The agreed valuation method or fixed price, as typed",
  F10: "4.1 Vesting Structure (reverse vesting); other ⚑",
  F10a: "4.1 the time-based schedule and cliff",
  F10b: "4.1 deliverables or milestones per Co-Founder",
  F11: "Share Transfers; freely transferable ⚑",
  F12: "Share Issuances: pre-emption, identified recipient, Board approval",
  F13: "5.1 Performance Contributions — who decides under-performance",
  F14: "5.4 Failure to Contribute; No Buy-out Option takes the clause out; S$1 ⚑",
  F14a: "The agreed valuation method or fixed price, as typed",
  F15: "6.2 Mutual Rights and Obligations",
  F16: "Restrictive Covenants: none, or 3 months (shares- or Founder-based), Board can waive",
  F17: "Conflict of Interest in or out",
  F18: "Non-Disparagement in or out",
  F19: "7.1 Good Leaver; keeps shares with F21 keeps ⚑",
  F20: "7.2 Bad Leaver causes",
  F21: "7.2 Bad Leaver terms; S$1 or free ⚑",
  F22: "Sale of the Company clause in or out",
  F23: "9.2 Confidentiality duration; none ⚑",
  F24: "IP Assignment; documented separately ⚑ (red)",
  F25: "8.4 Winding Up clause in or out",
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
  const label = (x: string) => (q.options.find((o) => o.value === x)?.label ?? x).split(" – ")[0];
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "people" } | { kind: "shares" };

export default function CofounderQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "F1") rows.push({ kind: "people" }, { kind: "shares" });
  }
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The Co-Founders";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className={`badge ${MASTER_LOADED ? "green" : ""}`}>
          {MASTER_LOADED ? `Live — questionnaire v${COFOUNDER_QUESTIONNAIRE.version} · master ${MASTER_VERSION}` : `Beta — questionnaire v${COFOUNDER_QUESTIONNAIRE.version} · master not loaded`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The co-founder agreement asks the firm&rsquo;s twenty-five questions (FDL CFA I TF Questions, 4 June
          2025, with the June 2025 bug-test changes), built into the assembler. {MASTER_LOADED
            ? "The answers switch clauses of the FD Master Co-Founders Agreement on and off."
            : "Until the FD Master Co-Founders Agreement and its clause sheet are uploaded (AI files → Co-Founder Agreements) and transcribed, FD AI saves the answers and the points for the lawyer, and the firm sends the draft by hand; no credit is taken."}
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
                            <span>{r.kind === "people" ? "Who are the co-founders, and what is the company?" : "How will the shares be split at the start?"}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "people"
                                ? "One box per Co-Founder (as many as F1): full name* (at least two), NRIC/passport, nationality, address, title, role, email. The company: legal or proposed name, UEN, address, the business in a line — filled from Settings."
                                : "Name, role, percent — one line per Co-Founder to start (an equal split), plus any other shareholder. A total other than 100% is flagged."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "people" ? "Party details" : "Shareholding table"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "people" ? "Preamble, recitals, 5.1 roles and the signature blocks" : "2.1(b) Initial Shareholding Allocation"} — anything blank is [●]
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
          The clauses the questionnaire expects to find in the FD Master Co-Founders Agreement (clause numbers from the June
          2025 bug tests). When the master is uploaded, FD checks this map against it and the clauses are transcribed into
          the assembler.
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
