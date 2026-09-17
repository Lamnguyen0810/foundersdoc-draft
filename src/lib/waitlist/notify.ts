import "server-only";

/**
 * Tell the firm's automation about a new waitlist signup.
 *
 * WAITLIST_WEBHOOK_URL is a Zapier "Catch Hook" address (or anything else
 * that accepts a JSON POST). When it is not set, nothing is sent and nothing
 * is logged — the site works exactly as before. When it is set, each NEW
 * signup is posted once, as one flat JSON object, so every field can be
 * picked in Zapier by name.
 *
 * Awaited with a ceiling, for the same reason the welcome email is: on Vercel
 * a function is frozen the moment it answers, so a request left running is a
 * request that never happened. Three seconds, then the form is confirmed
 * regardless — being on the list is what the person came for.
 */
export interface WaitlistSignup {
  email: string;
  name: string | null;
  company: string | null;
  note: string | null;
  source: string | null;
}

export async function notifyWaitlistWebhook(signup: WaitlistSignup): Promise<boolean> {
  const url = process.env.WAITLIST_WEBHOOK_URL?.trim();
  if (!url) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "waitlist_joined",
        email: signup.email,
        name: signup.name ?? "",
        company: signup.company ?? "",
        note: signup.note ?? "",
        source: signup.source ?? "",
        joined_at: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    if (!res.ok) console.warn(`[waitlist] webhook answered ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn("[waitlist] webhook not reached:", err instanceof Error ? err.message : err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
