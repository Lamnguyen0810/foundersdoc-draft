"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  COMPANY_FIELDS,
  DRAFTING_STYLES,
  type CompanyProfile,
  type DetailChoice,
  type DraftingStyle,
  type UserSettings,
} from "@/lib/settings";

/**
 * The settings page's body: the designer's sidebar, panels, cards, toggles
 * and save bars, wired to what FD AI actually has.
 *
 * Three kinds of control appear on it:
 *   REAL      — reads and writes the database or Stripe (name, company,
 *               preferences, password, documents, plan, sign out everywhere).
 *   LINK      — goes where the thing already lives (billing, contact, terms).
 *   COMING    — the designer's control, disabled, marked "Coming soon", and
 *               leading to the site's coming-soon page for that feature. The
 *               design is complete on screen; nothing on it pretends.
 */

export interface DraftRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  type: string;
}

/** A document the person deleted, still inside its thirty days. */
export interface DeletedRow {
  id: string;
  title: string;
  type: string;
  deletedAt: string;
  daysLeft: number;
}

export interface BillingView {
  credits: number | null;
  planLabel: string;
  planPrice: string | null;
  status: string | null;
  renewsAt: string | null;
  cancelling: boolean;
  card: string | null;
  allowance: number | null;
  used: number;
  draftsThisMonth: number;
  payments: {
    id: string;
    at: string | null;
    description: string;
    amount: string;
    status: "paid" | "refunded" | "part_refunded" | "failed" | "pending";
    refunded: string | null;
    url: string | null;
  }[];
}

type PanelId = "account" | "company" | "ai" | "documents" | "plan" | "notifications" | "security" | "support" | "legal";

