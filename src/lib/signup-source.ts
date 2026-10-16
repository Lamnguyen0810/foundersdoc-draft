/**
 * Where a new account came from.
 *
 * The first page of the visit is remembered in the tab — the page, its title,
 * the referring SITE and any utm_ tags — and saved on the account when it is
 * made (supabase/091_signup_source.sql turns it into the "Came from:" line in
 * Slack and the list on the dashboard).
 *
 * WHAT IT KEEPS, AND FOR HOW LONG
 *   sessionStorage, like the visit id in track.ts: nothing leaves the browser
 *   until the person signs up, and it is gone when the tab closes. The referrer
 *   is cut to its host — a full referrer can carry search terms and private
 *   link ids. public/fd-track.js does the same on the static pages, under the
 *   same key, so a visit that starts on a blog post and ends on /signup keeps
 *   its first page.
 *
 * Not "use client": the callback route uses cleanSignupSource() to check what
 * came back through Google. The browser-only parts check for window first.
 */

import { slugFromParam } from "./doc-links";

export type SignupSource = {
  /** The first page, path only. */
  path?: string;
  /** Its title, without " — Founders Doc". */
  title?: string;
  /** "article" when the first page was a blog post. */
  kind?: "article";
  /** The document asked for, when the first page was /draft?type=… — the
   *  email campaign links straight to /draft?type=nondisclosureagreement. */
  doc?: string;
  /** The referring site's host, "direct" when there was none. */
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

const KEY = "fd_src";

function clip(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  // Printable text only; no control characters reach Slack or the dashboard.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  return s || undefined;
}

/** Keep only the known keys, short, as plain strings. Anything else is dropped. */
export function cleanSignupSource(v: unknown): SignupSource | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const path = clip(o.path, 200);
  const out: SignupSource = {
    path: path && path.startsWith("/") ? path.split(/[?#]/)[0] : undefined,
    title: clip(o.title, 140),
    kind: o.kind === "article" ? "article" : undefined,
    doc: /^[a-z0-9-]{1,30}$/.test(String(o.doc ?? "")) ? String(o.doc) : undefined,
    ref: clip(o.ref, 120)?.toLowerCase(),
    utm_source: clip(o.utm_source, 60),
    utm_medium: clip(o.utm_medium, 60),
    utm_campaign: clip(o.utm_campaign, 80),
  };
  for (const k of Object.keys(out) as (keyof SignupSource)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** This page, as a first page. */
function here(): SignupSource {
  let ref = "direct";
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      ref = host === window.location.hostname.replace(/^www\./, "") ? "internal" : host;
    }
  } catch {
    /* an unreadable referrer is no referrer */
  }
  const q = new URLSearchParams(window.location.search);
  const article = document.querySelector('meta[property="og:type"][content="article"]') !== null;
  return (
    cleanSignupSource({
      path: window.location.pathname,
      title: document.title.replace(/\s*[—–|-]\s*Founders Doc.*$/i, ""),
      kind: article || window.location.pathname.startsWith("/resources/") ? "article" : undefined,
      doc: window.location.pathname === "/draft" ? slugFromParam(q.get("type")) : undefined,
      ref,
      utm_source: q.get("utm_source") ?? undefined,
      utm_medium: q.get("utm_medium") ?? undefined,
      utm_campaign: q.get("utm_campaign") ?? undefined,
    }) ?? {}
  );
}

/** Remember this page if it is the first of the visit. Never throws. */
export function rememberLanding(): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify(here()));
  } catch {
    /* private windows throw; the sign-up then records the page it happened on */
  }
}

/** The first page of this visit — or, failing that, this one. Never throws. */
export function readSignupSource(): SignupSource {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    const saved = raw ? cleanSignupSource(JSON.parse(raw)) : null;
    if (saved && saved.path) return saved;
  } catch {
    /* fall through */
  }
  try {
    return here();
  } catch {
    return {};
  }
}
