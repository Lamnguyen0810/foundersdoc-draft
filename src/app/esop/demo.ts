import type { EsopBatch, EsopCompany, EsopHolder, HolderStatus, LeaverType } from "@/lib/esop/vesting";

/* The same TEST rows supabase/105 adds (the approved mock-up's placeholder
   holders + Test Holder A/B in batch 99), for the local preview without
   Supabase. Placeholder people only. */

export const DEMO_COMPANY: EsopCompany = {
  id: "00000000-0000-0000-0000-000000000000",
  slug: "hitpay",
  name: "HitPay (TEST)",
  logo_url: "/email/hitpay-esop/hitpay-logo.png",
  plan: "free",
};

export const DEMO_BATCHES: EsopBatch[] = [
  { batch: 1, vesting_start: "2023-03-01", tranches: 4, note: "TEST" },
  { batch: 2, vesting_start: "2023-09-01", tranches: 4, note: "TEST" },
  { batch: 3, vesting_start: "2023-03-01", tranches: 4, note: "TEST" },
  { batch: 4, vesting_start: "2023-09-01", tranches: 4, note: "TEST" },
  { batch: 5, vesting_start: "2023-11-01", tranches: 4, note: "TEST" },
  { batch: 6, vesting_start: null, tranches: 4, note: "TEST" },
  { batch: 7, vesting_start: "2024-06-01", tranches: 4, note: "TEST" },
  { batch: 8, vesting_start: "2024-12-01", tranches: 4, note: "TEST" },
  { batch: 9, vesting_start: "2024-09-20", tranches: 4, note: "TEST" },
  { batch: 10, vesting_start: "2025-04-14", tranches: 4, note: "TEST" },
  { batch: 99, vesting_start: "2025-11-04", tranches: 4, note: "TEST" },
];

const h = (
  n: number,
  name: string,
  email: string,
  id_no: string,
  batch: number,
  per: number,
  status: HolderStatus,
  leaver_type: LeaverType | null,
  last_day: string | null,
): EsopHolder => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  name,
  email,
  id_no,
  batch,
  options_per_tranche: per,
  status,
  leaver_type,
  last_day,
  notes: null,
  updated_at: "2026-10-28T00:00:00Z",
  updated_by: null,
});

export const DEMO_HOLDERS: EsopHolder[] = [
  h(1, "Test Holder A", "administrator@foundersdoc.com", "TEST-ID-A", 99, 1000, "Active", null, null),
  h(2, "Test Holder B", "leaver.test@example.com", "TEST-ID-B", 99, 1000, "Leaver", "Good", "2026-06-30"),
  h(3, "Holder 1", "holder1@example.com", "TEST-ID-001", 1, 10000, "Active", null, null),
  h(4, "Holder 2", "holder2@example.com", "TEST-ID-002", 1, 7500, "Active", null, null),
  h(5, "Holder 3", "holder3@example.com", "TEST-ID-003", 1, 6000, "Active", null, null),
  h(6, "Holder 4", "holder4@example.com", "TEST-ID-004", 1, 4400, "Active", null, null),
  h(7, "Holder 5", "holder5@example.com", "TEST-ID-005", 1, 8800, "Active", null, null),
  h(8, "Holder 6", "holder6@example.com", "TEST-ID-006", 3, 4000, "Active", null, null),
  h(9, "Holder 7", "holder7@example.com", "TEST-ID-007", 4, 2000, "Active", null, null),
  h(10, "Holder 8", "holder8@example.com", "TEST-ID-008", 4, 2200, "Active", null, null),
  h(11, "Holder 9", "holder9@example.com", "TEST-ID-009", 5, 3000, "Active", null, null),
  h(12, "Holder 10", "holder10@example.com", "TEST-ID-010", 7, 2200, "Active", null, null),
  h(13, "Holder 11", "holder11@example.com", "TEST-ID-011", 8, 4400, "Active", null, null),
  h(14, "Holder 12", "holder12@example.com", "TEST-ID-012", 8, 4400, "Active", null, null),
  h(15, "Holder 13", "holder13@example.com", "TEST-ID-013", 8, 4400, "Active", null, null),
  h(16, "Holder 14", "holder14@example.com", "TEST-ID-014", 1, 2200, "Leaver", "Good", "2024-07-12"),
  h(17, "Holder 15", "holder15@example.com", "TEST-ID-015", 1, 8800, "Leaver", "Bad", "2025-02-01"),
  h(18, "Holder 16", "holder16@example.com", "TEST-ID-016", 1, 4400, "Leaver", "Good", "2026-04-23"),
  h(19, "Holder 17", "holder17@example.com", "TEST-ID-017", 2, 2900, "Leaver", "Bad", "2025-04-30"),
  h(20, "Holder 18", "holder18@example.com", "TEST-ID-018", 2, 2200, "Leaver", "Good", "2025-08-15"),
  h(21, "Holder 19", "holder19@example.com", "TEST-ID-019", 3, 0, "Leaver", "Unvested", "2024-02-01"),
  h(22, "Holder 20", "holder20@example.com", "TEST-ID-020", 3, 3400, "Leaver", "Good", "2026-03-14"),
  h(23, "Holder 21", "holder21@example.com", "TEST-ID-021", 4, 2200, "Leaver", "Good", "2025-06-30"),
  h(24, "Holder 22", "holder22@example.com", "TEST-ID-022", 4, 2200, "Leaver", "Good", "2025-10-31"),
  h(25, "Holder 23", "holder23@example.com", "TEST-ID-023", 4, 2200, "Leaver", "Good", "2026-06-22"),
  h(26, "Holder 24", "holder24@example.com", "TEST-ID-024", 5, 2200, "Leaver", "Good", "2026-01-15"),
  h(27, "Holder 25", "holder25@example.com", "TEST-ID-025", 6, 0, "Leaver", "Unvested", "2024-08-30"),
  h(28, "Holder 26", "holder26@example.com", "TEST-ID-026", 6, 0, "Leaver", "Unvested", "2024-11-19"),
  h(29, "Holder 27", "holder27@example.com", "TEST-ID-027", 7, 1100, "Leaver", "Good", "2025-07-31"),
  h(30, "Holder 28", "holder28@example.com", "TEST-ID-028", 8, 1100, "Leaver", "Good", "2026-02-28"),
  h(31, "Holder 29", "holder29@example.com", "TEST-ID-029", 9, 0, "Leaver", "Unvested", "2025-03-31"),
  h(32, "Holder 30", "holder30@example.com", "TEST-ID-030", 10, 1100, "Leaver", "Good", "2026-05-31"),
];
