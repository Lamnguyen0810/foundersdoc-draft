import type { MEnvelope, MSigner, MasterRows } from "./figures";

/**
 * Sample rows for the local preview (no Supabase): enough of everything for /admin/master to be
 * seen and checked. Invented companies and accounts; nothing here is a client's.
 */
export function demoRows(now: Date = new Date()): MasterRows {
  const DAY = 86_400_000;
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * 3_600_000).toISOString();
  /** a vesting start whose first tranche falls this many days from today */
  const start = (daysFromNow: number, yearsBack = 1) => {
    const d = new Date(now.getTime() + 8 * 3_600_000 + daysFromNow * DAY);
    return `${d.getUTCFullYear() - yearsBack}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const rows: MasterRows = {
    companies: [
      { id: "c1", slug: "sample-company", name: "Sample Company Pte. Ltd.", plan: "premium", self_serve: false, simulation: false },
      { id: "c2", slug: "example-consulting", name: "Example Consulting Pte. Ltd.", plan: "free", self_serve: true, simulation: false },
      { id: "c3", slug: "northwind-labs", name: "Northwind Labs Pte. Ltd.", plan: "free", self_serve: true, simulation: false },
      { id: "c4", slug: "rehearsal-co", name: "Rehearsal Co Pte. Ltd.", plan: "premium", self_serve: false, simulation: true },
    ],
    batches: [
      { company_id: "c1", batch: 7, vesting_start: start(-6), tranches: 4 },
      { company_id: "c1", batch: 8, vesting_start: start(6, 2), tranches: 4 },
      { company_id: "c2", batch: 1, vesting_start: start(-2), tranches: 4 },
      { company_id: "c3", batch: 1, vesting_start: start(96), tranches: 3 },
      { company_id: "c4", batch: 2, vesting_start: start(11), tranches: 4 },
    ],
    holders: [],
    runs: [
      { company_id: "c1", ref: "B7-T1", approved_at: ago(9), sent_at: ago(9), paid_at: ago(7), simulation: false },
      { company_id: "c2", ref: "B1-T1", approved_at: ago(3), sent_at: ago(3), paid_at: null, simulation: false },
      { company_id: "c4", ref: "B2-T1", approved_at: ago(1), sent_at: ago(1), paid_at: ago(1), simulation: true },
    ],
    certificates: [{ holder_id: "c2-b1-0", tranche: 1 }],
    alerts: [
      { company_id: "c1", ref: "B7-T1" },
      { company_id: "c1", ref: "B8-T2" },
      { company_id: "c2", ref: "B1-T1" },
    ],
    requests: [],
    subscriptions: [
      { user_id: "u2", tier: "sign_standard" },
      { user_id: "u3", tier: "pro" },
      { user_id: "u4", tier: "sign_personal" },
    ],
    envelopes: [],
    signers: [],
  };
  const people = (company: string, batch: number, active: number, leavers = 0) => {
    for (let i = 0; i < active; i++) rows.holders.push({ id: `${company}-b${batch}-${i}`, company_id: company, batch, status: "Active" });
    for (let i = 0; i < leavers; i++) rows.holders.push({ id: `${company}-b${batch}-l${i}`, company_id: company, batch, status: "Leaver" });
  };
  people("c1", 7, 6, 1);
  people("c1", 8, 9, 2);
  people("c2", 1, 3);
  people("c3", 1, 4);
  people("c4", 2, 5);

  let n = 0;
  const request = (more: Partial<MEnvelope>, signers: Array<Partial<MSigner>> = []): MEnvelope => {
    const e: MEnvelope = { id: `e${++n}`, status: "sent", created_at: ago(1), completed_at: null, owner_id: "u1", owner_email: "alex.tan@example.com", owner_name: "Alex Tan", esop_holder_id: null, esop_tranche: null, ...more };
    rows.envelopes.push(e);
    signers.forEach((s, i) => rows.signers.push({ envelope_id: e.id, position: i + 1, status: "waiting", invited_at: null, viewed_at: null, ...s }));
    return e;
  };
  const own = (id: string, name: string) => ({ owner_id: id, owner_email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, owner_name: name });
  const fd = { owner_id: null, owner_email: null, owner_name: null };

  /* people's own requests: sent, signed, waiting */
  request({ created_at: ago(0, 2) }, [{ status: "invited", invited_at: ago(0, 2) }]);
  request({ created_at: ago(0, 5), status: "completed", completed_at: ago(0, 1) });
  request({ ...own("u2", "Jamie Lee"), created_at: ago(6) }, [{ status: "signed", invited_at: ago(6) }, { status: "invited", invited_at: ago(5), viewed_at: ago(4) }, { status: "waiting" }]);
  request({ ...own("u2", "Jamie Lee"), created_at: ago(2), status: "completed", completed_at: ago(1, 20) });
  request({ ...own("u3", "Sam Wong"), created_at: ago(3), status: "completed", completed_at: ago(2, 3) });
  request({ ...own("u3", "Sam Wong"), created_at: ago(12), status: "completed", completed_at: ago(11) });
  request({ ...own("u3", "Sam Wong"), created_at: ago(4) }, [{ status: "invited", invited_at: ago(4) }]);
  request({ ...own("u4", "Priya Nair"), created_at: ago(18), status: "completed", completed_at: ago(17, 12) });
  request({ ...own("u4", "Priya Nair"), created_at: ago(20), status: "voided" });
  request({ ...own("u5", "Chen Wei"), created_at: ago(1), status: "completed", completed_at: ago(0, 20) });
  /* Founders Doc's own: the certificates of Sample Company's B7-T1, two still waiting on the holder */
  for (let i = 0; i < 6; i++) {
    const done = i < 4;
    request({ ...fd, created_at: ago(6, 20), status: done ? "completed" : "sent", completed_at: done ? ago(5, i) : null, esop_holder_id: `c1-b7-${i}`, esop_tranche: 1 }, done ? [] : [{ status: "signed", invited_at: ago(6, 20) }, { status: "invited", invited_at: ago(6), viewed_at: i === 4 ? ago(5) : null }]);
  }
  /* test activity: a team account, and a certificate sent in a simulation */
  request({ owner_id: "u9", owner_email: "legal@foundersdoc.com", owner_name: "Founders Doc test", created_at: ago(5) }, [{ status: "invited", invited_at: ago(5) }]);
  request({ ...fd, created_at: ago(1), esop_holder_id: "c4-b2-0", esop_tranche: 1 }, [{ status: "invited", invited_at: ago(1) }]);
  return rows;
}
