/**
 * Turns the uploaded pricing design into a stylesheet this app can serve.
 *
 *   node scripts/build-pricing-css.mjs <design.html> > src/app/billing/pricing.css
 *
 * TWO THINGS IT DOES, AND WHY
 *
 * 1. DROPS the design's banner, header and navigation. The page renders inside
 *    the app's own chrome; keeping them would give it two navigation bars.
 *
 * 2. NAMESPACES everything under `.fdp`. globals.css is 1,600 lines and already
 *    owns --ink, --line, --surface, --gold and --bg. Left on :root, the design's
 *    palette would silently restyle the entire application — every page, not
 *    just this one. Scoping is not tidiness here; it is the difference between
 *    a pricing page and a site-wide redesign nobody asked for.
 *
 * ── WHAT IT MUST NOT SCOPE, AND WHAT HAPPENED WHEN IT DID ───────────────────
 *    An earlier version of this script recursed into EVERY at-rule. Inside
 *    @media that is right. Inside @keyframes it is a disaster: the "selectors"
 *    there are `from`, `to` and percentages, and `.fdp from` is not a legal
 *    keyframe selector, so the browser silently discarded every frame. The
 *    named animation still existed, so `animation: heroItemIn … forwards`
 *    looked fine and ran — but it had nothing to animate to. Anything sitting
 *    at `opacity: 0` waiting for its entrance animation stayed at zero for
 *    ever, and the account summary at the top of the pricing page rendered as
 *    a blank white card. Nothing in the console, nothing in the build.
 *
 *    So: only at-rules that CONTAIN rules are recursed into. Everything else —
 *    @keyframes, @font-face, @property, @page — is copied out untouched.
 */
import fs from "node:fs";

const src = process.argv[2];
if (!src) { console.error("usage: build-pricing-css.mjs <design.html>"); process.exit(1); }

const html = fs.readFileSync(src, "utf8");
const raw = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
if (!raw) { console.error("no <style> block found"); process.exit(1); }

// Comments are stripped FIRST. Left in, one sitting between two rules ends up
// inside the next selector — legal CSS, but unreadable and a trap for whoever
// edits this next.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/* The design ships its own site header. The app renders AppNav instead, so
   every rule for that header is dropped rather than namespaced. */
const DROP = [".top-banner", ".banner-close", ".top-chip", ".header", ".nav",
              ".brand", ".links", ".has-sub", ".nav-sub", ".nav-btn",
              ".nav-left", ".nav-right", ".nav-links", ".fd-wordmark",
              ".nav-tools", ".nav-cta", ".theme-btn", ".burger", ".mobile-menu",
              ".progress"];

function topLevelRules(text) {
  const out = []; let depth = 0, buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { out.push(buf); buf = ""; }
  }
  return out;
}

function scopeSelector(sel) {
  return sel.split(",").map((one) => {
    const s = one.trim();
    if (!s) return null;
    if (s === "*") return ".fdp *";
    if (s === ":root" || s === "html" || s === "body") return ".fdp";
    /* `html[data-theme="dark"] { --tokens }` is the design's dark palette. The
       attribute lives on the real <html>, so the scope goes AFTER it. */
    if (/^html\[/.test(s)) return s.replace(/^html(\[[^\]]+\])\s*/, "html$1 .fdp ");
    if (s.startsWith(".fdp")) return s;
    return ".fdp " + s;
  }).filter(Boolean).join(",");
}

/* At-rules whose body is a list of RULES, so scoping has to continue inside.
   Every other at-rule holds declarations or keyframe steps, which must be left
   exactly as the designer wrote them. */
const NESTS_RULES = /^@(media|supports|layer|container|scope)\b/;

function scopeRules(text) {
  return topLevelRules(text).map((rule) => {
    const i = rule.indexOf("{");
    const sel = rule.slice(0, i).trim();
    const body = rule.slice(i + 1, rule.lastIndexOf("}"));
    if (sel.startsWith("@")) {
      return NESTS_RULES.test(sel)
        ? `${sel}{${scopeRules(body)}}`
        : `${sel}{${body.trim()}}`;   // @keyframes, @font-face, @property, …
    }
    if (DROP.some((d) => sel.includes(d))) return "";
    return `${scopeSelector(sel)}{${body.trim()}}`;
  }).filter(Boolean).join("\n");
}

console.log("/* GENERATED — do not edit by hand.");
console.log(" * Source: the uploaded pricing design, via scripts/build-pricing-css.mjs.");
console.log(" * Re-run that script against a new version of the design rather than");
console.log(" * patching this file, or the next revision will undo your edits. */");
console.log(scopeRules(css));
