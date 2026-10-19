"use client";

import { Fragment } from "react";
import { JVA_QUESTIONNAIRE } from "@/lib/jva/data/questionnaire";
import { MASTER_VERSION } from "@/lib/jva/data/master";
import { ALL_QUESTIONS, defaultsBy, LEVELS, levelsOf, showIf, type Condition, type Question } from "@/lib/jva/questions";

/**
 * The joint venture agreement's questions, as the user meets them —
 * read-only, as the IP assignment agreement's are.
 *
 * Built from a joint venture set-up checklist, on three levels. Where the
 * usual answer depends on the user's side (majority or minority), both are
 * shown, and so is the level at which each question is asked.
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
  JV0: "Which questions are asked and which clauses go in: Basic (company, shares, board, short reserved list, deadlock meet-and-mediate, first refusal, pre-emption, confidentiality), Standard (+ funding, Schedule 2 reserved matters, business plan, information, dividends, buy-out or winding up on deadlock, lock-in, default at fair value, restrictions, deed of adherence), Complex (+ tag/drag, default discount, anti-corruption)",
  JV1: "Recital (B), Shareholdings, board make-up, chair and casting vote, the deadlock trigger (50:50: two tied meetings; majority: a refused Reserved Matter), tag/drag",
  JV1a: "Party A's percentage; Party B holds the rest (Recital (B), Shareholdings, Schedule 1); flags at 75%+",
  JV2: "The side's usual answers (casting vote, reserved matters, tag/drag); which party box is the user's (minority = Party B)",
  JV3: "Governing law, constitution name, Business Day city, mediation centre, arbitration or courts, third-party rights statute, who appoints the valuer; US: shares of common stock, stock ledger",
  JV3a: "The governing law (own wording); the jurisdiction entries are left as [●] and flagged",
  JV4: "Recital (A) and the Incorporation clause (new company), Completion timing",
  JV4a: "Recital (A), Deed of Adherence, the draft's title", JV4b: "Recital (A)",
  JV5: "Business definition (also what the parties must not compete with)",
  JV6: "Currency of the investments, funding cap and borrowing limit",
  JV7: "Subscription clause and Schedule 1 (50:50: the same for each party)", JV7a: "Party B's subscription price",
  JV8: "Further Funding: voluntary (pre-emption or loan) or binding up to a cap, with Failure to Fund (dilution)", JV8a: "The cap per party",
  JV9: "Board: one or two directors each", JV10: "Board: 2–1, 3–1 or 3–2",
  JV11: "Chair: chosen at each meeting, no casting vote; or rotating yearly with a casting vote (not on Reserved Matters)",
  JV12: "Chair appointed by Party A, with or without a casting vote",
  JV13: "Reserved Matters list (inline at Basic, Schedule 2 above); the first five always included", JV13a: "The borrowing limit in Schedule 2",
  JV14: "Deadlock: after senior people and mediation, dropped / buy-out (\"shotgun\") / winding up",
  JV15: "Transfers: right of first refusal or consent", JV16: "Lock-In clause (group transfers still allowed)",
  JV17: "Tag-Along and Drag-Along clauses (majority shape only)",
  JV18: "Default: Option to Buy at Fair Value, or 80% of Fair Value; Fair Value clause (independent accountants)",
  JV19: "Non-Competition and Non-Solicitation, during or during + 12 months; Reasonableness",
  JV20: "Dividend Policy: distribute what can be spared, or reinvest", JV21: "Anti-Corruption clause",
  JV22: "Governing Law & Dispute Resolution: courts or arbitration (consultation or mediation for 30 days first); deadlock excluded",
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

export default function JvaQuestions() {
  const rows: Row[] = [];
  for (const q of ALL_QUESTIONS) {
    rows.push({ kind: "q", q });
    if (q.id === "JV4") rows.splice(rows.length - 1, 0, { kind: "parties" });
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
          {`Live — questionnaire v${JVA_QUESTIONNAIRE.version} · wording ${MASTER_VERSION} · 50:50 or majority, Basic / Standard / Complex, any law`}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. Built from a joint venture set-up checklist. The user first picks a level (JV0), then 50:50 or a majority
          (with a majority, Party A is the majority party and the user says which side they are on). A question not asked at a level
          takes its usual answer or the one shown. Always an agreement, not a deed. The constitution should be amended to match.
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
                            <span>Who are the two parties?</span>
                            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                              Party A and Party B — each an individual or a company — name*, registration or ID number, place of incorporation, address, email, and for a company who signs. The user&rsquo;s own side is filled from the company profile (Party B for a minority partner).
                            </span>
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>parties</code></td>
                        <td><span className="pill">Party boxes</span></td>
                        <td style={{ fontSize: 12 }}>Always</td>
                        <td style={{ fontSize: 12 }}>—</td>
                        <td style={{ fontSize: 12 }}>Parties, Notices, signature blocks, Schedule 1; companies add Affiliates and group transfers, individuals add death or incapacity as a default event — anything blank is [●]</td>
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
