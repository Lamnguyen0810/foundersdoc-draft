"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EsopCompany, EsopMember, EsopSettings, MemberRole } from "@/lib/esop/vesting";
import { Ic } from "./icons";

/**
 * Settings (Rachel, 6 Nov 2026), on every ESOP dashboard. The client's Admins change
 * them; everyone else sees them read-only. Saved with the person's own session, so
 * supabase/123 decides what is allowed (esop_set_member, esop_save_settings).
 *
 *   Approvers      who approves issuances
 *   Access         who can open the dashboard, and what they may do
 *   Holder access  whether holders see their own options (Premium)
 *   Alerts         who is told before a vesting, and how long before
 */

type Role = Exclude<MemberRole, "approver">;
const ROLE_TEXT: Record<Role, [string, string]> = {
  ceo: ["Admin", "Sees and changes everything, including these settings"],
  editor: ["Editor", "Sees and changes holders and documents"],
  viewer: ["View only", "Sees everything, changes nothing"],
};
const ROLES = Object.keys(ROLE_TEXT) as Role[];
const TIMINGS: Array<[number, string]> = [
  [28, "4 weeks before"],
  [14, "2 weeks before"],
  [7, "1 week before"],
  [3, "3 days before"],
  [1, "The day before"],
  [0, "On the day"],
];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ERRORS: Array<[RegExp, string]> = [
  [/last admin/, "A dashboard needs at least one Admin. Make someone else Admin first."],
  [/premium/, "Holder access is part of Premium. Ask Founders Doc to switch it on."],
  [/not allowed/, "Only an Admin can change the settings."],
  [/bad email/, "Check the email address."],
  [/too many/, "That is more than the limit (50 people, 10 alert emails, 5 timings)."],
  [/esop_set_member|esop_save_settings|esop_members_list|function .* does not exist/, "Settings need supabase/123_esop_settings.sql first."],
];
const why = (m: string) => ERRORS.find(([re]) => re.test(m))?.[1] ?? `Not saved: ${m}`;

