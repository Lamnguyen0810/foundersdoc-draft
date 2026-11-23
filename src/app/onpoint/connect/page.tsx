import type { Metadata } from "next";
import { msConfig, readLink } from "@/lib/onpoint/mailbox";
import "../../approve/approve.css";

/**
 * /onpoint/connect?t=<link> (0270): the page the client opens from the connect link.
 * One button: sign in to Microsoft (their own password) and approve "Send mail as you". Public; the signed,
 * 7-day link is the permission, and only the address it was made for can connect.
 */
export const metadata: Metadata = { title: "Connect your email · OnPoint Workflows", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const ERRORS: Record<string, string> = {
  link: "This link has expired or is not valid. Please ask Founders Doc for a new one.",
  expired: "The sign-in took too long or was opened in another browser. Please press the button again.",
  declined: "The permission was not approved, so nothing was connected. You can try again any time.",
  wrong: "You signed in with a different email account. Please press the button again and sign in with the address shown above.",
  other: "Microsoft could not finish the connection. Please try again; if it keeps happening, write to legal@foundersdoc.com.",
};

export default async function Connect({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const t = one(q.t);
  const link = readLink(t);
  const err = one(q.err);
  const done = one(q.done) === "1";
  const approved = one(q.approved) === "1";
  const start = `/api/onpoint/mail/start?t=${encodeURIComponent(t)}`;

  return (
    <main className="apv">
      <div className="apv-card">
        <div className="apv-top">
          <b>OnPoint Workflows</b>
          <span>powered by FD AI</span>
        </div>
        <section className="apv-body">
          {!msConfig() ? (
            <>
              <p className="apv-eyebrow">Connect your email</p>
              <h1>Not available yet</h1>
              <p>Connecting an email account is not switched on yet. Please check back with Founders Doc.</p>
            </>
          ) : !link ? (
            <>
              <p className="apv-eyebrow">Connect your email</p>
              <h1>Link not valid</h1>
              <p className="apv-err">{ERRORS.link}</p>
            </>
          ) : done ? (
            <>
              <p className="apv-ok" aria-hidden="true">
                ✅
              </p>
              <h1>Connected</h1>
              <p>
                <b>{link.e}</b> is connected. OnPoint&rsquo;s filing reminders will now be sent from this address, and you will see them in your Sent items. Clients&rsquo; replies come straight to you.
              </p>
              <p className="apv-small">You can close this page.</p>
            </>
          ) : (
            <>
              <p className="apv-eyebrow">Connect your email</p>
              <h1>Send OnPoint&rsquo;s reminders from your own email</h1>
              <p>
                Sign in to <b>{link.e}</b> with Microsoft and approve. It takes about a minute.
              </p>
              {approved && <p className="apv-note">✅ Your company has approved OnPoint Workflows. Now press the button below.</p>}
              {err && <p className="apv-err">{err === "admin" ? "Your company needs to approve this once. Please send this page to whoever manages your company's Microsoft 365, and ask them to use “I manage our Microsoft 365” below." : (ERRORS[err] ?? ERRORS.other)}</p>}
              <a className="apv-btn" href={start} style={{ textAlign: "center", textDecoration: "none" }}>
                Sign in with Microsoft
              </a>
              <ul className="apv-list">
                <li>
                  <span>You type your own password on Microsoft&rsquo;s page</span>
                  <b>🔒</b>
                </li>
                <li>
                  <span>Allows: send email as you, read your name</span>
                  <b>✉️</b>
                </li>
                <li>
                  <span>Cannot read your inbox or other emails</span>
                  <b>🚫</b>
                </li>
              </ul>
              <p className="apv-small">
                I manage our Microsoft 365: <a href={`${start}&admin=1`}>approve OnPoint Workflows for our company</a>. You can remove access any time at{" "}
                <a href="https://myapps.microsoft.com" target="_blank" rel="noopener noreferrer">
                  myapps.microsoft.com
                </a>{" "}
                or by writing to <a href="mailto:legal@foundersdoc.com">legal@foundersdoc.com</a>.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
