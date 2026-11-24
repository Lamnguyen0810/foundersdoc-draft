import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, countdown, daysBetween, fmtDate, sgToday } from "./dates";
import { clientKey, derive } from "./derive";
import { bodyHtml, DEFAULT_TEMPLATES, render, unknownTokens } from "./templates";
import type { Sheet } from "./xlsx";

/* OnPoint (0267): sample companies only. No client data belongs in this file. */

test("dates: month ends stay month ends, Singapore today", () => {
  assert.equal(addMonths("2025-12-31", 3), "2026-03-31");
  assert.equal(addMonths("2025-12-31", 6), "2026-06-30");
  assert.equal(addMonths("2026-06-30", 6), "2026-12-31");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-15", 1), "2026-02-15");
  assert.equal(addMonths("2025-09-30", 7), "2026-04-30");
  assert.equal(daysBetween("2026-11-23", "2026-12-07"), 14);
  assert.equal(countdown("2026-11-23", "2026-11-23"), "due today");
  assert.equal(countdown("2026-11-24", "2026-11-23"), "in 1 day");
  assert.equal(countdown("2026-11-20", "2026-11-23"), "3 days overdue");
  assert.equal(fmtDate("2026-07-31"), "31 Jul 2026");
  assert.equal(fmtDate(null), "–");
  assert.equal(sgToday(new Date("2026-11-22T16:30:00Z")), "2026-11-23");
  assert.equal(sgToday(new Date("2026-11-22T15:59:00Z")), "2026-11-22");
});

test("client key: the same company however it is written", () => {
  assert.equal(clientKey("Sample Company Pte. Ltd."), clientKey("SAMPLE COMPANY PTE LTD"));
  assert.equal(clientKey("Sample Company Private Limited"), clientKey("Sample Company Pte Ltd"));
  assert.equal(clientKey("A & B Trading"), clientKey("A and B Trading"));
});

const ML: Sheet = {
  name: "Pte Ltd",
  rows: [
    ["Company Name", "UEN", "FYE", "Acc", "FS/Tax", "Sec", "Date of FS", "AGM Date", "AR Date", "ECI", null, null, "Tax Comp"],
    [null, null, null, null, null, null, null, null, null, "Revenue", "Profit", "Date", null],
    ["Sample Company Pte. Ltd.", "202600001A", "2025-12-31", "x", "x", "x", null, null, null, null, null, null, null],
    ["Example Consulting Pte. Ltd.", "202600002B", "2025-12-31", "x", "x", "x", "2026-05-01", "2026-06-01", null, 1, 1, "2026-03-01", null],
    ["Specimen Trading Pte. Ltd.", "202600003C", "2026-03-31", null, "x", "x", null, "Managed by client", null, null, null, null, "Waiver"],
    ["Placeholder Foods Pte. Ltd.", "202600004D", "2026-03-31", null, null, "x", null, "To strike off", null, null, null, null, null],
    ["Demo Logistics Pte. Ltd.", null, "2026-06-30", "x", null, null, "Exempted", null, null, null, null, null, null],
  ],
};

