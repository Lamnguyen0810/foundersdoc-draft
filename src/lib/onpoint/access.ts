import "server-only";
import { isAdminClientConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/sign/notify";
import { isMember } from "./server";

/**
 * Signing in to OnPoint Workflows (0267): type your email, get a 6-digit code at that address, type it.
 * Only for an address on OnPoint's member list (onpoint_members). Logins belong to this product: an OnPoint
 * member who is not on the list of another product cannot open it, and vice versa.
 */

const lastSent = new Map<string, number>();
const tries = new Map<string, number>();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const clean = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const okEmail = (e: string) => EMAIL.test(e) && e.length <= 200;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function codeEmail(code: string) {
  const subject = `OnPoint Workflows: Your Sign-in Code ${code}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px 8px;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#161616;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ebebe8;">
<tr><td style="padding:28px 32px 0 32px;"><p style="margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a86;">OnPoint Workflows · powered by FD AI</p>
<p style="margin:12px 0 0 0;font-size:24px;font-weight:bold;">Your sign-in code</p>
<p style="margin:10px 0 0 0;font-size:15px;line-height:23px;color:#666;">Type this code on the sign-in page to open OnPoint Workflows:</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;"><p style="margin:0;display:inline-block;padding:14px 22px;background:#f4f4f2;border-radius:10px;font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:8px;">${esc(code)}</p></td></tr>
<tr><td style="padding:16px 32px 28px 32px;font-size:13px;line-height:20px;color:#666;"><p style="margin:0;">It works once, for 60 minutes. Didn't ask for it? You can ignore this email. Never share the code with anyone.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text: `Your OnPoint Workflows sign-in code: ${code}\n\nIt works once, for 60 minutes. Never share it with anyone.` };
}

export async function sendCode(email: string): Promise<"sent" | "not_member" | "too_soon" | "failed"> {
  if (!isAdminClientConfigured()) return "failed";
  if (!(await isMember(email))) return "not_member";
  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < 30_000) return "too_soon";
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) return "failed";
  lastSent.set(email, now);
  tries.delete(email);
  const m = codeEmail(code);
  const ok = await sendEmail({ kind: "onpoint_code", to: email, name: "", subject: m.subject, html: m.html, text: m.text, link: "", cc: [] });
  if (!ok) lastSent.delete(email);
  return ok ? "sent" : "failed";
}

export function countTry(email: string): boolean {
  const n = (tries.get(email) ?? 0) + 1;
  tries.set(email, n);
  return n <= 5;
}
export const clearTries = (email: string) => void tries.delete(email);
