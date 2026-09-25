"use client";

import { Fragment } from "react";
import { QUESTIONNAIRE } from "@/lib/termsheet/data/questionnaire";

/**
 * The term sheet's questions, as the user meets them — read-only.
 *
 * The NDA's questions live in the database and are edited in the table
 * above. The term sheet's do not: they are the firm's questionnaire.json
 * (v1.0), built into the assembly engine, because its branching (show_if),
 * wording per deal type and default rules drive the assembler directly.
 * This view reads that same file, so what is listed here is exactly what
 * is asked. A change of wording or order is a change to questionnaire.json.
 */

type Raw = Record<string, unknown>;
type Cond = { q?: string; eq?: unknown; in?: unknown[]; not_in?: unknown[]; all?: Cond[]; any?: Cond[] };

const DEALS = QUESTIONNAIRE.deal_types as unknown as { value: string; label: string }[] | Record<string, unknown>;

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Choice",
  multi_choice: "Several choices",
  free_text: "Typed answer",
  free_text_list: "Typed list",
  period_or_date: "Period or date",
  date: "Date",
  country: "Country",
  state_list: "State / province",
  amount: "Amount",
  amount_with_choice: "Amount + choice",
  rate_and_period: "Rate and period",
  yes_no: "Yes / no",
  yes_no_period: "Yes (with period) / no",
};

function list(v: unknown[] | undefined): string {
  return (v ?? []).map(String).join(", ");
}

/** show_if in words: "Q8a is yes or partly, and Q1 is not project". */
function when(c: Cond | undefined): string {
  if (!c) return "Always";
  if (c.all) return c.all.map(when).join(", and ");
  if (c.any) return c.any.map(when).join(", or ");
  if (c.eq !== undefined) return `${c.q} is ${String(c.eq)}`;
  if (c.in) return `${c.q} is ${list(c.in).replace(/, ([^,]*)$/, " or $1")}`;
  if (c.not_in) return `${c.q} is not ${list(c.not_in).replace(/, ([^,]*)$/, " or $1")}`;
  return "—";
}

/** The first wording found: plain, per deal type, or per variant. */
function pick(q: Raw, key: string): { value: string; varies: boolean } {
  if (typeof q[key] === "string" && q[key]) return { value: q[key] as string, varies: false };
  const by = q[`${key}_by_deal_type`] as Record<string, string> | undefined;
  if (by) {
    const v = by.investment ?? by.default ?? Object.values(by)[0];
    return { value: v ?? "", varies: Object.keys(by).length > 1 };
  }
  const variants = q.variants as Record<string, Raw> | undefined;
  if (variants) {
    const first = variants.investment ?? variants.default ?? Object.values(variants)[0];
    const v = first?.[key];
    return { value: typeof v === "string" ? v : "", varies: true };
  }
  return { value: "", varies: false };
}

function optionCount(q: Raw): { n: number; varies: boolean } {
  if (Array.isArray(q.options)) return { n: (q.options as unknown[]).length, varies: false };
  const by = q.options_by_deal_type as Record<string, unknown[]> | undefined;
  if (by) return { n: (by.investment ?? by.default ?? Object.values(by)[0] ?? []).length, varies: true };
  if (q.options_by_subject) return { n: 0, varies: true };
  const variants = q.variants as Record<string, Raw> | undefined;
  if (variants) {
    const first = variants.investment ?? variants.default ?? Object.values(variants)[0];
    const o = first?.options;
    return { n: Array.isArray(o) ? o.length : 0, varies: true };
  }
  return { n: 0, varies: false };
}

function defaultText(d: unknown): string {
  if (d === undefined || d === null) return "—";
  if (typeof d === "object" && d && "rule" in d) {
    const r = (d as { rule: unknown }).rule;
    return Array.isArray(r) ? "Depends on earlier answers" : String(r);
  }
  if (Array.isArray(d)) return d.join(", ");
  const s = String(d);
  const m = /^P(\d+)([DWMY])$/.exec(s);
  if (m) {
    const unit = ({ D: "day", W: "week", M: "month", Y: "year" } as Record<string, string>)[m[2]];
    return `${m[1]} ${unit}${m[1] === "1" ? "" : "s"}`;
  }
  if (/options_by_subject/.test(s)) return "The usual ones for the Q4 answer";
  if (s === "unsure") return "Not sure";
  return s;
}

