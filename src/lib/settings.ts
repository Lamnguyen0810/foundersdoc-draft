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

export interface AiPreferences {
  detail: DetailChoice;
}

export interface UserSettings {
  company: CompanyProfile;
  use_company: boolean;
  ai: AiPreferences;
  updated_at: string | null;
}

export const EMPTY_COMPANY: CompanyProfile = {
  name: "", jurisdiction: "Singapore", entity_type: "Private Limited", industry: "", stage: "",
  uen: "", address: "", contact: "", governing_law: "Singapore", website: "", description: "",
};

export const DEFAULT_SETTINGS: UserSettings = {
  company: EMPTY_COMPANY,
  use_company: true,
  ai: { detail: "standard" },
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
export function normaliseSettings(row: { company?: unknown; use_company?: unknown; ai?: unknown; updated_at?: unknown } | null): UserSettings {
  const c = (row?.company ?? {}) as Partial<Record<keyof CompanyProfile, unknown>>;
  const company = { ...EMPTY_COMPANY };
  for (const k of Object.keys(EMPTY_COMPANY) as (keyof CompanyProfile)[]) {
    if (typeof c[k] === "string") company[k] = (c[k] as string).slice(0, 2000);
  }
  const ai = (row?.ai ?? {}) as { detail?: unknown };
  const detail: DetailChoice = ai.detail === "simple" || ai.detail === "comprehensive" ? ai.detail : "standard";
  return {
    company,
    use_company: row?.use_company === undefined ? true : Boolean(row.use_company),
    ai: { detail },
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
