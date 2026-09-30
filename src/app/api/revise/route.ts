import { NextRequest } from "next/server";
import { generateDraftStream } from "@/lib/ai/provider";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import {
  ModelNotFoundError,
  OverloadedError,
  ProviderNotConfiguredError,
  RateLimitedError,
} from "@/lib/ai/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { NDA_DECISIONS, lessonsBlock, playbookBlock } from "@/lib/prompt";
import {
  FAIR_USE_REACHED,
  attachDraft,
  currentBalance,
  refundCredit,
  reserveCredit,
} from "@/lib/billing/credits";

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
 * Every revision is a new version of the document, and every new version
 * costs one credit — a change of comprehensiveness level included. There used
 * to be a free allowance (billing_config.free_revisions, three per draft);
 * the firm decided a new version is a new draft and is paid for like one, so
 * that column is no longer read.
 *
 * The credit comes back whenever no new version is made: the model failed,
 * ran out of time, or could not reach the level asked for.
 */
export const runtime = "nodejs";

/**
 * How long this function may run. Identical reasoning to /api/generate, and
 * deliberately the identical number: two routes calling the same model on the
 * same plan must not disagree about the ceiling, or one of them is wrong.
 *
 * This said 120 with a 110-second watchdog, which is only safe if Fluid compute
 * is actually deployed. Without it the real ceiling is 60 seconds — so the
 * watchdog would never fire, the platform would kill the function, and the
 * credit reserved above would never be handed back.
 */
export const maxDuration = 300;

/**
 * Stop with enough time left to refund, explain and close cleanly. One setting
 * shared with /api/generate: raise GENERATE_BUDGET_MS in Vercel once Fluid
 * compute is on, and both routes move together.
 */
const BUDGET_MS = (() => {
  const raw = Number(process.env.GENERATE_BUDGET_MS);
  if (!Number.isFinite(raw) || raw < 5_000 || raw > 290_000) return 50_000;
  return Math.floor(raw);
})();

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

function isMaterialDepthRewrite(before: string, after: string): boolean {
  const words = (value: string) => value.replace(/\s+/g, " ").trim().split(" ");
  const a = words(before);
  const b = words(after);
  const lengthDelta = Math.abs(a.length - b.length) / Math.max(a.length, 1);
  const overlap = Math.min(a.length, b.length);
  let changedAtPosition = Math.abs(a.length - b.length);
  for (let index = 0; index < overlap; index += 1) {
    if (a[index] !== b[index]) changedAtPosition += 1;
  }
  return lengthDelta >= 0.03 || changedAtPosition / Math.max(a.length, b.length, 1) >= 0.06;
}

const SYSTEM = `You are revising a legal document that you previously drafted for FoundersDoc, a Singapore law firm.

RULES
- Return the COMPLETE revised document, nothing else. No preamble, no explanation, no commentary, no markdown fences.
- Keep the existing structure, numbering and defined terms unless the instruction explicitly asks you to change them.
- Preserve every [[TO CONFIRM: ...]] placeholder exactly as it is, unless the instruction supplies the missing fact.
- Never invent a name, an amount, a date, a registration number or a statutory reference. If something is missing, leave or add a [[TO CONFIRM: ...]] placeholder.
- Do not give legal advice, opinions on merits, or an assessment of enforceability.
- British spelling. Formal but plain English.
- Never add a non-solicitation or non-compete clause to an NDA, even if the instruction asks for one; leave it out.`;