interface Row {
  id: string;
  section: string;
  text: string;
  textVaries: boolean;
  help: string;
  type: string;
  typeVaries: boolean;
  options: { n: number; varies: boolean };
  other: boolean;
  required: boolean;
  when: string;
  def: string;
}

function rows(): Row[] {
  const out: Row[] = [];
  const add = (q: Raw, section: string) => {
    const t = pick(q, "text");
    const ty = pick(q, "type");
    const variants = q.variants as Record<string, Raw> | undefined;
    out.push({
      id: String(q.id),
      section,
      text: t.value || "(wording set per deal type)",
      textVaries: t.varies,
      help: pick(q, "help").value,
      type: ty.value || "free_text",
      typeVaries: ty.varies,
      options: optionCount(q),
      other: Boolean(q.allow_other ?? (variants && Object.values(variants).some((v) => v.allow_other))),
      required: Boolean(q.required),
      when: when(q.show_if as Cond | undefined),
      def: defaultText(q.default),
    });
  };
  for (const raw of QUESTIONNAIRE.questions as unknown as Raw[]) {
    add(raw, String(raw.section ?? ""));
    const follow = raw.follow_up as Raw | undefined;
    if (follow) add(follow, String(raw.section ?? ""));
  }
  return out;
}

const ROWS = rows();

/* The Parties step is not in questionnaire.json ("not_collected"): the
   drafting screen asks it after Q2, as the NDA does. Shown in place so the
   order here is the order on screen. */
const PARTIES_AFTER = "Q2";

export default function TermQuestions() {
  const sections: { name: string; rows: Row[] }[] = [];
  for (const r of ROWS) {
    const last = sections[sections.length - 1];
    if (last && last.name === r.section) last.rows.push(r);
    else sections.push({ name: r.section, rows: [r] });
  }
  const dealCount = Array.isArray(DEALS) ? DEALS.length : Object.keys(DEALS ?? {}).length;
  let step = 0;

  return (
    <>
      <div className="questions-status">
        <span className="badge green">Live — questionnaire v{QUESTIONNAIRE.version}</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Read-only. The term sheet asks these from the firm&rsquo;s questionnaire.json, built into the assembler: its
          branching, wording for each of the {dealCount} deal types and default rules drive the letter directly. To change a
          question, change questionnaire.json.
        </span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>#</th>
              <th>Question</th>
              <th>ID</th>
              <th>Type</th>
              <th>Asked when</th>
              <th>Default</th>
              <th>Required</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              step += 1;
              const stepNo = step;
              return (
                <Fragment key={sec.name}>
                  <tr className="step-row">
                    <td>{stepNo}</td>
                    <td colSpan={6}>
                      <div className="step-title">
                        <strong>{sec.name}</strong>
                      </div>
                    </td>
                  </tr>
                  {sec.rows.map((r, i) => (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="sub-no">{stepNo}.{i + 1}</td>
                        <td>
                          <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                            <span>{r.text}</span>
                            {r.help && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>{r.help}</span>}
                            {r.textVaries && <span className="badge gray">Wording varies by deal type</span>}
                          </div>
                        </td>
                        <td><code style={{ fontSize: 11 }}>{r.id}</code></td>
                        <td>
                          <span className="pill">{TYPE_LABEL[r.type] ?? r.type}</span>
                          {r.options.n > 0 && (
                            <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>
                              {r.options.n} option{r.options.n === 1 ? "" : "s"}{r.options.varies ? " (varies)" : ""}
                            </span>
                          )}
                          {r.options.n === 0 && r.options.varies && (
                            <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>options follow Q4</span>
                          )}
                          {r.other && <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10.5 }}>+ Other</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{r.when}</td>
                        <td style={{ fontSize: 12 }}>{r.def}</td>
                        <td>{r.required ? <span className="badge green">Required</span> : <span className="badge gray">Optional</span>}</td>
                      </tr>
                      {r.id === PARTIES_AFTER && (
                        <tr>
                          <td className="sub-no">{stepNo}.{i + 2}</td>
                          <td>
                            <div className="filename" style={{ gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
                              <span>Who are the parties?</span>
                              <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>
                                Name, company or individual, country, registration number, address and contact for each party. Your own side is filled from Settings.
                              </span>
                            </div>
                          </td>
                          <td><code style={{ fontSize: 11 }}>parties</code></td>
                          <td><span className="pill">Party details</span></td>
                          <td style={{ fontSize: 12 }}>Always</td>
                          <td style={{ fontSize: 12 }}>—</td>
                          <td><span className="badge green">Required</span></td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
