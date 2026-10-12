"use client";

import { Fragment } from "react";
import { SERVICES_QUESTIONNAIRE } from "@/lib/services/data/questionnaire";
import { ADAPTATIONS, CORRECTIONS, MASTER_VERSION, SECTIONS } from "@/lib/services/data/master";
import { ALL_QUESTIONS, defaultsBy, showIf, type Condition, type Question } from "@/lib/services/questions";

/**
 * The services agreement's questions, as the user meets them — read-only,
 * as the investment agreement's are.
 *
 * There is no FD Lite question bank: the questions are the choices that
 * differ between the two precedents (a platform service agreement and an
 * advisory services agreement) and FD AI's review of them from both sides.
 * Where the usual answer depends on the user's side, both are shown.
 * Beneath the list: what was generalised, the FD supplementary wording and
 * the precedents' slips fixed.
 */

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
};

/** What each answer does to the contract. */
const SHAPES: Record<string, string> = {
  SV1: "The structure: platform (access, Authorised Users, Customer Data, service changes and levels, Outputs — precedent A) or professional (standard of work, deliverables, Background IP, retainer / fixed / hourly / success fee — precedent B)",
  SV2: "Picks the provider's or the customer's version of: invoices and disputes, suspension, subcontracting, warranties, Outputs, assignment, refunds and data export on termination; and the side's usual answers below",
  SV3: "S$ or US$ in Schedule 2 and the cap; interpretation rule",
  SV4: "Recital (A) and Schedule 1",
  SV4a: "Schedule 1 deliverables; the Deliverables clause (acceptance — provider; rejection — customer, FD); conformity warranty (customer, FD)",
  SV5s: "Definition of Commencement Date", SV5t: "Definition of Commencement Date (own wording)",
  SV5: "Term (Initial Term, or until the Services are completed)", SV5a: "Term",
  SV6: "Renewal: automatic 12-month Renewal Periods unless 30 days' notice, or only by agreement",
  SV7: "Schedule 2 Subscription Fee", SV7a: "Schedule 2 billing", SV7b: "Schedule 2 Usage Fees", SV7c: "Schedule 2 Usage Fees (own wording)", SV7d: "Schedule 2 Set-up Fee",
  SV8: "Schedule 2: fixed fee, retainer, hourly rate, or retainer and Success Fee", SV8a: "Schedule 2 amount", SV8b: "Schedule 2 payment of the fixed fee",
  SV8c: "Schedule 2 fee cap", SV8d: "Schedule 2 Success Fee (own wording; flagged)",
  SV9: "Invoices clause and Schedule 2 payment terms",
  SV10: "Late Payment (1% a month — precedent B)",
  SV11: "Fee Increases: on notice for a renewal with a right to leave, proposed only if agreed, or only by agreement (review)",
  SV12: "Service Levels and Schedule 1 Part 2 (99.5%, support hours, P1–P3 — review), or Availability (efforts only)",
  SV13: "Changes to the Services: unrestricted (precedent A), 30-day material-reduction exit (provider review), or consent (customer review)",
  SV15: "Deliverables IP: assigned on payment with Background IP licensed, or retained with a perpetual licence (both FD)",
  SV16: "Cap amount: 12 months' fees (A), all fees paid (B and review) or a fixed amount", SV16a: "Cap amount",
  SV17: "Cap: the Service Provider's only, or each Party's (with the Customer's fees and indemnity carved out)",
  SV18: "Indemnities: broad customer indemnity outside the cap (A, provider review), narrow (customer review), or narrow plus the provider's IP indemnity (FD); conduct of claims (FD)",
  SV19: "Time Limit for Claims: 6 months from the event (A) or 12 months from knowledge (customer review), or none",
  SV20: "Insurance: provider's PI and public liability (FD) or the customer's (A), or none",
  SV21: "Non-Solicitation: the customer only (A) or mutual (FD), 12 months, 6-month carve-out",
  SV22: "Termination for Convenience: 30 days (B) or 3 months (A), not before the Initial Term ends for a platform; or none",
  SV23: "Governing law: Singapore courts (both precedents) or SIAC arbitration",
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
    return Object.entries(by.map).map(([k, v]) => `${k === "provider" ? "Provider" : k === "customer" ? "Customer" : k === "platform" ? "Platform" : k === "professional" ? "Professional" : k}: ${label(v)}`).join(" · ");
  }
  const d = q.defaultValue;
  if (d === undefined || d === null) return "—";
  const label = (x: string) => (q.options.find((o) => o.value === x)?.label ?? x).split(" – ")[0];
  return Array.isArray(d) ? d.map((x) => label(String(x))).join(", ") : label(String(d));
}

type Row = { kind: "q"; q: Question } | { kind: "parties" };

export default function ServicesQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "SV3") rows.push({ kind: "parties" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd || s.fd).map((c) => c.text.match(/^\*\*(.+?)\.\*\*/)?.[1] ?? c.id));
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The services";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Beta — questionnaire v${SERVICES_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · platform and professional services, provider or customer`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. There is no FD Lite question bank for the services agreement: the questions are the choices that
          differ between the two precedents (A: a platform service agreement, with FD AI&rsquo;s review of it for each side; B:
          an advisory services agreement), and the wording is theirs, generalised. Redacted copies go in AI files.
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
                            <span>Who are the Service Provider and the Customer?</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              Two boxes, the user&rsquo;s own side filled from the company profile: company or individual, name*, UEN or ID, where incorporated, address, notice email, signatory and title.
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
        <span className="badge">Where a precedent clause was generalised — for FD review</span>
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
          Wording in neither precedent, written in their style for the answers given: {fdClauses.join(", ")}; and the
          customer&rsquo;s Outputs, refund and data-export rights on termination.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the precedents, fixed</span>
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
