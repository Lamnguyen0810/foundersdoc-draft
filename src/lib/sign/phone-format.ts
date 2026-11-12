/**
 * Phone numbers for signing codes (0222). Pure: the send page (browser) and the server share it.
 * Numbers are kept as E.164: "+" and 8 to 15 digits. A Singapore number may be typed without
 * "+65" (8 digits starting 3, 6, 8 or 9).
 */
export type CodeChannel = "email" | "whatsapp" | "sms";
export const PHONE_CHANNELS: CodeChannel[] = ["whatsapp", "sms"];
export const CHANNEL_TEXT: Record<CodeChannel, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };

export function normalisePhone(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[\s().-]/g, "");
  if (/^[3689]\d{7}$/.test(digits)) return `+65${digits}`;
  const plus = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  return /^\+[1-9]\d{7,14}$/.test(plus) ? plus : null;
}

/** +65 ****4567 */
export function maskPhone(e164: string): string {
  const cc = /^\+(1|7|[2-9]\d)/.exec(e164)?.[0] ?? e164.slice(0, 3);
  return `${cc} ****${e164.slice(-4)}`;
}