test("Master List: due dates from FYE, dates in the sheet mean done, words mean what they say", () => {
  const d = derive("ML", [ML], "2026-11-23");
  assert.deepEqual(d.kinds, ["Master List"]);
  assert.equal(d.clients.length, 5);
  const get = (name: string, type: string) => d.deadlines.find((x) => x.client_key === clientKey(name) && x.type === type);

  const a = "Sample Company Pte. Ltd.";
  assert.equal(get(a, "ECI")?.due_date, "2026-03-31");
  assert.equal(get(a, "FS")?.due_date, "2026-06-30");
  assert.equal(get(a, "AGM")?.due_date, "2026-06-30");
  assert.equal(get(a, "AR")?.due_date, "2026-07-31");
  assert.ok(["ECI", "FS", "AGM", "AR"].every((t) => get(a, t)?.status === "active"));

  const b = "Example Consulting Pte. Ltd.";
  assert.equal(get(b, "ECI")?.status, "completed");
  assert.equal(get(b, "ECI")?.done_on, "2026-03-01");
  assert.equal(get(b, "FS")?.status, "completed");
  assert.equal(get(b, "AGM")?.status, "completed");
  assert.equal(get(b, "AR")?.status, "active");

  const c = "Specimen Trading Pte. Ltd.";
  assert.equal(get(c, "ECI")?.status, "waived");
  assert.equal(get(c, "AGM")?.status, "not_applicable");
  assert.equal(get(c, "AR")?.status, "not_applicable");
  assert.equal(get(c, "FS")?.status, "active");

  const p = "Placeholder Foods Pte. Ltd.";
  assert.equal(get(p, "ECI"), undefined, "no FS/Tax service: no ECI");
  assert.equal(get(p, "AGM")?.status, "cancelled");
  assert.equal(get(p, "AR")?.status, "cancelled");

  const e = "Demo Logistics Pte. Ltd.";
  assert.equal(get(e, "FS")?.status, "not_applicable");
  assert.equal(get(e, "AGM"), undefined, "no Sec service: no AGM or AR");
  assert.equal(d.contacts.length, 0, "no email column: no contacts made up");
});

test("Nominee Service: latest expiry per client is live, old ones are not", () => {
  const ns: Sheet = {
    name: "Secretary",
    rows: [
      ["No", "Name", "Date start", "Date expire"],
      [1, "Sample Company Pte. Ltd.", "2025-01-01", "2025-12-31"],
      [2, "Sample Company Pte. Ltd.", "2026-01-01", "2026-12-31"],
      [3, "Example Consulting Pte. Ltd.", "2024-01-01", "2024-12-31"],
      [4, "Clients total", null, "2026-12-31"],
    ],
  };
  const d = derive("NS", [ns], "2026-11-23");
  const live = d.deadlines.filter((x) => x.status === "active");
  assert.equal(live.length, 1);
  assert.equal(live[0].due_date, "2026-12-31");
  assert.equal(live[0].label, "Corp-sec renewal");
  assert.equal(d.deadlines.length, 3);
});

test("Job Schedule and contacts", () => {
  const js: Sheet = {
    name: "Accounts",
    rows: [
      ["Client", "Frequency", "Last Completed"],
      ["Sample Company Pte. Ltd.", "Quarterly", "2026-09-30"],
      ["Example Consulting Pte. Ltd.", "Monthly", "2026-10-31"],
    ],
  };
  const gst: Sheet = { name: "GST", rows: [["Client", "Quarter ending", "Next Due"], ["Sample Company Pte. Ltd.", "Dec", "2027-01-31"]] };
  const ct: Sheet = {
    name: "Contacts",
    rows: [
      ["Company", "Contact", "Email"],
      ["Sample Company Pte Ltd", "Alex Tan", "Alex.Tan@example.com"],
      ["Example Consulting", "Jamie Lee", "not an email"],
    ],
  };
  const d = derive("JS", [js, gst, ct], "2026-11-23");
  assert.deepEqual(d.kinds, ["Job Schedule", "Contacts"]);
  assert.equal(d.deadlines.find((x) => x.source_key.startsWith("JS:Accounts:sample"))?.due_date, "2026-12-31");
  assert.equal(d.deadlines.find((x) => x.source_key.startsWith("JS:Accounts:example"))?.due_date, "2026-11-30");
  assert.equal(d.deadlines.find((x) => x.source_key.startsWith("JS:GST"))?.due_date, "2027-01-31");
  assert.deepEqual(d.contacts, [{ client_key: clientKey("Sample Company Pte. Ltd."), name: "Sample Company Pte Ltd", contact_name: "Alex Tan", contact_email: "alex.tan@example.com" }]);
});

test("a company listed twice gives one deadline per source key", () => {
  const twice: Sheet = { ...ML, rows: [...ML.rows, ML.rows[2]] };
  const d = derive("ML", [twice], "2026-11-23");
  const keys = d.deadlines.map((x) => x.source_key);
  assert.equal(new Set(keys).size, keys.length);
});

