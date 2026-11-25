import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { me, snapshot } from "@/lib/onpoint/server";
import { sgToday } from "@/lib/onpoint/dates";
import OnPointApp, { type Snapshot } from "./OnPointApp";
import { DEMO_CLIENTS, DEMO_DEADLINES, DEMO_INVOICES, DEMO_LEADS, DEMO_TEMPLATES } from "./demo";
import "../esop/esop.css";
import "../esop/[slug]/overview.css";
import "./onpoint.css";

/**
 * foundersdoc.com/onpoint (0267): OnPoint Consulting's filing-deadline reminders. Its own sign-in
 * (/onpoint/login); only OnPoint's members and Founders Doc admins get in. Without Supabase (local preview)
 * it shows sample companies, never OnPoint's real clients.
 * 0280: OnPoint sends payment reminders; filing reminders are optional (off unless switched on).
 */
export const metadata: Metadata = { title: "OnPoint Workflows", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnPointPage() {
  if (!isSupabaseConfigured()) {
    const demo: Snapshot = {
      me: { email: "preview@example.com", role: "admin", founder: true },
      ws: { id: "demo", slug: "onpoint", name: "OnPoint Consulting Pte. Ltd.", custom_name: null, logo: null, sender_name: "OnPoint Consulting", sender_email: "sadiq@example.com", test_inbox: "administrator@foundersdoc.com", auto_send: false, filing_enabled: true, pay_subject: null, pay_body: null, pay_before: [7, 0], pay_after: [3, 10, 30], payments_enabled: false, mail_connected: false, plan: "free", feedback_until: "2027-02-25" },
      clients: DEMO_CLIENTS,
      deadlines: DEMO_DEADLINES,
      deliveries: [],
      imports: [{ id: 1, file_name: "Sample unpaid invoices.xlsx", kind: "Invoice list", summary: {}, imported_by: "preview@example.com", imported_at: new Date().toISOString(), undone_at: null }],
      templates: DEMO_TEMPLATES,
      leads: DEMO_LEADS,
      invoices: DEMO_INVOICES,
      payments_ready: true,
      files_ready: true,
      feedback_ready: true,
      feedback: [],
      files: [
        { id: "f1", name: "SAMPLE_invoice_0386.pdf", kind: "pdf", size: 48213, uploaded_by: "sadiq@example.com", uploaded_at: new Date().toISOString(), invoice_id: "v1", import_id: null, details: {} },
        { id: "f2", name: "SAMPLE_invoice_0412.pdf", kind: "pdf", size: 51002, uploaded_by: "sadiq@example.com", uploaded_at: new Date().toISOString(), invoice_id: null, import_id: null, details: {} },
        { id: "f3", name: "Sample unpaid invoices.xlsx", kind: "list", size: 9120, uploaded_by: "sadiq@example.com", uploaded_at: `${sgToday()}T00:30:00.000Z`, invoice_id: null, import_id: 1, details: { invoices: 5, added: 5 } },
      ],
      today: sgToday(),
    };
    return <OnPointApp initial={demo} preview />;
  }
  const m = await me().catch(() => null);
  if (!m) redirect("/onpoint/login");
  return <OnPointApp initial={(await snapshot(m)) as unknown as Snapshot} />;
}