export default function SettingsPage(p: {
  company: EsopCompany;
  settings: EsopSettings;
  access: { role: MemberRole | null; canEdit: boolean; canManage: boolean };
  isAdmin: boolean;
  viewer: string;
  client: SupabaseClient | null;
  say: (t: string) => false;
}) {
  const { client, company } = p;
  const can = p.access.canManage;
  const [members, setMembers] = useState<EsopMember[] | null>(client ? null : demoMembers(p.viewer));
  const [days, setDays] = useState<number[]>(p.settings.alert_days);
  const [emails, setEmails] = useState<string[]>(p.settings.alert_emails);
  const [holderAccess, setHolderAccess] = useState(p.settings.holder_access);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [newAlert, setNewAlert] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const premium = p.settings.plan === "premium" || p.isAdmin;

  useEffect(() => {
    if (!client) return;
    let gone = false;
    void client.rpc("esop_members_list", { p_company: company.id }).then(({ data, error }) => {
      if (gone) return;
      if (error) {
        setMembers([]);
        p.say(why(error.message));
        return;
      }
      setMembers((data ?? []) as EsopMember[]);
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, [client, company.id]);

  async function setMember(m: EsopMember, patch: Partial<EsopMember>, done = "Saved") {
    const next = { ...m, ...patch };
    const before = members;
    setMembers((l) => (l ?? []).some((x) => x.email === next.email) ? (l ?? []).map((x) => (x.email === next.email ? next : x)) : [...(l ?? []), next]);
    if (!client) return p.say(done + " (preview, not stored)");
    setBusy(m.email);
    const { error } = await client.rpc("esop_set_member", { p_company: company.id, p_email: next.email, p_role: next.role, p_approves: next.approves, p_alerts: next.alerts });
    setBusy("");
    if (error) {
      setMembers(before);
      return p.say(why(error.message));
    }
    p.say(done);
  }

  async function remove(m: EsopMember) {
    if (!window.confirm(`Remove ${m.email}? They will no longer be able to open this dashboard.`)) return;
    const before = members;
    setMembers((l) => (l ?? []).filter((x) => x.email !== m.email));
    if (!client) return p.say("Removed (preview, not stored)");
    const { error } = await client.rpc("esop_remove_member", { p_company: company.id, p_email: m.email });
    if (error) {
      setMembers(before);
      return p.say(why(error.message));
    }
    p.say(`${m.email} removed`);
  }

  async function add() {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL.test(email)) return p.say("Check the email address.");
    if ((members ?? []).some((x) => x.email === email)) return p.say("They already have access. Change their role below.");
    await setMember({ email, role: newRole, approves: false, alerts: false }, {}, `${email} added. They can open the dashboard after signing in to FD AI with this email.`);
    setNewEmail("");
  }

  async function saveSettings() {
    if (!client) {
      setDirty(false);
      return p.say("Saved (preview, not stored)");
    }
    setBusy("settings");
    const { error } = await client.rpc("esop_save_settings", { p_company: company.id, p_alert_days: days, p_alert_emails: emails, p_holder_access: holderAccess, p_option_pool: null });
    setBusy("");
    if (error) return p.say(why(error.message));
    setDirty(false);
    p.say("Settings saved");
  }

  async function sendAll() {
    if (!window.confirm("Email every active holder with an email address a private link to their own share options?")) return;
    setBusy("links");
    try {
      const res = await fetch("/api/esop/holder-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: company.slug, all: true }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: number; failed?: number; error?: string };
      if (!out.ok) return p.say(out.error ?? "Could not send the links.");
      p.say(`${out.sent ?? 0} link${out.sent === 1 ? "" : "s"} sent${out.failed ? ` · ${out.failed} could not be sent` : ""}`);
    } finally {
      setBusy("");
    }
  }

  const toggleDay = (d: number) => {
    setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d].sort((a, b) => b - a)));
    setDirty(true);
  };
  const addAlertEmail = () => {
    const e = newAlert.trim().toLowerCase();
    if (!EMAIL.test(e)) return p.say("Check the email address.");
    if (!emails.includes(e)) setEmails((l) => [...l, e]);
    setNewAlert("");
    setDirty(true);
  };
  const list = members ?? [];
  const approvers = list.filter((m) => m.approves);
  const alertPeople = list.filter((m) => m.alerts);
  const timingText = days.length ? days.map((d) => TIMINGS.find((t) => t[0] === d)?.[1] ?? `${d} days before`).join(", ") : "No emails";

  return (
    <>
      <header className="ev-title">
        <h1>Settings</h1>
        <span>{can ? `${company.name.replace(/\s*\(TEST\)\s*$/i, "")} · changes apply straight away` : "Only an Admin can change these"}</span>
      </header>
      {!p.settings.ready && <div className="ev-simbar">These settings need supabase/123_esop_settings.sql to be run first.</div>}

      <section className="ev-card ev-set">
        <div className="ev-seth">
          <h2>Approvers</h2>
          <span>Who approves issuances of option certificates, from the dashboard or the approval email.</span>
        </div>
        {members === null && <div className="ev-sub">Loading…</div>}
        {members !== null && list.length === 0 && <div className="ev-sub">No one has access yet. Add people under Access first.</div>}
        <ul className="ev-setlist">
          {list.map((m) => (
            <li key={m.email}>
              <span className="ev-ini sm t0" aria-hidden="true">
                {m.email[0].toUpperCase()}
              </span>
              <span className="ev-setwho">{m.email}</span>
              <label className="ev-check">
                <input type="checkbox" checked={m.approves} disabled={!can || busy === m.email} onChange={(e) => void setMember(m, { approves: e.target.checked }, e.target.checked ? `${m.email} can now approve` : `${m.email} no longer approves`)} />
                Approver
              </label>
            </li>
          ))}
        </ul>
        <div className="ev-setfoot">{approvers.length ? `${approvers.length} approver${approvers.length === 1 ? "" : "s"}` : "No approver yet: Founders Doc approves for you"}</div>
      </section>

      <section className="ev-card ev-set">
        <div className="ev-seth">
          <h2>Access</h2>
          <span>Who can open this dashboard. They sign in to FD AI with the email you add.</span>
        </div>
        <ul className="ev-setlist">
          {list.map((m) => (
            <li key={m.email}>
              <span className="ev-ini sm t1" aria-hidden="true">
                {m.email[0].toUpperCase()}
              </span>
              <span className="ev-setwho">
                {m.email}
                {m.email === p.viewer.toLowerCase() && <span className="ev-muted"> · you</span>}
              </span>
              <label className="ev-select sm">
                <span className="ev-sr">Role for {m.email}</span>
                <select value={m.role === "approver" ? "editor" : m.role} disabled={!can || busy === m.email} onChange={(e) => void setMember(m, { role: e.target.value as Role }, `${m.email} is now ${ROLE_TEXT[e.target.value as Role][0]}`)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_TEXT[r][0]}
                    </option>
                  ))}
                </select>
              </label>
              {can && (
                <button className="ev-x sm" onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>
                  <Ic n="close" s={14} w={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {can && (
          <form
            className="ev-setadd"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label className="ev-search wide">
              <Ic n="mail" w={2} />
              <span className="ev-sr">Email</span>
              <input type="email" placeholder="name@company.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </label>
            <label className="ev-select">
              <span className="ev-sr">Role</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_TEXT[r][0]}
                  </option>
                ))}
              </select>
            </label>
            <button className="ev-btn gold" type="submit">
              <Ic n="plus" w={2.2} />
              Add person
            </button>
          </form>
        )}
        <dl className="ev-roles">
          {ROLES.map((r) => (
            <div key={r}>
              <dt>{ROLE_TEXT[r][0]}</dt>
              <dd>{ROLE_TEXT[r][1]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ev-card ev-set">
        <div className="ev-seth">
          <h2>
            Holder access <span className="ev-goldp ev-tagp">Premium</span>
          </h2>
          <span>Let each option holder sign in and see their own options, vesting dates and documents, and nobody else&rsquo;s.</span>
        </div>
        <button
          role="switch"
          aria-checked={holderAccess}
          disabled={!can || !premium}
          className={`ev-switch ${holderAccess ? "on" : ""}`}
          onClick={() => {
            setHolderAccess((v) => !v);
            setDirty(true);
          }}
        >
          {holderAccess ? "Holders can see their own page" : "Holders cannot sign in"}
          <span aria-hidden="true">
            <span />
          </span>
        </button>
        {!premium && <div className="ev-sub">Part of Premium. <a href="mailto:legal@foundersdoc.com?subject=ESOP%20Premium">Ask Founders Doc</a> to switch it on.</div>}
        {premium && p.settings.holder_access && (
          <div className="ev-setadd">
            <button className="ev-btn" disabled={!can || busy === "links"} onClick={() => void sendAll()}>
              <Ic n="mail" />
              {busy === "links" ? "Sending…" : "Email every active holder their link"}
            </button>
            <span className="ev-sub">Each holder gets a private link to their own page (foundersdoc.com/my-options). You can also send one from a holder&rsquo;s details.</span>
          </div>
        )}
        {premium && !p.settings.holder_access && <div className="ev-sub">Switch it on and save; you can then email holders their private links.</div>}
      </section>

      <section className="ev-card ev-set">
        <div className="ev-seth">
          <h2>Alerts</h2>
          <span>Who gets an email before a vesting, and when. Sent from Founders Doc (fd.documents@foundersdoc.com).</span>
        </div>
        <h3 className="ev-seth3">When</h3>
        <div className="ev-chips flat" role="group" aria-label="When to send alerts">
          {TIMINGS.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} className={days.includes(d) ? "on" : ""} disabled={!can} onClick={() => toggleDay(d)}>
              {label}
            </button>
          ))}
          {days
            .filter((d) => !TIMINGS.some((t) => t[0] === d))
            .map((d) => (
              <button key={d} type="button" aria-pressed className="on" disabled={!can} onClick={() => toggleDay(d)}>
                {d} days before ✕
              </button>
            ))}
          {can && (
            <span className="ev-custom">
              <input inputMode="numeric" placeholder="Other" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} aria-label="Days before" />
              <button
                type="button"
                className="ev-link"
                onClick={() => {
                  const n = Number(custom);
                  if (!custom || n > 60) return p.say("Choose 0 to 60 days.");
                  if (!days.includes(n)) toggleDay(n);
                  setCustom("");
                }}
              >
                Add
              </button>
            </span>
          )}
        </div>
        <div className="ev-sub">{timingText}</div>

        <h3 className="ev-seth3">Who</h3>
        <ul className="ev-setlist">
          {list.map((m) => (
            <li key={m.email}>
              <span className="ev-setwho">{m.email}</span>
              <label className="ev-check">
                <input type="checkbox" checked={m.alerts} disabled={!can || busy === m.email} onChange={(e) => void setMember(m, { alerts: e.target.checked }, e.target.checked ? `${m.email} will get alerts` : `${m.email} will not get alerts`)} />
                Gets alerts
              </label>
            </li>
          ))}
          {emails.map((e) => (
            <li key={e}>
              <span className="ev-setwho">
                {e} <span className="ev-muted">· alerts only, no access</span>
              </span>
              {can && (
                <button
                  className="ev-x sm"
                  aria-label={`Stop alerts to ${e}`}
                  onClick={() => {
                    setEmails((l) => l.filter((x) => x !== e));
                    setDirty(true);
                  }}
                >
                  <Ic n="close" s={14} w={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {can && (
          <form
            className="ev-setadd"
            onSubmit={(e) => {
              e.preventDefault();
              addAlertEmail();
            }}
          >
            <label className="ev-search wide">
              <Ic n="mail" w={2} />
              <span className="ev-sr">Alert email</span>
              <input type="email" placeholder="Someone else, e.g. hr@company.com" value={newAlert} onChange={(e) => setNewAlert(e.target.value)} />
            </label>
            <button className="ev-btn" type="submit">
              Add email
            </button>
          </form>
        )}
        <div className="ev-setfoot">
          {alertPeople.length + emails.length ? `${alertPeople.length + emails.length} ${alertPeople.length + emails.length === 1 ? "person gets" : "people get"} alerts` : "No one gets alerts yet"}
          {company.slug === "hitpay" && " · Founders Doc's own Slack alert carries on as now"}
        </div>
      </section>

      {can && (
        <div className="ev-savebar">
          <span>{dirty ? "You have unsaved changes to holder access or alerts." : "People changes save straight away."}</span>
          <button className="ev-btn gold" disabled={!dirty || busy === "settings"} onClick={() => void saveSettings()}>
            {busy === "settings" ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
      <p className="ev-note">
        Your own sign-in and password: <a href="/settings">account settings</a>
      </p>
    </>
  );
}

function demoMembers(viewer: string): EsopMember[] {
  const me = viewer.includes("@") ? viewer.toLowerCase() : "founder@example.com";
  return [
    { email: me, role: "ceo", approves: true, alerts: true },
    { email: "cfo@example.com", role: "editor", approves: true, alerts: false },
    { email: "board@example.com", role: "viewer", approves: false, alerts: false },
  ];
}
