"use client";

import { useEffect } from "react";

/**
 * The motion from the pricing design, as a component.
 *
 * The design ships this as a <script> at the bottom of a static page. In the
 * app it has to be a client component instead — and it has to clean up after
 * itself, because React mounts and unmounts this page repeatedly during a
 * session, and observers left running would pile up on every visit.
 *
 * Three behaviours, all decorative and all optional: a scroll-progress hairline,
 * a staggered reveal as sections enter view, and a cursor-tracking highlight on
 * the recommendation card. Every one of them is skipped when the viewer has
 * asked for reduced motion — the CSS respects that too, but a pointermove
 * listener that never stops firing is worth not attaching in the first place.
 */
export default function PricingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".fdp");
    if (!root) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    /* Reveal on scroll. Everything is made visible immediately when the browser
       has no IntersectionObserver or the viewer wants less motion — the content
       is the point; the animation is not. */
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".section-head, .card-grid .card, .topup-wrap, .footer-note, .recommended-bar, .hero-side",
      ),
    );

    targets.forEach((el) => {
      el.classList.add("fx-reveal");
      const grid = el.closest(".card-grid");
      if (grid) {
        const i = Array.from(grid.children).indexOf(el);
        el.style.setProperty("--fx-delay", `${Math.max(0, i) * 85}ms`);
      }
    });

    if (reduce || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("fx-visible", "is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("fx-visible", "is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    );
    targets.forEach((el) => observer.observe(el));

    /* The progress hairline. */
    const bar = root.querySelector<HTMLElement>(".scroll-progress");
    const onScroll = () => {
      if (!bar) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    /* Cursor highlight on the recommendation card. Fine pointers only: on a
       touch screen this fires on every tap and tilts the card under the
       finger, which reads as a glitch rather than a flourish. */
    const side = root.querySelector<HTMLElement>(".hero-side");
    const fine = window.matchMedia?.("(pointer:fine)").matches ?? false;
    const onMove = (e: PointerEvent) => {
      if (!side) return;
      const r = side.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      side.style.setProperty("--mouse-x", `${x * 100}%`);
      side.style.setProperty("--mouse-y", `${y * 100}%`);
      side.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 3.2}deg) rotateY(${(x - 0.5) * 4.2}deg) translateY(-2px)`;
    };
    const onLeave = () => {
      if (!side) return;
      side.style.setProperty("--mouse-x", "50%");
      side.style.setProperty("--mouse-y", "35%");
      side.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)";
    };
    if (side && fine) {
      side.addEventListener("pointermove", onMove);
      side.addEventListener("pointerleave", onLeave);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (side && fine) {
        side.removeEventListener("pointermove", onMove);
        side.removeEventListener("pointerleave", onLeave);
      }
    };
  }, []);

  return null;
}
