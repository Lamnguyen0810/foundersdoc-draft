import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows } from "../../app/esop/[slug]/model";
import type { EsopBatch, EsopHolder } from "./vesting";

/**
 * What a client sees when they log in to their ESOP dashboard (0262), before the first client
 * login is given out. Sample names only. Run: npm run test:esop
 */

const NOW = new Date(2026, 10, 23); // 23 Nov 2026
const batches = new Map<number, EsopBatch>(
  (
    [
      { batch: 1, vesting_start: "2021-06-01", tranches: 4, note: null }, // all four tranches vested by 2025
      { batch: 2, vesting_start: "2023-03-01", tranches: 4, note: null }, // 3 vested, last one in Mar 2027
      { batch: 3, vesting_start: "2024-12-01", tranches: 4, note: null }, // 1 vested
      { batch: 4, vesting_start: null, tranches: 4, note: null }, // dates not recorded
    ] as EsopBatch[]
  ).map((b) => [b.batch, b]),
);
const h = (name: string, batch: number, more: Partial<EsopHolder> = {}): EsopHolder => ({
  id: name,
  name,
  email: null,
  id_no: null,
  batch,
  options_per_tranche: 1000,
  status: "Active",
  leaver_type: null,
  last_day: null,
  notes: null,
  updated_at: "2026-11-01T00:00:00Z",
  updated_by: null,
  ...more,
});

test("fully vested, still vesting, and still vesting after 3+ years are told apart", () => {
  const rows = buildRows(
    [
      h("Alex Tan", 1),
      h("Jamie Lee", 2),
      h("Sam Wong", 3),
      h("Robin Lim", 4),
      h("Casey Ng", 1, { status: "Leaver", leaver_type: "Good", last_day: "2024-01-31" }),
      h("Morgan Goh", 1, { top_ups: 1, topup_start: "2025-06-01", topup_options_per_tranche: 500 }),
      h("Taylor Ong", 1, { top_ups: 1 }),
    ],
    [],
    batches,
    NOW,
  );
  const by = (n: string) => rows.find((r) => r.h.name === n)!;
  const pick = (n: string) => ({ full: by(n).full, vesting: by(n).vesting, long: by(n).longVesting });
  assert.deepEqual(pick("Alex Tan"), { full: true, vesting: false, long: false }, "every tranche vested");
  assert.deepEqual(pick("Jamie Lee"), { full: false, vesting: true, long: true }, "granted over 3 years ago, one tranche to go");
  assert.deepEqual(pick("Sam Wong"), { full: false, vesting: true, long: false });
  assert.deepEqual(pick("Robin Lim"), { full: false, vesting: true, long: false }, "no dates recorded: never called fully vested");
  assert.deepEqual(pick("Casey Ng"), { full: false, vesting: false, long: false }, "a leaver is in neither list");
  assert.deepEqual(pick("Morgan Goh"), { full: false, vesting: true, long: true }, "the original grant is done but the top-up is still vesting");
  assert.deepEqual(pick("Taylor Ong"), { full: false, vesting: true, long: true }, "a top-up without dates is never called fully vested");
  /* every active holder is in exactly one of the two lists */
  for (const r of rows.filter((x) => x.active)) assert.equal(Number(r.full) + Number(r.vesting), 1, r.h.name);
  assert.equal(by("Alex Tan").c.next, null);
});

test("a client's login never gets Founders Doc's working notes, and a View only login gets no to-do list", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), "src/app/esop/[slug]", f), "utf8");
  const page = src("page.tsx");
  assert.match(page, /admin \|\| settings\.self_serve \? h : \{ \.\.\.h, notes: null \}/, "the notes are taken off on the server, before the page is sent");
  const sheet = src("EsopSheet.tsx");
  assert.match(sheet, /const notesMine = role === "admin" \|\| !!props\.settings\?\.self_serve;/);
  assert.match(sheet, /notesMine \? h\.notes : ""/, "nor in the Excel export");
  assert.match(sheet, /\.\.\.\(showNotes \? \{ notes: f\.notes\.trim\(\) \|\| null \} : \{\}\)/, "a note that was not shown is never saved over");
  assert.match(sheet, /const upkeep = canEdit;/);
  for (const t of ["Record top-up schedules", "Add missing option certificates"]) assert.ok(new RegExp(`upkeep && [^\\n]*\\n?[^\\n]*${t}`).test(sheet), `"${t}" is for people who can edit`);
  /* the three filters that answer "who has fully vested and who has not" */
  assert.match(sheet, /\["full", "Fully vested", \(r\) => r\.full/);
  assert.match(sheet, /\["vesting", "Still vesting", \(r\) => r\.vesting/);
  assert.match(sheet, /\["long", "Still vesting · 3\+ years", \(r\) => r\.longVesting/);
});

/* ── view only: opening, downloading and exporting are paid (0263) ─────────── */

test("a free client login views only: the page, the server and the database all hold the files back", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const page = src("src/app/esop/[slug]/page.tsx");
  assert.match(page, /const canDownload = admin \|\| settings\.self_serve \|\| settings\.plan === "premium" \|\| \(!passRes\.error && passRes\.data === true\);/);
  assert.match(page, /canDownload \? d : \{ \.\.\.d, path: null, url: null \}/, "a locked login is never told where a file is");
  const sheet = src("src/app/esop/[slug]/EsopSheet.tsx");
  assert.match(sheet, /const locked = props\.canDownload === false;/, "absent means open: Founders Doc and own dashboards are never locked by accident");
  for (const fn of ["async function openDoc(d: EsopDocument) {", "async function downloadZip(list: EsopDocument[], name: string) {", "function downloadExcel(only?: Set<string>) {"]) {
    const at = sheet.indexOf(fn);
    assert.ok(at > 0, fn);
    assert.match(sheet.slice(at, at + fn.length + 80), /if \(locked\) return void setPaywall\(true\);/, `${fn} stops at the paywall first`);
  }
  assert.match(sheet, /Monthly subscription\./);
  assert.match(sheet, /Pay to download\./);
  /* the lock itself: the storage rule, so a login cannot fetch a file around the page */
  const sql = src("supabase/135_esop_download_lock.sql");
  assert.match(sql, /create policy "esop-docs: read" on storage\.objects\s+for select to authenticated using \(bucket_id = 'esop-docs' and public\.esop_can_read_path\(name\)\);/);
  assert.match(sql, /c\.self_serve or c\.plan = 'premium' or \(c\.downloads_until is not null and c\.downloads_until > now\(\)\)/);
  assert.match(sql, /select public\.is_admin\(\)\s+or \(\s+public\.esop_can\(p_company\)/, "Founders Doc always; a member only with a plan or a pass");
});
