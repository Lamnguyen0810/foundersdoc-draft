"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

/**
 * Records that a page was opened.
 *
 * WHY THIS DID NOT EXIST BEFORE, AND WHY IT HAD TO
 *   `page_view` has always been in the event vocabulary, and nothing has ever
 *   sent one. Every visitor figure on the admin page was therefore either
 *   invented by the design's own random generator or, once pointed at the
 *   database, a nought. "Show real statistics" is not achievable by deleting
 *   the fake ones; the rows have to start existing.
 *
 *   It is one line of consequence in a client component because the App Router
 *   navigates without a document load: a server-side counter would see the
 *   first page of a session and none of the rest.
 *
 * WHAT IT DOES NOT DO
 *   It sets no cookie and reads no storage of its own. The visit id comes from
 *   sessionStorage via track(), dies with the tab, and is not an identity. The
 *   path is stripped of its query string and of any id in it — on the server,
 *   in /api/events — so /draft/7f3c… is counted as /draft/:id and no matter
 *   reference reaches the analytics table.
 */
export default function PageView() {
  const pathname = usePathname();

  /* React runs effects twice in development. Without this the first page of
     every dev session counts double, which is a small lie but still a lie. */
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    track("page_view");
  }, [pathname]);

  return null;
}