export async function POST(req: NextRequest) {
  let body: {
    draftId?: string;
    instruction?: string;
    text?: string;
    targetDetailLevel?: number;
    currentDetailLevel?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const detailInstructions = {
    1: "Rewrite the entire NDA as a concise level 1 version of 500-800 words. Consolidate definitions and boilerplate while preserving every core confidentiality protection, standard exception and placeholder.",
    2: "Rewrite the entire NDA as a standard level 2 version of 750-1,050 words. Include the usual practical protections and procedures without unnecessary detail.",
    3: "Rewrite the entire NDA as a detailed level 3 version of 1,000-1,400 words. Use complete standard definitions, confidentiality procedures and general provisions.",
    4: "Rewrite the entire NDA as a thorough level 4 version of about 1,250-1,750 words. Expand relevant definitions, handling duties, representative controls, compelled-disclosure procedure, return or destruction mechanics, remedies and general provisions.",
    5: "Rewrite the entire NDA as a maximum-detail level 5 version of about 1,500-2,200 words. Draft the relevant protections and procedures comprehensively, while remaining proportionate and avoiding repetition.",
  } as const;
  const targetDetailLevel = Number.isInteger(body.targetDetailLevel) &&
    Number(body.targetDetailLevel) >= 1 && Number(body.targetDetailLevel) <= 5
      ? (Number(body.targetDetailLevel) as 1 | 2 | 3 | 4 | 5)
      : null;
  const currentDetailLevel = Number.isInteger(body.currentDetailLevel) &&
    Number(body.currentDetailLevel) >= 1 && Number(body.currentDetailLevel) <= 5
      ? Number(body.currentDetailLevel)
      : 3;
  const instruction = targetDetailLevel
    ? `${detailInstructions[targetDetailLevel]} This must be a genuine full-document rewrite, not light copy-editing. Do not invent facts, never add a non-compete or non-solicit, and do not add an indemnity or IP assignment unless already required by the current document.`
    : (body.instruction ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!instruction) return Response.json({ error: "Say what to change." }, { status: 400 });
  if (!text) return Response.json({ error: "There is no draft to revise." }, { status: 400 });

  const user = isSupabaseConfigured() ? await getUser() : null;
  if (isSupabaseConfigured() && !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  /* The rules the draft was written under, when 044 has been run. */
  let system = SYSTEM;

  /* ── one credit for every new version ─────────────────────────────────── */
  let spendId: string | null = null;
  let charged = false;

  if (isSupabaseConfigured()) {
    /* With accounts on, a revision is always of a saved draft of the
       person's own. Without the id there would be nothing to charge
       against, and no version to save. */
    if (!body.draftId) {
      return Response.json({ error: "This draft has not been saved yet, so it cannot be revised." }, { status: 400 });
    }
    const supabase = await createClient();
    /* RLS: only the person's own draft is found. */
    const { data: draft } = await supabase
      .from("drafts")
      .select("id,doc_types(slug)")
      .eq("id", body.draftId)
      .maybeSingle();
    if (!draft) return Response.json({ error: "That draft could not be found." }, { status: 404 });

    /* The firm's rules follow the document into its revisions: a rewrite
       to a different detail level must keep the same survival period, the
       same defined terms. Best effort — a revision is never refused for
       want of a playbook. */
    const dt = (draft as { doc_types?: { slug?: string } | { slug?: string }[] | null } | null)?.doc_types;
    const slug = Array.isArray(dt) ? dt[0]?.slug : dt?.slug;
    if (slug) {
      const [{ data: rules }, { data: learnt }] = await Promise.all([
        supabase.rpc("playbook_for", { p_slug: slug }),
        supabase.rpc("lessons_for", { p_slug: slug }),
      ]);
      const stub = {
        playbook: (rules ?? []) as { title: string; text: string }[],
        lessons: ((learnt ?? []) as { rule: string }[]).map((r) => r.rule),
      } as Parameters<typeof playbookBlock>[0];
      const blocks = [playbookBlock(stub), lessonsBlock(stub), slug === "nda" ? NDA_DECISIONS : null].filter(Boolean);
      if (blocks.length > 0) system = [SYSTEM, ...blocks].join("\n\n");
    }

    /* Taken HERE, before the model is asked, as in /api/generate — so two
       tabs cannot both revise on the last credit. */
    spendId = await reserveCredit();

    // Same as /api/generate: a member over fair use is not out of credits.
    if (spendId === FAIR_USE_REACHED) {
      return Response.json(
        {
          error:
            "You have reached this month's fair-use limit on the Unlimited plan. Nothing has " +
            "been charged — get in touch and we will raise it.",
          code: "fair_use",
        },
        { status: 429 },
      );
    }

    if (!spendId) {
      return Response.json(
        {
          error: "Each new version of a draft uses one credit, and you have none left.",
          code: "no_credits",
        },
        { status: 402 },
      );
    }
    charged = true;
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
      let firstChunkAt = 0;

      /* ── THE DEADLINE ──────────────────────────────────────────────────
         The watchdog below only runs between chunks, so it cannot see the
         phase before the first one: connecting, queuing, retrying a busy
         model, falling back to a lighter one. That phase has no natural
         limit, and when it overruns the platform kills the function — no
         refund, no message, and a revision the person paid for. */
      const deadline = new AbortController();
      const deadlineTimer = setTimeout(
        () => deadline.abort(new Error("revise_budget_exhausted")),
        BUDGET_MS,
      );

      /* ── HEARTBEAT ─────────────────────────────────────────────────────
         Say something every few seconds while there is nothing to say, so the
         browser can tell a slow revision from a dead connection. The client
         ignores the content and notes only that a line arrived. */
      let beat: ReturnType<typeof setInterval> | null = setInterval(() => {
        try {
          controller.enqueue(line({ t: "ping" }));
        } catch {
          // Already closed; nothing to keep alive.
        }
      }, 5_000);

      const stopBeating = () => {
        if (beat) {
          clearInterval(beat);
          beat = null;
        }
      };

      try {
        try {
        // A completed, materially rewritten document is preferable to throwing
        // it away and starting a second generation that can exceed Vercel's
        // request limit. Depth is directed by the prompt and checked below.
        const maxAttempts = 1;
        attempts: for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          acc = "";
          const attemptMessage = attempt === 1
            ? userMessage
            : `${userMessage}\n\nRETRY REQUIREMENT: The previous attempt did not materially reach the requested comprehensiveness level. Rewrite the complete document more decisively and stay within the requested word range.`;

        for await (const event of generateDraftStream({
          system,
          user: attemptMessage,
          signal: deadline.signal,
        })) {
          /* Secondary guard. The deadline above is the real one and fires
             first; this only matters if an abort were ever swallowed before
             reaching us. refund_credit ignores a second refund of the same
             spend, so the two paths cannot both give the credit back. */
          if (Date.now() - startedAt > BUDGET_MS) {
            if (spendId) await refundCredit(spendId, "timed out");
            controller.enqueue(
              line({
                t: "error",
                v:
                  "That revision was stopped before it finished, so the document you had is " +
                  "unchanged and nothing was charged. Try again in a moment.",
                code: "timeout",
              }),
            );
            return;
          }
          if (event.type === "text") {
            if (!firstChunkAt) {
              stopBeating();
              firstChunkAt = Date.now();
              console.info(`[/api/revise] first token after ${firstChunkAt - startedAt}ms`);
            }
            acc += event.value;
            controller.enqueue(line({ t: "text", v: event.value }));
          } else if (event.type === "done") {
            /* Every model call is logged, kept or not: the provider bills it
               either way, and the admin's "Model requests" and the /usage
               page read this table. Revisions were missing from it. */
            if (isSupabaseConfigured() && user) {
              try {
                const { provider, model, inputTokens, outputTokens } = event.usage;
                const supabase = await createClient();
                const { error: usageError } = await supabase.from("usage_log").insert({
                  user_id: user.id,
                  draft_id: body.draftId ?? null,
                  provider,
                  model,
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  cost_usd: costUsd(priceFor(model), inputTokens, outputTokens),
                  paid_benchmark_usd: costUsd(PAID_BENCHMARK, inputTokens, outputTokens),
                });
                if (usageError) console.error("[/api/revise] could not log usage:", usageError.message);
              } catch (err) {
                console.error("[/api/revise] could not log usage:", err);
              }
            }
            const wordCount = acc.trim().split(/\s+/).length;
            const currentWordCount = text.trim().split(/\s+/).length;
            const levelDifference = targetDetailLevel
              ? targetDetailLevel - currentDetailLevel
              : 0;
            // Only reject output that moves in the opposite direction. The
            // model's clause choices, not a rigid word quota, determine whether
            // a legally sensible NDA is Standard, Detailed, Thorough or Maximum.
            const reachesLevel = levelDifference > 0
              ? wordCount >= currentWordCount * 1.02
              : levelDifference < 0
                ? wordCount <= currentWordCount * 0.98
                : true;
            if (targetDetailLevel && (!isMaterialDepthRewrite(text, acc) || !reachesLevel)) {
              if (attempt < maxAttempts) {
                controller.enqueue(line({ t: "retry" }));
                continue attempts;
              }
              if (spendId) await refundCredit(spendId, "revision unchanged");
              controller.enqueue(
                line({
                  t: "error",
                  code: "revision_validation_failed",
                  v: "The model could not produce a sufficiently different document at that level. The original version was kept and nothing was charged.",
                }),
              );
              return;
            }
            /* A request that changed nothing is not a new version, so it is
               not paid for. */
            if (!targetDetailLevel && acc.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim()) {
              if (spendId) await refundCredit(spendId, "revision unchanged");
              controller.enqueue(
                line({
                  t: "error",
                  code: "revision_unchanged",
                  v: "That request did not change the document, so no new version was made and nothing was charged.",
                }),
              );
              return;
            }
            // Persist the revision and count it.
            if (isSupabaseConfigured() && body.draftId && user) {
              try {
                const supabase = await createClient();
                const { data: row } = await supabase
                  .from("drafts")
                  .select("revisions,answers")
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

                const nextVersion = Number(row?.revisions ?? 0) + 2;
                const answers = (row?.answers ?? {}) as Record<string, string>;
                const clean = (value: string | undefined) =>
                  (value ?? "").split("(")[0].replace(/[^a-zA-Z0-9 -]/g, "").trim()
                    .replace(/\s+/g, "-").slice(0, 28);
                const parties = [clean(answers.party_a), clean(answers.party_b)].filter(Boolean);
                const detailLevel = targetDetailLevel ?? currentDetailLevel;
                const detailName = ["Concise", "Standard", "Detailed", "Thorough", "Maximum"]
                  [detailLevel - 1] ?? "Revised";
                const fileName = ["NDA", ...parties, `V${nextVersion}`, detailName]
                  .join("-") + ".docx";
                const { error: versionError } = await supabase.from("draft_versions").insert({
                  draft_id: body.draftId,
                  user_id: user.id,
                  version_number: nextVersion,
                  detail_level: detailLevel,
                  file_name: fileName,
                  instruction,
                  output: acc,
                });
                if (versionError) {
                  console.error("[/api/revise] could not save version:", versionError.message);
                }
                /* The credit bought this version: tie it to the draft, as
                   /api/generate does, which also closes the refund path. */
                if (spendId) await attachDraft(spendId, body.draftId);
              } catch (err) {
                console.error("[/api/revise] could not save the revision:", err);
              }
            }
            controller.enqueue(
              line({ t: "done", charged, creditsLeft: await currentBalance() }),
            );
            return;
          } else {
            if (spendId) await refundCredit(spendId, "revision failed");
            controller.enqueue(line({ t: "error", v: event.message }));
            return;
          }
        }
        }
        } catch (err) {
          /* Absorb ONLY our own deadline. Every other failure is a real error
             and belongs to the outer catch, which reports it honestly. */
          if (!deadline.signal.aborted) throw err;

          const seconds = Math.round((Date.now() - startedAt) / 1000);
          const waited = firstChunkAt
            ? `${firstChunkAt - startedAt}ms waiting, then ${Date.now() - firstChunkAt}ms generating`
            : "never received a first token — all of it was spent waiting on the model";
          console.warn(`[/api/revise] stopped at ${seconds}s (${waited}). Credit refunded.`);

          if (spendId) await refundCredit(spendId, "timed out");
          controller.enqueue(
            line({
              t: "error",
              v:
                "That revision was stopped before it finished, so the document you had is " +
                "unchanged and nothing was charged. Try again in a moment.",
              code: "timeout",
            }),
          );
        }
      } catch (err) {
        console.error("[/api/revise]", err);
        if (spendId) await refundCredit(spendId, err instanceof Error ? err.name : "error");
        controller.enqueue(line({ t: "error", v: friendly(err) }));
      } finally {
        stopBeating();
        clearTimeout(deadlineTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
