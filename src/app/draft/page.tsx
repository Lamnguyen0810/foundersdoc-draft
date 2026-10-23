import { forTheBrowser, loadDocTypes } from "@/lib/doctypes.server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { getWallet } from "@/lib/billing/credits";
import DraftChat from "./DraftChat";
import TermSheet from "./TermSheet";
import Employment from "./Employment";
import Contractor from "./Contractor";
import Cofounder from "./Cofounder";
import Sha from "./Sha";
import Spa from "./Spa";
import Ssa from "./Ssa";
import Ia from "./Ia";
import Services from "./Services";
import Loan from "./Loan";
import Cln from "./Cln";
import Ipaa from "./Ipaa";
import Jva from "./Jva";
import { recentDrafts } from "./recent";
import { loadCompanyProfile, loadPrefill } from "@/lib/settings.server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { draftHref, PUBLIC_SLUG, slugFromParam } from "@/lib/doc-links";
import { fdAiLd, ldJson } from "@/lib/seo";

/* The one screen in the app Google is welcome to read: a visitor can open it
   without an account, so it is what a search for "draft an NDA online" should
   land on. The root layout says noindex for everything else. */
const NDA_META = {
  title: "Draft an NDA Online in Minutes | FD AI by Founders Doc",
  description:
    "Draft a mutual or one-way non-disclosure agreement (NDA) online. Answer a few questions, get a lawyer-backed NDA in Word in minutes. Start free.",
};

/* /draft on its own is the catalogue of every document, so it gets its own
   title: sharing the NDA's made Google treat the two as copies. */
const CATALOGUE_META = {
  title: "Draft Legal Documents Online in Minutes | FD AI",
  description:
    "Answer a few questions and FD AI drafts your NDA, employment, contractor or shareholders' agreement from Founders Doc's own playbook. Start free.",
};

/* A shared link names the document it opens. The page used to say "Draft an
   NDA" for every one, so /draft?type=loanagreement previewed as an NDA in
   Slack and on WhatsApp. Each document now has its own title and its own
   canonical link; the NDA and the catalogue keep theirs. */
/** A document's name inside a sentence: "an IP assignment agreement" — capitals such as IP and NDA stay. */
const inSentence = (label: string) => label.replace(/\b[A-Z][a-z]+\b/g, (w) => w.toLowerCase());

