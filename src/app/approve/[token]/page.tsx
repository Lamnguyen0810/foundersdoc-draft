import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { approvalSummary, hashApprovalToken, isApprovalToken, type ApprovalItem } from "@/lib/esop/approval";
import "../approve.css";

/**
 * /approve/<token>: the one-button page behind "Approve issuance of Option
 * Certificates" in the approval email (SQL 117). No login: the private link
 * is the key. Opening it never approves (email scanners open every link);
 * only the Confirm button (a form POST) does.
 */
export const metadata: Metadata = { title: "Approve Option Certificates · Founders Doc", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type View = ApprovalItem & {
  status: "ok" | "approved" | "expired" | "invalid" | "responded";
  /** 0217 (SQL 129): the Director's Modify / Cancel on this link */
  response?: { kind: "modify" | "cancel"; note: string | null; at: string } | null;
};

const PREVIEW: View = {
  status: "ok",
  ref: "B8-T2",
  batch: 8,
  tranche: 2,
  vest_date: "2026-12-01",
  vest_date_text: "1 Dec 2026",
  company: "Specimen Company",
  share_class: "Class B",
  simulation: true,
  to: "administrator@foundersdoc.com",
  to_name: "Specimen Director",
  holders: [
    { name: "Specimen Holder One", options: "4,400", options_number: 4400 },
    { name: "Specimen Holder Two", options: "4,400", options_number: 4400 },
    { name: "Specimen Holder Three", options: "2,200", options_number: 2200 },
  ],
  leavers: [{ name: "Specimen Leaver", leaver_type: "Good" }],
};

async function load(token: string): Promise<View> {
  if (!isApprovalToken(token)) return { ...PREVIEW, status: "invalid" };
  if (!isSupabaseConfigured()) return PREVIEW;
  if (!isAdminClientConfigured()) return { ...PREVIEW, status: "invalid" };
  const { data, error } = await supabaseAdmin().rpc("esop_approval_link_view", { p_token_hash: hashApprovalToken(token) });
  if (error || !data) {
    if (error) console.error("[approve] view failed:", error.message);
    return { ...PREVIEW, status: "invalid" };
  }
  return data as View;
}

const fmt = (n: number) => n.toLocaleString("en-GB");
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default async function ApprovePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; e?: string; do?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const v = await load(token);
  const preview = !isSupabaseConfigured();
  const previewDone = preview && sp.done === "1";
  const previewAnswer = preview && (sp.done === "modify" || sp.done === "cancel") ? sp.done : null;
  const status = previewDone ? "approved" : previewAnswer ? "responded" : v.status;
  const answer = previewAnswer ? { kind: previewAnswer, note: null } : (v.response ?? null);
  /* Modify / Cancel (0217): ?do= opens the form on the same page; only the form's POST records it */
  const asking = status === "ok" && (sp.do === "modify" || sp.do === "cancel") ? sp.do : null;
  const s = approvalSummary(v);
  const company = (v.company ?? "").replace(/\s*\(test\)\s*/i, "").trim();

  return (
    <main className="apv">
      <div className="apv-card">
        <div className="apv-top">
          <b>Founders Doc</b>
          <span>ESOP Administration</span>
        </div>
        {v.simulation && status !== "invalid" && (
          <p className="apv-sim">🧪 <b>Simulation</b>: a practice run. Nothing goes to the client or holders.</p>
        )}

        {status === "invalid" && (
          <section className="apv-body">
            <h1>This link isn&apos;t valid</h1>
            <p>Please use the button in your latest approval email, or reply to that email and we&apos;ll help.</p>
          </section>
        )}

        {status === "expired" && (
          <section className="apv-body">
            <h1>This approval link has expired</h1>
            <p>For your security, approval links work once and only for a limited time. Just reply to the email and Founders Doc will send you a new one.</p>
          </section>
        )}

        {status === "responded" && (
          <section className="apv-body">
            <p className="apv-ok">{answer?.kind === "cancel" ? "✖️" : "✏️"}</p>
            <h1>{answer?.kind === "cancel" ? "Issuance cancelled" : "Thank you, we've got your change"}</h1>
            {answer?.kind === "cancel" ? (
              <p>
                Nothing will be issued or charged for the vesting on <b>{s.vest}</b>. If you change your mind, reply to the email and we&apos;ll send a fresh approval.
              </p>
            ) : (
              <p>
                Nothing goes out until it&apos;s fixed. Once the change is made you&apos;ll get a fresh approval email for the vesting on <b>{s.vest}</b>.
              </p>
            )}
            {answer?.note && <p className="apv-note">“{answer.note}”</p>}
          </section>
        )}

        {status === "approved" && (
          <section className="apv-body">
            <p className="apv-ok">✅</p>
            <h1>{sp.done === "1" ? "Thank you, approved!" : "Already approved"}</h1>
            <p>
              The issuance of <b>{s.certificates} Option Certificate{s.certificates === 1 ? "" : "s"}</b> vesting on <b>{s.vest}</b> is approved
              {v.approved_at ? ` (${when(v.approved_at)})` : ""}.
            </p>
            <p className="apv-next">
              <b>What happens next:</b> we&apos;ll email you the payment link, and then the certificates for your signature. You don&apos;t need to do anything else for now.
            </p>
          </section>
        )}

        {asking && (
          <section className="apv-body">
            <p className="apv-eyebrow">FD x {company || "Company"} · ESOP</p>
            <h1>{asking === "modify" ? "Ask for a change" : "Cancel this issuance?"}</h1>
            <p>
              {s.certificates} Option Certificate{s.certificates === 1 ? "" : "s"} vesting on <b>{s.vest}</b> ({s.names}).
            </p>
            {sp.e && <p className="apv-err">{sp.e === "note" ? "Please write what should change." : "Something went wrong. Please try again, or reply to the email."}</p>}
            <form method="post" action={`/approve/${token}/respond`}>
              <input type="hidden" name="kind" value={asking} />
              <label className="apv-label" htmlFor="apv-note">
                {asking === "modify" ? "What should change?" : "Reason (optional)"}
              </label>
              <textarea
                id="apv-note"
                name="note"
                className="apv-text"
                rows={4}
                maxLength={2000}
                required={asking === "modify"}
                placeholder={asking === "modify" ? "e.g. one holder's options, someone who has left, the vesting date" : "e.g. the vesting is on hold"}
              />
              <button type="submit" className={asking === "modify" ? "apv-btn" : "apv-btn apv-btn-stop"}>
                {asking === "modify" ? "✏️ Send the change" : "✖️ Cancel the issuance"}
              </button>
            </form>
            <p className="apv-small">
              {asking === "modify" ? "Nothing is issued until the change is made and you approve again." : "Nothing is issued or charged. You can still go ahead later."}{" "}
              <a href={`/approve/${token}`}>Back to approve</a>
            </p>
          </section>
        )}

        {status === "ok" && !asking && (
          <section className="apv-body">
            <p className="apv-eyebrow">FD x {company || "Company"} · ESOP</p>
            <h1>Approve issuance of Option Certificates</h1>
            <p>
              Vesting on <b>{s.vest}</b>. Founders Doc will issue one Option Certificate for each person below.
            </p>
            {sp.e && <p className="apv-err">{sp.e === "expired" ? "This link has just expired. Please reply to the email for a new one." : "Something went wrong. Please try again, or reply to the email."}</p>}
            <ul className="apv-list">
              {v.holders.map((h) => (
                <li key={h.name}>
                  <span>✅ {h.name}</span>
                  <b>{fmt(h.options_number ?? (Number(String(h.options).replace(/,/g, "")) || 0))} options</b>
                </li>
              ))}
              {v.leavers.map((l) => (
                <li key={l.name} className="apv-leaver">
                  <span>➖ {l.name} has left ({l.leaver_type} leaver), so no certificate this time</span>
                </li>
              ))}
            </ul>
            <p className="apv-total">
              <b>
                {s.certificates} Option Certificate{s.certificates === 1 ? "" : "s"}
              </b>{" "}
              · {fmt(s.options)} options in total{v.share_class ? ` · ${v.share_class} shares` : ""}
            </p>
            <form method="post" action={`/approve/${token}/confirm`}>
              <button type="submit" className="apv-btn">
                ✅ Confirm: {s.button.replace(/^Approve/, "approve")}
              </button>
            </form>
            <div className="apv-alt">
              <a className="apv-alt-btn" href={`/approve/${token}?do=modify`}>
                ✏️ Modify
              </a>
              <a className="apv-alt-btn" href={`/approve/${token}?do=cancel`}>
                ✖️ Cancel
              </a>
            </div>
            <p className="apv-small">
              By confirming, you approve Founders Doc issuing these certificates. Next, we&apos;ll send the payment link, and then the certificates for your signature.
              Something not right? Choose Modify and tell us what to change.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
