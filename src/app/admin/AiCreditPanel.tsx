"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The AI credit meter: how much prepaid credit is left at the AI provider,
 * said in drafts and days rather than dollars, and what the admin should do
 * about it.
 *
 * Every number on this card comes from admin_ai_credit() (supabase/078).
 * The browser works nothing out: after a top-up or a balance correction it
 * shows the figures the database hands back.
 */

export interface AiCreditMeter {
  provider: string;
  since: string | null;
  last_topup_at: string | null;
  topped_up_usd: number;
  adjust_usd: number;
  spent_usd: number;
  drafts_since: number;
  balance_usd: number;
  avg_cost_usd: number | null;
  avg_sample: number;
  drafts_7d: number;
  per_day: number;
  drafts_left: number | null;
  days_left: number | null;
  status: "none" | "ok" | "soon" | "urgent";
  action: string;
  ledger: { kind: "topup" | "adjust"; amount_usd: number; note: string | null; at: string }[];
  /* Lifetime figures, from supabase/080. Absent until that file has been run. */
  paid_total_usd?: number;
  topup_count?: number;
  first_topup_at?: string | null;
  spent_total_usd?: number;
  drafts_total?: number;
  by_month?: { month: string; paid_usd: number; spent_usd: number; drafts: number; requests?: number }[];
  /* From supabase/081: calls told apart from drafts, and every provider. */
  requests_total?: number;
  by_provider?: { provider: string; drafts: number; requests: number; spent_usd: number }[];
  documents_billed?: number;
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
  mock: "Mock (local testing)",
};

const BILLING_LINKS: Record<string, string> = {
  openai: "https://platform.openai.com/settings/organization/billing/overview",
  gemini: "https://console.cloud.google.com/billing",
  anthropic: "https://console.anthropic.com/settings/billing",
};

const STATUS: Record<AiCreditMeter["status"], { badge: string; label: string; dot: string }> = {
  urgent: { badge: "red", label: "🔴 Top up now", dot: "err" },
  soon: { badge: "", label: "🟠 Get ready to top up", dot: "warn" },
  ok: { badge: "green", label: "🟢 Balance is enough", dot: "" },
  none: { badge: "gray", label: "⚪ Not set up", dot: "" },
};

function usd(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `US$${Number(n).toFixed(dp)}`;
}

function approx(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `~${Math.max(0, Math.floor(Number(n))).toLocaleString("en-GB")}`;
}

function sgDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
}

