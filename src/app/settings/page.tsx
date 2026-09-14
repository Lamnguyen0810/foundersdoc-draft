import { redirect } from "next/navigation";
import Link from "next/link";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "Settings — FD AI" };
export const dynamic = "force-dynamic";

/** Keep in step with Supabase → Authentication → Policies → Password requirements.
 *  This only shapes the guidance and the button state; Supabase enforces the
 *  real rule server-side and its message wins if the two ever disagree. */
const MIN_PASSWORD_LENGTH = 12;

export default async function SettingsPage() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) redirect("/draft");

  const user = await getUser();
  if (!user?.email) redirect("/login?next=%2Fsettings");

  return (
    <main className="wrap" style={{ maxWidth: 560, padding: "56px 24px 96px" }}>
      <p className="kicker">FD AI</p>
      <h1 style={{ fontSize: "clamp(26px, 3vw, 32px)", marginTop: 8 }}>Settings</h1>
      <p className="sub" style={{ margin: "10px 0 32px", fontSize: 15 }}>
        Signed in as <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{user.email}</strong>
      </p>

      <section
        style={{
          border: "1px solid var(--grey-2)",
          borderRadius: 14,
          padding: "clamp(20px, 3vw, 28px)",
          background: "var(--white)",
        }}
      >
        <h2 style={{ fontSize: 19, marginBottom: 6 }}>Change your password</h2>
        <p className="sub" style={{ fontSize: 13.5, marginBottom: 22 }}>
          If the firm gave you a temporary password when your account was made, this is where you
          replace it with one only you know.
        </p>

        <SettingsForm
          supabaseUrl={url}
          supabaseKey={key}
          email={user.email}
          minLength={MIN_PASSWORD_LENGTH}
        />
      </section>

      <section
        style={{
          marginTop: 20,
          padding: "16px 18px",
          border: "1px solid var(--grey-2)",
          borderLeft: "2px solid var(--gold)",
          borderRadius: 10,
          background: "var(--grey-1)",
          fontSize: 13,
          lineHeight: 1.65,
          color: "var(--grey-5)",
        }}
      >
        <b style={{ color: "var(--ink)", fontWeight: 500 }}>Your email address is fixed.</b>{" "}
        Accounts are created by the firm, so changing an address — or adding someone new — is an
        administrator&rsquo;s job. Ask the firm and it takes a minute.
      </section>

      <p style={{ marginTop: 28, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="btn btn-white" href="/draft">
          Back to drafting
        </Link>
        <Link className="btn btn-white" href="/history">
          Past drafts
        </Link>
      </p>
    </main>
  );
}
