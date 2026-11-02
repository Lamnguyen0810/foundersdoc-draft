import { headers } from "next/headers";
import { signStore } from "@/lib/sign/store";
import { viewForToken } from "@/lib/sign/service";
import { who } from "@/lib/sign/http";
import SignClient from "./SignClient";
import "../sign.css";

/**
 * A signer's page: /sign/<token>, opened from the email. No account needed —
 * the link is the key (only its hash is stored). Opening it is recorded in the
 * audit trail (time, IP, browser). FD Sign: lib/sign, supabase/112.
 */
export const metadata = { title: "Review & sign — FD Sign", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const store = signStore();
  if (store === "no-secret-key") {
    return (
      <main className="fdsign">
        <div className="fs-empty">
          <h1>Signing is not available right now</h1>
          <p>Please try again later, or reply to the email you received.</p>
        </div>
      </main>
    );
  }
  const view = await viewForToken(store, token, who(await headers()));
  if (!view) {
    return (
      <main className="fdsign">
        <div className="fs-empty">
          <h1>This link is not valid</h1>
          <p>It may have been replaced by a newer one. Please use the latest email from Founders Doc, or reply to it for a new link.</p>
        </div>
      </main>
    );
  }
  return <SignClient token={token} view={view} />;
}
