"use client";

import { useRouter } from "next/navigation";

/** The design's period dropdown; changing it reloads the tab for that range. */
export default function PeriodSelect({
  tab,
  days,
  q,
  ranges,
}: {
  tab: string;
  days: number;
  q?: string;
  ranges: { days: number; label: string }[];
}) {
  const router = useRouter();
  return (
    <div className="select-wrap">
      <select
        aria-label="Dashboard period"
        value={days}
        onChange={(e) => {
          const p = new URLSearchParams({ tab, days: e.target.value });
          if (q) p.set("q", q);
          router.push(`/admin?${p.toString()}`);
        }}
      >
        {ranges.map((r) => (
          <option key={r.days} value={r.days}>
            Last {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