export default function AiCreditPanel({ meter, error }: { meter: AiCreditMeter | null; error?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<"topup" | "set" | null>(null);
  const [amount, setAmount] = useState("5");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState<AiCreditMeter | null>(meter);

  const m = live;

  async function save() {
    if (!open || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ai-credit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: open, amount, date, note, provider: m?.provider }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; meter?: AiCreditMeter };
      if (!res.ok || !json.meter) throw new Error(json.error || `Request failed (${res.status})`);
      setLive(json.meter);
      setMsg(open === "topup" ? `Top-up of ${usd(Number(amount))} recorded.` : `Balance set to ${usd(Number(amount))}.`);
      setOpen(null);
      setNote("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !m) {
    return (
      <div className="card">
        <div className="card-head"><div><h2>AI drafting credit</h2></div></div>
        <div className="card-body">
          <div className="setup-note"><strong>Not installed yet.</strong> Run <code>supabase/078_ai_credit_meter.sql</code> in the Supabase SQL editor, then reload.</div>
        </div>
      </div>
    );
  }
  if (!m) return null;

  const st = STATUS[m.status] ?? STATUS.none;
  /* What the provider has actually charged = everything paid minus what is
     left. Our own log only sees calls made through the site, so the gap is
     usage from before logging began, from closed accounts, or from the key
     being used elsewhere. */
  const spentAll = Math.max(0, (m.paid_total_usd ?? 0) - m.balance_usd);
  const unlogged = spentAll - (m.spent_total_usd ?? 0);
  const providerName = PROVIDER_NAMES[m.provider] ?? m.provider;
  const billing = BILLING_LINKS[m.provider];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>AI drafting credit</h2>
          <p>
            Prepaid credit at {providerName}. Last top-up {sgDate(m.last_topup_at)}
            {m.since ? ` · ${m.drafts_since.toLocaleString("en-GB")} drafts since, costing ${usd(m.spent_usd, 2)}` : ""}.
          </p>
        </div>
        <span className={`badge ${st.badge}`}>{st.label}</span>
      </div>
      <div className="card-body">
        <div className="summary" style={{ marginBottom: 14 }}>
          <div className="summary-card">
            <div className="summary-label">Balance left</div>
            <div className="summary-value">{usd(m.balance_usd)}</div>
            <div className="summary-note">of {usd(m.topped_up_usd)} topped up{m.adjust_usd ? ` (${m.adjust_usd > 0 ? "+" : "−"}${usd(Math.abs(m.adjust_usd))} corrected)` : ""}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Drafts left</div>
            <div className="summary-value">{approx(m.drafts_left)}</div>
            <div className="summary-note">
              {m.avg_cost_usd ? `at ${usd(m.avg_cost_usd, 3)} a draft, revisions included (average of ${m.avg_sample})` : "no drafts costed yet"}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Days left</div>
            <div className="summary-value">{approx(m.days_left)}</div>
            <div className="summary-note">
              {m.per_day > 0 ? `at ${m.per_day} drafts a day (last 7 days: ${m.drafts_7d})` : "no drafts in the last 7 days"}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Action</div>
            <div className="summary-value" style={{ fontSize: 18, lineHeight: 1.25, letterSpacing: 0 }}>{st.label.replace(/^\S+\s/, "")}</div>
            <div className="summary-note">{m.action}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn yellow" onClick={() => { setOpen(open === "topup" ? null : "topup"); setAmount("5"); setMsg(null); }}>
            Record a top-up
          </button>
          <button type="button" className="btn" onClick={() => { setOpen(open === "set" ? null : "set"); setAmount(m.balance_usd.toFixed(2)); setMsg(null); }}>
            Set balance from {providerName.split(" ")[0]}
          </button>
          {billing && (
            <a className="btn" href={billing} target="_blank" rel="noopener noreferrer">
              Open {providerName.split(" ")[0]} billing ↗
            </a>
          )}
          {msg && <span className="summary-note" style={{ marginLeft: 6 }}>{msg}</span>}
        </div>

        {open && (
          <div style={{ marginTop: 14, display: "grid", gap: 10, gridTemplateColumns: "140px 170px 1fr auto", alignItems: "end" }}>
            <label>
              <span className="field-label">{open === "topup" ? "Amount paid (US$)" : "Balance shown (US$)"}</span>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%" }} />
            </label>
            <label>
              <span className="field-label">Date</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
            </label>
            <label>
              <span className="field-label">Note (optional)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={open === "topup" ? "e.g. company card" : "e.g. from the billing page"} style={{ width: "100%" }} />
            </label>
            <button type="button" className="btn dark" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
            <div className="summary-note" style={{ gridColumn: "1 / -1" }}>
              {open === "topup"
                ? "Adds to the balance. The meter then counts every draft against it."
                : "Type the credit balance the provider's billing page shows right now. The difference is stored as a correction, so the meter matches what they will actually charge."}
            </div>
          </div>
        )}

        {typeof m.paid_total_usd === "number" && (
          <div style={{ marginTop: 18 }}>
            <div className="summary-label" style={{ marginBottom: 6 }}>Paid to {providerName.split(" ")[0]} so far</div>
            <div className="summary" style={{ marginBottom: 10 }}>
              <div className="summary-card">
                <div className="summary-label">Paid, all time</div>
                <div className="summary-value">{usd(m.paid_total_usd)}</div>
                <div className="summary-note">
                  {m.topup_count ? `${m.topup_count} top-up${m.topup_count === 1 ? "" : "s"} since ${sgDate(m.first_topup_at ?? null)}` : "no top-ups recorded yet"}
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Spent, all time</div>
                <div className="summary-value">{usd(spentAll)}</div>
                <div className="summary-note">
                  {unlogged > 0.005
                    ? `${usd(m.spent_total_usd)} logged by FD AI + ${usd(unlogged)} used before logging or outside the site`
                    : `${(m.drafts_total ?? 0).toLocaleString("en-GB")} drafts${typeof m.requests_total === "number" ? ` · ${m.requests_total.toLocaleString("en-GB")} AI requests incl. revisions and questions` : ""}`}
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Cost per draft</div>
                <div className="summary-value">{m.drafts_total ? usd((m.spent_total_usd ?? 0) / m.drafts_total, 3) : "—"}</div>
                <div className="summary-note">
                  {m.drafts_total ? `from the ${m.drafts_total.toLocaleString("en-GB")} logged drafts` : "no logged drafts yet"}
                  {m.paid_total_usd > 0 ? ` · ${Math.round((spentAll / m.paid_total_usd) * 100)}% of what was paid is used up` : ""}
                </div>
              </div>
            </div>
            {m.by_month && m.by_month.length > 0 && (
              <div>
                <div className="simple-row" style={{ display: "grid", gridTemplateColumns: "110px 110px 110px 90px 1fr", gap: 10, fontWeight: 500 }}>
                  <span>Month</span><span>Paid</span><span>Spent (logged)</span><span>Drafts</span><span>AI requests</span>
                </div>
                {m.by_month.map((row) => (
                  <div className="simple-row" key={row.month} style={{ display: "grid", gridTemplateColumns: "110px 110px 110px 90px 1fr", gap: 10 }}>
                    <span>{monthName(row.month)}</span>
                    <span className={row.paid_usd > 0 ? "good" : ""}>{row.paid_usd > 0 ? usd(row.paid_usd) : "—"}</span>
                    <span>{usd(row.spent_usd, 2)}</span>
                    <span>{row.drafts.toLocaleString("en-GB")}</span>
                    <span>{typeof row.requests === "number" ? row.requests.toLocaleString("en-GB") : "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {m.by_provider && m.by_provider.length > 0 && (
              <div className="summary-note" style={{ marginTop: 8 }}>
                Every provider ever used:{" "}
                {m.by_provider.map((p) => `${PROVIDER_NAMES[p.provider]?.split(" ")[0] ?? p.provider} ${p.drafts.toLocaleString("en-GB")} drafts, ${usd(p.spent_usd)}`).join(" · ")}
                {typeof m.documents_billed === "number" ? ` · billing records: ${m.documents_billed.toLocaleString("en-GB")} documents drafted` : ""}
              </div>
            )}
            <div className="summary-note" style={{ marginTop: 6 }}>
              Counts every top-up recorded here. Paid before the meter existed? Use “Record a top-up” with the date it was paid, and it is added to the total.
            </div>
          </div>
        )}

        {m.ledger.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="summary-label" style={{ marginBottom: 6 }}>Recent entries</div>
            {m.ledger.map((row, i) => (
              <div className="simple-row" key={`${row.at}-${i}`} style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr", gap: 10 }}>
                <span>{sgDate(row.at)}</span>
                <span className={row.amount_usd >= 0 ? "good" : "bad"}>{row.amount_usd >= 0 ? "+" : "−"}{usd(Math.abs(row.amount_usd))}</span>
                <span>{row.kind === "topup" ? "Top-up" : "Correction"}{row.note ? ` · ${row.note}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
