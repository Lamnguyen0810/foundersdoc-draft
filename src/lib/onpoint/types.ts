/**
 * OnPoint Workflows (0267): the six reminder types and the dates they are worked out from.
 * The UI groups them as AR, ECI and Others → AGM / FS / Corp-Sec expiry / Recurring job; "OTHER" is never
 * stored or sent, only one of the six (spec: OnPoint Reminder Emails, Backend Prompts §2).
 */

export const TYPES = ["AR", "ECI", "AGM", "FS", "CORP_SEC_EXPIRY", "RECURRING_JOB"] as const;
export type ReminderType = (typeof TYPES)[number];
export const OTHERS: ReminderType[] = ["AGM", "FS", "CORP_SEC_EXPIRY", "RECURRING_JOB"];

export const TYPE_NAME: Record<ReminderType, string> = {
  AR: "Annual Return (ACRA)",
  ECI: "ECI (IRAS)",
  AGM: "AGM date",
  FS: "Financial Statements",
  CORP_SEC_EXPIRY: "Nominee / Corp-Sec expiry",
  RECURRING_JOB: "Recurring job",
};

/** The short pick-list labels (Others → …) */
export const TYPE_PICK: Record<ReminderType, string> = {
  AR: "Annual Return (AR)",
  ECI: "ECI",
  AGM: "AGM date",
  FS: "Financial Statements (FS)",
  CORP_SEC_EXPIRY: "Corp-Sec expiry",
  RECURRING_JOB: "Recurring job",
};

export const isType = (v: unknown): v is ReminderType => typeof v === "string" && (TYPES as readonly string[]).includes(v);

export type DeadlineStatus = "active" | "completed" | "waived" | "not_applicable" | "cancelled";

export interface Client {
  id: string;
  key: string;
  name: string;
  uen: string | null;
  fye: string | null;
  services: string[];
  contact_name: string | null;
  contact_email: string | null;
  active: boolean;
  /** 0285: free notes on the client page */
  notes?: string | null;
}

export interface Deadline {
  id: string;
  client_id: string;
  type: ReminderType;
  label: string | null;
  due_date: string;
  source: string;
  source_key: string;
  derived: boolean;
  status: DeadlineStatus;
  done_on: string | null;
}

export interface Template {
  type: ReminderType;
  version: number;
  subject: string;
  body: string;
}

export interface Delivery {
  id: string;
  client_id: string | null;
  deadline_id: string | null;
  invoice_id?: string | null;
  type: string;
  trigger: "AUTOMATIC" | "MANUAL";
  lead_days: number | null;
  to_email: string | null;
  intended_to: string | null;
  subject: string | null;
  status: "queued" | "sent" | "failed" | "suppressed";
  test: boolean;
  requested_by: string | null;
  requested_at: string;
  error: string | null;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  custom_name: string | null;
  logo_data: string | null;
  sender_name: string;
  sender_email: string | null;
  test_inbox: string | null;
  auto_send: boolean;
  /** 0280: filing reminders are optional (OnPoint uses payment reminders); the payment email's own wording */
  filing_enabled: boolean;
  pay_subject: string | null;
  pay_body: string | null;
  /** 0282: automatic payment reminders: days before the due date (0 = on the day) and days after it */
  pay_before: number[];
  pay_after: number[];
  /** 0290: payment reminders (invoices) are optional; OnPoint's system is deadline tracking */
  payments_enabled: boolean;
  /** 0294: types whose automatic client chase is switched off on Rules & flows */
  paused_types?: string[];
}
