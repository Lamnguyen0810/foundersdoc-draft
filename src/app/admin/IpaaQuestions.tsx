"use client";

import { Fragment } from "react";
import { IPAA_QUESTIONNAIRE } from "@/lib/ipaa/data/questionnaire";
import { MASTER_VERSION } from "@/lib/ipaa/data/master";
import { ALL_QUESTIONS, defaultsBy, LEVELS, levelsOf, showIf, type Condition, type Question } from "@/lib/ipaa/questions";

/**
 * The IP assignment agreement's questions, as the user meets them —
 * read-only, as the loan agreement's are.
 *
 * The FD Lite question bank's two pathways (the Recipient's and the
 * Creator's), with the questions the document needs added, on the FD Lite
 * menu's three levels. Where the usual answer depends on the user's side,
 * both are shown, and so is the level at which each question is asked.
 */

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
  scale: "Slider",
};

/** What each answer does to the contract. */
const SHAPES: Record<string, string> = {
  IP0: "Which questions are asked and which clauses go in: Basic (assignment, moral rights, perfection, confidentiality), Standard (+ IP licence, independent advice), Complex (+ distribution of IP rights, right to sue, scope of licence, warranties, completion, permitted disclosure)",
  IP1: "The side's usual answers below (licence back, exclusivity, warranties, knowledge qualifier); the user's own party box is filled from the company profile",
  IP2: "Governing law, third-party rights statute, the moral rights law, courts or arbitration, the title guarantee (England and Wales) and the deed signature blocks; US law: no deed, consideration recited, work made for hire",
  IP2a: "The governing law (own wording); the jurisdiction entries are left as [●] and flagged",
  IP3: "Recital (A) — the Recipient's pathway; whether the Creator's box starts as an individual or a company; employee flag",
  IP3a: "Recital (A), own wording",
  IP4: "Recital (A) — the Creator's pathway; whether the Creator's box starts as an individual or a company",
  IP4a: "Recital (A), own wording",
  IP5: "Template: the Recipient's details may be left [●]; the usual project kind and ownership",
  IP6: "Contributors clause (assignments and moral rights waivers from anyone else who contributes); the Recipient's own contributions are the Recipient's",
  IP7: "Schedule 1 lines (software, artwork, proprietary information, other); source code in Completion; patent flag",
  IP7a: "Schedule 1, own wording",
  IP8: "The Project definition and Schedule 1",
  IP9: "Project Period (one-off, fixed months, ongoing, collaboration); recital (A) for a collaboration",
  IP9a: "Project Period in months",
  IP10: "Return of Information clause when information is handed over (yes or maybe)",
  IP11: "Recipient's pathway, Complex: the Recipient owns (assignment), joint ownership (an undivided share assigned + Joint Ownership clause) or the Creator owns (Grant of Licence) — title of the document follows",
  IP11a: "Grant of Licence: perpetual and royalty-free for the business, or limited to the Project",
  IP12: "Creator's pathway, Complex: the same three owners, with the licence back (any purpose or portfolio) or the licence to the Recipient (perpetual or limited) in one answer",
  IP12a: "Buy-Back Option at fair market value (independent valuer)",
  IP13: "Distribution of IP Rights: the shares", IP13a: "The creator's percentage",
  IP14: "Grant of Licence to Use Assigned IP Rights (portfolio, or any purpose); Scope of Licence at Complex; the Work Product's confidentiality exception",
  IP15: "Scope of Licence (a): exclusive, sole or non-exclusive",
  IP16: "Fee and Taxes clauses; no fee → signed as a deed (not under US law)",
  IP16a: "Fee currency", IP16b: "Fee amount (in figures and words)",
  IP17: "Warranties: ownership, non-infringement, validity, originality",
  IP17a: "\"so far as the Creator is aware, having made reasonable enquiries\" on non-infringement and validity",
  IP18: "Governing Law & Dispute Resolution: courts or arbitration (consultation or mediation for 30 days first)",
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

const LEVEL_NAME: Record<string, string> = { basic: "Basic", standard: "Standard", complex: "Complex" };

/** At which levels a question is asked, and what the others set. */
function levelText(q: Question): string {
  const { asked, fixed } = levelsOf(q.id);
  if (asked.length === LEVELS.length) return "All levels";
  const label = (x: unknown) => (x === "" ? "blank" : (q.options.find((o) => o.value === x)?.label ?? String(x)).split(" – ")[0]);
  const others = LEVELS.filter((l) => !asked.includes(l)).map((l) => `${LEVEL_NAME[l]}: ${l in fixed ? label(fixed[l]) : "usual answer"}`);
  return `${asked.map((l) => LEVEL_NAME[l]).join(", ")} · not asked at ${others.join("; ")}`;
}

type Row = { kind: "q"; q: Question } | { kind: "parties" };

export default function IpaaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "IP6") rows.splice(rows.length - 1, 0, { kind: "parties" });
  }
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === "q" ? r.q.section : "The people";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.rows.push(r);
    else sections.push({ name, rows: [r] });
  }
  let n = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">
          {`Live — questionnaire v${IPAA_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · creator or recipient, Basic / Standard / Complex, any law`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The FD Lite question bank&rsquo;s two pathways — the recipient&rsquo;s and the creator&rsquo;s — with the questions the
          document needs added (the governing law in place of the Singapore-only check, the description of the work, the fee, the
          licence back and the warranties). The user first picks a level (IP0): Basic and Standard assign the IP 100% to the
          recipient; Complex adds joint ownership or the creator keeping the IP under licence. A question not asked at a level takes its
          usual answer or the one shown. Where no fee is paid the document is signed as a deed (not under US law).
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
                        <td style={{ fontSize: 12 }}>
                          {when(showIf(r.q.id))}
                          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>{levelText(r.q)}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>{defaultText(r.q)}</td>
                        <td style={{ fontSize: 12 }}>{SHAPES[r.q.id] ?? "—"}</td>
                      </tr>
                    ) : (
                      <tr key={r.kind}>
                        <td className="sub-no">{stepNo}.{i + 1}</td>
                        <td>
                          <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                            <span>Who are the Creator and the Recipient?</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              Each party — an individual or a company (the Creator&rsquo;s starts from IP3 / IP4) — name*, registration or ID number, place of incorporation, address, email, and for a company who signs. The user&rsquo;s own side is filled from the company profile. For a creator&rsquo;s template only the creator&rsquo;s name is needed.
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>parties</code></td>
                        <td><span className="pill">Party boxes</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>Parties, Notices, signature blocks (as a deed or an agreement) — anything blank is [●]</td>
                      </tr>
                    ),
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

    </>
  );
}
