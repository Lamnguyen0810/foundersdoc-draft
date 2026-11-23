import type { Metadata } from "next";
import AccessForm from "./AccessForm";
import "../../approve/approve.css";

/**
 * /esop/access (0264, 0266): type your email, get a 6-digit code at that address, type it, and the dashboard
 * opens. For people on a client's ESOP dashboard, so they never need a password. Public: the answer never says
 * who is a client.
 */
export const metadata: Metadata = { title: "Open your ESOP dashboard · Founders Doc", robots: { index: false, follow: false } };

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="apv">
      <div className="apv-card">
        <div className="apv-top">
          <b>Founders Doc</b>
          <span>ESOP dashboard</span>
        </div>
        <section className="apv-body">
          <p className="apv-eyebrow">Sign in</p>
          <h1>Open your ESOP dashboard</h1>
          <p>Type the email we have for you. We&rsquo;ll send a 6-digit code to it; type the code here and your dashboard opens. No password needed.</p>
          {sp.error === "link-expired" && <p className="apv-err">That link has expired. Type your email and we&rsquo;ll send you a code.</p>}
          <AccessForm initial={(sp.email ?? "").slice(0, 200)} />
          <p className="apv-small">
            The code only goes to that email address. Trouble? Reply to any of our emails, or write to <a href="mailto:legal@foundersdoc.com">legal@foundersdoc.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
