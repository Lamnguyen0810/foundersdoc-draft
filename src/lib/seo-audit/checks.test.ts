import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage, checkSite, readPage, scoreOf } from "./checks";

const page = (head: string, body: string, url = "https://foundersdoc.com/about", status = 200) =>
  readPage({ url, origin: "https://foundersdoc.com", status, ms: 120, html: `<html lang="en"><head>${head}</head><body>${body}</body></html>` });

const goodHead =
  '<title>About Founders Doc — Start-up Lawyers in Singapore</title><meta name="description" content="Founders Doc is a Singapore law practice for founders and start-ups, advising early-stage companies around the world since 2021."><link rel="canonical" href="https://foundersdoc.com/about"><meta property="og:title" content="x"><meta property="og:description" content="y">';
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

test("a well-made page has nothing to fix", () => {
  const p = page(goodHead, `<h1>About</h1><p>${words(400)}</p><img src="a.png" alt="Team">`);
  assert.deepEqual(checkPage(p).map((f) => f.code), []);
  assert.equal(scoreOf(checkPage(p)), 100);
});

test("missing title is a problem, long description an improvement", () => {
  const p = page(`<meta name="description" content="${"x".repeat(200)}">`, `<h1>A</h1><p>${words(400)}</p>`);
  const codes = checkPage(p).map((f) => f.code);
  assert.ok(codes.includes("title-missing"));
  assert.ok(codes.includes("desc-long"));
  assert.ok(codes.includes("canonical-missing"));
});

test("noindex in the sitemap and broken structured data are problems", () => {
  const p = page(goodHead + '<meta name="robots" content="noindex"><script type="application/ld+json">{bad json</script>', `<h1>A</h1><p>${words(400)}</p>`);
  const levels = checkPage(p).filter((f) => f.level === "problem").map((f) => f.code);
  assert.deepEqual(levels.sort(), ["jsonld-invalid", "noindex"]);
});

test("errors stop the checks; images without alt are counted", () => {
  assert.deepEqual(checkPage(page("", "", "https://foundersdoc.com/x", 404)).map((f) => f.code), ["status"]);
  const p = page(goodHead, `<h1>A</h1><p>${words(400)}</p><img src="a"><img src="b" alt="">`);
  const f = checkPage(p).find((x) => x.code === "img-alt");
  assert.ok(f && f.what.startsWith("1 of 2"));
});

test("site rules: duplicate titles and pages nothing links to", () => {
  const a = page(goodHead, '<h1>A</h1><a href="/contact">c</a>', "https://foundersdoc.com/");
  const b = page(goodHead, "<h1>B</h1>", "https://foundersdoc.com/contact");
  const c = page(goodHead.replace("About", "Pricing"), "<h1>C</h1>", "https://foundersdoc.com/pricing");
  const codes = checkSite([a, b, c]).map((f) => `${f.code}:${f.url}`);
  assert.ok(codes.some((x) => x.startsWith("dup-title")));
  assert.ok(codes.includes("orphan:https://foundersdoc.com/pricing"));
  assert.ok(!codes.includes("orphan:https://foundersdoc.com/contact"));
});
