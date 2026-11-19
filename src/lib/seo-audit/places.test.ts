import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES, TEMPLATE_GROUPS, templatePaths } from "@/lib/templates/data";
import { GUIDES, GUIDE_CARDS, guidePath } from "@/lib/products/esign-guides";

/**
 * Every page has a door (0246): no template or guide may be left with nothing on the site leading to it.
 * A page that only the sitemap knows about is hard for a visitor to find and weak in search.
 * Run: npm run test:seo (part of npm test).
 */

const file = (name: string) => readFileSync(join(process.cwd(), "public", name), "utf8");

test("every template is on the Templates page, in exactly one group", () => {
  const placed = TEMPLATE_GROUPS.flatMap((g) => g.slugs);
  assert.deepEqual([...placed].sort(), TEMPLATES.map((t) => t.slug).sort(), "a template is missing from the groups, or a group names one that does not exist");
  assert.equal(new Set(placed).size, placed.length, "a template is in two groups");
  assert.ok(TEMPLATE_GROUPS.every((g) => g.slugs.length > 0 && /^[a-z]+$/.test(g.id)));
});

test("every country and variant page hangs under a template that is on the Templates page", () => {
  const parents = new Set(TEMPLATE_GROUPS.flatMap((g) => g.slugs));
  for (const path of templatePaths()) {
    const [, , doc] = path.split("/");
    if (doc) assert.ok(parents.has(doc), `${path} has no parent on the Templates page`);
  }
});

test("every FD Sign guide is in the guides block, on the Resources page and one click from the menu", () => {
  const cards = new Set(GUIDE_CARDS.map((c) => c.href));
  const resources = file("resources.html");
  for (const g of GUIDES) {
    assert.ok(cards.has(guidePath(g)), `${guidePath(g)} is not in the FD Sign page's guides block`);
    assert.ok(resources.includes(`href="${guidePath(g)}"`), `${guidePath(g)} is not on the Resources page`);
  }
});

test("the home page leads to the Templates page, the FD Sign page and the guides", () => {
  const home = file("index.html");
  for (const href of ["/templates", "/e-signature", "/e-signature#guides"]) assert.ok(home.includes(`href="${href}"`), `the home page has no link to ${href}`);
  /* the strip of contracts points at template pages, not straight into the drafting tool */
  assert.ok(!/class="track"[\s\S]{0,2500}href="\/draft\?type=/.test(home), "a contract in the home page strip skips its template page");
});

test("every template the home page names exists", () => {
  const known = new Set(templatePaths());
  for (const m of file("index.html").matchAll(/href="(\/templates\/[^"#?]+)"/g)) assert.ok(known.has(m[1]), `the home page links to ${m[1]}, which is not a page`);
});
