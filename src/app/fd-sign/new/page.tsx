import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signAccount } from "@/lib/sign/account";
import { phoneChannels } from "@/lib/sign/phone";
import { allowance } from "@/lib/sign/allowance";
import { signStore } from "@/lib/sign/store";
import Wizard from "../Wizard";

export const metadata = { title: "New signing request" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const me = await signAccount();
  if (!me) redirect("/login?next=/fd-sign/new");
  /* 0223: this month's plan (FD_SIGN_PRICING=on); off = Beta, nothing shown */
  const store = signStore();
  const a = store === "no-secret-key" ? null : await allowance(me, store).catch(() => null);
  const phoneLeft = a?.live && a.phoneLimit !== null ? Math.max(0, a.phoneLimit - a.phoneUsed) : null;
  const channels = phoneChannels();
  return (
    <Suspense>
      <Wizard
        channels={phoneLeft === 0 ? [] : channels}
        plan={a?.live ? { label: a.label, used: a.used, limit: a.limit, phoneLeft, phoneOffered: channels.length > 0 } : null}
      />
    </Suspense>
  );
}
