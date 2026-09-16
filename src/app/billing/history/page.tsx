import { redirect } from "next/navigation";

/**
 * Billing history moved onto /usage, where the plan, the credits and the money
 * now sit together. This route stays only so that a link somebody has already
 * sent or bookmarked lands in the right place rather than on a 404.
 */
export default function BillingHistoryMoved() {
  redirect("/usage#billing-history");
}
