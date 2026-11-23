import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessEmail } from "./access-email";

/** One-press access to a client's ESOP dashboard (0264). Sample names only. Run: npm run test:esop */

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const LINK = "https://foundersdoc.com/auth/confirm?token_hash=abc&type=magiclink&next=%2Fesop%2Fsample";

test("the access email: the vesting's style of subject, one button, and how to get a new link", () => {
  const m = accessEmail({ company: "Sample Company (TEST)", slug: "sample", link: LINK, origin: "https://foundersdoc.com" });
  assert.equal(m.subject, "FD x Sample Company ESOP: Your Dashboard Access");
  assert.ok(m.html.includes(`href="${LINK.replace(/&/g, "&amp;")}"`), "the button is the sign-in link, escaped");
  assert.match(m.html, /Open the dashboard/);
  assert.match(m.html, /foundersdoc\.com\/esop\/access/, "next time: type your email");
  assert.match(m.html, /please don't forward this email/);
  assert.ok(m.text.includes(LINK));
  assert.ok(!/hitpay-logo/.test(m.html), "another company does not get HitPay's logo");
  assert.match(accessEmail({ company: "HitPay", slug: "hitpay", link: LINK }).html, /hitpay-logo\.png/);
});

test("the link goes to that person only, and only if they are on the dashboard", () => {
  const lib = src("src/lib/esop/access.ts");
  assert.match(lib, /if \(!company\) return "not_member";/);
  assert.match(lib, /to: email, name: "", subject: mail\.subject[^\n]*cc: \[\] \}/, "to that address, never copied");
  assert.ok(!/email_override/.test(lib), "never to a simulation inbox: the button signs in as them");
  assert.match(lib, /`\/esop\/\$\{company\.slug\}`/, "it opens their own dashboard");
});

test("the public page tells nobody who our clients are, and the Founders Doc button stays gated", () => {
  const pub = src("src/app/api/esop/access/route.ts");
  assert.match(pub, /\/\* sent, not on a dashboard, or too soon: the same words \*\//);
  assert.ok(!/not_member/.test(pub.split("the same words")[1] ?? ""), "no separate answer for a stranger");
  const mw = src("src/lib/supabase/middleware.ts");
  assert.match(mw, /"\/esop\/access",\n\s+"\/api\/esop\/access",/);
  assert.match(src("src/app/api/esop/access-invite/route.ts"), /if \(!\(await isAdmin\(\)\)\) return NextResponse\.json\(\{ error: "Only Founders Doc can send this\." \}, \{ status: 403 \}\);/);
  assert.match(src("src/app/auth/confirm/route.ts"), /if \(next\.startsWith\("\/esop\/"\)\) return NextResponse\.redirect\(new URL\("\/esop\/access\?error=link-expired"/);
});
