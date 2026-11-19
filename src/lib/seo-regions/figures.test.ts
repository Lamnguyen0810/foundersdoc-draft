import { test } from "node:test";
import assert from "node:assert/strict";
import { ExportError, OTHER_REGION, PHRASES, REGION_GROUPS, bandOf, countryKey, csvRows, isBrand, isoDay, pageOf, phraseTable, readExport, regionTable, searchBands, topSearches, totals, type RegionUpload } from "./figures";

/** SEO by region (0247): reading a Search Console export and working out where we show up. Sample figures only. */

const COUNTRIES = `Country,Clicks,Impressions,CTR,Position
Singapore,40,1000,4%,8.0
Vietnam,5,100,5%,3.0
Malaysia,1,300,0.33%,20.0
United Kingdom,0,50,0%,31.5
United States,2,"1,200",0.17%,44.2
Germany,0,10,0%,60
Hong Kong,0,0,0%,0
`;
const QUERIES = `Top queries,Clicks,Impressions,CTR,Position
founders doc,30,200,15%,1.2
nda template singapore,4,300,1.33%,9.0
free nda template singapore,1,100,1%,15.0
"loan agreement template, singapore",0,40,0%,22
term sheet,0,500,0%,50
`;
const upload = (more: Partial<RegionUpload> = {}): RegionUpload => ({ ...readExport({ "Countries.csv": COUNTRIES, "Queries.csv": QUERIES }), ...more });

