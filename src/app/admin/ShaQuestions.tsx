"use client";

import { Fragment } from "react";
import { SHA_QUESTIONNAIRE } from "@/lib/sha/data/questionnaire";
import { MASTER_CORRECTIONS, MASTER_MENU, MASTER_VERSION, SECTIONS } from "@/lib/sha/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/sha/questions";

/**
 * The shareholders agreement's questions, as the user meets them —
 * read-only, as the contractor agreement's are.
 *
 * They are the firm's "FDL [SHA]: TF Qns" (Final Clean, 24 April 2025,
 * Complex column), with the review's fixes. Beneath the list: the master
 * menu (8 April 2025) against the 14 April master, the FD supplementary
 * wording, and the slips in the master fixed in transcription.
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
        if (/^S\d+[a-z]?$/.test(q)) out[q] = [out[q], `${c.title}${c.fd ? " (FD)" : ""}`].filter(Boolean).join("; ");
      }
    }
  }
  out.S5 = "Shares definition; class column of Table A";
  out.S5a = "Definitions of each class";
  out.S6b = "Table A item: Board of Directors";
  out.S24 = "Table A item (2) Reserved Matters";
  out.S24a = "Reserved matters: borrowings and unbudgeted spend";
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

type Row = { kind: "q"; q: Question } | { kind: "people" } | { kind: "shares" };

export default function ShaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "S4") rows.push({ kind: "people" });
    if (q.id === "S5a") rows.push({ kind: "shares" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd || s.fd).map((c) => c.title));
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The company";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Live — questionnaire v${SHA_QUESTIONNAIRE.version} · master ${MASTER_VERSION} · Complex version only`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The shareholders&rsquo; agreement asks the firm&rsquo;s questions (FDL [SHA]: TF Qns, Final Clean 24
          April 2025), built into the assembler, and FD AI assembles the agreement from the FD Lite SHA master of 14 April
          2025. Standard and Basic are not offered yet: the Master Menu&rsquo;s ticks for them are still to come.
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
                            <span>{r.kind === "people" ? "Tell me about the company, and who signs for it." : "Who are the shareholders?"}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "people"
                                ? "Legal or proposed name*, UEN (if incorporated), address, the business in a line, signatory (name, title, email) — filled from Settings."
                                : "One box per shareholder (as many as S4; at least two names*): founder / investor / other, name, NRIC/passport/company no., address, capital, number and class of shares, email, signatory if a company; CEO Founder, Lead Investor, may appoint a director."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "people" ? "Company details" : "Shareholder boxes"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "people" ? "Party (1), Business, the Company's signature block" : "Parties, Table A item (1), definitions of Founders / Investors / CEO Founder / Lead Investor, signature blocks"} — anything blank is [●]
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
        <span className="badge">Master Menu (8 April 2025) → the 14 April master</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Where each menu item sits in the master FD AI drafts from. Standard and Basic ticks to follow.
        </span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Menu</th>
              <th style={{ width: 280 }}>Item</th>
              <th style={{ width: 200 }}>Clause id</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {MASTER_MENU.map((m) => (
              <tr key={m.menu + m.title}>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{m.menu}</td>
                <td style={{ fontSize: 12 }}>{m.title}</td>
                <td>{m.clause ? <code style={{ fontSize: 11 }}>{m.clause}</code> : "—"}</td>
                <td style={{ fontSize: 12 }}>{m.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">FD supplementary — for FD review</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Wording not in the master, written in its style for answers the master has no clause for: {fdClauses.join(", ")}; plus
          the variants for a different quorum, voting threshold, chairman, pre-emption holders, tag-along holders, death and
          insolvency outcomes, and unanimous amendment.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the master, fixed in transcription</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <tbody>
            {MASTER_CORRECTIONS.map((c, i) => (
              <tr key={i}>
                <td style={{ width: 40, fontSize: 12 }}>{i + 1}</td>
                <td style={{ fontSize: 12 }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
