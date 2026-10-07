"use client";

import { Fragment } from "react";
import { EMPLOYMENT_QUESTIONNAIRE } from "@/lib/employment/data/questionnaire";
import {
  ARBITRATION_TEXT, CONFIDENTIALITY_PERIOD, FIXED_TERM_SENTENCE, IP_SCOPE, MASTER_VERSION, SECTIONS,
} from "@/lib/employment/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/employment/questions";

/**
 * The employment agreement's questions, as the user meets them — read-only,
 * as the term sheet's are (TermQuestions.tsx).
 *
 * They are the firm's questionnaire ("The 10 Questions"), built into the
 * assembler: its branching, defaults and the clauses each answer switches
 * drive the contract directly. Beneath the list: every sentence the
 * assembler can put in that is NOT in the master — wording the
 * questionnaire needs and the master does not have — for FD to sign off.
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
  E1a: "Where the Company is incorporated; the registration label (UEN, Company Number …)",
  E1b: "The governing law and “Employment Act”; public holidays; statutory contributions (CPF in Singapore); courts or arbitration seat. Different place from the employer → flagged",
  E2: "Regular or not sure → a non-compete is left out and statutory protections are flagged",
  E3a: "1.1 Term — fixed term replaces the first sentence ⚑",
  E3b: "Table A “End of Fixed Term”",
  E3c: "Table A “Probation Period”; 1.2 left out if none",
  E3d: "Table A “Probation Period” notice",
  E4a: "Table A “Notice Period for Termination”",
  E4c: "7.2 standard list, or the custom list below",
  E4d: "7.2 (a)… — reworded by FD AI, confirmed by the user; the “at law” ground always stays",
  E5: "7.3 Garden Leave ⚑",
  E6a: "6.1 (a) staff, (b) clients, (c) compete; Clause 6 left out if none; California → all left out",
  E6b: "Table A “Restricted Period” (3 or 6 months; 12 no longer offered)",
  E6c: "6.3(c) Restricted Territory — “worldwide” refused",
  E6d: "6.1(c) industry — “any business” refused",
  E7: "5.2 how long confidentiality lasts (2 or 5 years ⚑)",
  E8a: "11.2, 11.3, 11.5(b) — “all work” scope ⚑",
  E8b: "11.6 Waiver of Moral Rights in or out",
  E9: "2.3(b) and 2.4 — consent, or fully exclusive; the 5% listed-shares proviso",
  E10a: "Clause 9 Privacy Consent in or out; GDPR places flagged",
  E10b: "12.8(b) courts, or arbitration ⚑ — not asked when the employee works in the UK",
  M1: "3.3 Good Leaver and Bad Leaver ⚑",
  M2: "12.5 Rights of Group Companies ⚑ instead of “no third-party rights”",
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
  const label = (x: string) => (x === "same" ? "Same as employer" : q.options.find((o) => o.value === x)?.label ?? x);
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

/** Every piece of wording the assembler can use that is not in the master. */
function supplementary(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const sec of SECTIONS) {
    for (const c of sec.clauses) {
      if (!c.fd) continue;
      const heading = /^\*\*(.+?)\.\*\*/.exec(c.text)?.[1] ?? c.id;
      const body = [c.text, ...(c.subs ?? []).map((s) => `${s.ref ? `${s.ref} ` : ""}${s.text}`)].join("\n");
      out.push({ name: `${sec.heading.charAt(0) + sec.heading.slice(1).toLowerCase()} — ${heading}`, text: body.replace(/\*\*/g, "") });
    }
  }
  out.push({ name: "Term — fixed term (1.1, first sentence)", text: FIXED_TERM_SENTENCE.replace(/\*\*/g, "") });
  out.push({ name: "Governing law — arbitration (12.8(b))", text: ARBITRATION_TEXT });
  for (const k of ["2y", "5y"]) out.push({ name: `Confidentiality — ${k === "2y" ? "2" : "5"} years after (5.2)`, text: `You shall, ${CONFIDENTIALITY_PERIOD[k].text}:` });
  out.push({ name: "Intellectual property — company owns all work (11.2, 11.3)", text: `… created, generated or contributed to by you ${IP_SCOPE.all.own} …` });
  out.push({
    name: "Outside work — fully exclusive (2.3(b), 2.4)",
    text: "“Without the prior written approval of the Company” and “without the prior written consent of the Company” are taken out; 2.4(d) loses its listed-shares proviso.",
  });
  return out;
}

type Row = { kind: "q"; q: Question } | { kind: "people" } | { kind: "job" };

export default function EmploymentQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "E1b") rows.push({ kind: "people" }, { kind: "job" });
  }
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The people and the job";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  const extra = supplementary();
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">Live — questionnaire v{EMPLOYMENT_QUESTIONNAIRE.version} · master {MASTER_VERSION}</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The employment agreement asks the firm&rsquo;s ten questions (and two optional modules), built into the
          assembler: the answers switch clauses of the FD Master Employment Agreement (GENERIC) on and off, so the order,
          defaults and branching are the code&rsquo;s. FD AI only rewords custom dismissal reasons and flags local-law
          points — its rules are the <b>Employment Agreement</b> playbook under AI files. ⚑ = wording not in the master (listed below).
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
                          {r.q.allowSame && <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>+ Same as employer</span>}
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
                            <span>{r.kind === "people" ? "Who are the employer and the employee?" : "Tell me about the job."}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "people"
                                ? "Employer: legal name*, registration number, address, signatory (name, title, email). Employee: name*, address, passport/ID number, email. The employer is filled from Settings."
                                : "Job title*, salary and currency, per month or year, pay day, start date, where based, normal hours, annual leave days."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "people" ? "Party details" : "Job details"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "people" ? "The letter's heading, the parties, signature and acceptance" : "Opening paragraph and Table A"} — anything blank is [●]
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
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          The questionnaire asks for things the master does not cover. This wording fills the gap, in the master&rsquo;s
          style, and is used only when the answer calls for it. It has not been approved by an FD lawyer yet.
        </span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 280 }}>Where</th>
              <th>Wording</th>
            </tr>
          </thead>
          <tbody>
            {extra.map((x) => (
              <tr key={x.name}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{x.name}</td>
                <td style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{x.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
