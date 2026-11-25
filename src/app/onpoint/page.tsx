import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { me, snapshot } from "@/lib/onpoint/server";
import { sgToday } from "@/lib/onpoint/dates";
import OnPointApp, { type Snapshot } from "./OnPointApp";
import { DEMO_CLIENTS, DEMO_DEADLINES, DEMO_LEADS, DEMO_TEMPLATES } from "./demo";
import { DEFAULT_FLOWS } from "@/lib/onpoint/flows";
import "../esop/esop.css";
import "../esop/[slug]/overview.css";
import "./onpoint.css";

/**
 * foundersdoc.com/onpoint (0267): OnPoint Consulting's filing-deadline reminders. Its own sign-in
 * (/onpoint/login); only OnPoint's members and Founders Doc admins get in. Without Supabase (local preview)
 * it shows sample companies, never OnPoint's real clients.
 * 0294: every page follows the approved mock-up (deadline tracking; no payment reminders).
 */
export const metadata: Metadata = { title: "OnPoint Workflows", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnPointPage() {
  if (!isSupabaseConfigured()) {
    const at = (min: number) => `${sgToday()}T0${Math.min(9, Math.floor(min / 60))}:${String(min % 60).padStart(2, "0")}:00.000Z`;
    const demo: Snapshot = {
      me: { email: "preview@example.com", role: "admin", founder: true },
      ws: { id: "demo", slug: "onpoint", name: "OnPoint Consulting Pte. Ltd.", custom_name: null, logo: null, sender_name: "OnPoint Consulting", sender_email: "sadiq@example.com", test_inbox: "administrator@foundersdoc.com", auto_send: false, filing_enabled: true, payments_enabled: false, mail_connected: false, plan: "free", feedback_until: "2027-02-25" },
      clients: DEMO_CLIENTS,
      deadlines: DEMO_DEADLINES,
      deliveries: [],
      imports: [
        { id: 1, file_name: "SAMPLE_Master_List_2026.xlsx", kind: "Master List", summary: {}, imported_by: "preview@example.com", imported_at: at(2), undone_at: null },
        { id: 2, file_name: "SAMPLE_Nominee_Service.xlsx", kind: "Nominee Service", summary: {}, imported_by: "preview@example.com", imported_at: at(60), undone_at: null },
        { id: 3, file_name: "SAMPLE_Job_Schedule.xlsx", kind: "Job Schedule", summary: {}, imported_by: "preview@example.com", imported_at: at(180), undone_at: null },
      ],
      templates: DEMO_TEMPLATES,
      leads: DEMO_LEADS,
      feedback_ready: true,
      feedback: [],
      /* 0294: the mock-up's flows, a note and one connection (sample only) */
      rules_ready: true,
      flows: DEFAULT_FLOWS.map((f, i) => ({ ...f, id: `f${i + 1}` })),
      runs: [],
      notes: [{ id: "n1", day: sgToday(), text: "Call Sample Company about AGM pack", created_by: "preview@example.com" }],
      connections: { team_email: null, monday_email: null, slack: true, zapier: false },
      paused: [],
      today: sgToday(),
    };
    return <OnPointApp initial={demo} preview />;
  }
  const m = await me().catch(() => null);
  if (!m) redirect("/onpoint/login");
  return <OnPointApp initial={(await snapshot(m)) as unknown as Snapshot} />;
}
