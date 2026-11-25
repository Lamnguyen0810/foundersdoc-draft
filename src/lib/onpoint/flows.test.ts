import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFlow, cleanFlowDays, flowHit, flowLine, nextReminder, okHook, whenDetail, whenTitle } from "./flows";

/* Rules & flows (0294): sample data only. */

const dl = (due: string, type = "AR", status = "active") => ({ type, due_date: due, status }) as never;

test("flows: fire on the chosen days before, or the days after a deadline passes", () => {
  const before = { enabled: true, trigger: "before" as const, types: ["AR" as const], days: [30, 14, 7] };
  assert.equal(flowHit(before, dl("2026-12-07"), "2026-11-23"), 14);
  assert.equal(flowHit(before, dl("2026-12-08"), "2026-11-23"), null);
  assert.equal(flowHit(before, dl("2026-12-07", "AGM"), "2026-11-23"), null, "another type");
  assert.equal(flowHit({ ...before, enabled: false }, dl("2026-12-07"), "2026-11-23"), null, "switched off");
  assert.equal(flowHit(before, dl("2026-12-07", "AR", "completed"), "2026-11-23"), null, "done");
  const late = { enabled: true, trigger: "overdue" as const, types: [], days: [0, 7] };
  assert.equal(flowHit(late, dl("2026-11-22"), "2026-11-23"), 0, "the day after it was due");
  assert.equal(flowHit(late, dl("2026-11-23"), "2026-11-23"), null, "due today is not overdue");
  assert.equal(flowHit(late, dl("2026-11-15", "ECI"), "2026-11-23"), 7);
  assert.equal(flowHit(late, dl("2026-11-16"), "2026-11-23"), null);
});

test("flows: input is checked before it is saved", () => {
  assert.deepEqual(cleanFlowDays([7, "14", 14, -1, 400, 2.5], "before"), [14, 7]);
  assert.deepEqual(cleanFlowDays([0, 3], "overdue"), [3, 0]);
  assert.deepEqual(cleanFlowDays([0], "before"), []);
  const ok = cleanFlow({ name: " AGM 21 day ", trigger: "before", types: ["AGM", "NOPE"], days: [21], actions: ["email_client", "slack", "rm -rf"] });
  assert.deepEqual(ok, { name: "AGM 21 day", enabled: true, trigger: "before", types: ["AGM"], days: [21], actions: ["email_client", "slack"] });
  assert.ok("error" in cleanFlow({ name: "", days: [1], actions: ["slack"] }));
  assert.ok("error" in cleanFlow({ name: "x", days: [], actions: ["slack"] }));
  assert.ok("error" in cleanFlow({ name: "x", days: [3], actions: [] }));
});

test("flows: the words on the cards", () => {
  const name = (t: string) => ({ AR: "Annual Return", ECI: "ECI" })[t] ?? t;
  assert.equal(whenTitle({ trigger: "before", types: ["AR"] }, name as never), "Annual Return approaching");
  assert.equal(whenTitle({ trigger: "overdue", types: [] }, name as never), "Any deadline passes its due date");
  assert.equal(whenDetail({ trigger: "before", days: [7, 30, 14] }), "30, 14, 7 days before the due date");
  assert.equal(whenDetail({ trigger: "overdue", days: [0] }), "the day after it is due");
  assert.equal(flowLine("Sample Company Pte. Ltd.", "Annual Return", "2026-11-20", "2026-11-23"), "Sample Company Pte. Ltd.: Annual Return, 3 days overdue (2026-11-20)");
});

test("next reminder: the next lead time ahead, due-day, or escalated", () => {
  assert.deepEqual(nextReminder(dl("2026-12-24"), [30, 14, 7], "2026-11-23"), { kind: "date", date: "2026-11-24", inDays: 1 });
  assert.deepEqual(nextReminder(dl("2026-12-10"), [30, 14, 7], "2026-11-23"), { kind: "date", date: "2026-11-26", inDays: 3 });
  assert.deepEqual(nextReminder(dl("2026-11-27"), [30, 14, 7], "2026-11-23"), { kind: "dueday" });
  assert.deepEqual(nextReminder(dl("2026-11-30"), [30, 14, 7], "2026-11-23"), { kind: "date", date: "2026-11-23", inDays: 0 });
  assert.deepEqual(nextReminder(dl("2026-11-20"), [30], "2026-11-23"), { kind: "escalated" });
  assert.deepEqual(nextReminder(dl("2026-12-23"), [30], "2026-11-23", true), { kind: "none" }, "paused");
});

test("hooks: only Slack and Zapier hook addresses are accepted", () => {
  assert.ok(okHook("slack", "https://hooks.slack.com/services/T000/B000/XXXX"));
  assert.ok(!okHook("slack", "http://hooks.slack.com/services/T000/B000/XXXX"));
  assert.ok(!okHook("slack", "https://evil.example.com/services/x"));
  assert.ok(okHook("zapier", "https://hooks.zapier.com/hooks/catch/1/abc/"));
  assert.ok(!okHook("zapier", "https://hooks.zapier.com.evil.example/hooks/catch/1/abc/"));
  assert.ok(!okHook("zapier", "not a url"));
});

test("export: the Excel file has one sheet per table, text never runs as a formula", async () => {
  const JSZip = (await import("jszip")).default;
  const { writeXlsx } = await import("./xlsxWrite");
  const { readXlsx } = await import("./xlsx");
  const bytes = await writeXlsx<Uint8Array>(new JSZip(), { Deadlines: [{ Company: "Sample Company Pte. Ltd.", "Days left": 14, Note: "=1+1" }], Clients: [] }, "uint8array");
  const sheets = readXlsx(Buffer.from(bytes));
  assert.deepEqual(sheets.map((s) => s.name), ["Deadlines", "Clients"]);
  assert.deepEqual(sheets[0]!.rows[0], ["Company", "Days left", "Note"]);
  assert.deepEqual(sheets[0]!.rows[1], ["Sample Company Pte. Ltd.", 14, "=1+1"]);
});