test("templates: tokens filled, nothing made up, unknown tokens caught", () => {
  const r = render(DEFAULT_TEMPLATES.AR, { type: "AR", label: null, company: "Sample Company Pte. Ltd.", uen: "202600001A", contact: "Alex Tan", due: "2026-12-07", today: "2026-11-23" });
  assert.equal(r.subject, "Reminder: Annual Return for Sample Company Pte. Ltd. due 7 Dec 2026");
  assert.match(r.body, /^Hi Alex Tan,/);
  assert.match(r.body, /in 14 days/);
  assert.deepEqual(r.missing, []);

  const n = render(DEFAULT_TEMPLATES.AR, { type: "AR", label: null, company: "Sample Company Pte. Ltd.", uen: null, contact: null, due: "2026-11-20", today: "2026-11-23" });
  assert.deepEqual(n.missing, ["UEN"], "a missing UEN blocks sending");
  assert.match(n.body, /^Hi there,/);
  assert.match(n.body, /3 days overdue/);
  assert.equal(n.notes.length, 1);

  const k = render(DEFAULT_TEMPLATES.CORP_SEC_EXPIRY, { type: "CORP_SEC_EXPIRY", label: "Nominee director renewal", company: "Sample Company Pte. Ltd.", uen: "1", contact: "Alex", due: "2026-12-31", today: "2026-11-23" });
  assert.match(k.subject, /Nominee director renewal/);

  assert.deepEqual(unknownTokens("Hi {contact}, {due_date} {Company} {first_name}"), ["{Company}", "{first_name}"]);
  for (const t of Object.values(DEFAULT_TEMPLATES)) assert.deepEqual(unknownTokens(t.subject + t.body), []);
});

test("email HTML escapes the words it is given", () => {
  const h = bodyHtml("Hi <b>Alex</b> & co\n\nLine two", "Test: would have gone to someone");
  assert.ok(h.includes("Hi &lt;b&gt;Alex&lt;/b&gt; &amp; co"));
  assert.ok(!h.includes("<b>Alex"));
  assert.equal((h.match(/<p /g) ?? []).length, 3);
});

test("designed email: logo, deadline card, escaped words, footer", async () => {
  const { emailHtml, logoUrl } = await import("./templates");
  const h = emailHtml("Hi <b>Alex</b>,\n\nPlease reply.", {
    logoUrl: "https://foundersdoc.com/api/onpoint/logo?v=default",
    sender: "Sample & Co",
    deadline: { type: "Annual Return (ACRA)", company: "Sample Company Pte. Ltd.", uen: "SAMPLE-UEN-1", due: "2026-12-24", today: "2026-11-24" },
    banner: "Test: would have gone to someone",
  });
  assert.ok(h.includes('src="https://foundersdoc.com/api/onpoint/logo?v=default"'));
  assert.ok(h.includes("Annual Return (ACRA) due 24 Dec 2026"));
  assert.ok(h.includes("in 30 days"));
  assert.ok(h.includes("SAMPLE-UEN-1"));
  assert.ok(h.includes("Hi &lt;b&gt;Alex&lt;/b&gt;,") && !h.includes("<b>Alex"));
  assert.ok(h.includes("Sample &amp; Co"));
  assert.ok(h.includes("Test: would have gone to someone"));
  const late = emailHtml("x", { logoUrl: "https://x/l.png", sender: "S", deadline: { type: "ECI", company: "C", uen: null, due: "2026-11-20", today: "2026-11-24" } });
  assert.ok(late.includes("4 days overdue") && !late.includes(">UEN<"));
  assert.match(logoUrl("https://foundersdoc.com/", null), /^https:\/\/foundersdoc\.com\/api\/onpoint\/logo\?v=default$/);
  assert.notEqual(logoUrl("https://a", "data:image/png;base64,AAAA"), logoUrl("https://a", "data:image/png;base64,BBBB"));
});
