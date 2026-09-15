/**
 * The pieces every tab is built from.
 *
 * Declared at module level rather than inside a page, because a component
 * created during render is a new component type on every render — React throws
 * away the DOM and rebuilds it each time.
 *
 * All of these are server components. Nothing on the admin console needs to be
 * interactive except the credits form, so nothing else ships JavaScript.
 */

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-GB");
}

export function money(n: number): string {
  if (!n) return "US$0.00";
  if (n < 0.01) return `US$${n.toFixed(4)}`;
  return `US$${n.toFixed(2)}`;
}

/**
 * A date a person can read.
 *
 * Pinned to Singapore, not to the server's clock. This page renders on Vercel,
 * where the server runs in UTC: without the timezone a draft started at 7am on
 * Tuesday in the office is reported as Monday, and the day a document was
 * created is exactly the sort of thing somebody later relies on.
 */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  return when(iso);
}

/**
 * One headline figure.
 *
 * `previous` is the same count over the immediately preceding window of equal
 * length. When it is absent the change line is simply not drawn — a percentage
 * against a period nobody measured is a made-up number, which is the whole
 * thing this page is being rebuilt to remove.
 */
export function Kpi({
  label,
  value,
  previous,
  hint,
  goodWhenUp = true,
}: {
  label: string;
  value: number;
  previous?: number | null;
  hint?: string;
  goodWhenUp?: boolean;
}) {
  let change: React.ReactNode = hint ?? null;

  if (previous !== undefined && previous !== null) {
    const diff = value - previous;
    // No previous activity and none now is not "up 0%", it is nothing to say.
    if (previous === 0 && value === 0) {
      change = hint ?? "No activity in either period";
    } else if (previous === 0) {
      change = (
        <>
          <span className="delta good">+{fmt(value)}</span> — nothing in the period before
        </>
      );
    } else {
      const pct = Math.round((diff / previous) * 100);
      const up = diff >= 0;
      const good = up === goodWhenUp;
      change = (
        <>
          <span className={`delta ${good ? "good" : "bad"}`}>
            {up ? "+" : "−"}
            {Math.abs(pct)}%
          </span>{" "}
          vs the period before ({fmt(previous)})
        </>
      );
    }
  }

  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(value)}</div>
      {change && <div className="kpi-change">{change}</div>}
    </div>
  );
}

/**
 * A ranked list with the bar drawn behind the row.
 *
 * `empty` is required, and it says what would have to happen for the list to
 * fill up. An empty panel that just says "No data" leaves the reader unable to
 * tell a quiet week from a broken counter.
 */
export function BarList({
  rows,
  empty,
  unit,
}: {
  rows: { label: string; value: number; note?: string }[];
  empty: string;
  unit?: string;
}) {
  if (!rows.length) return <p className="fda-empty">{empty}</p>;
  const top = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.label} className="bar-row">
          <span className="bar" style={{ width: `${Math.max(3, (r.value / top) * 100)}%` }} />
          <span className="name">
            {r.label}
            {r.note && <small>{r.note}</small>}
          </span>
          <span className="num">
            {fmt(r.value)}
            {unit && <small>{unit}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A panel with a heading and a one-line explanation of what it counts. */
export function Panel({
  title,
  sub,
  aside,
  children,
}: {
  title: string;
  sub?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
