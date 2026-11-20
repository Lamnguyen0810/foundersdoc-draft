/**
 * Nationality on an Option Certificate (0259).
 *
 * It is not in the Letter of Grant, so it is typed in when the certificates are made, or left out.
 * In a simulation an empty one prints as "[to be confirmed]". That placeholder must never count as
 * a typed value: on 20 Nov 2026 the three holders of the first real vesting had the placeholder
 * itself saved on their rows, so the form came up pre-filled with it and a real certificate would
 * have gone for signing reading "[to be confirmed]". Pure, so it can be tested.
 */
export const TBC = "[to be confirmed]";

/** What was really typed: "" for nothing, and "" for the placeholder in any spelling. */
export function realNationality(v: unknown): string {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return /^[\[(]?\s*(to be confirmed|tbc|tba|n\/?a|-+)\s*[\])]?\.?$/i.test(t) ? "" : t;
}
