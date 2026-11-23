import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessCodeEmail, accessEmail } from "./access-email";

/** Password-free access to a client's ESOP dashboard (0264, 0266). Sample names only. Run: npm run test:esop */

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

test("the invitation signs nobody in: its button opens the sign-in page, so a forwarded email gives nothing away", () => {
  const m = accessEmail({ company: "Sample Company (TEST)", slug: "sample", email: "Alex.Tan@example.com", origin: "https://foundersdoc.com" });
  assert.equal(m.subject, "FD x Sample Company ESOP: Your Dashboard Access");
  assert.ok(m.html.includes('href="https://foundersdoc.com/esop/access?email=Alex.Tan%40example.com"'));
  assert.ok(!/token|auth\/confirm/.test(m.html + m.text), "no sign-in token in the email");
  assert.match(m.html, /type the 6-digit code we send to it/);
  assert.ok(!/hitpay-logo/.test(m.html), "another company does not get HitPay's logo");
  assert.match(accessEmail({ company: "HitPay", slug: "hitpay", email: "a@example.com" }).html, /hitpay-logo\.png/);
});

test("the code email: the code in the subject and the body, how long it lasts, never to be shared", () => {
  const c = accessCodeEmail({ company: "Sample Company", slug: "sample", code: "482910", minutes: 60 });
  assert.equal(c.subject, "FD x Sample Company ESOP: Your Sign-in Code 482910");
  assert.match(c.html, />482910</);
  assert.match(c.html, /It works once, for 60 minutes/);
  assert.match(c.text, /Never share the code with anyone, including Founders Doc/);
});

test("codes go only to someone on a dashboard, to that address only; wrong codes are capped; client sign-ins are posted", () => {
  const lib = src("src/lib/esop/access.ts");
  assert.match(lib, /const company = \(await membershipsOf\(email\)\)\[0\];\n\s+if \(!company\) return "not_member";/);
  assert.match(lib, /to: email, name: "", subject: mail\.subject[^\n]*cc: \[\] \}/, "to that address, never copied");
  assert.ok(!/email_override/.test(lib), "never to a simulation inbox");
  assert.match(lib, /const MAX_TRIES = 5;/);
  assert.ok(lib.includes("if (!isFounder && !/@foundersdoc\\.com$/.test(email)) {"), "our own logins are never posted");
  assert.ok(lib.includes("await teamNotice(`🔓 ${maskEmail(email)} has just signed in"), "a client's sign-in is posted, with the email masked");
  const verify = src("src/app/api/esop/access/verify/route.ts");
  assert.match(verify, /if \(!countTry\(email\)\) return/);
  assert.match(verify, /supabase\.auth\.verifyOtp\(\{ email, token: code, type: "email" \}\)/, "Supabase checks the code");
});

test("the public steps tell nobody who our clients are, and the Founders Doc button stays gated", () => {
  const pub = src("src/app/api/esop/access/route.ts");
  assert.match(pub, /\/\* sent, not on a dashboard, or too soon: the same words \*\//);
  const mw = src("src/lib/supabase/middleware.ts");
  assert.match(mw, /"\/esop\/access",\n\s+"\/api\/esop\/access",/);
  assert.match(src("src/app/api/esop/access-invite/route.ts"), /if \(!\(await isAdmin\(\)\)\) return NextResponse\.json\(\{ error: "Only Founders Doc can send this\." \}, \{ status: 403 \}\);/);
});
