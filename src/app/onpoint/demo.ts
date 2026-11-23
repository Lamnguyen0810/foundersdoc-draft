import { addMonths, sgToday } from "@/lib/onpoint/dates";
import { DEFAULT_LEADS, DEFAULT_TEMPLATES } from "@/lib/onpoint/templates";
import { TYPES, type Client, type Deadline, type ReminderType, type Template } from "@/lib/onpoint/types";

/* The local preview (no Supabase): SAMPLE companies only, never OnPoint's real clients. */
const T = sgToday();
const c = (i: number, name: string, email: string | null, contact: string | null): Client => ({
  id: `c${i}`,
  key: name.toLowerCase(),
  name,
  uen: `SAMPLE-UEN-${i + 1}`,
  fye: addMonths(T, -((i % 10) + 1)),
  services: ["fs_tax", "sec"],
  contact_name: contact,
  contact_email: email,
  active: true,
});
export const DEMO_CLIENTS: Client[] = [
  c(1, "Sample Company Pte. Ltd.", "alex.tan@example.com", "Alex Tan"),
  c(2, "Example Consulting Pte. Ltd.", "jamie.lee@example.com", "Jamie Lee"),
  c(3, "Specimen Trading Pte. Ltd.", null, null),
  c(4, "Placeholder Foods Pte. Ltd.", "accounts@example.com", null),
  c(5, "Demo Logistics Pte. Ltd.", "ops@example.com", "Sam Wong"),
];
let n = 0;
const d = (client: string, type: ReminderType, days: number, label: string | null = null, status: Deadline["status"] = "active"): Deadline => ({
  id: `d${++n}`,
  client_id: client,
  type,
  label,
  due_date: new Date(Date.parse(T) + days * 86_400_000).toISOString().slice(0, 10),
  source: "Sample data",
  source_key: `demo:${n}`,
  derived: true,
  status,
  done_on: null,
});
export const DEMO_DEADLINES: Deadline[] = [
  d("c1", "AR", 14),
  d("c1", "ECI", -3),
  d("c1", "AGM", 45),
  d("c2", "ECI", 7),
  d("c2", "FS", 30),
  d("c3", "AR", 2),
  d("c3", "CORP_SEC_EXPIRY", 60, "Corp-sec renewal"),
  d("c4", "RECURRING_JOB", 3, "Accounts (Monthly)"),
  d("c4", "AGM", -10),
  d("c5", "CORP_SEC_EXPIRY", 30, "Registered address renewal"),
  d("c5", "AR", 90),
];
export const DEMO_TEMPLATES = Object.fromEntries(TYPES.map((t) => [t, { type: t, version: 0, ...DEFAULT_TEMPLATES[t] }])) as Record<ReminderType, Template>;
export const DEMO_LEADS = Object.fromEntries(TYPES.map((t) => [t, [...DEFAULT_LEADS[t]]])) as Record<ReminderType, number[]>;
