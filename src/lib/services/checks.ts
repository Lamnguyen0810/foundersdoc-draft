/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { num } from "./assemble";
import { applyDefaults, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Party } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  SV0: "Beta: built from two precedents",
  SV1: "Broad indemnity outside the cap",
  SV2: "Provider free to change the service",
  SV3: "No service levels",
  SV4: "Short time limit for claims",
  SV5: "Only the provider's liability is capped",
  SV6: "Success fee wording",
  SV7: "Fee missing",
  SV8: "Cap may be very low early on",
  SV9: "Answer that cannot be used",
  SV10: "Personal data in the platform",
  SV11: "Deliverables pass to the customer",
  SV12: "No early exit",
  SV13: "Same party on both sides",
  SV21: "Your own wording",
};

export function titleFor(f: Flag): string {
  if (f.title) return f.title;
  if (f.scenario === "FD") return "FD supplementary wording";
  return FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, provider: Party, customer: Party): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const flags: Flag[] = [];
  const platform = str(a.SV1) === "platform";
  const cust = str(a.SV2) === "customer";
  const prov = !cust;

  flags.push({
    level: "yellow",
    scenario: "SV0",
    reason: `The Services Agreement is in Beta. It is built from two precedents (a platform service agreement and an advisory services agreement) and FD AI's review of them, generalised, with the usual answers leaning to the ${prov ? "Service Provider" : "Customer"}. There is no approved FD Lite template yet. Have a lawyer read it in full before it is signed.`,
  });

  if (cust && str(a.SV18) === "broad") {
    flags.push({ level: "yellow", scenario: "SV1", reason: "As the Customer you give a broad indemnity — for your breach, your data or materials, your use of the services and any breach of law — that sits outside the liability cap. Customers usually limit it to third-party claims from their own breach.", field: "SV18" });
  }
  if (cust && platform && str(a.SV13) === "free") {
    flags.push({ level: "yellow", scenario: "SV2", reason: "The provider may change, suspend or discontinue the service on notice, and the Customer has no right to leave if the core service is reduced. Consider the 30-day exit or a consent requirement.", field: "SV13" });
  }
  if (cust && platform && str(a.SV12) !== "standard") {
    flags.push({ level: "yellow", scenario: "SV3", reason: "There is no uptime or support commitment — only commercially reasonable efforts. If the platform matters to the business, ask for service levels.", field: "SV12" });
  }
  if (cust && str(a.SV19) === "6") {
    flags.push({ level: "yellow", scenario: "SV4", reason: "The Customer must bring any claim within six months of the event — shorter than the usual legal time limit, and it runs even if the problem is found later.", field: "SV19" });
  }
  if (cust && str(a.SV17) === "provider") {
    flags.push({ level: "green", scenario: "SV5", reason: "Only the Service Provider's liability is capped; the Customer's is not. Customers usually ask for the cap to apply to both sides.", field: "SV17" });
  }
  if (str(a.SV8) === "retainer_success") {
    flags.push({ level: "yellow", scenario: "SV6", reason: "The success fee is in your own words. Check that it says exactly what triggers it, how it is calculated (gross or net, cash and non-cash) and how long after the agreement ends it can still be earned.", field: "SV8d" });
  }
  const fee = platform ? num(str(a.SV7)) : num(str(a.SV8a));
  if (!Number.isFinite(fee)) {
    flags.push({ level: "yellow", scenario: "SV7", reason: "No fee amount as a plain number: Schedule 2 shows [●]. Fill it in before signing.", field: platform ? "SV7" : "SV8a" });
  }
  if (prov && str(a.SV16) === "fees_12") {
    flags.push({ level: "green", scenario: "SV8", reason: "The cap is the fees paid in the 12 months before a claim — close to nothing for a claim early in the agreement. That favours the provider; the customer may push back.", field: "SV16" });
  }
  if (platform) {
    flags.push({ level: "green", scenario: "SV10", reason: "If the platform will hold personal data, check where it is hosted and whether any of it leaves Singapore; the agreement requires comparable protection for any transfer.", field: "SV1" });
  }
  if (prov && !platform && str(a.SV15) === "assign") {
    flags.push({ level: "green", scenario: "SV11", reason: "The deliverables pass to the Customer once paid for. Make sure nothing you reuse for other clients is built into them outside your Background IP.", field: "SV15" });
  }
  if (str(a.SV22) === "none") {
    flags.push({ level: "green", scenario: "SV12", reason: "Neither side can end the agreement early without a reason — only for breach or insolvency. Check this suits the length of the term.", field: "SV22" });
  }
  const same = (x: string, y: string) => x && y && x.toLowerCase().replace(/[^a-z0-9]/g, "") === y.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (same(str(provider.name), str(customer.name))) {
    flags.push({ level: "red", scenario: "SV13", reason: "The Service Provider and the Customer have the same name. A company cannot contract with itself — check the parties.", field: "parties" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "SV9", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
