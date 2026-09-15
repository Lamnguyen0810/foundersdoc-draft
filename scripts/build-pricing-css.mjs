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

const DROP = [".top-banner", ".banner-close", ".top-chip", ".header", ".nav",
              ".brand", ".links", ".has-sub", ".nav-sub", ".nav-btn",
              ".nav-left", ".nav-right", ".nav-links"];

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
    if (s.startsWith(".fdp")) return s;
    return ".fdp " + s;
  }).filter(Boolean).join(",");
}

function scopeRules(text) {
  return topLevelRules(text).map((rule) => {
    const i = rule.indexOf("{");
    const sel = rule.slice(0, i).trim();
    const body = rule.slice(i + 1, rule.lastIndexOf("}"));
    if (sel.startsWith("@")) return `${sel}{${scopeRules(body)}}`;
    if (DROP.some((d) => sel.includes(d))) return "";
    return `${scopeSelector(sel)}{${body.trim()}}`;
  }).filter(Boolean).join("\n");
}

console.log("/* GENERATED — do not edit by hand.");
console.log(" * Source: the uploaded pricing design, via scripts/build-pricing-css.mjs.");
console.log(" * Re-run that script against a new version of the design rather than");
console.log(" * patching this file, or the next revision will undo your edits. */");
console.log(scopeRules(css));
