/**
 * The videos on /podcast that were added from the admin console (085), and
 * the words the page and the console share for them. Shared by the client
 * and the server — no imports from either side here.
 */

export const VIDEO_CATEGORIES: { value: string; label: string }[] = [
  { value: "general", label: "Lawyers react" },
  { value: "fundraising", label: "Fundraising" },
  { value: "companydocs", label: "Company docs" },
  { value: "hr", label: "HR" },
  { value: "ma", label: "M&A" },
];

/** The shelves on the page, by the id the page gives them. */
export const VIDEO_SHELVES: { value: string; label: string; pageId: string | null }[] = [
  { value: "general", label: "Lawyers react to TV and the headlines", pageId: "shelf-s0" },
  { value: "fundraising", label: "Fundraising and term sheets", pageId: "shelf-s1" },
  { value: "companydocs", label: "Company docs and people", pageId: "shelf-s2" },
  { value: "stories", label: "Founder stories and the endgame", pageId: "shelf-s3" },
  { value: "shorts", label: "Quick explainers (Shorts)", pageId: "shelf-shorts" },
  { value: "none", label: "New episodes only", pageId: null },
];

/** The shelf a topic usually belongs on. */
export const DEFAULT_SHELF: Record<string, string> = {
  general: "general",
  fundraising: "fundraising",
  companydocs: "companydocs",
  hr: "companydocs",
  ma: "stories",
};

export interface VideoRow {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  category: string;
  shelf: string;
  kind: "video" | "short";
  published_on: string;
  featured: boolean;
  status: "live" | "hidden";
  created_at: string;
  updated_at: string;
}

/** The 11-character id in any of the ways a YouTube link is written, or null. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return check(u.pathname.slice(1).split("/")[0]);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v) return check(v);
      const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function check(v: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
}
