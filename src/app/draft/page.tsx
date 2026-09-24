import { loadDocTypes } from "@/lib/doctypes.server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { getWallet } from "@/lib/billing/credits";
import DraftChat from "./DraftChat";
import { recentDrafts } from "./recent";
import { loadPrefill } from "@/lib/settings.server";

/* The one screen in the app Google is welcome to read: a visitor can open it
   without an account, so it is what a search for "draft an NDA online" should
   land on. The root layout says noindex for everything else. */
export const metadata = {
  title: "Draft an NDA online in minutes — FD AI by Founders Doc",
  description:
    "Answer a few questions and FD AI drafts a non-disclosure agreement from Founders Doc's own playbook — nothing invented, lawyer-backed, Word in minutes. Start without an account.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://foundersdoc.com/draft" },
};
export const dynamic = "force-dynamic";

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { docTypes } = await loadDocTypes();

  // `/draft?type=nda` — the deep link the marketing site uses. An unknown slug
  // falls through to the catalogue rather than erroring, so a stale link on the
  // site lands somewhere sensible instead of breaking.
  const requested = (await searchParams).type?.trim().toLowerCase();
  const presetSlug = docTypes.find((d) => d.slug === requested)?.slug;

  const [user, recent, wallet, admin, prefill] = await Promise.all([
    isSupabaseConfigured() ? getUser() : Promise.resolve(null),
    recentDrafts(),
    getWallet(),
    isSupabaseConfigured() ? isAdmin() : Promise.resolve(false),
    isSupabaseConfigured() ? loadPrefill() : Promise.resolve(null),
  ]);

  return (
    <DraftChat
      docTypes={docTypes}
      presetSlug={presetSlug}
      userEmail={user?.email ?? null}
      /* Accounts exist and this person has none: the questions are open to
         them, Generate is where they sign up. Never true when Supabase is
         absent — local development drafts without accounts at all. */
      guest={isSupabaseConfigured() && !user}
      recent={recent}
      wallet={
        Number.isFinite(wallet.credits)
          ? { credits: wallet.credits, inTrial: wallet.inTrial, trialEndsAt: wallet.trialEndsAt }
          : null /* unmetered local dev: show nothing rather than "Infinity left" */
      }
      isAdmin={admin}
      prefill={prefill}
    />
  );
}