/** Title, description and canonical link of /draft or of one document's link. */
function pageMeta(slug: string | undefined, docTypes: { slug: string; label: string }[]) {
  const d = slug && slug !== "nda" ? docTypes.find((x) => x.slug === slug) : undefined;
  if (!d) return slug === "nda" ? { ...NDA_META, url: `https://foundersdoc.com${draftHref("nda")}` } : { ...CATALOGUE_META, url: "https://foundersdoc.com/draft" };
  const article = /^[aeiou]/i.test(d.label) ? "an" : "a";
  return {
    title: `Draft ${article} ${d.label} Online | FD AI`,
    description: `Answer a few questions and FD AI drafts ${article} ${inSentence(d.label)} from Founders Doc's own master — lawyer-backed, Word in minutes. Start free.`,
    url: `https://foundersdoc.com${draftHref(d.slug)}`,
  };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type?: string }> }): Promise<Metadata> {
  const slug = slugFromParam((await searchParams).type);
  const { docTypes } = slug && slug !== "nda" ? await loadDocTypes() : { docTypes: [] };
  const { title, description, url } = pageMeta(slug, docTypes);
  return {
    robots: { index: true, follow: true },
    /* absolute: the title already names FD AI, so the layout's "· FD AI" is not added again. */
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Founders Doc", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
export const dynamic = "force-dynamic";

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string } & Record<string, string | string[] | undefined>>;
}) {
  const { docTypes: loaded } = await loadDocTypes();
  /* Questions and labels only — see forTheBrowser(). */
  const { docTypes, looks } = forTheBrowser(loaded);

  // `/draft?type=nondisclosureagreement` — the deep link the marketing site uses. An unknown slug
  // falls through to the catalogue rather than erroring, so a stale link on the
  // site lands somewhere sensible instead of breaking.
  const all = await searchParams;
  const raw = (typeof all.type === "string" ? all.type : "").trim().toLowerCase() || undefined;
  /* A document with a public name (the loan agreement: ?type=loanagreement)
     is moved there from its old link, so the address bar and anything shared
     from it carry the right name. */
  if (raw && PUBLIC_SLUG[raw]) {
    /* Everything else in the link travels with it — an email campaign's
       utm_ tags, which say where a sign-up came from. */
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(all)) {
      if (k === "type" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) rest.append(k, one);
    }
    const extra = rest.toString();
    redirect(`${draftHref(raw)}${extra ? `&${extra}` : ""}`);
  }
  const requested = slugFromParam(raw);
  const presetSlug = docTypes.find((d) => d.slug === requested)?.slug;

  const [user, recent, wallet, admin, prefill] = await Promise.all([
    isSupabaseConfigured() ? getUser() : Promise.resolve(null),
    recentDrafts(),
    getWallet(),
    isSupabaseConfigured() ? isAdmin() : Promise.resolve(false),
    isSupabaseConfigured() ? loadPrefill() : Promise.resolve(null),
  ]);
  const guest = isSupabaseConfigured() && !user;

  /* Structured data (schema.org): what FD AI is, who makes it and which
     documents it drafts, so a search engine or an AI assistant can describe
     it in its own words. Same description and link as the page's meta tags. */
  const meta = pageMeta(requested, loaded);
  const ld = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: ldJson(fdAiLd({ url: meta.url, description: meta.description, documents: loaded.map((d) => d.label) })) }}
    />
  );

  /* An assembled document — the term sheet, the employment agreement — has
     a screen of its own. The catalogue is DraftChat's; a pick there
     hard-navigates here with the slug, and this is where the branch happens. */
  const preset = docTypes.find((d) => d.slug === presetSlug);
  if (preset?.engine === "assembly") {
    const company = isSupabaseConfigured() && user ? await loadCompanyProfile() : null;
    const Screen =
      preset.slug === "employment"
        ? Employment
        : preset.slug === "contractor"
          ? Contractor
          : preset.slug === "cofounder"
            ? Cofounder
            : preset.slug === "sha"
              ? Sha
              : preset.slug === "spa"
                ? Spa
                : preset.slug === "ssa"
                  ? Ssa
                  : preset.slug === "ia"
                    ? Ia
                    : preset.slug === "services"
                      ? Services
                      : preset.slug === "loan"
                        ? Loan
                        : preset.slug === "cln"
                          ? Cln
                          : preset.slug === "ipaa"
                            ? Ipaa
                            : preset.slug === "jva"
                              ? Jva
                              : TermSheet;
    return (
      <>
        {ld}
        <Screen
          look={looks[preset.slug]}
          userEmail={user?.email ?? null}
          guest={guest}
          wallet={!guest && wallet && Number.isFinite(wallet.credits) ? { credits: wallet.credits, inTrial: wallet.inTrial, trialEndsAt: wallet.trialEndsAt } : null}
          isAdmin={admin}
          company={company}
          recent={recent}
        />
      </>
    );
  }

  /* A visitor has no wallet. credit_balance() answers 0 for nobody, which
     the screen would show as "0 credits — Add credits": a paywall for a
     person who has not been asked to pay, in the place the sign-up block
     is meant to speak from. Nothing is the truthful number here. */
  const credits = guest ? null : wallet;

  return (
    <>
      {ld}
      <DraftChat
        docTypes={docTypes}
        looks={looks}
        presetSlug={presetSlug}
        userEmail={user?.email ?? null}
        /* Accounts exist and this person has none: the questions are open to
           them, Generate is where they sign up. Never true when Supabase is
           absent — local development drafts without accounts at all. */
        guest={guest}
        recent={recent}
        wallet={
          credits && Number.isFinite(credits.credits)
            ? { credits: credits.credits, inTrial: credits.inTrial, trialEndsAt: credits.trialEndsAt }
            : null /* a visitor, or unmetered local dev: show nothing */
        }
        isAdmin={admin}
        prefill={prefill}
      />
    </>
  );
}