test("a CSV is read with quoted cells, commas inside quotes and Windows line ends", () => {
  assert.deepEqual(csvRows('a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2'), [["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  assert.deepEqual(csvRows("﻿Country,Clicks\nSingapore,3\n"), [["Country", "Clicks"], ["Singapore", "3"]]);
});

test("an export is read: countries, searches, the period and a country filter", () => {
  const u = readExport({
    "foundersdoc.com-Performance/Countries.csv": COUNTRIES,
    "Queries.csv": QUERIES,
    "Dates.csv": "Date,Clicks\n2026-11-14,3\n2026-11-12,1\n2026-11-18,2\n",
    "Filters.csv": "Filter,Value\nSearch type,Web\nDate,Last 7 days\nCountry,Vietnam\n",
  });
  assert.deepEqual([u.date_from, u.date_to, u.country], ["2026-11-12", "2026-11-18", "Vietnam"]);
  assert.equal(u.countries.length, 7);
  assert.deepEqual(u.countries.find((c) => c.country === "United States"), { country: "United States", clicks: 2, impressions: 1200, position: 44.2 });
  assert.equal(u.queries[0].query, "term sheet", "searches are kept busiest first");
  assert.equal(upload().country, null, "no Filters file: every country");
});

test("the period is read however the export writes its dates", () => {
  assert.deepEqual(["2026-11-18", "18 Nov 2026", "Nov 18, 2026", "November 18, 2026", "18/11/2026", "11/18/2026", "18.11.2026", "3/4/2026"].map(isoDay), [
    "2026-11-18", "2026-11-18", "2026-11-18", "2026-11-18", "2026-11-18", "2026-11-18", "2026-11-18", "2026-04-03",
  ]);
  assert.deepEqual(["", "Date", "last 7 days", "32/13/2026"].map(isoDay), [null, null, null, null]);
  const u = readExport({ "Countries.csv": COUNTRIES, "Dates.csv": "Date,Clicks\n\"Nov 14, 2026\",3\n\"Nov 12, 2026\",1\n\"Nov 18, 2026\",2\n" });
  assert.deepEqual([u.date_from, u.date_to], ["2026-11-12", "2026-11-18"]);
});

test("the searches people really used are listed busiest first", () => {
  assert.deepEqual(topSearches(upload(), 3).map((q) => [q.query, q.impressions]), [["term sheet", 500], ["nda template singapore", 300], ["founders doc", 200]]);
  assert.equal(topSearches(upload()).length, 5);
});

test("something that is not an export is refused with how to make one", () => {
  assert.throws(() => readExport({ "notes.csv": "a,b\n1,2\n" }), (e: unknown) => e instanceof ExportError && /Download CSV/.test(e.message));
  assert.throws(() => readExport({}), ExportError);
});

test("the regions: showing or not, totals, and an average position weighted by impressions", () => {
  const rows = regionTable(upload());
  assert.deepEqual(rows.map((r) => r.name), [...REGION_GROUPS.map((g) => g.name), OTHER_REGION.name]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual([by.sg.showing, by.sg.impressions, by.sg.clicks, by.sg.position], [true, 1000, 40, 8]);
  /* Vietnam 100 at 3.0 and Malaysia 300 at 20.0 → (300 + 6000) / 400 = 15.75 */
  assert.deepEqual([by.sea.impressions, by.sea.clicks, by.sea.position, by.sea.from], [400, 6, 15.8, ["Malaysia", "Vietnam"]]);
  assert.deepEqual([by.hk.showing, by.hk.impressions, by.hk.position], [false, 0, null], "listed with no impressions is not showing");
  assert.deepEqual([by["anz-in"].showing, by["anz-in"].position], [false, null], "not listed at all is not showing");
  assert.deepEqual([by.other.impressions, by.other.from], [10, ["Germany"]]);
  assert.ok(rows.every((r) => r.change === null), "nothing to compare with yet");
});

test("the change since the upload before is in impressions, region by region", () => {
  const before = upload({ countries: [{ country: "Singapore", clicks: 1, impressions: 700, position: 12 }, { country: "Hong Kong", clicks: 0, impressions: 30, position: 40 }] });
  const by = Object.fromEntries(regionTable(upload(), before).map((r) => [r.id, r.change]));
  assert.deepEqual([by.sg, by.hk, by.sea, by.uk], [300, -30, 400, 50]);
});

test("a country is found under the names Search Console and people use", () => {
  assert.equal(countryKey(" Viet Nam "), "vietnam");
  assert.equal(countryKey("USA"), "united states");
  const rows = regionTable(upload({ countries: [{ country: "Viet Nam", clicks: 1, impressions: 5, position: 2 }, { country: "UK", clicks: 0, impressions: 7, position: 9 }] }));
  assert.deepEqual(rows.filter((r) => r.showing).map((r) => r.id), ["sea", "uk"]);
});

test("a followed search counts every search that holds all its words", () => {
  const rows = Object.fromEntries(phraseTable(upload()).map((r) => [r.phrase, r]));
  assert.equal(Object.keys(rows).length, PHRASES.length);
  /* "nda template singapore" (300 at 9.0) and "free nda template singapore" (100 at 15.0) → 400 at 10.5 */
  assert.deepEqual([rows["NDA template Singapore"].matches, rows["NDA template Singapore"].impressions, rows["NDA template Singapore"].position, rows["NDA template Singapore"].mostly], [2, 400, 10.5, null]);
  assert.deepEqual([rows["loan agreement template Singapore"].impressions, rows["loan agreement template Singapore"].position], [40, 22], "punctuation in a search does not hide it");
  assert.deepEqual([rows["term sheet template Singapore"].impressions, rows["term sheet template Singapore"].position], [0, null], '"term sheet" alone is a different search');
  assert.deepEqual([rows["Founders Doc"].brand, rows["Founders Doc"].position, rows["Founders Doc"].clicks], [true, 1.2, 30]);
  assert.deepEqual([rows["mutual NDA template"].matches, rows["mutual NDA template"].position], [0, null]);
});

test("a position is said as a page: 1 to 10 is page one, 11 to 20 nearly there, the rest further back", () => {
  assert.deepEqual([1, 3.7, 10, 10.9, 20, 20.1, 34].map(pageOf), [1, 1, 1, 2, 2, 3, 4]);
  assert.deepEqual([3.7, 10.9, 34, null].map(bandOf), ["one", "near", "far", null]);
  assert.deepEqual([pageOf(null), pageOf(0)], [null, null]);
});

test("a search for us by name is told apart from a search for a document", () => {
  for (const q of ["founders doc", "Founder Doc singapore", "foundersdoc.com", "fd ai", "FD Sign login", "founders docs nda"]) assert.equal(isBrand(q), true, q);
  for (const q of ["nda template singapore", "founders agreement template", "doc signing", "fd"]) assert.equal(isBrand(q), false, q);
});

test("the totals and the three groups count real searches, leaving our own name out of the page-one count", () => {
  const u = upload();
  assert.deepEqual(totals(u), { impressions: 2660, clicks: 48, regionsShowing: 5, regions: 7, pageOne: 1, nearly: 1 });
  const b = searchBands(u);
  /* page one: "founders doc" (1.2) and "nda template singapore" (9.0); nearly: "free nda template singapore" (15.0); far: 22 and 50 */
  assert.deepEqual([b.one.map((q) => q.query), b.near.map((q) => q.query), b.far.map((q) => q.query)], [
    ["nda template singapore", "founders doc"],
    ["free nda template singapore"],
    ["term sheet", "loan agreement template, singapore"],
  ]);
});
