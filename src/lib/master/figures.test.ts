import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { ALL_COLUMNS } from "./columns";
import { demoRows } from "./demo";
import { hoursText, master, singaporeDay, singaporeMidnight, stageText, steps, testEnvelopes, vestings, type MasterRows, type MCompany, type MEnvelope, type MSigner } from "./figures";

/**
 * The master dashboard's figures (0244). Sample companies and names only.
 * Run: npm run test:master (or npm test).
 */

/* 18 Nov 2026, 10:00 in Singapore */
const NOW = new Date("2026-11-18T02:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();
/** a vesting start that makes tranche 1 fall this many days from today */
const startFor = (daysFromNow: number) => {
  const d = new Date(Date.UTC(2026, 10, 18 + daysFromNow));
  return `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const MANAGED: MCompany = { id: "c-managed", slug: "sample-co", name: "Sample Company", plan: "premium", self_serve: false, simulation: false };
const OWN: MCompany = { id: "c-own", slug: "example-co", name: "Example Consulting", plan: "free", self_serve: true, simulation: false };

const empty = (): MasterRows => ({ envelopes: [], signers: [], companies: [], batches: [], holders: [], runs: [], certificates: [], alerts: [], requests: [], subscriptions: [] });
let seq = 0;
const env = (more: Partial<MEnvelope> = {}): MEnvelope => ({ id: `e${++seq}`, status: "sent", created_at: ago(1), completed_at: null, owner_id: "u1", owner_email: "alex.tan@example.com", owner_name: "Alex Tan", esop_holder_id: null, esop_tranche: null, ...more });
const signer = (e: MEnvelope, position: number, more: Partial<MSigner> = {}): MSigner => ({ envelope_id: e.id, position, status: "waiting", invited_at: null, viewed_at: null, ...more });

/** A company with one batch of `n` active holders whose tranche 1 vests `daysFromNow` days from today. */
function withBatch(c: MCompany, daysFromNow: number, n = 3, batch = 8): MasterRows {
  const r = empty();
  r.companies.push(c);
  r.batches.push({ company_id: c.id, batch, vesting_start: startFor(daysFromNow), tranches: 4 });
  for (let i = 0; i < n; i++) r.holders.push({ id: `${c.id}-h${i}`, company_id: c.id, batch, status: "Active" });
  r.holders.push({ id: `${c.id}-left`, company_id: c.id, batch, status: "Leaver" });
  return r;
}
const kinds = (r: MasterRows) => master(r, NOW).actions.map((a) => a.kind);

test("the day is Singapore's, whatever the server's clock says", () => {
  /* 17:30 UTC on 30 Nov is already 1 Dec in Singapore */
  const late = new Date("2026-11-30T17:30:00Z");
  const d = singaporeDay(late);
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()], [2026, 12, 1]);
  assert.equal(new Date(singaporeMidnight(late)).toISOString(), "2026-11-30T16:00:00.000Z");
});

test("a vesting two weeks away with no approval is raised; one further off is not", () => {
  assert.deepEqual(kinds(withBatch(MANAGED, 14)), ["unapproved"]);
  assert.deepEqual(kinds(withBatch(MANAGED, 15)), []);
  const a = master(withBatch(MANAGED, 10), NOW).actions[0];
  assert.equal(a.title, "Sample Company · B8-T1: not approved yet");
  assert.match(a.detail, /^3 certificates · vests 28 Nov 2026 \(in 10 days\)$/);
  assert.equal(a.href, "/esop/sample-co");
  assert.equal(a.tone, "warn");
  assert.equal(master(withBatch(MANAGED, 2), NOW).actions[0].tone, "err", "three days or fewer is urgent");
});

test("a vesting that passed without approval stays raised for 30 days, then drops off", () => {
  const late = master(withBatch(MANAGED, -5), NOW).actions[0];
  assert.equal(late.kind, "unapproved");
  assert.match(late.detail, /5 days ago/);
  assert.equal(late.tone, "err");
  assert.deepEqual(kinds(withBatch(MANAGED, -30)), ["unapproved"]);
  assert.deepEqual(kinds(withBatch(MANAGED, -31)), []);
});

test("a batch with nobody active, or with no vesting start, raises nothing", () => {
  assert.deepEqual(kinds(withBatch(MANAGED, 5, 0)), []);
  const r = withBatch(MANAGED, 5);
  r.batches[0].vesting_start = null;
  assert.deepEqual(kinds(r), []);
});

test("a managed vesting goes: approved, paid, certificates signed, done", () => {
  const r = withBatch(MANAGED, 5);
  const v = () => vestings(MANAGED, r, NOW)[0];
  assert.equal(stageText(v(), true), "Coming up");
  r.alerts.push({ company_id: MANAGED.id, ref: "B8-T1" });
  assert.equal(stageText(v(), true), "Alert sent, not approved");

  r.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(1), sent_at: ago(1), paid_at: null, simulation: false });
  assert.deepEqual(kinds(r), ["unpaid"]);
  assert.equal(stageText(v(), true), "Approved, waiting for payment");

  r.runs[0].paid_at = ago(0, 5);
  assert.deepEqual(kinds(r), ["unsigned"]);
  assert.equal(master(r, NOW).actions[0].title, "Sample Company · B8-T1: 3 certificates still to sign");

  /* two signed in FD Sign, the third uploaded to the holder's record */
  for (const i of [0, 1]) r.envelopes.push(env({ owner_id: null, owner_email: null, owner_name: null, status: "completed", completed_at: ago(0, 2), esop_holder_id: `${MANAGED.id}-h${i}`, esop_tranche: 1 }));
  assert.equal(stageText(v(), true), "2 of 3 certificates signed");
  assert.equal(master(r, NOW).actions[0].title, "Sample Company · B8-T1: 1 certificate still to sign");
  assert.deepEqual(steps(v(), true), [["Alert", true], ["Approved", true], ["Paid", true], ["Certificates", false]]);

  r.certificates.push({ holder_id: `${MANAGED.id}-h2`, tranche: 1 });
  assert.equal(v().done, true);
  assert.deepEqual(kinds(r), []);
  /* a leaver's missing certificate never holds a vesting open */
  assert.equal(v().certificates, 3);
});

test("a self-serve dashboard has no payment step: approved, then certificates on file", () => {
  const r = withBatch(OWN, 3, 2);
  r.runs.push({ company_id: OWN.id, ref: "B8-T1", approved_at: ago(1), sent_at: ago(1), paid_at: null, simulation: false });
  assert.deepEqual(kinds(r), ["unsigned"]);
  const a = master(r, NOW).actions[0];
  assert.equal(a.title, "Example Consulting · B8-T1: 2 certificates still to file");
  const v = vestings(OWN, r, NOW)[0];
  assert.equal(v.paid, null);
  assert.equal(stageText(v, false), "0 of 2 certificates on file");
  assert.deepEqual(steps(v, false).map((s) => s[0]), ["Alert", "Approved", "Certificates"]);
});

test("an approval made in a simulation is a rehearsal, not an approval", () => {
  const r = withBatch({ ...MANAGED, simulation: true }, 6);
  r.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(1), sent_at: ago(1), paid_at: ago(1), simulation: true });
  const a = master(r, NOW).actions;
  assert.deepEqual(a.map((x) => x.kind), ["unapproved"], "the real vesting is still coming and still needs approving");
  assert.match(a[0].detail, /rehearsed in simulation only · simulation is on$/);
  assert.equal(master(r, NOW).esop[0].simulation, true);
  assert.equal(stageText(vestings(r.companies[0], r, NOW)[0], true), "Rehearsed in simulation, not approved");
});

test("the approver's Modify is raised first; a Cancel stops the vesting being chased", () => {
  const r = withBatch(MANAGED, 6);
  r.requests.push({ company_id: MANAGED.id, ref: "B8-T1", kind: "modify" });
  const a = master(r, NOW).actions;
  assert.deepEqual(a.map((x) => [x.kind, x.tone]), [["request", "err"]]);
  r.requests[0].kind = "cancel";
  assert.deepEqual(kinds(r), []);
  assert.equal(stageText(vestings(MANAGED, r, NOW)[0], true), "Cancelled by the approver");
});

test("a vesting approved long ago and still unfinished is raised for 60 days", () => {
  const r = withBatch(MANAGED, -45);
  r.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(50), sent_at: ago(50), paid_at: null, simulation: false });
  assert.deepEqual(kinds(r), ["unpaid"]);
  assert.equal(master(r, NOW).actions[0].tone, "err");
  const old = withBatch(MANAGED, -61);
  old.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(70), sent_at: ago(70), paid_at: null, simulation: false });
  assert.deepEqual(kinds(old), []);
});

test("each ESOP row shows the vesting in progress, or else the next one; managed clients come first", () => {
  const r = withBatch(MANAGED, 40);
  const other = withBatch(OWN, 5, 2, 1);
  for (const k of ["companies", "batches", "holders"] as const) (r[k] as unknown[]).push(...other[k]);
  const rows = master(r, NOW).esop;
  assert.deepEqual(rows.map((x) => [x.name, x.managed, x.active, x.leavers]), [["Sample Company", true, 3, 1], ["Example Consulting", false, 2, 1]]);
  assert.deepEqual([rows[0].focus!.ref, rows[0].focus!.daysLeft], ["B8-T1", 40], "nothing in progress: the next vesting");
  assert.deepEqual([rows[1].focus!.ref, rows[1].focus!.daysLeft], ["B1-T1", 5]);
  const none = empty();
  none.companies.push(OWN);
  assert.equal(master(none, NOW).esop[0].focus, null);
});

test("signing: sent, completed, cancelled and still open, today and over 7 and 30 days", () => {
  const r = empty();
  r.envelopes.push(
    env({ created_at: ago(0, 1) }), // today, open
    env({ created_at: ago(0, 1), status: "voided" }), // today, cancelled
    env({ created_at: ago(3), status: "completed", completed_at: ago(0, 2) }), // sent 3 days ago, completed today
    env({ created_at: ago(20), status: "completed", completed_at: ago(19) }),
    env({ created_at: ago(40), status: "completed", completed_at: ago(39) }), // outside 30 days
    env({ created_at: ago(5), owner_id: null, owner_email: null, owner_name: null }), // Founders Doc's own
  );
  const s = master(r, NOW).sign;
  assert.deepEqual(s.windows.map((w) => [w.label, w.sent, w.completed, w.cancelled, w.own]), [
    ["Today", 2, 1, 1, 2],
    ["7 days", 4, 1, 1, 3],
    ["30 days", 5, 2, 1, 4],
  ]);
  assert.equal(s.openNow, 2);
});

test("signing: how long it takes, from sent to fully signed", () => {
  const r = empty();
  for (const hours of [2, 4, 30]) r.envelopes.push(env({ created_at: ago(2, hours), status: "completed", completed_at: ago(2) }));
  const t = master(r, NOW).sign.timeToSign;
  assert.equal(t.count, 3);
  assert.equal(Math.round(t.averageHours!), 12);
  assert.equal(Math.round(t.medianHours!), 4);
  assert.deepEqual(master(empty(), NOW).sign.timeToSign, { count: 0, averageHours: null, medianHours: null });
  assert.deepEqual([hoursText(null), hoursText(0.25), hoursText(4.04), hoursText(72)], ["–", "15 min", "4 h", "3 days"]);
});

test("signing: a signer waiting more than 2 days is raised, by the sender's account and the signer's place only", () => {
  const r = empty();
  const fresh = env({ created_at: ago(1) });
  const stuck = env({ created_at: ago(9) });
  r.envelopes.push(fresh, stuck);
  r.signers.push(signer(fresh, 1, { status: "invited", invited_at: ago(1) }));
  r.signers.push(signer(stuck, 1, { status: "signed", invited_at: ago(9) }), signer(stuck, 2, { status: "invited", invited_at: ago(8), viewed_at: ago(7) }));
  const m = master(r, NOW);
  assert.equal(m.sign.stalledNow, 1);
  assert.deepEqual(m.actions, [{ kind: "stalled", tone: "err", title: "Alex Tan's request · signer 2 of 2", detail: "opened, not signed · 8 days", href: null }]);
  /* exactly 2 days is not yet "more than 2 days" */
  r.signers[0].invited_at = ago(2);
  assert.equal(master(r, NOW).sign.stalledNow, 1);
  r.signers[0].invited_at = ago(2, 1);
  assert.equal(master(r, NOW).sign.stalledNow, 2);
  assert.equal(master(r, NOW).actions.find((a) => a.detail.startsWith("not opened"))!.tone, "warn");
});

test("signing: certificates of one vesting waiting on the same signer are one line", () => {
  const r = withBatch(MANAGED, -3, 4);
  r.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(6), sent_at: ago(6), paid_at: ago(6), simulation: false });
  for (let i = 0; i < 4; i++) {
    const e = env({ created_at: ago(5), owner_id: null, owner_email: null, owner_name: null, esop_holder_id: `${MANAGED.id}-h${i}`, esop_tranche: 1 });
    r.envelopes.push(e);
    r.signers.push(signer(e, 1, { status: "signed", invited_at: ago(5) }), signer(e, 2, { status: "invited", invited_at: ago(4), viewed_at: i === 0 ? ago(3) : null }));
  }
  const m = master(r, NOW);
  const lines = m.actions.filter((a) => a.kind === "stalled");
  assert.deepEqual(lines, [{ kind: "stalled", tone: "warn", title: "Sample Company · B8-T1 certificates · signer 2 of 2", detail: "4 documents waiting, 1 opened · 4 days", href: "/admin/sign?tab=sent" }]);
  assert.equal(m.sign.stalledNow, 4);
  assert.equal(m.actions[0].kind, "unsigned", "the vesting itself comes before the reminder to chase signatures");
});

test("signing: senders by plan, each account counted once", () => {
  const r = empty();
  r.envelopes.push(env({ owner_id: "u1" }), env({ owner_id: "u1" }), env({ owner_id: "u2", owner_email: "jamie.lee@example.com" }), env({ owner_id: "u3", owner_email: "sam.wong@example.com" }), env({ owner_id: "u4", owner_email: "old@example.com", created_at: ago(45) }));
  r.subscriptions.push({ user_id: "u1", tier: "sign_personal" }, { user_id: "u1", tier: "pro" }, { user_id: "u2", tier: "sign_standard" }, { user_id: "u9", tier: "unlimited" }, { user_id: "u3", tier: "not-a-plan" });
  assert.deepEqual(master(r, NOW).sign.byPlan, [
    { tier: "none", label: "No plan (free week)", senders: 1, requests: 1 },
    { tier: "sign_standard", label: "Sign Standard", senders: 1, requests: 1 },
    { tier: "pro", label: "FD AI Pro", senders: 1, requests: 2 },
  ]);
});

test("test activity is counted apart: the team's test accounts and ESOP simulations", () => {
  const r = withBatch({ ...MANAGED, simulation: false }, 100);
  r.runs.push({ company_id: MANAGED.id, ref: "B8-T1", approved_at: ago(3), sent_at: ago(3), paid_at: ago(3), simulation: true });
  const real = env({ created_at: ago(1) });
  const team = env({ created_at: ago(6), owner_email: "legal@foundersdoc.com", owner_name: "Legal" });
  const sim = env({ created_at: ago(3), owner_id: null, owner_email: null, owner_name: null, esop_holder_id: `${MANAGED.id}-h0`, esop_tranche: 1 });
  const before = env({ created_at: ago(10), owner_id: null, owner_email: null, owner_name: null, esop_holder_id: `${MANAGED.id}-h1`, esop_tranche: 1, status: "completed", completed_at: ago(9) });
  r.envelopes.push(real, team, sim, before);
  r.signers.push(signer(team, 1, { status: "invited", invited_at: ago(6) }), signer(sim, 1, { status: "invited", invited_at: ago(3) }));
  assert.deepEqual([...testEnvelopes(r)].sort(), [team.id, sim.id].sort(), "a certificate sent before the simulated approval is real");
  const m = master(r, NOW);
  assert.deepEqual(m.test, { sent30: 2, openNow: 2, stalledNow: 2 });
  assert.equal(m.sign.windows[2].sent, 2);
  assert.equal(m.sign.openNow, 1);
  assert.equal(m.sign.stalledNow, 0);
  assert.deepEqual(m.actions.filter((a) => a.kind === "stalled"), [], "nobody is asked to chase a test request");
  /* every request of a company in simulation is test activity */
  r.companies[0] = { ...MANAGED, simulation: true };
  assert.equal(testEnvelopes(r).has(before.id), true);
});

test("privacy: nothing on the page can name a signer or a document, because the rows never carry them", () => {
  const r = withBatch(MANAGED, 5);
  const e = env({ created_at: ago(9) });
  r.envelopes.push(e);
  r.signers.push(signer(e, 1, { status: "invited", invited_at: ago(9) }));
  const keys = new Set([...r.envelopes, ...r.signers, ...r.holders].flatMap((x) => Object.keys(x)));
  for (const k of ["title", "file_name", "name", "email", "typed_name", "message"]) assert.equal(keys.has(k), false, `a row carries "${k}"`);
  const page = JSON.stringify(master(r, NOW));
  assert.ok(!/alex\.tan@example\.com/i.test(page), "the sender is shown by account name, not address");
});

test("privacy: the page reads no title, no file and no signer's or holder's name or email from the database", () => {
  for (const [list, columns] of Object.entries(ALL_COLUMNS)) {
    for (const column of columns.split(",").map((c) => c.trim())) {
      /* the sending account (owner_email, owner_name) and a company's name are what the page shows; nothing else personal is read */
      if (["owner_email", "owner_name"].includes(column) || (list === "COMPANY_COLUMNS" && column === "name")) continue;
      /* a company's simulation inbox is read only to know that a simulation is on; the loader keeps a yes or no, not the address */
      if (list === "COMPANY_COLUMNS" && column === "email_override") continue;
      assert.ok(!/title|file|name|email|phone|message|typed|png|original|ip$|user_agent|note|id_no|nationality/.test(column), `${list} reads "${column}"`);
    }
  }
  assert.ok(!ALL_COLUMNS.COMPANY_COLUMNS.includes("contact"), "not the client's contact either");
});

test("every column the page reads exists in the database, as the SQL files in supabase/ define it", () => {
  const dir = join(process.cwd(), "supabase");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const columnsOf = (table: string) => {
    const found = new Set<string>();
    for (const m of sql.matchAll(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "g")))
      for (const line of m[1].split("\n")) {
        const word = /^\s*([a-z_0-9]+)\s/.exec(line)?.[1];
        if (word && !["primary", "unique", "check", "constraint", "foreign"].includes(word)) found.add(word);
      }
    for (const m of sql.matchAll(new RegExp(`alter table public\\.${table}\\s+add column if not exists ([a-z_0-9]+)`, "g"))) found.add(m[1]);
    return found;
  };
  const TABLES: Record<keyof typeof ALL_COLUMNS, string[]> = {
    ENVELOPE_COLUMNS: ["sign_envelopes"],
    SIGNER_COLUMNS: ["sign_signers"],
    COMPANY_COLUMNS: ["esop_companies"],
    BATCH_COLUMNS: ["esop_batches"],
    HOLDER_COLUMNS: ["esop_holders"],
    RUN_COLUMNS: ["esop_tranche_runs"],
    CERTIFICATE_COLUMNS: ["esop_documents"],
    ALERT_COLUMNS: ["esop_alerts", "esop_alert_log"],
    REQUEST_COLUMNS: ["esop_run_requests"],
    SUBSCRIPTION_COLUMNS: ["subscriptions"],
  };
  for (const [list, tables] of Object.entries(TABLES) as Array<[keyof typeof ALL_COLUMNS, string[]]>)
    for (const table of tables) {
      const has = columnsOf(table);
      assert.ok(has.size > 0, `no definition of ${table} was found`);
      for (const column of ALL_COLUMNS[list].split(",").map((c) => c.trim())) assert.ok(has.has(column), `${table} has no column "${column}"`);
    }
  /* and the columns the reads filter and sort by (load.ts) */
  for (const [table, columns] of Object.entries({ sign_envelopes: ["id", "status", "created_at"], sign_signers: ["envelope_id", "position"], esop_documents: ["id", "kind", "holder_id"], esop_run_requests: ["resolved_at", "created_at"], esop_alert_log: ["days_before"], subscriptions: ["id", "status"] }))
    for (const column of columns) assert.ok(columnsOf(table).has(column), `${table} has no column "${column}"`);
});

test("the preview's sample rows show every part of the page", () => {
  const m = master(demoRows(NOW), NOW);
  assert.deepEqual([...new Set(m.actions.map((a) => a.kind))].sort(), ["stalled", "unapproved", "unsigned"]);
  assert.equal(m.esop.length, 4);
  assert.ok(m.esop.some((c) => c.simulation) && m.esop.some((c) => !c.managed) && m.esop.some((c) => c.focus?.paid));
  assert.ok(m.sign.byPlan.length >= 3 && m.sign.timeToSign.count > 0 && m.test.sent30 === 2);
});

test("an empty system is quiet", () => {
  const m = master(empty(), NOW);
  assert.deepEqual([m.actions, m.esop, m.sign.byPlan], [[], [], []]);
  assert.deepEqual(m.sign.windows.map((w) => w.sent), [0, 0, 0]);
});
