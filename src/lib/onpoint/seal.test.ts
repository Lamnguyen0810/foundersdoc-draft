import { test } from "node:test";
import assert from "node:assert/strict";
import { okSecret, sameMailbox, seal, sign, unseal, verify } from "./seal";

const KEY = "k".repeat(40);

test("links: signed, tamper-proof, expiring", () => {
  const t = sign({ k: "connect", w: "ws1", e: "alex.tan@example.com", x: Date.now() + 60_000 }, KEY);
  assert.equal(verify<{ e: string }>(t, KEY)?.e, "alex.tan@example.com");
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "connect", w: "ws1", e: "someone@else.com", x: Date.now() + 60_000 })).toString("base64url");
  assert.equal(verify(`${forged}.${sig}`, KEY), null, "a changed email is refused");
  assert.equal(verify(`${body}.${sig}`, "x".repeat(40)), null, "another key is refused");
  assert.equal(verify(sign({ k: "connect", x: Date.now() - 1 }, KEY), KEY), null, "an expired link is refused");
  assert.equal(verify("nonsense", KEY), null);
  assert.equal(verify(`${t}.extra`, KEY), null);
});

test("tokens: sealed and only opened with the same key", () => {
  const s = seal("refresh-token-value", KEY);
  assert.ok(!s.includes("refresh-token-value"));
  assert.notEqual(seal("refresh-token-value", KEY), s, "a new IV every time");
  assert.equal(unseal(s, KEY), "refresh-token-value");
  assert.equal(unseal(s, "y".repeat(40)), null);
  const parts = s.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.equal(unseal(parts.join("."), KEY), null);
});

test("secret length and mailbox match", () => {
  assert.equal(okSecret("short"), false);
  assert.equal(okSecret(KEY), true);
  assert.equal(sameMailbox("Alex.Tan@example.com", [null, "alex.tan@example.com"]), true);
  assert.equal(sameMailbox("alex.tan@example.com", ["jamie.lee@example.com"]), false);
});
