import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { CHANNEL_TEXT, type CodeChannel } from "./phone-format";

/**
 * Signing codes by WhatsApp or SMS (0222), switchable without a code change:
 *
 *   WhatsApp (Meta Cloud API)   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 *                               WHATSAPP_OTP_TEMPLATE (an approved *authentication* template with a
 *                               "copy code" button; default "fd_sign_code"), WHATSAPP_OTP_LANG (default "en")
 *   SMS (Twilio)                TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a number or a
 *                               registered sender name) or TWILIO_MESSAGING_SERVICE_SID
 *   FD_SIGN_PHONE_CHANNELS      optional: which of them senders may choose, e.g. "whatsapp" or
 *                               "whatsapp,sms"; empty = every channel that is set up; "off" = none
 *
 * A channel that isn't set up is simply not offered. Email always works and is the fallback:
 * if a WhatsApp or SMS code can't be sent, the code goes by email instead (lib/sign/code.ts).
 */
const set = (...k: string[]) => k.every((x) => (process.env[x] ?? "").trim());

export function phoneChannels(): CodeChannel[] {
  /* local preview only: SIGN_PHONE_PREVIEW=1 offers both (the code is shown on the page, nothing is sent) */
  if (!isSupabaseConfigured() && process.env.SIGN_PHONE_PREVIEW === "1") return ["whatsapp", "sms"];
  const ready: CodeChannel[] = [];
  if (set("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID")) ready.push("whatsapp");
  if (set("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN") && (set("TWILIO_FROM") || set("TWILIO_MESSAGING_SERVICE_SID"))) ready.push("sms");
  const only = (process.env.FD_SIGN_PHONE_CHANNELS ?? "").trim().toLowerCase();
  if (only === "off") return [];
  if (!only) return ready;
  const allow = only.split(",").map((x) => x.trim());
  return ready.filter((c) => allow.includes(c));
}

/** Send a 6-digit code to a phone. true = the provider accepted it. Never logs the code. */
export async function sendPhoneCode(channel: CodeChannel, to: string, code: string): Promise<boolean> {
  if (!phoneChannels().includes(channel)) return false;
  try {
    if (channel === "whatsapp") {
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!.trim())}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: process.env.WHATSAPP_OTP_TEMPLATE?.trim() || "fd_sign_code",
            language: { code: process.env.WHATSAPP_OTP_LANG?.trim() || "en" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) console.error("[sign] WhatsApp code not sent:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return res.ok;
    }
    if (channel === "sms") {
      const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
      const form = new URLSearchParams({ To: to, Body: `${code} is your FD Sign code. It works for 10 minutes. Don't share it with anyone.` });
      const svc = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      if (svc) form.set("MessagingServiceSid", svc);
      else form.set("From", process.env.TWILIO_FROM!.trim());
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN!.trim()}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) console.error("[sign] SMS code not sent:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return res.ok;
    }
  } catch (e) {
    console.error(`[sign] ${CHANNEL_TEXT[channel]} code hand-over failed:`, e);
  }
  return false;
}