const PANELS: { id: PanelId; label: string; group: "Settings" | "Support"; icon: ReactNode }[] = [
  { id: "account", label: "Account", group: "Settings", icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.25" /><path d="M5.75 19c.7-3.25 3.05-5 6.25-5s5.55 1.75 6.25 5" /></svg> },
  { id: "company", label: "Company Profile", group: "Settings", icon: <svg viewBox="0 0 24 24"><path d="M5 20V5.5h9V20M14 9h5v11M8 9h3M8 13h3M8 17h3M17 13h.01M17 17h.01M3.5 20h17" /></svg> },
  { id: "ai", label: "FD AI", group: "Settings", icon: <svg viewBox="0 0 24 24"><path d="M12 3l1.1 3.4L16.5 7.5l-3.4 1.1L12 12l-1.1-3.4-3.4-1.1 3.4-1.1L12 3ZM18 13l.7 2.3L21 16l-2.3.7L18 19l-.7-2.3L15 16l2.3-.7L18 13Z" /></svg> },
  { id: "documents", label: "Documents & Data", group: "Settings", icon: <svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20H7z" /><path d="M14 3.5V8h4M10 12h5M10 15.5h5" /></svg> },
  { id: "plan", label: "Plan & Usage", group: "Settings", icon: <svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17M7 14.5h3" /></svg> },
  { id: "notifications", label: "Notifications", group: "Settings", icon: <svg viewBox="0 0 24 24"><path d="M6.5 17h11l-1.3-1.8V11a4.2 4.2 0 0 0-8.4 0v4.2L6.5 17Z" /><path d="M10 19.5h4" /></svg> },
  { id: "security", label: "Security & Privacy", group: "Settings", icon: <svg viewBox="0 0 24 24"><rect x="5.5" y="10" width="13" height="10" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2" /></svg> },
  { id: "support", label: "Help & Support", group: "Support", icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.3a2.4 2.4 0 1 1 3.5 2.15c-.9.5-1.3 1-1.3 2.05M12 16.9h.01" /></svg> },
  { id: "legal", label: "Legal", group: "Support", icon: <svg viewBox="0 0 24 24"><path d="M12 4v16M8 20h8M6 7h12M7 7l-3 5h6L7 7ZM17 7l-3 5h6l-3-5Z" /><path d="M4 12c.2 1.5 1.3 2.5 3 2.5s2.8-1 3-2.5M14 12c.2 1.5 1.3 2.5 3 2.5s2.8-1 3-2.5" /></svg> },
];

const PANEL_IDS = new Set<string>(PANELS.map((p) => p.id));

/** The site's coming-soon page, which names the feature it was asked about. */
function soonHref(feature: string): string {
  return `/coming-soon?f=${encodeURIComponent(feature)}`;
}

/** A designed control that has no feature behind it yet. */
function SoonButton({ feature, className = "btn" }: { feature: string; className?: string }) {
  return (
    <a className={`${className} soon`} href={soonHref(feature)} title={`${feature} — coming soon`}>
      Coming soon
    </a>
  );
}

function SoonSwitch({ feature }: { feature: string }) {
  return (
    <a className="switch soon" href={soonHref(feature)} title={`${feature} — coming soon`} aria-label={`${feature} — coming soon`}>
      <span className="slider" />
    </a>
  );
}

function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function SettingsShell({
  email,
  fullName: initialName,
  settings: initialSettings,
  settingsMissing,
  drafts,
  draftCount,
  deleted,
  lastSignInAt,
  avatarUrl: initialAvatar,
  userId,
  billing,
  supabase,
  passwordForm,
  cancelPlan,
  updateCard,
}: {
  email: string;
  fullName: string;
  settings: UserSettings;
  settingsMissing: boolean;
  drafts: DraftRow[];
  draftCount: number;
  deleted: DeletedRow[];
  lastSignInAt: string | null;
  avatarUrl: string | null;
  /** Whose folder a photo goes into, and what the storage policy checks. */
  userId: string;
  billing: BillingView;
  supabase: { url: string; key: string };
  passwordForm: ReactNode;
  cancelPlan: ReactNode;
  updateCard: ReactNode;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<PanelId>("account");
  const [toast, setToast] = useState<string | null>(null);

  /* The panel in the address, so a link to /settings#plan opens on Plan. */
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      if (PANEL_IDS.has(h)) setPanel(h as PanelId);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  function open(id: PanelId) {
    setPanel(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  }

  function say(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2400);
  }

  /* ── account ── */
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [nameBusy, setNameBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function saveName() {
    setNameBusy(true);
    try {
      const res = await fetch("/api/settings/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ full_name: name }) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; full_name?: string };
      if (!res.ok || !json.ok) return say(json.error ?? "Could not save.");
      setSavedName(json.full_name ?? name);
      say("Account saved");
      router.refresh();
    } finally {
      setNameBusy(false);
    }
  }

  /* ── the photo ──────────────────────────────────────────────────────────
     Uploaded straight from the browser to storage, which is what storage is
     for: the file never passes through this application, and a 2 MB ceiling
     and the three image types are enforced by the bucket rather than by the
     checks below. Those are here to fail fast and say something useful, not
     because they are what is keeping anything out.

     The path is the person's own user id, then a timestamp: a new photo gets a
     new name so that no browser, proxy or CDN can go on showing the old one. */
  const [avatar, setAvatar] = useState<string | null>(initialAvatar);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  async function choosePhoto(file: File, userId: string) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return say("Photos must be a PNG, JPG or WEBP.");
    }
    if (file.size > 2 * 1024 * 1024) return say("That photo is over 2 MB. Try a smaller one.");

    setPhotoBusy(true);
    try {
      const client = createBrowserClient(supabase.url, supabase.key);
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upload } = await client.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upload) {
        return say(
          /bucket/i.test(upload.message)
            ? "Photo storage is not set up yet — run supabase/033_photo_and_closing_an_account.sql."
            : "Could not upload that photo.",
        );
      }
      const { data } = client.storage.from("avatars").getPublicUrl(path);
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar_url: data.publicUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) return say(json.error ?? "Could not save that photo.");
      setAvatar(data.publicUrl);
      say("Photo updated");
      router.refresh();
    } finally {
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar_url: null }),
      });
      if (!res.ok) return say("Could not remove that photo.");
      setAvatar(null);
      say("Photo removed");
      router.refresh();
    } finally {
      setPhotoBusy(false);
    }
  }

  /* ── closing the account ─────────────────────────────────────────────────
     The subscription is cancelled first, through the route that already knows
     how to refund the unused part of the month; only then is the door shut.
     The order matters: a closed account cannot cancel anything afterwards. */
  const [closing, setClosing] = useState<"deactivate" | "delete" | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);

  async function closeAccount(action: "deactivate" | "delete") {
    setCloseBusy(true);
    try {
      if (billing.status && ["active", "trialing", "past_due"].includes(billing.status)) {
        await fetch("/api/billing/cancel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: "other",
            note: action === "delete" ? "Account deleted by the customer" : "Account deactivated by the customer",
          }),
        }).catch(() => null);
      }

      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirm: confirmEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setCloseBusy(false);
        return say(json.error ?? "Could not close the account.");
      }

      /* Every session, not just this one — including the phone in a pocket. */
      const client = createBrowserClient(supabase.url, supabase.key);
      await client.auth.signOut({ scope: "global" }).catch(() => null);
      /* A full page load, not the router: the session has just been destroyed,
         and a client-side navigation can serve a payload rendered a moment ago
         for somebody who was still signed in. The same reasoning as the
         sign-in form, for the same reason, in the opposite direction. */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?closed=${action}`);
    } catch {
      setCloseBusy(false);
      say("Could not close the account.");
    }
  }

  /* ── company + ai ── */
  const [company, setCompany] = useState<CompanyProfile>(initialSettings.company);
  const [savedCompany, setSavedCompany] = useState<CompanyProfile>(initialSettings.company);
  const [useCompany, setUseCompany] = useState(initialSettings.use_company);
  const [detail, setDetail] = useState<DetailChoice>(initialSettings.ai.detail);
  const [savedDetail, setSavedDetail] = useState<DetailChoice>(initialSettings.ai.detail);
  const [style, setStyle] = useState<DraftingStyle>(initialSettings.ai.style);
  const [savedStyle, setSavedStyle] = useState<DraftingStyle>(initialSettings.ai.style);
  const [usePast, setUsePast] = useState(initialSettings.ai.use_past_drafts);
  const [retainDeleted, setRetainDeleted] = useState(initialSettings.retain_deleted);
  const [improveProduct, setImproveProduct] = useState(initialSettings.improve_product);
  const [busy, setBusy] = useState(false);
  const aiDirty = detail !== savedDetail || style !== savedStyle;

  /* Saving the FD AI section saves all three of its settings together, so the
     switch and the two choosers cannot end up describing different things. */
  const aiPayload = () => ({ ai: { detail, style, use_past_drafts: usePast } });
  const companyDirty = JSON.stringify(company) !== JSON.stringify(savedCompany) || useCompany !== initialSettings.use_company;

  async function save(payload: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; settings?: UserSettings };
      if (!res.ok || !json.ok) {
        say(json.error ?? "Could not save.");
        return false;
      }
      if (json.settings) {
        setSavedCompany(json.settings.company);
        setCompany(json.settings.company);
        setSavedDetail(json.settings.ai.detail);
        setSavedStyle(json.settings.ai.style);
        setUsePast(json.settings.ai.use_past_drafts);
        setRetainDeleted(json.settings.retain_deleted);
        setImproveProduct(json.settings.improve_product);
      }
      say(done);
      return true;
    } finally {
      setBusy(false);
    }
  }

  /* ── documents ── */
  const [docBusy, setDocBusy] = useState<string | null>(null);

  /**
   * Delete a document — which, unless the person has turned the thirty days
   * off, means putting it in the wastebasket below rather than destroying it.
   * The server decides that, not this button: the setting lives there, and a
   * browser that has been open since before the setting changed should not be
   * the thing that decides whether a client's agreement is recoverable.
   */
  async function removeDraft(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”?${retainDeleted ? " You can restore it for 30 days." : " This cannot be undone."}`)) return;
    setDocBusy(id);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; kept?: boolean; error?: string };
      if (!res.ok || !json.ok) return say(json.error ?? "Could not delete.");
      say(json.kept ? "Deleted — recoverable for 30 days" : "Deleted");
      router.refresh();
    } finally {
      setDocBusy(null);
    }
  }

  async function restoreDraft(id: string) {
    setDocBusy(id);
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) return say("Could not restore that document.");
      say("Restored");
      router.refresh();
    } finally {
      setDocBusy(null);
    }
  }

  async function destroyDraft(id: string, title: string) {
    if (!window.confirm(`Delete “${title}” for good? This cannot be undone.`)) return;
    setDocBusy(id);
    try {
      const res = await fetch(`/api/drafts/${id}?forever=1`, { method: "DELETE" });
      if (!res.ok) return say("Could not delete that document.");
      say("Deleted for good");
      router.refresh();
    } finally {
      setDocBusy(null);
    }
  }

  /* ── security ── */
  const [signingOut, setSigningOut] = useState(false);
  async function signOutEverywhere() {
    setSigningOut(true);
    try {
      const client = createBrowserClient(supabase.url, supabase.key);
      await client.auth.signOut({ scope: "global" });
      router.push("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
      say("Could not sign out. Try again.");
    }
  }

  const av = initials(savedName, email);
  const percent = billing.allowance && billing.allowance > 0 ? Math.min(100, Math.round((billing.used / billing.allowance) * 100)) : null;
  const [first, ...older] = billing.payments;

  const setC = (k: keyof CompanyProfile, v: string) => setCompany((c) => ({ ...c, [k]: v }));

  return (
    <main className="fdset">
      <div className="page">
        <section className="hero">
          <div>
            <h1>Settings</h1>
            <p>Manage your account, company details, FD AI preferences, documents, plan, usage and security.</p>
          </div>
        </section>

        <div className="mobile-picker">
          <select aria-label="Settings section" value={panel} onChange={(e) => open(e.target.value as PanelId)}>
            {PANELS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <section className="shell">
          <aside className="sidebar">
            {(["Settings", "Support"] as const).map((group) => (
              <div key={group}>
                <div className="side-group-label">{group}</div>
                <nav className="side-nav" aria-label={group}>
                  {PANELS.filter((p) => p.group === group).map((p) => (
                    <button key={p.id} type="button" className={panel === p.id ? "side-btn active" : "side-btn"} onClick={() => open(p.id)} aria-current={panel === p.id ? "page" : undefined}>
                      <span className="icon">{p.icon}</span>
                      <span className="copy"><strong>{p.label}</strong></span>
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </aside>

          <div className="main">
            {/* ── ACCOUNT ─────────────────────────────────────────────── */}
            <section className={panel === "account" ? "panel active" : "panel"} id="account">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Account</h2>
                    <p>Keep your profile details up to date and control how you sign in.</p>
                  </div>
                </div>
                <div className="profile-row">
                  <div className="avatar-large">
                    {avatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={avatar} alt="" width={64} height={64} />
                    ) : (
                      av
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong>Profile photo</strong>
                    <span>PNG, JPG or WEBP · max 2 MB</span>
                  </div>
                  <div className="inline-actions">
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && userId) void choosePhoto(file, userId);
                      }}
                    />
                    <button
                      className="btn"
                      type="button"
                      disabled={photoBusy || !userId}
                      onClick={() => photoInput.current?.click()}
                    >
                      {photoBusy ? "Working…" : avatar ? "Change" : "Upload"}
                    </button>
                    {avatar && (
                      <button className="btn" type="button" disabled={photoBusy} onClick={() => void removePhoto()}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="fields">
                  <div className="field">
                    <label htmlFor="fullName">Full name</label>
                    <input id="fullName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" value={email} readOnly title="Accounts are created by the firm, so the address is changed by an administrator." />
                  </div>
                </div>
                <p className="field-note">Your email address is fixed: accounts are created by the firm, so changing it is an administrator’s job. Ask the firm and it takes a minute.</p>
                <div className="savebar">
                  <button className="btn" type="button" disabled={name === savedName || nameBusy} onClick={() => setName(savedName)}>Cancel</button>
                  <button className="btn primary save-action" type="button" disabled={name.trim() === savedName || !name.trim() || nameBusy} onClick={() => void saveName()}>
                    {nameBusy ? "Saving…" : "Save account"}
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Sign-in methods</h2>
                    <p>Connect the sign-in methods you want to use for your FoundersDoc account.</p>
                  </div>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Email &amp; password</strong>
                    <span>Signed in as {email}.</span>
                  </div>
                  <button className="btn" type="button" onClick={() => setShowPassword((v) => !v)}>{showPassword ? "Close" : "Change password"}</button>
                </div>
                {showPassword && <div className="password-form">{passwordForm}</div>}
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Google</strong>
                    <span>Connect Google for faster login.</span>
                  </div>
                  <SoonButton feature="Google sign-in" />
                </div>
              </div>

              <div className="card danger-zone">
                <div className="card-head">
                  <div>
                    <h2>Account management</h2>
                    <p>Deactivate your account temporarily or permanently delete it.</p>
                  </div>
                </div>
                {closing === null && (
                  <div className="inline-actions">
                    <button className="btn" type="button" onClick={() => setClosing("deactivate")}>
                      Deactivate account
                    </button>
                    <button className="btn danger" type="button" onClick={() => { setConfirmEmail(""); setClosing("delete"); }}>
                      Delete account
                    </button>
                  </div>
                )}

                {closing === "deactivate" && (
                  <div className="close-confirm">
                    <strong>Deactivate this account?</strong>
                    <p>
                      You will be signed out everywhere and cannot sign in again. Nothing is
                      deleted — your documents stay exactly as they are.
                      {billing.status && ["active", "trialing", "past_due"].includes(billing.status)
                        ? " Your membership is cancelled and the unused part of the month refunded."
                        : ""}{" "}
                      To open the account again, contact FoundersDoc.
                    </p>
                    <div className="inline-actions">
                      <button className="btn" type="button" disabled={closeBusy} onClick={() => setClosing(null)}>
                        Keep my account
                      </button>
                      <button className="btn danger" type="button" disabled={closeBusy} onClick={() => void closeAccount("deactivate")}>
                        {closeBusy ? "Closing…" : "Yes, deactivate"}
                      </button>
                    </div>
                  </div>
                )}

                {closing === "delete" && (
                  <div className="close-confirm danger">
                    <strong>Delete this account and everything in it?</strong>
                    <p>
                      You will be signed out everywhere and cannot sign in again. Your documents,
                      their versions and your answers are kept for <b>30 days</b> and then destroyed
                      for good.
                      {billing.status && ["active", "trialing", "past_due"].includes(billing.status)
                        ? " Your membership is cancelled and the unused part of the month refunded."
                        : ""}{" "}
                      Those 30 days are so FoundersDoc can undo a mistake if you ask — you will not
                      be able to sign in and undo it yourself. Download anything you need first.
                    </p>
                    <label className="close-confirm-field">
                      <span>Type <b>{email}</b> to confirm</span>
                      <input
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        placeholder={email}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <div className="inline-actions">
                      <button className="btn" type="button" disabled={closeBusy} onClick={() => setClosing(null)}>
                        Keep my account
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={closeBusy || confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()}
                        onClick={() => void closeAccount("delete")}
                      >
                        {closeBusy ? "Closing…" : "Delete my account"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── COMPANY PROFILE ─────────────────────────────────────── */}
            <section className={panel === "company" ? "panel active" : "panel"} id="company">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Company Profile</h2>
                    <p>Save your company details once so FD AI can pre-fill them when drafting future documents.</p>
                  </div>
                  <span className="muted-badge">{settingsMissing ? "Not set up yet" : savedCompany.name ? "Saved securely" : "Not saved yet"}</span>
                </div>
                {settingsMissing && (
                  <p className="setup-note">Saving needs <code>supabase/018_user_settings.sql</code> to be run first.</p>
                )}
                <div className="fields">
                  {COMPANY_FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={`c-${f.key}`}>{f.label}</label>
                      {f.options ? (
                        <select id={`c-${f.key}`} value={company[f.key]} onChange={(e) => setC(f.key, e.target.value)}>
                          {f.options.map((o) => (
                            <option key={o} value={o}>{o || "—"}</option>
                          ))}
                        </select>
                      ) : (
                        <input id={`c-${f.key}`} value={company[f.key]} placeholder={f.placeholder} onChange={(e) => setC(f.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="c-description">Company description</label>
                  <textarea id="c-description" value={company.description} placeholder="What the company does, in a sentence or two." onChange={(e) => setC("description", e.target.value)} />
                </div>
                <div className="prefill">
                  <div>
                    <strong>Use my company profile to pre-fill FD AI documents</strong>
                    <p>Your company name goes in as “your name or organisation”, with the UEN and registered address as party details. You can still review and edit the information before generating any draft.</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={useCompany} onChange={(e) => setUseCompany(e.target.checked)} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="savebar">
                  <button className="btn" type="button" disabled={!companyDirty || busy} onClick={() => { setCompany(savedCompany); setUseCompany(initialSettings.use_company); }}>Discard</button>
                  <button className="btn primary save-action" type="button" disabled={!companyDirty || busy || settingsMissing} onClick={() => void save({ company, use_company: useCompany }, "Company profile saved")}>
                    {busy ? "Saving…" : "Save company profile"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── FD AI ───────────────────────────────────────────────── */}
            <section className={panel === "ai" ? "panel active" : "panel"} id="ai">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>FD AI preferences</h2>
                    <p>These are your default drafting preferences. Keep them simple so the experience stays clear and easy to use.</p>
                  </div>
                </div>
                <div className="summary-label" style={{ marginBottom: 10 }}>Drafting detail</div>
                <div className="choice-grid" role="radiogroup" aria-label="Drafting detail">
                  {([
                    ["simple", "Simple", "Shorter, practical drafting for straightforward documents."],
                    ["standard", "Standard", "Balanced legal detail with clear commercial language."],
                    ["comprehensive", "Comprehensive", "More detailed drafting and broader clause coverage."],
                  ] as [DetailChoice, string, string][]).map(([id, title, copy]) => (
                    <div key={id} role="radio" aria-checked={detail === id} tabIndex={0} className={detail === id ? "choice active" : "choice"} onClick={() => setDetail(id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDetail(id)}>
                      {id === "standard" && <div className="pill">Recommended</div>}
                      <strong>{title}</strong>
                      <span>{copy}</span>
                    </div>
                  ))}
                </div>
                <p className="field-note">Sets where the comprehensiveness slider starts on a new NDA. You can still move it on the draft itself.</p>
                <div className="fields three" style={{ marginTop: 18 }}>
                  {/* Jurisdiction is not a second setting: it is the governing
                      law already on the company profile, shown here because
                      this is where people look for it. Two boxes holding the
                      same fact is how they come to disagree. */}
                  <div className="field">
                    <label>Default governing law</label>
                    <select disabled value={savedCompany.governing_law || "Singapore"}>
                      <option>{savedCompany.governing_law || "Singapore"}</option>
                    </select>
                    <button type="button" className="soon-note" onClick={() => open("company")}>
                      From your company profile · change it there
                    </button>
                  </div>
                  <div className="field">
                    <label>Drafting style</label>
                    <select value={style} onChange={(e) => setStyle(e.target.value as DraftingStyle)}>
                      {DRAFTING_STYLES.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    <span className="field-note">
                      {DRAFTING_STYLES.find((o) => o.id === style)?.help}
                    </span>
                  </div>
                  <div className="field">
                    <label>Language</label>
                    <select disabled value="English"><option>English</option></select>
                    <span className="field-note">
                      FD AI drafts in English. There is no other language to choose yet.
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 20 }}>
                  <div className="toggle-row">
                    <div className="toggle-copy">
                      <strong>Use Company Profile</strong>
                      <span>Pre-fill relevant business details during drafting.</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={useCompany} onChange={(e) => { setUseCompany(e.target.checked); void save({ use_company: e.target.checked }, e.target.checked ? "Company profile will pre-fill drafts" : "Company profile will not pre-fill drafts"); }} />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-copy">
                      <strong>Use my previous documents as a style guide</strong>
                      <span>
                        Show FD AI your most recent finished document of the same type, so a new
                        draft follows your house style. It is used for wording and structure only —
                        every party, date, sum and term still comes from the questions you answer.
                      </span>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={usePast}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setUsePast(on);
                          void save(
                            { ai: { detail, style, use_past_drafts: on } },
                            on
                              ? "Your past documents will guide the style"
                              : "Drafts will not look at your past documents",
                          );
                        }}
                      />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-copy">
                      <strong>Remember drafting preferences</strong>
                      <span>Your choices on this page are saved to your account and used for every new draft.</span>
                    </div>
                    <label className="switch"><input type="checkbox" checked readOnly disabled /><span className="slider" /></label>
                  </div>
                </div>
                <div className="savebar">
                  <button className="btn primary save-action" type="button" disabled={!aiDirty || busy || settingsMissing} onClick={() => void save(aiPayload(), "FD AI preferences saved")}>
                    {busy ? "Saving…" : "Save FD AI preferences"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── DOCUMENTS & DATA ────────────────────────────────────── */}
            <section className={panel === "documents" ? "panel active" : "panel"} id="documents">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Documents &amp; Data</h2>
                    <p>{draftCount === 0 ? "Documents you draft with FD AI appear here." : `${draftCount} document${draftCount === 1 ? "" : "s"} in your workspace.`}</p>
                  </div>
                  <Link className="btn primary" href="/draft">New document</Link>
                </div>
                <div className="doc-list">
                  {drafts.length === 0 && <p className="field-note" style={{ margin: 0 }}>Nothing yet. Start your first draft and it will be listed here.</p>}
                  {drafts.map((d) => (
                    <div className="doc-item" key={d.id}>
                      <div className="doc-icon">{d.status === "final" ? "FINAL" : "DRAFT"}</div>
                      <div>
                        <strong>{d.title}</strong>
                        <span>{d.type} · Updated {day(d.updatedAt)}</span>
                      </div>
                      <div className="doc-actions">
                        <Link className="mini-btn" href={`/draft/${d.id}`}>Open</Link>
                        <button
                          type="button"
                          className="mini-btn danger"
                          disabled={docBusy === d.id}
                          onClick={() => void removeDraft(d.id, d.title)}
                        >
                          {docBusy === d.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {draftCount > drafts.length && (
                    <Link className="mini-btn" href="/history" style={{ justifySelf: "start" }}>See all {draftCount} in past drafts</Link>
                  )}
                </div>
              </div>
              {deleted.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h2>Recently deleted</h2>
                      <p>Deleted documents wait 30 days before they are destroyed. Restore one here.</p>
                    </div>
                  </div>
                  <div className="doc-list">
                    {deleted.map((d) => (
                      <div className="doc-item" key={d.id}>
                        <div className="doc-icon muted">BIN</div>
                        <div>
                          <strong>{d.title}</strong>
                          <span>
                            {d.type} · deleted {day(d.deletedAt)} ·{" "}
                            {d.daysLeft === 0
                              ? "destroyed today"
                              : `${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} left`}
                          </span>
                        </div>
                        <div className="doc-actions">
                          <button
                            type="button"
                            className="mini-btn"
                            disabled={docBusy === d.id}
                            onClick={() => void restoreDraft(d.id)}
                          >
                            {docBusy === d.id ? "…" : "Restore"}
                          </button>
                          <button
                            type="button"
                            className="mini-btn danger"
                            disabled={docBusy === d.id}
                            onClick={() => void destroyDraft(d.id, d.title)}
                          >
                            Delete now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card">
                {/* Not a setting. Versions are kept for every document and
                    always have been — the reopened draft shows them — so a
                    switch here would offer to turn off something that is not
                    optional. It says what happens instead. */}
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Version history</strong>
                    <span>
                      Every version of every document is kept — the first draft and each revision
                      you ask for. Open a past draft to read or download any of them.
                    </span>
                  </div>
                  <span className="muted-badge">Always on</span>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Keep deleted documents for 30 days</strong>
                    <span>
                      Deleting puts a document in Recently deleted, where you can restore it. Turn
                      this off and deleting destroys it on the spot.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={retainDeleted}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setRetainDeleted(on);
                        void save(
                          { retain_deleted: on },
                          on ? "Deleted documents will be kept for 30 days" : "Deleting will destroy a document at once",
                        );
                      }}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </section>

            {/* ── PLAN & USAGE ────────────────────────────────────────── */}
            <section className={panel === "plan" ? "panel active" : "panel"} id="plan">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Plan &amp; Usage</h2>
                    <p>Manage your membership, credits and billing in one place.</p>
                  </div>
                  <span className="muted-badge">{billing.planLabel}</span>
                </div>
                <div className="plan-overview-grid">
                  <div className="plan-overview-block credits-block">
                    <div className="summary-label">Credits</div>
                    <div className="plan-credit-row">
                      <div className="plan-credit-number" aria-label={`${billing.credits ?? 0} credits available`}>{billing.credits ?? "—"}</div>
                      <div>
                        <div className="plan-block-title">Available credits</div>
                        <p className="plan-block-copy">Use credits for FD AI drafting and review.</p>
                      </div>
                    </div>
                  </div>
                  <div className={billing.cancelling ? "plan-overview-block is-cancelled" : "plan-overview-block"}>
                    <div className="summary-label">Current plan</div>
                    <div className="plan-top">
                      <div className="plan-name">{billing.planLabel}</div>
                      {billing.status && <div className="status"><i />{billing.status}</div>}
                    </div>
                    {billing.planPrice ? (
                      <div className="plan-price"><strong>{billing.planPrice}</strong> / month</div>
                    ) : (
                      <div className="plan-price"><strong>—</strong></div>
                    )}
                    {billing.renewsAt && (
                      <div className="plan-detail-row"><span>{billing.cancelling ? "Ends" : billing.planPrice ? "Renews" : "Expires"}</span><strong>{day(billing.renewsAt)}</strong></div>
                    )}
                    <div className="plan-actions">
                      <Link className="btn primary" href={billing.planPrice ? "/billing#topups" : "/billing"}>{billing.planPrice ? "Buy credits" : "Explore our plans"}</Link>
                      <Link className="btn" href="/billing">View pricing</Link>
                    </div>
                    {cancelPlan}
                  </div>
                  <div className="plan-overview-block">
                    <div className="summary-label">Billing</div>
                    <div className="billing-amount">{billing.planPrice ?? "—"}</div>
                    <div className="billing-caption">{billing.planPrice && billing.renewsAt && !billing.cancelling ? `Next payment · ${day(billing.renewsAt)}` : "No payment due"}</div>
                    {billing.card && <div className="plan-detail-row"><span>Payment method</span><strong>{billing.card}</strong></div>}
                    <div className="plan-actions">{updateCard}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Usage this month</h2>
                    <p>See how much of your current monthly allowance you have used.</p>
                  </div>
                </div>
                <div className="usage-layout">
                  <div className="usage-count"><strong>{billing.draftsThisMonth}</strong><span>draft{billing.draftsThisMonth === 1 ? "" : "s"} created</span></div>
                  <div className="usage-bar">
                    <div className="track"><span style={{ width: `${percent ?? 0}%` }} /></div>
                    <small>{billing.allowance ? `${billing.used} of ${billing.allowance} monthly credits used` : "Pay as you go — no monthly allowance"}</small>
                  </div>
                  <div className="usage-percent"><strong>{percent === null ? "—" : `${percent}%`}</strong><span>allowance used</span></div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Billing history</h2>
                    <p>View past payments, invoices and receipts.</p>
                  </div>
                  {updateCard}
                </div>
                <div className="billing-table">
                  {!first && <p className="field-note" style={{ margin: 0 }}>No payments yet. Your first invoice appears here once you subscribe or buy credits.</p>}
                  {first && <PaymentRowView p={first} />}
                </div>
                {older.length > 0 && (
                  <details className="history-dropdown">
                    <summary className="history-more-btn">
                      <span>View older invoices <span className="history-more-count">({older.length})</span></span>
                      <span aria-hidden="true" className="chevron"><svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 12 12"><path d="M2.5 4.25 6 7.5l3.5-3.25" /></svg></span>
                    </summary>
                    <div className="billing-history-more">
                      {older.map((p) => <PaymentRowView key={p.id} p={p} />)}
                    </div>
                  </details>
                )}
              </div>
            </section>

            {/* ── NOTIFICATIONS ───────────────────────────────────────── */}
            <section className={panel === "notifications" ? "panel active" : "panel"} id="notifications">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Notifications</h2>
                    <p>Choose which updates FoundersDoc should notify you about.</p>
                  </div>
                  <SoonButton feature="Notifications" className="muted-badge" />
                </div>
                {[
                  ["Draft completed", "When an FD AI document finishes generating."],
                  ["Document ready", "When a processed or reviewed document is available."],
                  ["Low-credit warning", "Notify me when my balance is running low."],
                  ["Credits reset", "Monthly allocation confirmation."],
                  ["Payment & renewal alerts", "Billing receipts, renewals and payment issues."],
                  ["Security alerts", "Important notices about unusual sign-ins or account issues."],
                ].map(([t, c]) => (
                  <div className="toggle-row" key={t}>
                    <div className="toggle-copy"><strong>{t}</strong><span>{c}</span></div>
                    <SoonSwitch feature={`Notifications — ${t}`} />
                  </div>
                ))}
              </div>
            </section>

            {/* ── SECURITY & PRIVACY ──────────────────────────────────── */}
            <section className={panel === "security" ? "panel active" : "panel"} id="security">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Security</h2>
                    <p>Keep access to your account protected and easy to manage.</p>
                  </div>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy"><strong>Password</strong><span>Change the password you sign in with.</span></div>
                  <button className="btn" type="button" onClick={() => { open("account"); setShowPassword(true); }}>Change password</button>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy"><strong>Two-factor authentication</strong><span>Add an extra verification step when signing in.</span></div>
                  <SoonButton feature="Two-factor authentication" className="btn primary" />
                </div>
                {/* A list of devices is not something the sign-in service will
                    tell us, so this says the one thing it will: when this
                    account was last used. Ending every session is the row
                    below, and that has always worked. */}
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Last sign-in</strong>
                    <span>
                      {lastSignInAt
                        ? `${new Date(lastSignInAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}. If that was not you, change your password and log out everywhere.`
                        : "No sign-in recorded yet."}
                    </span>
                  </div>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy"><strong>Log out all devices</strong><span>End every signed-in session, including this one, and sign in again.</span></div>
                  <button className="btn" type="button" disabled={signingOut} onClick={() => void signOutEverywhere()}>{signingOut ? "Signing out…" : "Log out all"}</button>
                </div>
              </div>
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Privacy</h2>
                    <p>Control how your uploaded information is used within FoundersDoc.</p>
                  </div>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Use uploaded information to provide FD AI features</strong>
                    <span>Required for FD AI to review or draft from the information you submit. Your answers and uploads are used only to produce your document.</span>
                  </div>
                  <label className="switch"><input type="checkbox" checked readOnly disabled /><span className="slider" /></label>
                </div>
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Let FoundersDoc learn from my documents</strong>
                    <span>
                      Your documents are not used to train or improve any model, and this switch is
                      off. It records your answer for if that ever changes — nothing happens either
                      way today.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={improveProduct}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setImproveProduct(on);
                        void save(
                          { improve_product: on },
                          on ? "Noted — you have opted in" : "Noted — your documents stay yours alone",
                        );
                      }}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </section>

            {/* ── HELP & SUPPORT ──────────────────────────────────────── */}
            <section className={panel === "support" ? "panel active" : "panel"} id="support">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Help &amp; Support</h2>
                    <p>Quick routes to the help you need, without making the page feel overwhelming.</p>
                  </div>
                </div>
                <div className="support-grid">
                  <div className="support-card">
                    <div className="emoji"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5.5h14v10H9l-4 3v-13Z" /><path d="M8.5 9h7M8.5 12h4.5" /></svg></div>
                    <strong>Contact support</strong>
                    <p>Get help with your account, documents or billing.</p>
                    <a className="btn" href="/contact">Contact support</a>
                  </div>
                  <div className="support-card">
                    <div className="emoji"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4.5 20 19H4L12 4.5Z" /><path d="M12 9v4.5M12 16.5h.01" /></svg></div>
                    <strong>Report a problem</strong>
                    <p>Let us know if something isn’t working correctly.</p>
                    <a className="btn" href={`mailto:administrator@foundersdoc.com?subject=${encodeURIComponent("FD AI — a problem")}`}>Report a bug</a>
                  </div>
                  <div className="support-card">
                    <div className="emoji"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11a2.5 2.5 0 0 0-2.5-2.5H5z" /><path d="M19 5.5h-5A2.5 2.5 0 0 0 11.5 8v11a2.5 2.5 0 0 1 2.5-2.5h5z" /></svg></div>
                    <strong>FAQs &amp; guides</strong>
                    <p>Read help articles about FD AI, credits and account settings.</p>
                    <SoonButton feature="Help centre" />
                  </div>
                </div>
                <div className="prefill" style={{ marginTop: 16 }}>
                  <div>
                    <strong>Need more than FD AI?</strong>
                    <p>Reach out to FoundersDoc if you need extra support beyond self-service drafting.</p>
                  </div>
                  <a className="btn primary" href="/contact">Contact FoundersDoc</a>
                </div>
              </div>
            </section>

            {/* ── LEGAL ───────────────────────────────────────────────── */}
            <section className={panel === "legal" ? "panel active" : "panel"} id="legal">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Legal</h2>
                    <p>Important policies and service terms governing your use of FoundersDoc and FD AI.</p>
                  </div>
                </div>
                <div className="legal-links">
                  <a
                    className="legal-item"
                    href="https://foundersdoc.com/terms-of-service"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>FD Consult: Platform Terms of Service</span>
                    <span>↗</span>
                  </a>
                  <a className="legal-item updating" href={soonHref("Terms and conditions")}><span>Terms &amp; conditions</span><span className="muted-badge">Coming soon</span></a>
                  <a className="legal-item updating" href={soonHref("Privacy policy")}><span>Privacy Policy</span><span className="muted-badge">Coming soon</span></a>
                  <a className="legal-item updating" href={soonHref("AI and legal disclaimer")}><span>AI / legal disclaimer</span><span className="muted-badge">Coming soon</span></a>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>

      <div className={toast ? "toast show" : "toast"} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}

function PaymentRowView({ p }: { p: BillingView["payments"][number] }) {
  const label =
    p.status === "paid" ? "Paid"
    : p.status === "refunded" ? "Refunded"
    : p.status === "part_refunded" ? `Refunded ${p.refunded ?? ""}`.trim()
    : p.status === "failed" ? "Failed"
    : "Pending";
  return (
    <div className="billing-row">
      <div className="history-date"><strong>{day(p.at)}</strong><span>{p.description}</span></div>
      <div className="history-amount"><strong>{p.amount}</strong></div>
      <div><span className={p.status === "paid" ? "paid-pill" : "paid-pill muted"}>{label}</span></div>
      <div className="history-actions">
        <a className="history-btn" href={p.url ?? "#"} target="_blank" rel="noreferrer">
          <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>View
        </a>
      </div>
    </div>
  );
}
