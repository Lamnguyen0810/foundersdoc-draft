import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtDay } from "@/lib/esop/vesting";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { demoRows } from "@/lib/master/demo";
import { LATE_DAYS, OPEN_DAYS, SOON_DAYS, STALLED_DAYS, hoursText, master, stageText, steps, type Action, type EsopRow, type Master } from "@/lib/master/figures";
import { loadMaster } from "@/lib/master/load";
import "../dashboard.css";
import "../admin.css";
import "./master.css";

/**
 * /admin/master (0244): FD Sign and every ESOP dashboard on one page, for Founders Doc admins.
 *
 * Read-only. It shows where things stand and links to the page where each is acted on; nothing
 * is approved, paid, reminded or changed from here.
 *
 * WHO SEES IT. Founders Doc admins only (is_admin(), the same check as /admin): everyone else is
 * sent away before a single row is read. Without Supabase (the local preview) it shows sample
 * rows and says so.
 *
 * The figures are worked out in lib/master/figures.ts (pure, tested); the rows are read in
 * lib/master/load.ts. People's own signing requests stay private: the page knows a request by
 * its sender's account and a signer by their place, never by a title, a file or a signer's name.
 */
export const metadata = { title: "FD Sign and ESOP — Founders Doc", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const KIND_TEXT: Record<Action["kind"], string> = { request: "Change asked for", unapproved: "Approve", unpaid: "Payment", unsigned: "Certificates", stalled: "Signing" };
const num = (n: number) => n.toLocaleString("en-GB");
const SGT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function MasterPage() {
  const preview = !isSupabaseConfigured();
  if (!preview) {
    const user = await getUser();
    if (!user) redirect("/login?next=%2Fadmin%2Fmaster");
    if (!(await isAdmin())) redirect("/draft");
  }

  let m: Master;
  let problems: string[] = [];
  if (preview) {
    const now = new Date();
    m = master(demoRows(now), now);
  } else if (!isAdminClientConfigured()) {
    return (
      <main className="fdadmin">
        <div className="page">
          <section className="hero">
            <div>
              <h1>FD Sign and ESOP</h1>
              <p>This page needs one setting: add SUPABASE_SECRET_KEY in Vercel (as a secret) and redeploy.</p>
            </div>
          </section>
        </div>
      </main>
    );
  } else {
    const loaded = await loadMaster();
    problems = loaded.problems;
    m = master(loaded.rows);
  }

  const [today, week, month] = m.sign.windows;
  const urgent = m.actions.filter((a) => a.tone === "err").length;

  return (
    <main className="fdadmin fdmaster">
      <div className="page">
        <section className="hero">
          <div>
            <h1>FD Sign and ESOP</h1>
            <p>Everything in one place, to look at. As at {SGT.format(new Date(m.at))}, Singapore time.</p>
          </div>
          <div className="hero-actions">
            <Link className="btn" href="/admin">
              ‹ Admin
            </Link>
            <Link className="btn refresh-btn" href="/admin/master">
              Refresh
            </Link>
          </div>
        </section>

        {preview && <div className="setup-note">Preview: these are sample rows, not real requests or companies.</div>}
        {problems.length > 0 && (
          <div className="setup-note">
            <strong>Some figures are incomplete.</strong> These could not be read: {problems.join(", ")}.
          </div>
        )}

        {/* ── NEEDS ACTION ─────────────────────────────────────────── */}
        <div className="card ms-block">
          <div className="card-head">
            <div>
              <h2>Needs action</h2>
              <p>
                {m.actions.length === 0 ? "Nothing is waiting on anyone." : `${num(m.actions.length)} to look at${urgent ? `, ${num(urgent)} late or urgent` : ""}.`} Vestings in the next {SOON_DAYS} days, and signers waiting more than{" "}
                {STALLED_DAYS} days.
              </p>
            </div>
          </div>
          <div className="card-body">
            <div className="attention-list">
              {m.actions.length === 0 && (
                <div className="attention-row">
                  <span className="dot" />
                  <span>All clear</span>
                  <span className="badge green">Healthy</span>
                </div>
              )}
              {m.actions.map((a, i) => (
                <div className="attention-row ms-action" key={`${a.kind}-${i}`}>
                  <span className={a.tone === "err" ? "dot err" : "dot warn"} />
                  <span className="ms-action-text">
                    <b>{a.title}</b>
                    <span>{a.detail}</span>
                  </span>
                  <span className="ms-action-end">
                    <span className={a.tone === "err" ? "badge red" : "badge gray"}>{KIND_TEXT[a.kind]}</span>
                    {a.href ? (
                      <Link className="btn" href={a.href}>
                        Open
                      </Link>
                    ) : (
                      <span className="ms-private" title="A person's own request: only they can open it.">
                        Private
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FD SIGN ──────────────────────────────────────────────── */}
        <div className="ms-title">
          <h2>FD Sign</h2>
          <Link className="btn" href="/admin/sign">
            Founders Doc&apos;s requests ›
          </Link>
        </div>
        <div className="summary">
          <Tile label="Sent today" value={num(today.sent)} note={`${num(week.sent)} in 7 days · ${num(month.sent)} in 30 days`} />
          <Tile label="Completed today" value={num(today.completed)} note={`${num(week.completed)} in 7 days · ${num(month.completed)} in 30 days`} />
          <Tile label="Open now" value={num(m.sign.openNow)} note={m.sign.stalledNow ? `${num(m.sign.stalledNow)} waiting more than ${STALLED_DAYS} days` : `None waiting more than ${STALLED_DAYS} days`} bad={m.sign.stalledNow > 0} />
          <Tile
            label="Time to sign"
            value={hoursText(m.sign.timeToSign.averageHours)}
            note={m.sign.timeToSign.count ? `Average of ${num(m.sign.timeToSign.count)} completed in 30 days · half are done within ${hoursText(m.sign.timeToSign.medianHours)}` : "Nothing completed in 30 days"}
          />
        </div>
        <div className="grid-2">
          <div className="table-card">
            <div className="table-head">
              <div className="head-text">
                <h2>Requests</h2>
                <p>Real requests only. People&apos;s own, and Founders Doc&apos;s (ESOP certificates and others).</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="ms-num">Sent</th>
                    <th className="ms-num">People&apos;s own</th>
                    <th className="ms-num">Founders Doc&apos;s</th>
                    <th className="ms-num">Completed</th>
                    <th className="ms-num">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sign.windows.map((w) => (
                    <tr key={w.label}>
                      <td>{w.label}</td>
                      <td className="ms-num">{num(w.sent)}</td>
                      <td className="ms-num">{num(w.own)}</td>
                      <td className="ms-num">{num(w.sent - w.own)}</td>
                      <td className="ms-num">{num(w.completed)}</td>
                      <td className="ms-num">{num(w.cancelled)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <div className="head-text">
                <h2>Senders by plan</h2>
                <p>Accounts that sent a request of their own in the last 30 days.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="ms-num">Senders</th>
                    <th className="ms-num">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sign.byPlan.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty">Nobody has sent a request of their own in the last 30 days.</div>
                      </td>
                    </tr>
                  )}
                  {m.sign.byPlan.map((p) => (
                    <tr key={p.tier}>
                      <td>{p.label}</td>
                      <td className="ms-num">{num(p.senders)}</td>
                      <td className="ms-num">{num(p.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── ESOP ─────────────────────────────────────────────────── */}
        <div className="ms-title">
          <h2>ESOP dashboards</h2>
          <span className="ms-sub">
            {num(m.esop.length)} {m.esop.length === 1 ? "company" : "companies"}
          </span>
        </div>
        <div className="table-card ms-block">
          <div className="table-wrap">
            <table className="ms-esop">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Holders</th>
                  <th>Vesting</th>
                  <th>When</th>
                  <th>Where it stands</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.esop.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">No ESOP dashboards yet.</div>
                    </td>
                  </tr>
                )}
                {m.esop.map((c) => (
                  <EsopLine key={c.slug} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── TEST ACTIVITY ────────────────────────────────────────── */}
        <div className="card ms-block ms-test">
          <div className="card-head">
            <div>
              <h2>Test activity, kept apart</h2>
              <p>The team&apos;s own test accounts and ESOP simulations. None of it is counted above.</p>
            </div>
          </div>
          <div className="card-body ms-test-row">
            <span>
              <b>{num(m.test.sent30)}</b> sent in 30 days
            </span>
            <span>
              <b>{num(m.test.openNow)}</b> open now
            </span>
            <span>
              <b>{num(m.test.stalledNow)}</b> waiting more than {STALLED_DAYS} days
            </span>
          </div>
        </div>

        <p className="ms-foot">
          A vesting is listed under Needs action from {SOON_DAYS} days before it until it is finished: for {LATE_DAYS} days after its date if it was never approved, and {OPEN_DAYS} days if it was. People&apos;s own signing requests are shown by the sender&apos;s account
          only; their titles, files and signers are not read for this page.
        </p>
      </div>
    </main>
  );
}

function Tile({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      <div className={bad ? "summary-note bad" : "summary-note"}>{note}</div>
    </div>
  );
}

function EsopLine({ c }: { c: EsopRow }) {
  const v = c.focus;
  const days = v ? (v.daysLeft === 0 ? "today" : v.daysLeft > 0 ? `in ${v.daysLeft} day${v.daysLeft === 1 ? "" : "s"}` : `${-v.daysLeft} day${v.daysLeft === -1 ? "" : "s"} ago`) : "";
  return (
    <tr>
      <td>
        <b>{c.name}</b>
        <div className="ms-tags">
          <span className="badge gray">{c.managed ? "Run by Founders Doc" : "Self-serve"}</span>
          {c.plan === "premium" && <span className="badge gray">Premium</span>}
          {c.simulation && <span className="badge red">Simulation on</span>}
        </div>
      </td>
      <td>
        {num(c.active)} active
        {c.leavers > 0 && <div className="muted-cell">{num(c.leavers)} left</div>}
      </td>
      <td>
        {v ? (
          <>
            <b>{v.ref}</b>
            <div className="muted-cell">
              {num(v.certificates)} certificate{v.certificates === 1 ? "" : "s"}
            </div>
          </>
        ) : (
          <span className="muted-cell">None coming up</span>
        )}
      </td>
      <td>
        {v && (
          <>
            {fmtDay(v.date)}
            <div className={v.daysLeft < 0 && !v.done ? "muted-cell bad" : "muted-cell"}>{days}</div>
          </>
        )}
      </td>
      <td>
        {v && (
          <>
            <div className="ms-steps" aria-hidden="true">
              {steps(v, c.managed).map(([label, reached]) => (
                <span key={label} className={reached ? "ms-step on" : "ms-step"}>
                  {label}
                </span>
              ))}
            </div>
            <div className="ms-stage">{stageText(v, c.managed)}</div>
          </>
        )}
      </td>
      <td className="ms-open">
        <Link className="btn" href={`/esop/${c.slug}`}>
          Open
        </Link>
      </td>
    </tr>
  );
}
