import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { me } from "@/lib/onpoint/server";
import LoginForm from "./LoginForm";
import "../../approve/approve.css";

/** /onpoint/login (0267): email → 6-digit code → OnPoint Workflows. Members only; no password. */
export const metadata: Metadata = { title: "Sign in · OnPoint Workflows", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnPointLogin() {
  if (isSupabaseConfigured() && (await me().catch(() => null))) redirect("/onpoint");
  return (
    <main className="apv">
      <div className="apv-card">
        <div className="apv-top">
          <b>OnPoint Workflows</b>
          <span>powered by FD AI</span>
        </div>
        <section className="apv-body">
          <p className="apv-eyebrow">Sign in</p>
          <h1>Open OnPoint Workflows</h1>
          <p>Type your work email. We&rsquo;ll send a 6-digit code to it; type the code here and you&rsquo;re in. No password needed.</p>
          <LoginForm />
          <p className="apv-small">
            Only people OnPoint has added can sign in. Trouble? Write to <a href="mailto:legal@foundersdoc.com">legal@foundersdoc.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
