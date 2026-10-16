/**
 * What the back end can spot by rule. Every flag is for the lawyer who
 * reviews the agreement before it is signed and is listed beside the draft,
 * never written in it. A red flag stops the draft: the answers are saved,
 * the credit is refunded and the firm follows up.
 */

import { readAnswers } from "./assemble";
import { applyDefaults, problemWith, questionsFor } from "./questions";
import type { Answers, Flag, Party } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const FLAG_TITLES: Record<string, string> = {
  IP1: "Confirm the jurisdiction entries",
  IP2: "Another law: entries left blank",
  IP3: "Signing as a deed",
  IP4: "The creator is an employee",
  IP5: "Others contribute to the IP",
  IP6: "Joint ownership",
  IP7: "You get a licence, not ownership",
  IP8: "Creator may reuse the work",
  IP9: "A template: fill in per client",
  IP10: "Possible patents",
  IP11: "Same party on both sides",
  IP12: "Answer that cannot be used",
  IP13: "US law: signed as an agreement",
  IP14: "Background IP not licensed",
  IP15: "Limited licence",
  IP21: "Your own wording",
};

export function titleFor(f: Flag): string {
  return f.title ?? FLAG_TITLES[f.scenario] ?? "Worth checking";
}

export function ruleChecks(answersIn: Answers, creator: Party, recipient: Party): { flags: Flag[] } {
  const a = applyDefaults(answersIn);
  const r = readAnswers(a);
  const flags: Flag[] = [];

  /* The governing law. */
  if (r.otherLaw) {
    flags.push({
      level: "yellow",
      scenario: "IP2",
      reason: `The governing law is ${str(a.IP2a) || "another country's"}. FD AI has no entries for it, so the third-party rights statute, the local moral rights law and the courts are left as [●]. A lawyer qualified there should fill them in and check ${r.j.checkLocally}.`,
      field: "IP2",
    });
  } else if (r.lawKey !== "sg") {
    flags.push({
      level: "yellow",
      scenario: "IP1",
      reason: `The agreement is governed by the laws of ${r.j.law}. Have a lawyer qualified there confirm the jurisdiction entries, and check ${r.j.checkLocally}.`,
      field: "IP2",
    });
  } else {
    flags.push({ level: "green", scenario: "IP1", reason: `Under Singapore law, check ${r.j.checkLocally}.`, field: "IP2" });
  }

  /* How it is signed. */
  if (r.deed) {
    const co = [creator, recipient].some((p) => p.kind === "company");
    const ind = [creator, recipient].some((p) => p.kind !== "company");
    const how = [
      ind ? "an individual signs in front of a witness who is not a party" : "",
      co ? `a company signs by two directors, or a director and the company secretary, or ${r.lawKey === "sg" ? "one director in front of a witness (section 41B of the Companies Act 1967)" : "(where the governing law allows) one director in front of a witness"}` : "",
    ].filter(Boolean).join("; ");
    flags.push({
      level: "yellow",
      scenario: "IP3",
      reason: `No fee is paid for the IP, so the document is signed as a deed, which binds without payment: ${how}. Check whether the governing law allows a deed to be signed electronically; if not, sign it on paper.`,
      field: "IP16",
    });
  } else if (r.j.us && !r.fee) {
    flags.push({
      level: "green",
      scenario: "IP13",
      reason: "Under US law there is no deed: the agreement recites that it is made for good and valuable consideration, and adds a work-made-for-hire clause where the recipient owns the IP.",
      field: "IP2",
    });
  }

  if (!r.creatorSide && r.role === "employee") {
    flags.push({
      level: "green",
      scenario: "IP4",
      reason: `In many countries, IP an employee creates in the course of employment already belongs to the employer; this agreement confirms it and covers anything outside that. Check it matches the employment contract${r.lawKey === "ew" ? ", and any statutory compensation for employee inventions" : ""}.`,
      field: "IP3",
    });
  }

  if (r.withOthers !== "solo") {
    flags.push({
      level: "yellow",
      scenario: "IP5",
      reason: `${r.withOthers === "undetermined" ? "Others may contribute to the work. " : ""}Before anyone else contributes, get their written assignment of IP and waiver of moral rights (the Contributors clause requires it), or part of the IP may stay with them.`,
      field: "IP6",
    });
  }

  if (r.owner === "joint") {
    flags.push({
      level: "yellow",
      scenario: "IP6",
      reason: "What each joint owner may do without the other differs from country to country, especially for patents. The Joint Ownership clause sets the rules; check they fit any plan to license or sell the IP.",
      field: r.creatorSide ? "IP12" : "IP11",
    });
  }
  if (r.owner === "creator" && !r.creatorSide) {
    flags.push({
      level: "yellow",
      scenario: "IP7",
      reason: "The creator keeps the IP and you receive a licence. Investors and buyers usually expect a company to own the IP that is core to its business; check that a licence is enough.",
      field: "IP11",
    });
  }
  if (r.owner === "creator" && r.licenceKind === "limited" && !r.creatorSide) {
    flags.push({ level: "yellow", scenario: "IP15", reason: "The licence is limited to the Project and its period. Check you will not need the work for anything else, or after the project ends.", field: "IP11a" });
  }
  if (r.owner === "recipient" && r.licenceBack === "any" && !r.creatorSide) {
    flags.push({ level: "yellow", scenario: "IP8", reason: "The creator may reuse the work for any purpose, including for other clients. Check that is intended, especially for anything confidential or core to the business.", field: "IP14" });
  }
  if (r.template) {
    flags.push({ level: "green", scenario: "IP9", reason: "This is a template: fill in the recipient's details, the description of the work and Schedule 1 for each client before signing." });
  }
  if (r.types.includes("coding") || r.types.includes("proprietary")) {
    flags.push({ level: "green", scenario: "IP10", reason: "If any of the work could be patented, keep it confidential until a patent application is filed: publishing it first can prevent a patent.", field: "IP7" });
  }
  if (!r.atLeast("standard") && !r.creatorSide) {
    flags.push({
      level: "green",
      scenario: "IP14",
      reason: "Basic does not license any background IP (the creator's existing code, designs or tools) built into the work. Choose Standard or Complex if the work will include any.",
      field: "IP0",
    });
  }

  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key(str(creator.name)) && key(str(creator.name)) === key(str(recipient.name))) {
    flags.push({ level: "red", scenario: "IP11", reason: "The creator is also named as the recipient. A party cannot assign IP to itself — check the parties.", field: "parties" });
  }

  for (const q of questionsFor(a)) {
    const why = problemWith(q, a[q.id]);
    if (why) flags.push({ level: "red", scenario: "IP12", reason: `${q.text} — "${str(a[q.id])}". ${why}`, field: q.id });
  }
  return { flags };
}
