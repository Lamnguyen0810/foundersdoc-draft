/**
 * Number and date formatting shared by the admin dashboard's tabs.
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "16 Sep" — the design's short date, in Singapore time. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "numeric", timeZone: "Asia/Singapore" }).formatToParts(d);
  const dd = parts.find((x) => x.type === "day")?.value ?? "";
  const mm = Number(parts.find((x) => x.type === "month")?.value ?? 1);
  return `${dd} ${MONTHS[mm - 1]}`;
}

/** "16 Sep, 10:12" — the design's timestamp, in Singapore time. */
export function stamp(iso: string): string {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" }).format(new Date(iso));
  return `${day(iso)}, ${time}`;
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
