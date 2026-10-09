"use client";

import { Fragment } from "react";
import { SSA_QUESTIONNAIRE } from "@/lib/ssa/data/questionnaire";
import { CORRECTIONS, MASTER_VERSION, SECTIONS, SOURCES } from "@/lib/ssa/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/ssa/questions";

/**
 * The share subscription agreement's questions, as the user meets them —
 * read-only, as the SPA's are.
 *
 * They are the firm's FD Lite SSA question bank, all three versions.
 * Beneath the list: where each part of the wording comes from (the VIMA
 * model, simplified), the FD supplementary wording, and VIMA's slips fixed.
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
        if (/^SS\d+[a-z]?$/.test(q)) out[q] = [out[q], `${c.title}${c.fd || sec.fd ? " (FD)" : ""}`].filter(Boolean).join("; ");
      }
    }
  }
  out.SS1 = "Which sections exist: Basic (subscription, completion, confidentiality, general); Standard (+ resolutions, warranties); Complex (+ conditions, caps, undertakings, capitalisation, several investors)";
  out.SS2 = "Company party and Recital (A); \u201cNo\u201d stops the draft (red)";
  out.SS3 = "Founders as parties: waiver of pre-emption, warrantors, founder undertakings, signature blocks";
  out.SS3a = "Number of founder boxes"; out.SS4 = "Number of investor boxes; Several Obligations (FD)";
  out.SS5 = "Ranking / Rights; Subscription Shares; \u201cexisting shares\u201d stops the draft (use the SPA)";
  out.SS6b = "Conditions: last item";
  out.SS8 = "Investors' obligations (a): pay, or convert a SAFE / loan (FD)";
  out.SS11 = "Schedule 3 (4 headings)"; out.SS11c = "Schedule 3 (9 headings)";
  out.SS12 = "Limitations on Warranty Claims section"; out.SS12b = "Maximum Liability"; out.SS12d = "Time Limit";
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

export default function SsaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "SS2") rows.push({ kind: "company" });
    if (q.id === "SS5") rows.push({ kind: "people" });
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
          {`Beta — questionnaire v${SSA_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · Basic, Standard and Complex`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The questions are the firm&rsquo;s FD Lite SSA question bank [for investors], all three versions. No FD
          Lite SSA template was available, so the wording follows the Singapore VIMA Model Subscription Agreement,
          simplified to the bank&rsquo;s versions. Upload the FD Lite template to swap it in.
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
                            <span>{r.kind === "company" ? "Tell me about the company issuing the shares, and who signs for it." : "Who are the founders and the investors?"}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "company"
                                ? "Legal or proposed name*, UEN, registered office, the business in a line, issued shares and capital before the investment, signatory (name, title, notice email), bank account for the subscription money."
                                : "One box per founder (as many as SS3a): name, NRIC/passport, address, email. One box per investor (as many as SS4; at least one name*): individual or company, name, ID, where incorporated, address, email, signatory, shares subscribed, amount. The investors' representative, if SS4a is yes."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "company" ? "Company details" : "Party boxes"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "company" ? "Company party, Recital (B), Business, bank details, notices, Schedule 2" : "Parties, Schedule 1 (shares and amounts), Subscription Shares, capitalisation, signature blocks"} — anything blank is [●]
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
        <span className="badge">Where the wording comes from — for FD review</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 320 }}>Part</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((c) => (
              <tr key={c.where}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{c.where}</td>
                <td style={{ fontSize: 12 }}>{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Wording not in the VIMA model (which leaves these blank), written in its style for the bank&rsquo;s answers:{" "}
          {fdClauses.join(", ")}; plus SAFE / loan conversion, the SAFE conversion letter, evidence of the investor&rsquo;s
          authority, the completion certificate, preference share rights and the second anti-bribery warranty.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">VIMA slips and old references, fixed</span>
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
