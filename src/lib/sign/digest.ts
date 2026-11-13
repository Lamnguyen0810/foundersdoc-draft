import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * FD Sign status emails (0236, Rachel 12 Nov): a premium sender's open documents, each with its progress,
 * who has signed, who is left and a Remind button, plus what was completed. Daily or weekly (default) or off.
 * Sent by /api/fd-sign/digest (Vercel Cron, 9am Singapore) through the FD Sign email Zap; only the sender
 * gets it. Built as email-safe HTML: tables and inline styles.
 */
export type DigestFrequency = "daily" | "weekly" | "off";
export const isFrequency = (v: unknown): v is DigestFrequency => v === "daily" || v === "weekly" || v === "off";

const memory = new Map<string, DigestFrequency>(); // local preview only

export async function digestFrequency(userId: string): Promise<DigestFrequency> {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return memory.get(userId) ?? "weekly";
  const r = await supabaseAdmin().from("sign_digest").select("frequency").eq("user_id", userId).maybeSingle();
  const f = (r.data as { frequency?: string } | null)?.frequency;
  return isFrequency(f) ? f : "weekly";
}

export async function setDigestFrequency(userId: string, f: DigestFrequency): Promise<void> {
  if (!isSupabaseConfigured() || !isAdminClientConfigured()) return void memory.set(userId, f);
  const r = await supabaseAdmin().from("sign_digest").upsert({ user_id: userId, frequency: f, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (r.error) throw new Error(r.error.message);
}

export interface DigestSigner {
  position: number;
  name: string;
  status: string; // waiting (not their turn yet) | invited | signed
  invited_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
}
export interface DigestDoc {
  id: string;
  title: string;
  created_at: string;
  completed_at: string | null;
  status: string; // sent | completed
  signers: DigestSigner[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SGT = { timeZone: "Asia/Singapore" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...SGT });
function ago(iso: string, now: number): string {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
const first = (n: string) => n.trim().split(/\s+/)[0] || "them";

/** "1–4 · A, B, C, D" for a run of signers in a row with the same state */
function rows(doc: DigestDoc, now: number): Array<{ who: string; pill: string; bg: string; fg: string }> {
  const out: Array<{ who: string; pill: string; bg: string; fg: string; key: string; from: number; to: number; names: string[] }> = [];
  const sorted = [...doc.signers].sort((a, b) => a.position - b.position);
  const current = sorted.find((s) => s.status === "invited" && s.invited_at);
  for (const s of sorted) {
    let key: string, pill: string, bg: string, fg: string;
    if (s.status === "signed") [key, pill, bg, fg] = ["signed", "Signed", "#e5f4e4", "#226b2a"];
    else if (s.status === "invited" && s.invited_at && s.viewed_at) [key, pill, bg, fg] = [`o${s.position}`, `Opened ${ago(s.viewed_at, now)}, not signed`, "#fdf2d8", "#8a6410"];
    else if (s.status === "invited" && s.invited_at) [key, pill, bg, fg] = [`e${s.position}`, `Emailed ${ago(s.invited_at, now)}, not opened`, "#e7f1fb", "#1f5fa8"];
    else [key, pill, bg, fg] = ["wait", current ? `Not emailed yet (after ${current.position})` : "Not emailed yet", "#f1f0ec", "#6b6b67"]; // waiting for their turn
    const last = out[out.length - 1];
    if (last && last.key === key && (key === "signed" || key === "wait")) {
      last.to = s.position;
      last.names.push(s.name);
    } else out.push({ who: "", pill, bg, fg, key, from: s.position, to: s.position, names: [s.name] });
  }
  return out.map((r) => ({ ...r, who: `${r.from === r.to ? r.from : `${r.from}–${r.to}`} · ${r.names.join(", ")}` }));
}

export function digestEmail(p: { name: string; frequency: Exclude<DigestFrequency, "off">; plan: string; open: DigestDoc[]; completed: DigestDoc[]; site: string; now?: number }): { subject: string; html: string; text: string } {
  const now = p.now ?? Date.now();
  const period = p.frequency === "daily" ? "daily" : "weekly";
  const left = p.open.reduce((n, d) => n + d.signers.filter((s) => s.status !== "signed").length, 0);
  const when = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", ...SGT });
  const subject = p.open.length
    ? `FD Sign: ${p.open.length} document${p.open.length === 1 ? "" : "s"} waiting, ${left} ${left === 1 ? "person" : "people"} still to sign`
    : `FD Sign: ${p.completed.length} document${p.completed.length === 1 ? "" : "s"} completed`;
  const box = (n: number, t: string) =>
    `<td width="33%" style="padding:0 4px;"><div style="background:#faf9f5;border:1px solid #ecebe6;border-radius:10px;padding:10px 12px;"><div style="font-size:20px;font-weight:bold;">${n}</div><div style="font-size:12px;color:#6b6b67;">${t}</div></div></td>`;
  const docs = p.open
    .slice(0, 10)
    .map((d) => {
      const total = d.signers.length;
      const signed = d.signers.filter((s) => s.status === "signed").length;
      const pct = total ? Math.round((signed / total) * 100) : 0;
      const cur = [...d.signers].sort((a, b) => a.position - b.position).find((s) => s.status === "invited" && s.invited_at);
      const link = `${p.site}/fd-sign/d/${d.id}`;
      const list = rows(d, now)
        .map((r) => `<tr><td style="padding:7px 0;border-top:1px solid #f0efea;">${esc(r.who)}</td><td align="right" style="padding:7px 0;border-top:1px solid #f0efea;white-space:nowrap;"><span style="font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;background:${r.bg};color:${r.fg};">${esc(r.pill)}</span></td></tr>`)
        .join("");
      return `<tr><td style="padding:14px 26px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ecebe6;border-radius:12px;"><tr><td style="padding:14px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:15px;font-weight:bold;">${esc(d.title)}</td><td align="right" style="font-size:12px;color:#6b6b67;white-space:nowrap;">sent ${day(d.created_at)}</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 4px;"><tr>${pct > 0 ? `<td width="${pct}%" style="height:7px;background:#f3bf4b;font-size:0;line-height:0;">&nbsp;</td>` : ""}${pct < 100 ? `<td width="${100 - pct}%" style="height:7px;background:#ecebe6;font-size:0;line-height:0;">&nbsp;</td>` : ""}</tr></table>
<div style="font-size:13px;color:#55555b;margin-bottom:8px;"><b>${signed} of ${total} signed</b> · ${total - signed} remaining${cur ? ` · with signer ${cur.position} now` : ""}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">${list}</table>
<div style="margin-top:12px;">${cur ? `<a href="${link}?remind=1" style="display:inline-block;font-size:13px;font-weight:bold;padding:9px 15px;border-radius:9px;text-decoration:none;background:#f3bf4b;color:#1b1b1e;margin-right:6px;">Remind ${esc(first(cur.name))}</a>` : ""}<a href="${link}" style="display:inline-block;font-size:13px;font-weight:bold;padding:8px 14px;border-radius:9px;text-decoration:none;border:1px solid #d9d9d4;color:#1b1b1e;">View document</a></div>
</td></tr></table></td></tr>`;
    })
    .join("");
  const more = p.open.length > 10 ? `<tr><td style="padding:10px 26px 0;font-size:13px;color:#55555b;">…and ${p.open.length - 10} more in <a href="${p.site}/fd-sign" style="color:#8a6410;">My documents</a>.</td></tr>` : "";
  const done = p.completed.length
    ? `<tr><td style="padding:14px 26px 4px;font-size:13px;line-height:20px;color:#55555b;">✅ Completed ${p.frequency === "daily" ? "since yesterday" : "this week"}: ${p.completed
        .slice(0, 5)
        .map((d) => `<b style="color:#1b1b1e;">${esc(d.title)}</b> (${d.signers.length} of ${d.signers.length} signed${d.completed_at ? `, ${day(d.completed_at)}` : ""}) <a href="${p.site}/api/sign/file?e=${d.id}&amp;signed=1&amp;download=1" style="color:#8a6410;">Download ›</a>`)
        .join("<br>")}</td></tr>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f3ef;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3ef;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e5df;border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:#1b1b1e;">
<tr><td style="padding:24px 26px 4px;"><span style="display:inline-block;font-size:11px;letter-spacing:4px;font-weight:bold;border-top:2px solid #1b1b1e;border-bottom:2px solid #1b1b1e;padding:4px 8px;">FOUNDERS DOC</span>
<h1 style="font-size:21px;line-height:28px;margin:18px 0 6px;">Your FD Sign ${period} update</h1>
<p style="margin:0;font-size:14px;line-height:22px;color:#55555b;">Hi ${esc(first(p.name))}, here's where your documents stand. ${esc(when)}, 9:00am (Singapore time).</p></td></tr>
<tr><td style="padding:16px 22px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${box(p.open.length, "waiting for signatures")}${box(left, "people still to sign")}${box(p.completed.length, p.frequency === "daily" ? "completed since yesterday" : "completed this week")}</tr></table></td></tr>
${docs}${more}${done}
<tr><td style="padding:16px 26px 22px;border-top:1px solid #f0efea;font-size:11.5px;line-height:18px;color:#8a8a86;">You get this ${p.frequency === "daily" ? "every morning" : "every Monday"} with your <b>${esc(p.plan)}</b> plan. <a href="${p.site}/fd-sign#status-emails" style="color:#8a6410;">Change to ${p.frequency === "daily" ? "weekly" : "daily"} or turn off</a><br>Founders Doc · FD Sign. Only you get this summary.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Your FD Sign ${period} update (${when})`,
    ...p.open.map((d) => {
      const signed = d.signers.filter((s) => s.status === "signed").length;
      return `- ${d.title}: ${signed} of ${d.signers.length} signed. ${p.site}/fd-sign/d/${d.id}`;
    }),
    ...(p.completed.length ? [`Completed: ${p.completed.map((d) => d.title).join(", ")}`] : []),
    `Change or turn off: ${p.site}/fd-sign#status-emails`,
  ].join("\n");
  return { subject, html, text };
}

/** One sender's email, or null when there is nothing to tell (no open documents, nothing completed). */
export async function senderDigest(
  store: import("./store").SignStore,
  owner: { id: string; name: string },
  frequency: Exclude<DigestFrequency, "off">,
  plan: string,
  site: string,
  now = Date.now(),
): Promise<{ subject: string; html: string; text: string; open: number } | null> {
  const since = now - (frequency === "daily" ? 1 : 7) * 86_400_000;
  const all = await store.mine(owner.id, 500);
  const toDoc = (e: (typeof all)[number]): DigestDoc => ({
    id: e.id,
    title: e.title,
    created_at: e.created_at,
    completed_at: e.completed_at,
    status: e.status,
    signers: e.signers.map((s) => ({ position: s.position, name: s.name, status: s.status, invited_at: s.invited_at, viewed_at: s.viewed_at, signed_at: s.signed_at })),
  });
  const open = all.filter((e) => e.status === "sent").map(toDoc);
  const completed = all.filter((e) => e.status === "completed" && e.completed_at && Date.parse(e.completed_at) >= since).map(toDoc);
  if (!open.length && !completed.length) return null;
  return { ...digestEmail({ name: owner.name, frequency, plan, open, completed, site, now }), open: open.length };
}

/** Monday in Singapore (the weekly email's day). */
export const isMondaySgt = (now = Date.now()) => new Date(now + 8 * 3_600_000).getUTCDay() === 1;
