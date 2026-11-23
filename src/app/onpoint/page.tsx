import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { me, snapshot } from "@/lib/onpoint/server";
import { sgToday } from "@/lib/onpoint/dates";
import OnPointApp, { type Snapshot } from "./OnPointApp";
import { DEMO_CLIENTS, DEMO_DEADLINES, DEMO_LEADS, DEMO_TEMPLATES } from "./demo";
import "../esop/esop.css";
import "../esop/[slug]/overview.css";
import "./onpoint.css";

/**
 * foundersdoc.com/onpoint (0267): OnPoint Consulting's filing-deadline reminders. Its own sign-in
 * (/onpoint/login); only OnPoint's members and Founders Doc admins get in. Without Supabase (local preview)
 * it shows sample companies, never OnPoint's real clients.
 */
export const metadata: Metadata = { title: "OnPoint Workflows", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnPointPage() {
  if (!isSupabaseConfigured()) {
    const demo: Snapshot = {
      me: { email: "preview@example.com", role: "admin", founder: true },
      ws: { id: "demo", slug: "onpoint", name: "OnPoint Consulting Pte. Ltd.", custom_name: null, logo: null, sender_name: "OnPoint Consulting", sender_email: "sadiq@example.com", test_inbox: "administrator@foundersdoc.com", auto_send: false },
      clients: DEMO_CLIENTS,
      deadlines: DEMO_DEADLINES,
      deliveries: [],
      imports: [],
      templates: DEMO_TEMPLATES,
      leads: DEMO_LEADS,
      today: sgToday(),
    };
    return <OnPointApp initial={demo} preview />;
  }
  const m = await me().catch(() => null);
  if (!m) redirect("/onpoint/login");
  return <OnPointApp initial={(await snapshot(m)) as unknown as Snapshot} />;
}
