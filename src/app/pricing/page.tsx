import type { Metadata } from "next";
import PricingView from "../billing/PricingView";
import { pricedCatalogue } from "@/lib/billing/prices";
import { MEMBERSHIPS, PACKS, TRIAL, money } from "@/lib/billing/plans";
import { SITE, fdAiLd, ldJson } from "@/lib/seo";

/**
 * /pricing — FD AI's prices, for anybody.
 *
 * The same page as /billing (PricingView) without the account: no notices,
 * no history, and every buy button a link to /billing at the same section.
 * Signed in, that is the real button; signed out, middleware sends the
 * visitor to sign up first (the free trial). Public so that search engines
 * can read the prices, which is what lets the structured data name them
 * (lib/seo.ts → offers). Rebuilt at most once an hour, so Stripe is asked
 * once an hour, not once a visit.
 */
export const revalidate = 3600;

const TITLE = `FD AI Pricing — ${TRIAL.credits} Free Documents, Then From ${money(PACKS[0].amountCents)} | Founders Doc`;
const DESCRIPTION =
  `Start free with ${TRIAL.credits} documents over ${TRIAL.days} days, no card needed. Then from ${money(PACKS[0].amountCents)} a document, ` +
  `or a membership from ${money(MEMBERSHIPS[0].amountCents)} a month. Lawyer-backed.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: `${SITE}/pricing` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE}/pricing`, siteName: "Founders Doc", type: "website" },
};

export default async function PricingPage() {
  const catalogue = await pricedCatalogue();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(fdAiLd({ url: `${SITE}/pricing`, description: DESCRIPTION, documents: [] })) }}
      />
      <PricingView guest catalogue={catalogue} />
    </>
  );
}
