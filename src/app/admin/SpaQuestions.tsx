"use client";

import { Fragment } from "react";
import { SPA_QUESTIONNAIRE } from "@/lib/spa/data/questionnaire";
import { ADAPTATIONS, CORRECTIONS, MASTER_VERSION, REMOVED, SECTIONS } from "@/lib/spa/data/master";
import { ALL_QUESTIONS, showIf, type Condition, type Question } from "@/lib/spa/questions";

/**
 * The share purchase agreement's questions, as the user meets them —
 * read-only, as the SHA's are.
 *
 * There is no firm SPA question bank yet: these were written for FD AI from
 * the one precedent. Beneath the list: what was taken out of the precedent,
 * how its clauses were reworded to stand alone, the FD supplementary
 * wording, and the precedent's slips fixed in transcription.
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
        if (/^P\d+[a-z]?$/.test(q)) out[q] = [out[q], `${c.title}${c.fd ? " (FD)" : ""}`].filter(Boolean).join("; ");
      }
    }
  }
  out.P2 = "Buyer party; Buyer's warranties (Part C); Buyer's board approval at Closing";
  out.P3 = "Recitals (B) and (D); Sale Shares; Part A 3.2; handover deliverables and covenant";
  out.P4 = "Currency of the price and of the Part B thresholds";
  out.P5a = "Payment (a)/(b)"; out.P5b = "Payment (b)"; out.P5c = "Payment (a); refund of the Deposit (FD)";
  out.P7 = "Conditions (a)–(g); the whole Conditions, Pre-Closing and Termination sections drop with \u201cNone\u201d";
  out.P7a = "Schedule 4 (Key Personnel); definition of Key Personnel";
  out.P12 = "Sellers' deliverable: resignation letters";
  out.P13 = "Sellers' deliverable: deed of waiver of claims (FD)";
  out.P14 = "Schedule 3 Part B (all 17 groups of business warranties) in or out";
  out.P15a = "Survival: second sentence";
  out.P16a = "Limitation (FD)";
  out.P18a = "Specific Indemnities (b)";
  out.P19a = "Restrictions: period";
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

type Row = { kind: "q"; q: Question } | { kind: "target" } | { kind: "parties" };

export default function SpaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "P2") rows.push({ kind: "target" });
    if (q.id === "P4") rows.push({ kind: "parties" });
  }
  const fdClauses = SECTIONS.flatMap((s) => s.clauses.filter((c) => c.fd || s.fd).map((c) => c.title));
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
          {`Beta — questionnaire v${SPA_QUESTIONNAIRE.version} · wording ${MASTER_VERSION}`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. There is no FD Lite SPA master or question bank yet: the questions were written for FD AI, and the
          agreement is assembled from the firm&rsquo;s one SPA precedent (a buyer-side draft, November 2024), redacted and
          generalised for one to five sellers. Everything below is for FD to review before the Beta label comes off.
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
                            <span>{r.kind === "target" ? "Tell me about the company whose shares are being sold." : "Who is buying, and who is selling?"}</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              {r.kind === "target"
                                ? "Legal name*, UEN, address, the business in a line, total issued shares, issued share capital, latest accounts date, directors."
                                : "The buyer (individual or company*) and one box per seller (as many as P1; at least one name*): name, NRIC/passport or company no., where incorporated, address, email, signatory if a company, shares sold, price."}
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.kind}</code></td>
                        <td><span className="pill">{r.kind === "target" ? "Company details" : "Party boxes"}</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>
                          {r.kind === "target" ? "Recital (A), Business, Schedule 1, Accounts Date" : "Parties, notices, Schedule 2 (shares and price), the total Consideration, signature blocks"} — anything blank is [●]
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
        <span className="badge">Taken out of the precedent (deal-specific)</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <tbody>
            {REMOVED.map((r, i) => (
              <tr key={i}>
                <td style={{ width: 40, fontSize: 12 }}>{i + 1}</td>
                <td style={{ fontSize: 12 }}>{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Reworded to stand on its own — for FD review</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 260 }}>Where</th>
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
          Wording not in the precedent, written in its style for answers the precedent has no clause for: {fdClauses.join(", ")};
          plus the deposit and its refund, the conditions for approvals and third-party consents, the deed of waiver of
          claims, the warranty for a corporate seller or an individual buyer, and court jurisdiction.
        </span>
      </div>

      <div className="questions-status" style={{ marginTop: 18 }}>
        <span className="badge">Slips in the precedent, fixed in transcription</span>
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
