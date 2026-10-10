/**
 * POST /api/employment/guide — the employment law overview for the places
 * answered so far (E1a, E1b, E1c). Signed-in only (the middleware keeps
 * /api/* from visitors, who see the built-in guide instead). Free, but
 * logged in usage_log as an "ask", and limited per person per hour.
 */

import { NextRequest } from "next/server";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { aiGuide } from "@/lib/employment/guide-ai";
import { builtInGuide } from "@/lib/employment/guide";

export const runtime = "nodejs";
export const maxDuration = 30;

const LIMIT = 12;
const WINDOW_MS = 60 * 60 * 1000;
const recent = new Map<string, number[]>();

function allowed(id: string): boolean {
  const now = Date.now();
  const list = (recent.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    recent.set(id, list);
    return false;
  }
  list.push(now);
  recent.set(id, list);
  return true;
}

const clip = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : "");

export async function POST(req: NextRequest) {
  const user = isSupabaseConfigured() ? await getUser() : null;
  if (isSupabaseConfigured() && !user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const answers = { E1a: clip(body.E1a), E1b: clip(body.E1b), E1c: clip(body.E1c) };
  if (!answers.E1a) return Response.json({ error: "Where the employer is based is needed first." }, { status: 400 });

  if (user && !allowed(user.id)) return Response.json({ guide: builtInGuide(answers) });

  const { guide, usage } = await aiGuide(answers);
  if (usage && user && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("usage_log").insert({
        user_id: user.id,
        draft_id: null,
        kind: "ask",
        provider: usage.provider,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: costUsd(priceFor(usage.model), usage.inputTokens, usage.outputTokens),
        paid_benchmark_usd: costUsd(PAID_BENCHMARK, usage.inputTokens, usage.outputTokens),
      });
      if (error) console.error("[/api/employment/guide] could not log usage:", error.message);
    } catch (err) {
      console.error("[/api/employment/guide] could not log usage:", err);
    }
  }
  return Response.json({ guide });
}
