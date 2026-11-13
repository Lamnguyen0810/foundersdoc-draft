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
  /* 0236: WhatsApp / SMS codes for premium plans only; the others see that it's there, locked */
  const all = phoneChannels();
  const locked = !!a?.live && !a.premium && all.length > 0;
  const channels = locked ? [] : all;
  return (
    <Suspense>
      <Wizard
        channels={channels}
        phoneLocked={locked}
        plan={a?.live ? { label: a.label, used: a.used, limit: a.limit, per: a.per, endsAt: a.endsAt ?? null } : null}
      />
    </Suspense>
  );
}
