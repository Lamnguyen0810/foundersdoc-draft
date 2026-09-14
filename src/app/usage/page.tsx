import Link from "next/link";
import { PAID_BENCHMARK } from "@/lib/ai/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata = { title: "Usage — FDAI" };
export const dynamic = "force-dynamic";

interface UsageRow {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  paid_benchmark_usd: number | string;
  created_at: string;
}

function money(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number.parseFloat(v || "0");
}

/** Declared at module level, not inside the page: a component created during
 *  render is a new component type on every render. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat" style={{ padding: "16px 18px" }}>
      <dt
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--grey-4)",
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: "8px 0 0" }}>
        <b>{value}</b>
        {hint && <span>{hint}</span>}
      </dd>
    </div>
  );
}

export default async function UsagePage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="wrap" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 30 }}>Usage</h1>
        <p className="sub" style={{ marginTop: 12, maxWidth: "56ch" }}>
          Usage is recorded once Supabase is configured. Each draft still shows its own token count
          and cost estimate on the draft page. See SETUP_SUPABASE.md.
        </p>
      </main>
    );
  }

  const user = await getUser();
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_log")
    .select("provider,model,input_tokens,output_tokens,cost_usd,paid_benchmark_usd,created_at")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as UsageRow[];

  const drafts = rows.length;
  const inputTokens = rows.reduce((a, r) => a + r.input_tokens, 0);
  const outputTokens = rows.reduce((a, r) => a + r.output_tokens, 0);
  const actual = rows.reduce((a, r) => a + num(r.cost_usd), 0);
  const benchmark = rows.reduce((a, r) => a + num(r.paid_benchmark_usd), 0);
  const perDraft = drafts ? benchmark / drafts : 0;

  const byModel = new Map<string, { drafts: number; benchmark: number }>();
  for (const r of rows) {
    const key = `${r.provider} · ${r.model}`;
    const cur = byModel.get(key) ?? { drafts: 0, benchmark: 0 };
    cur.drafts += 1;
    cur.benchmark += num(r.paid_benchmark_usd);
    byModel.set(key, cur);
  }

  const monthLabel = monthStart.toLocaleString("en-GB", { month: "long", year: "numeric" });

  return (
    <main className="wrap" style={{ paddingTop: 32 }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "1px solid var(--grey-2)",
          paddingBottom: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <p className="kicker">FD AI</p>
          <h1 style={{ fontSize: "clamp(26px, 3vw, 34px)", marginTop: 8 }}>Usage — {monthLabel}</h1>
          <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>{user?.email}</p>
        </div>
        <Link className="btn btn-gold" href="/draft">
          New draft
        </Link>
      </header>

      {error && (
        <p className="note note-warn">Could not load usage. Has 001_schema.sql been run?</p>
      )}

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          margin: 0,
        }}
      >
        <Stat label="Drafts" value={drafts.toLocaleString()} hint="this month" />
        <Stat
          label="Tokens"
          value={`${(inputTokens + outputTokens).toLocaleString()}`}
          hint={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
        />
        <Stat label="Actual spend" value={money(actual)} hint="what you have paid" />
        <Stat
          label="On a paid model"
          value={money(benchmark)}
          hint={`${money(perDraft)} per draft`}
        />
      </dl>

      <section className="card" style={{ marginTop: 24, padding: 22 }}>
        <p className="kicker">The number pricing is built on</p>
        <p style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.7, color: "var(--grey-5)" }}>
          {drafts === 0 ? (
            <>Generate a few drafts and this becomes the margin calculation for pricing.</>
          ) : (
            <>
              A draft costs about <strong>{money(perDraft)}</strong> on a{" "}
              {PAID_BENCHMARK.label.toLowerCase()}. At $1–3 per draft, or inside a subscription,
              that is a gross margin of roughly{" "}
              <strong>{perDraft > 0 ? Math.round(1 / perDraft) : 0}×</strong> at $1 per draft. Take
              it as an order of magnitude, not a quotation — token counts vary with the length of
              the source document.
            </>
          )}
        </p>
      </section>

      {byModel.size > 0 && (
        <section style={{ marginTop: 28 }}>
          <p className="kicker" style={{ marginBottom: 10 }}>By model</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 420, fontSize: 13.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--grey-2)", textAlign: "left" }}>
                  {["Model", "Drafts", "Paid-model cost", "Per draft"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 0",
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--grey-4)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byModel.entries()].map(([key, v]) => (
                  <tr key={key} style={{ borderBottom: "1px solid var(--grey-2)" }}>
                    <td style={{ padding: "9px 0" }}>{key}</td>
                    <td style={{ padding: "9px 0" }}>{v.drafts}</td>
                    <td style={{ padding: "9px 0" }}>{money(v.benchmark)}</td>
                    <td style={{ padding: "9px 0" }}>{money(v.benchmark / v.drafts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: "var(--grey-4)" }}>
        Prices are planning estimates from src/lib/ai/pricing.ts. Check the provider&apos;s pricing
        page before quoting a figure to anyone.
      </p>
    </main>
  );
}
