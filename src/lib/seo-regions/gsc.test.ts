import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { countryName, regionTable } from "./figures";
import { GscError, assertion, countryRows, fetchRegionUploads, gscConfigured, gscKey, period, queryRows } from "./gsc";

/**
 * Reading Search Console automatically (0248). The network is closed here: every request is answered by this
 * file, with made-up figures, so nothing reaches Google and no real key is ever used.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const KEY = { client_email: "seo-reader@example.iam.gserviceaccount.com", private_key: PEM };
const setKey = (v: string | undefined) => (v === undefined ? delete process.env.GSC_SERVICE_ACCOUNT_JSON : (process.env.GSC_SERVICE_ACCOUNT_JSON = v));

test("the key: read from Vercel's setting, and anything that is not a key counts as not set up", () => {
  setKey(undefined);
  assert.equal(gscConfigured(), false);
  for (const bad of ["", "not json", "{}", JSON.stringify({ client_email: "x@y" }), JSON.stringify({ client_email: "x@y", private_key: "abc" })]) {
    setKey(bad);
    assert.equal(gscKey(), null, bad);
  }
  /* a key pasted with its line breaks written as \n is still a key */
  setKey(JSON.stringify({ ...KEY, private_key: PEM.replace(/\n/g, "\\n") }));
  assert.equal(gscKey()!.private_key, PEM);
});

test("the request to Google is signed with the key, asks only to read, and lasts an hour", () => {
  const [head, claims, signature] = assertion(KEY, 1_800_000_000).split(".");
  const read = (v: string) => JSON.parse(Buffer.from(v, "base64url").toString());
  assert.deepEqual(read(head), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(read(claims), { iss: KEY.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: 1_800_000_000, exp: 1_800_003_600 });
  assert.equal(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url")), true);
});

test("the period is the last 7 full days Search Console has, ending 3 days ago", () => {
  assert.deepEqual(period(new Date("2026-11-19T00:30:00Z")), { start: "2026-11-10", end: "2026-11-16" });
});

test("Google's rows become the stored shapes; a country code becomes its name", () => {
  assert.deepEqual([countryName("sgp"), countryName("VNM"), countryName("deu")], ["Singapore", "Vietnam", "DEU"]);
  assert.deepEqual(countryRows([{ keys: ["gbr"], clicks: 1, impressions: 40, position: 31.4567 }, { keys: [""] }]), [{ country: "United Kingdom", clicks: 1, impressions: 40, position: 31.5 }]);
  assert.deepEqual(queryRows([{ keys: ["nda template singapore"], clicks: 2, impressions: 90, position: 8.04 }, {}]), [{ query: "nda template singapore", clicks: 2, impressions: 90, position: 8 }]);
});

test("a day's reading: one set for every country, then one for each followed country that showed", async (t) => {
  setKey(JSON.stringify(KEY));
  const asked: Array<{ url: string; body: Record<string, unknown> | string }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: { body: unknown; headers: Record<string, string> }) => {
    if (url === "https://oauth2.googleapis.com/token") {
      asked.push({ url, body: String(init.body) });
      return new Response(JSON.stringify({ access_token: "token-for-the-test" }));
    }
    const body = JSON.parse(String(init.body)) as { dimensions: string[]; dimensionFilterGroups?: Array<{ filters: Array<{ expression: string }> }> };
    asked.push({ url, body });
    assert.equal(init.headers.Authorization, "Bearer token-for-the-test");
    if (body.dimensions[0] === "country")
      return new Response(JSON.stringify({ rows: [{ keys: ["sgp"], clicks: 40, impressions: 1000, position: 8 }, { keys: ["vnm"], clicks: 5, impressions: 100, position: 3 }, { keys: ["deu"], clicks: 0, impressions: 9, position: 60 }, { keys: ["hkg"], clicks: 0, impressions: 0, position: 0 }] }));
    const only = body.dimensionFilterGroups?.[0].filters[0].expression;
    return new Response(JSON.stringify({ rows: [{ keys: [only === "vnm" ? "founders doc" : "nda template singapore"], clicks: 3, impressions: 50, position: 2 }] }));
  });
  const uploads = await fetchRegionUploads(new Date("2026-11-19T00:30:00Z"));
  assert.deepEqual(uploads.map((u) => [u.country, u.date_from, u.date_to, u.queries[0].query]), [
    [null, "2026-11-10", "2026-11-16", "nda template singapore"],
    ["Singapore", "2026-11-10", "2026-11-16", "nda template singapore"],
    ["Vietnam", "2026-11-10", "2026-11-16", "founders doc"],
  ]);
  /* Hong Kong had no impressions and Germany is not followed: neither is asked about */
  assert.equal(asked.length, 5);
  assert.ok(asked.slice(1).every((a) => a.url === "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Afoundersdoc.com/searchAnalytics/query"));
  assert.match(String(asked[0].body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  const regions = Object.fromEntries(regionTable(uploads[0]).map((r) => [r.id, r.impressions]));
  assert.deepEqual([regions.sg, regions.sea, regions.hk, regions.other], [1000, 100, 0, 9]);
});

test("when Google refuses, the message says what to fix and never holds the key", async (t) => {
  setKey(JSON.stringify(KEY));
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.includes("oauth2") ? new Response(JSON.stringify({ access_token: "t" })) : new Response(JSON.stringify({ error: { message: "User does not have sufficient permission for site." } }), { status: 403 }),
  );
  await assert.rejects(fetchRegionUploads(), (e: unknown) => e instanceof GscError && /Users and permissions/.test(e.message) && !e.message.includes("PRIVATE KEY"));
  setKey(undefined);
  await assert.rejects(fetchRegionUploads(), /GSC_SERVICE_ACCOUNT_JSON is not set/);
});
