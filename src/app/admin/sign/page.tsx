import Link from "next/link";
import { signStore } from "@/lib/sign/store";
import { adminEmail } from "@/lib/sign/http";
import { isHookConfigured } from "@/lib/sign/notify";
import SignAdmin from "./SignAdmin";
import "../../sign/sign.css";

/**
 * FD Sign, the Founders Doc side: /admin/sign. Send certificates (or any PDF)
 * for signing — each on its own, or as one batch where the Director signs
 * once — and track who has signed. Admins only. lib/sign, supabase/112.
 */
export const metadata = { title: "FD Sign — Founders Doc", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignAdminPage() {
  const admin = await adminEmail();
  if (!admin) {
    return (
      <main className="fdsign fs-adm">
        <div className="fs-empty">
          <h1>Founders Doc admins only</h1>
          <p>
            <Link href="/login?next=/admin/sign">Sign in</Link> with an admin account.
          </p>
        </div>
      </main>
    );
  }
  const store = signStore();
  if (store === "no-secret-key") {
    return (
      <main className="fdsign fs-adm">
        <div className="fs-empty">
          <h1>FD Sign needs one setting</h1>
          <p>
            Add <code>SUPABASE_SECRET_KEY</code> in Vercel (Settings → Environment Variables, as a secret) and redeploy. It lets the server keep documents that signers without an account can open.
          </p>
        </div>
      </main>
    );
  }
  let recent: Awaited<ReturnType<typeof store.recent>> = [];
  let holders: Awaited<ReturnType<typeof store.esopHolders>> = [];
  let director: string | null = null;
  let setupError = "";
  try {
    [recent, holders, director] = await Promise.all([store.recent(40), store.esopHolders(), store.esopDirector()]);
  } catch (e) {
    setupError = e instanceof Error ? e.message : String(e);
  }
  if (/sign_envelopes|relation|does not exist/i.test(setupError)) {
    return (
      <main className="fdsign fs-adm">
        <div className="fs-empty">
          <h1>FD Sign is not set up yet</h1>
          <p>
            Run <code>supabase/112_fd_sign.sql</code> in Supabase, then reload this page.
          </p>
        </div>
      </main>
    );
  }
  return <SignAdmin recent={recent} holders={holders} director={director ?? ""} hook={isHookConfigured()} preview={store.kind === "memory"} />;
}
