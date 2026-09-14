import { NextRequest } from "next/server";
import { generateDraftStream } from "@/lib/ai/provider";
import {
  ModelNotFoundError,
  OverloadedError,
  ProviderNotConfiguredError,
  RateLimitedError,
} from "@/lib/ai/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { currentBalance, refundCredit, reserveCredit } from "@/lib/billing/credits";

/**
 * Revising a draft that already exists.
 *
 * ── HOW THIS DIFFERS FROM /api/generate ─────────────────────────────────────
 * Generate builds a document from a form. This one is given a finished document
 * and an instruction — "make it more concise", "flag anything unconfirmed" —
 * and must return the WHOLE document again, revised. Returning a diff or a
 * commentary would be easier for the model and useless to the caller: the page
 * replaces the document with what comes back.
 *
 * ── CHARGING ───────────────────────────────────────────────────────────────
 * The first few revisions of a draft are free, because the first draft is
 * rarely right and charging for the correction is how a product feels petty.
 * After that a revision costs a credit like any other model call. The allowance
 * is a row in billing_config, so the firm can make revisions free for ever
 * without a deploy.
 */
export const runtime = "nodejs";
// Matches /api/generate: the platform clamps anything higher and then kills
// the function, which would refund nothing. See the note there.
export const maxDuration = 60;
const BUDGET_MS = 50_000;

function line(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function friendly(err: unknown): string {
  if (
    err instanceof ProviderNotConfiguredError ||
    err instanceof RateLimitedError ||
    err instanceof ModelNotFoundError ||
    err instanceof OverloadedError
  ) {
    return err.message;
  }
  return "The drafting service returned an error while revising.";
}

const SYSTEM = `You are revising a legal document that you previously drafted for FoundersDoc, a Singapore law firm.

RULES
- Return the COMPLETE revised document, nothing else. No preamble, no explanation, no commentary, no markdown fences.
- Keep the existing structure, numbering and defined terms unless the instruction explicitly asks you to change them.
- Preserve every [[TO CONFIRM: ...]] placeholder exactly as it is, unless the instruction supplies the missing fact.
- Never invent a name, an amount, a date, a registration number or a statutory reference. If something is missing, leave or add a [[TO CONFIRM: ...]] placeholder.
- Do not give legal advice, opinions on merits, or an assessment of enforceability.
- British spelling. Formal but plain English.`;

export async function POST(req: NextRequest) {
  let body: { draftId?: string; instruction?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const instruction = (body.instruction ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!instruction) return Response.json({ error: "Say what to change." }, { status: 400 });
  if (!text) return Response.json({ error: "There is no draft to revise." }, { status: 400 });

  const user = isSupabaseConfigured() ? await getUser() : null;
  if (isSupabaseConfigured() && !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  /* ── does this one cost a credit? ─────────────────────────────────────── */
  let spendId: string | null = null;
  let charged = false;

  if (isSupabaseConfigured() && body.draftId) {
    const supabase = await createClient();
    const [{ data: draft }, { data: cfg }] = await Promise.all([
      supabase.from("drafts").select("revisions").eq("id", body.draftId).maybeSingle(),
      supabase.from("billing_config").select("free_revisions").maybeSingle(),
    ]);

    const used = Number(draft?.revisions ?? 0);
    const free = Number(cfg?.free_revisions ?? 3);

    if (used >= free) {
      spendId = await reserveCredit();
      if (!spendId) {
        return Response.json(
          {
            error: `You have had ${free} free revisions of this draft. Further changes use a credit, and you have none left.`,
            code: "no_credits",
          },
          { status: 402 },
        );
      }
      charged = true;
    }
  }

  const userMessage = [
    `INSTRUCTION FROM THE LAWYER:\n${instruction}`,
    "",
    "THE CURRENT DOCUMENT:",
    text,
  ].join("\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let acc = "";
      const startedAt = Date.now();
      try {
        for await (const event of generateDraftStream({ system: SYSTEM, user: userMessage })) {
          if (Date.now() - startedAt > BUDGET_MS) {
            if (spendId) await refundCredit(spendId, "timed out");
            controller.enqueue(
              line({
                t: "error",
                v: "That revision took longer than this plan allows and was stopped. Nothing was charged.",
                code: "timeout",
              }),
            );
            break;
          }
          if (event.type === "text") {
            acc += event.value;
            controller.enqueue(line({ t: "text", v: event.value }));
          } else if (event.type === "done") {
            // Persist the revision and count it.
            if (isSupabaseConfigured() && body.draftId && user) {
              try {
                const supabase = await createClient();
                const { data: row } = await supabase
                  .from("drafts")
                  .select("revisions")
                  .eq("id", body.draftId)
                  .maybeSingle();
                await supabase
                  .from("drafts")
                  .update({
                    output: acc,
                    // The lawyer's own edits are superseded by a revision they
                    // asked for, so the stored HTML is cleared rather than left
                    // to contradict the text beside it.
                    output_html: null,
                    revisions: Number(row?.revisions ?? 0) + 1,
                  })
                  .eq("id", body.draftId);
              } catch (err) {
                console.error("[/api/revise] could not save the revision:", err);
              }
            }
            controller.enqueue(
              line({ t: "done", charged, creditsLeft: await currentBalance() }),
            );
          } else {
            if (spendId) await refundCredit(spendId, "revision failed");
            controller.enqueue(line({ t: "error", v: event.message }));
          }
        }
      } catch (err) {
        console.error("[/api/revise]", err);
        if (spendId) await refundCredit(spendId, err instanceof Error ? err.name : "error");
        controller.enqueue(line({ t: "error", v: friendly(err) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
