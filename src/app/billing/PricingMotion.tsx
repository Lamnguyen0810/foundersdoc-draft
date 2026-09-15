"use client";

import { useEffect } from "react";

/**
 * The design's script, as a client component: reveal-on-scroll and the
 * active state on the sticky section tabs. Theme toggle, dropdowns, burger and
 * scroll progress belong to the design's own header, which the app replaces
 * with AppNav, so they are not here. Everything is torn down on unmount.
 */
export default function PricingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".fdp");
    if (!root || !("IntersectionObserver" in window)) return;

    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            reveal.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    root.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));

    const tabs = Array.from(root.querySelectorAll<HTMLAnchorElement>(".tab-link"));
    const ids = ["trial", "credits", "memberships", "topups", "compare"];
    const setActive = (id: string) =>
      tabs.forEach((t) => {
        const on = t.getAttribute("href") === `#${id}`;
        t.classList.toggle("active", on);
        if (on) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      });
    const sections = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.12, 0.25, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) sections.observe(el);
    });

    return () => {
      reveal.disconnect();
      sections.disconnect();
    };
  }, []);

  return null;
}
