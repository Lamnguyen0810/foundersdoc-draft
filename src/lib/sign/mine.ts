import "server-only";
import { isExpired, LINK_DAYS } from "./service";
import type { OwnedEnvelope, SignEvent, Signer, SignStore } from "./store";

/**
 * FD Sign for everyone: what "My documents" shows. Plain data for the pages
 * (no tokens, no signature images). Everything here is the owner's own rows.
 */

export type DocStatus = "waiting_me" | "waiting" | "completed" | "cancelled" | "expired";

export interface DocRow {
  id: string;
  title: string;
  status: DocStatus;
  folderId: string | null;
  pages: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  signed: number;
  total: number;
  waitingFor: string | null;
  last: { text: string; at: string };
  signers: Array<{ id: string; name: string; email: string; position: number; status: Signer["status"]; signedAt: string | null; viewedAt: string | null; invitedAt: string | null; me: boolean }>;
}

export function docRow(e: OwnedEnvelope, myEmail: string): DocRow {
  const signers = [...e.signers].sort((a, b) => a.position - b.position);
  const signed = signers.filter((s) => s.status === "signed").length;
  const now = signers.find((s) => s.status === "invited") ?? null;
  const expired = e.status === "sent" && !!now && isExpired(now);
  const status: DocStatus =
    e.status === "completed" ? "completed" : e.status === "voided" ? "cancelled" : expired ? "expired" : now && now.email.toLowerCase() === myEmail ? "waiting_me" : "waiting";
  const expiresAt = e.status === "sent" && now?.invited_at ? new Date(Date.parse(now.invited_at) + LINK_DAYS * 86_400_000).toISOString() : null;
  /* the latest thing that happened, in plain words */
  const acts: Array<{ text: string; at: string }> = [{ text: "Sent", at: e.created_at }];
  for (const s of signers) {
    if (s.viewed_at) acts.push({ text: `${s.name} opened it`, at: s.viewed_at });
    if (s.signed_at) acts.push({ text: `${s.name} signed`, at: s.signed_at });
  }
  if (e.completed_at) acts.push({ text: "Everyone signed", at: e.completed_at });
  const last = acts.sort((a, b) => b.at.localeCompare(a.at))[0];
  return {
    id: e.id,
    title: e.title,
    status,
    folderId: e.folder_id,
    pages: e.page_count,
    createdAt: e.created_at,
    completedAt: e.completed_at,
    expiresAt,
    signed,
    total: signers.length,
    waitingFor: e.status === "sent" && now ? now.name : null,
    last: e.status === "voided" ? { text: "Cancelled", at: last.at } : last,
    signers: signers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      position: s.position,
      status: s.status,
      signedAt: s.signed_at,
      viewedAt: s.viewed_at,
      invitedAt: s.invited_at,
      me: s.email.toLowerCase() === myEmail,
    })),
  };
}

const EVENT_TEXT: Record<string, string> = {
  created: "Request created",
  invited: "Signing email sent",
  reminded: "Reminder sent",
  link: "New signing link issued",
  viewed: "Opened the document",
  code_sent: "Email code sent",
  code_verified: "Confirmed the email code",
  signed: "Signed",
  completed: "Everyone signed",
  copy_sent: "Signed copy sent",
  voided: "Cancelled",
};

export interface DocEvent {
  at: string;
  text: string;
  who: string | null;
  ip: string | null;
}

/** The activity list for the detail page (newest first). */
export async function docEvents(store: SignStore, envelopeId: string, signers: Signer[]): Promise<DocEvent[]> {
  const ev: SignEvent[] = await store.events(envelopeId);
  return ev
    .filter((e) => EVENT_TEXT[e.event])
    .map((e) => {
      const s = e.signer_id ? signers.find((x) => x.id === e.signer_id) : null;
      return { at: e.at, text: EVENT_TEXT[e.event], who: s ? s.name : e.event === "copy_sent" ? e.detail : null, ip: e.ip ? maskIp(e.ip) : null };
    })
    .reverse();
}

/** 203.0.113.45 -> 203.0.113.• (the full IP stays in the audit trail PDF) */
export function maskIp(ip: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, ".•");
  return ip.split(":").slice(0, 3).join(":") + ":•";
}
