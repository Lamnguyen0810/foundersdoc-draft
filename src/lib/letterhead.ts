/**
 * Firm letterhead settings for the Word export.
 *
 * ⚠️ REPLACE THESE with the firm's real details before anyone downloads a draft
 * that leaves the office. Everything here is a placeholder.
 *
 * To use the real letterhead: put the logo at public/letterhead-logo.png and set
 * LOGO_FILE below. The exporter reads it at request time; if the file is absent
 * it silently falls back to a text-only header, so a missing logo never breaks a
 * download.
 */

export const LETTERHEAD = {
  firmName: "FoundersDoc",
  tagline: "Advocates & Solicitors",
  addressLines: [
    "[Firm address line 1]",
    "[Firm address line 2]",
    "Singapore [postcode]",
  ],
  contactLines: ["T +65 0000 0000", "legal@foundersdoc.com", "foundersdoc.com"],
  /** Relative to /public. Set to null for a text-only header. */
  logoFile: "letterhead-logo.png" as string | null,
  /** Printed small at the foot of every page. */
  footer: "This document is a draft and is subject to review.",
  /** Point sizes. docx uses half-points internally; the exporter doubles these. */
  bodyPt: 11,
  font: "Times New Roman",
} as const;
