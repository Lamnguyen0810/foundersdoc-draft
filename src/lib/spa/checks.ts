/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { num } from "./assemble";
import { applyDefaults, picks, problemWith, questionsFor, sellerCount } from "./questions";
import type { Answers, Flag, Party, Seller, Target } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  SP0: "Beta: built from a precedent",
  SP1: "Fewer sellers named than stated",
  SP2: "Shares or price missing",
  SP3: "More shares sold than issued",
  SP4: "Not the whole company",
  SP5: "Title-only warranties",
  SP6: "Long non-compete",
  SP7: "Cap above the price",
  SP8: "Deposit with no gap before Closing",
  SP9: "Answer that cannot be used",
  SP10: "Stamp the transfer",
  SP11: "No conditions, no due diligence",
  SP21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, target: Target, buyer: Party, sellersIn: Seller[]): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const sellers = sellersIn.filter((s) => str(s.name));

  flags.push({
    level: "yellow",
    scenario: "SP0",
    reason: "The Share Purchase Agreement is in Beta. It is assembled from a Founders Doc precedent (a buyer-side SPA, generalised), not yet from an approved FD Lite master. Have a lawyer read it in full before it is signed.",
  });

  const stated = sellerCount(a);
  if (sellers.length < stated) {
    flags.push({ level: "yellow", scenario: "SP1", reason: `${stated} sellers were stated, but ${sellers.length} ${sellers.length === 1 ? "is" : "are"} named. Every seller must be a party and sign, or their shares are not sold.`, field: "P1" });
  }

  const gaps = sellers.filter((s) => !Number.isFinite(num(str(s.shares))) || !Number.isFinite(num(str(s.price)))).map((s) => s.name);
  if (gaps.length) {
    flags.push({ level: "yellow", scenario: "SP2", reason: `No number of shares or price (as a plain number) for ${gaps.join(", ")}: Schedule 2 shows [●] there and the total price cannot be worked out. Fill it in before signing.`, field: "sellers" });
  }

  const sold = sellers.reduce((t, s) => t + (num(str(s.shares)) || 0), 0);
  const issued = num(str(target.issued_shares));
  if (Number.isFinite(issued) && sold > issued) {
    flags.push({ level: "red", scenario: "SP3", reason: `The sellers are selling ${sold.toLocaleString("en-GB")} shares, but the company has only ${issued.toLocaleString("en-GB")} issued shares. One of the figures is wrong.`, field: "target" });
  } else if (Number.isFinite(issued) && str(a.P3) !== "part" && sold > 0 && sold < issued) {
    flags.push({ level: "yellow", scenario: "SP4", reason: `The buyer is said to be buying the whole company, but the sellers named hold ${sold.toLocaleString("en-GB")} of its ${issued.toLocaleString("en-GB")} issued shares. Add the missing sellers, or answer that only some shares are sold.`, field: "P3" });
  }

  if (str(a.P14) === "title") {
    flags.push({ level: "yellow", scenario: "SP5", reason: "The sellers promise only that they own the shares. The buyer takes the business as it is — its accounts, contracts, tax and disputes — with no claim if something is wrong. Usual only for a small stake or after full due diligence.", field: "P14" });
  }

  const restraints = picks(a, "P19").filter((r) => r !== "none");
  if (restraints.length && str(a.P19a) === "3") {
    flags.push({ level: "yellow", scenario: "SP6", reason: "A three-year restriction after Closing. Singapore courts enforce restraints only as far as reasonably necessary to protect the goodwill bought; longer periods are more often accepted on a sale of a business than in employment, but two years is safer.", field: "P19a" });
  }

  const capPct = Number(str(a.P16a).replace(/%/g, ""));
  if (str(a.P16) === "pct" && Number.isFinite(capPct) && capPct > 100) {
    flags.push({ level: "yellow", scenario: "SP7", reason: `The sellers' liability is capped at ${capPct}% of the price — more than they receive. Check this is intended.`, field: "P16a" });
  }

  const conditions = picks(a, "P7").filter((c) => c !== "none");
  if (str(a.P5) === "deposit" && conditions.length === 0) {
    flags.push({ level: "yellow", scenario: "SP8", reason: "A deposit is paid on signing, but signing and Closing happen together, so the deposit serves no purpose. Pay the whole price at Closing, or add conditions.", field: "P5" });
  }
  if (conditions.length === 0 && str(a.P14) !== "title") {
    flags.push({ level: "green", scenario: "SP11", reason: "Signing and Closing happen together, with no due diligence condition. Make sure the buyer has finished its checks before signing: the warranties are its only protection afterwards.", field: "P7" });
  }

  flags.push({
    level: "green",
    scenario: "SP10",
    reason: "Stamp duty on the share transfer must be paid (e-Stamping with IRAS) within 14 days after the transfer is signed in Singapore, or a penalty applies. The transfer is then lodged with ACRA.",
    user_message: "Reminder: stamp the share transfer with IRAS within 14 days of signing.",
    field: "P20",
  });

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "SP9", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }

  void buyer;
  return { flags };
}
