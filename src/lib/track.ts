"use client";

import type { EventName, EventProps } from "./events";

/**
 * Record an event from the browser.
 *
 * Three properties this must have, in order of importance:
 *
 *   1. It can never break the page. Every failure is swallowed. A drafting
 *      session must not be interrupted because a counter did not increment.
 *   2. It survives navigation. sendBeacon hands the request to the browser,
 *      which delivers it even as the tab closes — which is the only way
 *      `draft_abandoned` ever arrives, since by definition the person left.
 *   3. It carries no identity. The id below lives in sessionStorage, not a
 *      cookie: it is not sent to anyone else, it does not follow someone
 *      between visits, and it is gone when the tab closes. That is what keeps
 *      this out of consent-banner territory.
 */

const KEY = "fd_anon";

function anonId(): string | null {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID().slice(0, 24);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private windows and locked-down browsers throw here. An event without an
    // id still counts; it just cannot be joined to the rest of the visit.
    return null;
  }
}

export function track(name: EventName, props?: EventProps): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      name,
      anon_id: anonId(),
      path: window.location.pathname,
      referrer: document.referrer || null,
      props: props ?? {},
    });

    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/events", blob)) return;

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never throw */
  }
}
