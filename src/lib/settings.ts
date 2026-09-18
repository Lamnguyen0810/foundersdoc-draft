/**
 * The person's own settings — shapes shared by the settings page, its API
 * and the drafting screen that reads them.
 */

export interface CompanyProfile {
  name: string;
  jurisdiction: string;
  entity_type: string;
  industry: string;
  stage: string;
  uen: string;
  address: string;
  contact: string;
  governing_law: string;
  website: string;
  description: string;
}

export type DetailChoice = "simple" | "standard" | "comprehensive";

/**
 * How the document reads, as opposed to how long it is.
 *
 * Detail decides how much is covered; style decides the register it is covered
 * in. They are independent: a comprehensive document can still be written in
 * plain English, and a short one can still be traditionally drafted.
 */
export type DraftingStyle = "standard_legal" | "plain_english";

export const DRAFTING_STYLES: { id: DraftingStyle; label: string; help: string }[] = [
  {
    id: "standard_legal",
    label: "Standard legal",
    help: "The firm's usual register — formal, conventional clause structure.",
  },
  {
    id: "plain_english",
    label: "Plain English",
    help: "The same protections in shorter sentences and everyday words.",
  },
];

export interface AiPreferences {
  detail: DetailChoice;
  style: DraftingStyle;
  /** Show FD AI one of your own finished documents of the same type, as a
   *  style reference. Never as a source of facts — see lib/prompt.ts. */
  use_past_drafts: boolean;
}

export interface UserSettings {
  company: CompanyProfile;
  use_company: boolean;
  ai: AiPreferences;
  /** Deleting a document keeps it for 30 days before it is really gone. */
  retain_deleted: boolean;
  /** Consent for FoundersDoc to learn from this person's documents. Nothing
   *  does so today; this records the answer for if that ever changes. */
  improve_product: boolean;
  updated_at: string | null;
}

export const EMPTY_COMPANY: CompanyProfile = {
  name: "", jurisdiction: "Singapore", entity_type: "Private Limited", industry: "", stage: "",
  uen: "", address: "", contact: "", governing_law: "Singapore", website: "", description: "",
};

export const DEFAULT_SETTINGS: UserSettings = {
  company: EMPTY_COMPANY,
  use_company: true,
  ai: { detail: "standard", style: "standard_legal", use_past_drafts: false },
  /* On by default: a document deleted by accident is recoverable, which is the
     safer failure for a law firm. Off deletes on the spot. */
  retain_deleted: true,
  /* Off by default. Consent is given, not assumed. */
  improve_product: false,
  updated_at: null,
};

/* The three choices on the settings page against the five-step slider on
   the drafting screen. Standard is the slider's own default. */
export const DETAIL_LEVEL: Record<DetailChoice, number> = { simple: 2, standard: 3, comprehensive: 4 };

export const COMPANY_FIELDS: { key: keyof CompanyProfile; label: string; options?: string[]; placeholder?: string }[] = [
  { key: "name", label: "Company name", placeholder: "ABC Technologies Pte. Ltd." },
  { key: "jurisdiction", label: "Country / jurisdiction", options: ["Singapore", "United Kingdom", "United States", "Other"] },
  { key: "entity_type", label: "Entity type", options: ["Private Limited", "LLP", "Sole Proprietorship", "Other"] },
  { key: "industry", label: "Industry", options: ["", "SaaS / Technology", "FinTech", "Professional Services", "Consumer", "Healthcare", "Other"] },
  { key: "stage", label: "Company stage", options: ["", "Pre-seed", "Seed", "Series A", "Growth"] },
  { key: "uen", label: "UEN / Registration No.", placeholder: "202612345N" },
  { key: "address", label: "Registered address", placeholder: "Singapore" },
  { key: "contact", label: "Primary contact" },
  { key: "governing_law", label: "Default governing law", options: ["Singapore", "England & Wales", "New York", "Other"] },
  { key: "website", label: "Company website", placeholder: "https://example.com" },
];

/** Reads a row's jsonb into the shape above, filling anything missing. */
export function normaliseSettings(
  row: {
    company?: unknown;
    use_company?: unknown;
    ai?: unknown;
    retain_deleted?: unknown;
    improve_product?: unknown;
    updated_at?: unknown;
  } | null,
): UserSettings {
  const c = (row?.company ?? {}) as Partial<Record<keyof CompanyProfile, unknown>>;
  const company = { ...EMPTY_COMPANY };
  for (const k of Object.keys(EMPTY_COMPANY) as (keyof CompanyProfile)[]) {
    if (typeof c[k] === "string") company[k] = (c[k] as string).slice(0, 2000);
  }
  const ai = (row?.ai ?? {}) as { detail?: unknown; style?: unknown; use_past_drafts?: unknown };
  const detail: DetailChoice = ai.detail === "simple" || ai.detail === "comprehensive" ? ai.detail : "standard";
  const style: DraftingStyle = ai.style === "plain_english" ? "plain_english" : "standard_legal";
  return {
    company,
    use_company: row?.use_company === undefined ? true : Boolean(row.use_company),
    ai: { detail, style, use_past_drafts: Boolean(ai.use_past_drafts) },
    retain_deleted: row?.retain_deleted === undefined ? true : Boolean(row.retain_deleted),
    improve_product: Boolean(row?.improve_product),
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * What a saved company profile fills in on a new draft. Keys are the
 * question keys the NDA form uses; a form without those questions ignores
 * them. Only what was actually saved — an empty profile fills nothing.
 */
export function prefillAnswers(s: UserSettings): Record<string, string> {
  if (!s.use_company || !s.company.name.trim()) return {};
  const out: Record<string, string> = { party_a: s.company.name.trim() };
  const details: string[] = [];
  if (s.company.uen.trim()) details.push(`UEN ${s.company.uen.trim()}`);
  if (s.company.address.trim()) details.push(`registered office at ${s.company.address.trim()}`);
  if (details.length) out.party_details = `${s.company.name.trim()}: ${details.join(", ")}`;
  return out;
}
