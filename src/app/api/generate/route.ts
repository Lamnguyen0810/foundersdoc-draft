/**
 * The drafting engine.
 *
 * Assembles system prompt + form answers, calls the provider adapter, streams
 * the result back as newline-delimited JSON, and records the draft and its
 * token cost. The API key is read here, on the server, and never reaches the
 * browser.
 */

import { NextRequest } from "next/server";
import { loadDocType } from "@/lib/doctypes.server";
import {
  SKIPPED,
  buildSystem,
  buildUser,
  missingRequired,
  skippedFields,
  type Answers,
} from "@/lib/prompt";
import { generateDraftStream } from "@/lib/ai/provider";
import {
  ModelNotFoundError,
  OverloadedError,
  ProviderNotConfiguredError,
  RateLimitedError,
} from "@/lib/ai/types";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  attachDraft,
  currentBalance,
  refundCredit,
  reserveCredit,
} from "@/lib/billing/credits";

export const runtime = "nodejs";

/**
 * How long this function may run.
 *
 * Vercel clamps this to whatever the plan and compute model allow, then KILLS
 * the function. A killed function runs none of its own cleanup, so the credit
 * reserved at the top is never given back: the person sees "Request failed
 * (504)" and is one document poorer.
 *
 * The ceiling is NOT a fixed property of the plan. With Fluid compute enabled,
 * Hobby allows 300 seconds. Without it — the case for any project created
 * before Fluid became the default — the old 60-second serverless cap applies,
 * which is what the logs showed. So declare the high number and let the
 * platform clamp it; the watchdog below is what actually keeps us honest.
 */
export const maxDuration = 300;

/**
 * Stop generating with enough time left to refund, explain and close cleanly.
 *
 * This MUST stay below whatever ceiling the platform is really enforcing, so
 * it is a setting rather than a constant: leave it alone while the function is
 * capped at 60 seconds, and raise it to 280000 once Fluid compute is on. No
 * redeploy of code needed — set GENERATE_BUDGET_MS in the Vercel dashboard.
 */
const BUDGET_MS = (() => {
  const raw = Number(process.env.GENERATE_BUDGET_MS);
  // Anything absent, non-numeric, negative or absurd falls back to the value
  // that is safe on the smallest ceiling, rather than trusting a typo.
  if (!Number.isFinite(raw) || raw < 5_000 || raw > 290_000) return 50_000;
  return Math.floor(raw);
})();

type Body = { docTypeSlug?: string; answers?: Answers; sourceText?: string };

function line(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function friendly(err: unknown): string {
  if (err instanceof ProviderNotConfiguredError) return err.message;
  if (err instanceof RateLimitedError) return err.message;
  if (err instanceof ModelNotFoundError) return err.message;
  if (err instanceof OverloadedError) return err.message;
  if (err instanceof Error) {
    return `The drafting service returned an error. Details are in the server logs. (${err.name})`;
  }
  return "An unexpected error occurred while drafting.";
}

/** Short human label for the history list, so a draft is findable later. */
function titleFor(answers: Answers): string {
  const clean = (v: string | undefined) =>
    (v ?? "") === SKIPPED ? "" : (v ?? "").split("(")[0].trim();
  const a = clean(answers.party_a);
  const b = clean(answers.party_b);
  if (a && b) return `${a} / ${b}`;
  return a || b || "Untitled draft";
}

function versionFileName(answers: Answers, version: number, detailLevel: number): string {
  const clean = (value: string | undefined) =>
    ((value ?? "") === SKIPPED ? "" : (value ?? "").split("(")[0])
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 28);
  const parties = [clean(answers.party_a), clean(answers.party_b)].filter(Boolean);
  const detailName = ["Concise", "Standard", "Detailed", "Thorough", "Maximum"]
    [detailLevel - 1] ?? "Revised";
  return ["NDA", ...parties, `V${version}`, ...(version > 1 ? [detailName] : [])]
    .join("-") + ".docx";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  // Identity is established server-side. The middleware already blocks anonymous
  // requests when Supabase is configured; this is the second lock on the door.
  const user = isSupabaseConfigured() ? await getUser() : null;
  if (isSupabaseConfigured() && !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  const docType = await loadDocType(body.docTypeSlug ?? "");
  if (!docType) {
    return Response.json({ error: "Unknown document type." }, { status: 400 });
  }

  const answers = body.answers ?? {};

  // A required question the user deliberately SKIPPED is not a missing answer — it is an
  // answer of "not now", and the prompt turns it into a [[TO CONFIRM]]. Only questions
  // never put to the user at all can block a draft, and "Draft with what I have" marks
  // every remaining question as skipped before it gets here, so in practice this fires
  // only on a malformed request.
  const missing = missingRequired(docType, answers);
  if (missing.length > 0) {
    return Response.json(
      { error: `Please complete: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }
  const skipped = skippedFields(docType, answers);

  /* ── pay before you draft ─────────────────────────────────────────────────
     The credit is taken HERE, before a single token is bought from the model.
     Checking a balance and deducting afterwards would let someone open ten
     tabs and turn one credit into ten documents, because all ten would read
     the same balance before any of them wrote.

     The price of reserving first is that a failed draft has already been paid
     for — so every exit path below hands it back. */
  const spendId = await reserveCredit();
  if (!spendId) {
    return Response.json(
      {
        error:
          "You have no drafting credits left. Your free week covers a few documents; " +
          "after that, add credits to carry on. Past drafts stay available to read and download.",
        code: "no_credits",
      },
      { status: 402 }, // Payment Required — the client shows the paywall on this
    );
  }

  const system = buildSystem(docType);
  const user_message = buildUser(docType, answers, body.sourceText);

  const startedGenerating = Date.now();
  let timedOut = false;
  let firstChunkAt = 0;

  /* ── THE DEADLINE ──────────────────────────────────────────────────────
     The watchdog further down can only run between chunks, so it is blind to
     everything that happens BEFORE the first chunk: connecting, queuing,
     retrying a busy model, falling back to a second one. That phase has no
     natural limit, and when it overruns, the platform kills the function
     outright — no refund, no message, just a 504 and a credit gone.

     So the budget is enforced from out here as well, where it covers the whole
     request rather than only the streaming part of it. */
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    deadline.abort(new Error("generate_budget_exhausted"));
  }, BUDGET_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";

      /* ── HEARTBEAT ────────────────────────────────────────────────────
         Between the request arriving and the first token this function can be
         busy for a long time — queuing behind a busy model, retrying, falling
         back — and it sends nothing at all while it does. To the browser that
         is indistinguishable from a dead connection, so the page spins on
         "Working" with no way out; and an idle HTTP/1.1 connection can be
         dropped by something in the middle regardless.

         So say something every few seconds. The client ignores the content and
         only notes that a line arrived, which is enough to tell a slow draft
         apart from a lost one. */
      let beat: ReturnType<typeof setInterval> | null = setInterval(() => {
        try {
          controller.enqueue(line({ t: "ping" }));
        } catch {
          // Already closed; nothing left to keep alive.
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
          for await (const event of generateDraftStream({
            system,
            user: user_message,
            signal: deadline.signal,
          })) {
            /* The watchdog. Checked between chunks rather than on a timer, so it
             can never fire while a chunk is half-written. */
            if (Date.now() - startedGenerating > BUDGET_MS) {
              timedOut = true;
              break;
            }
            if (event.type === "text") {
              if (!firstChunkAt) {
                stopBeating();
                firstChunkAt = Date.now();
                console.info(
                  `[/api/generate] first token after ${firstChunkAt - startedGenerating}ms`,
                );
              }
              accumulated += event.value;
              controller.enqueue(line({ t: "text", v: event.value }));
            } else if (event.type === "done") {
              const { provider, model, inputTokens, outputTokens } =
                event.usage;
              const actual = costUsd(
                priceFor(model),
                inputTokens,
                outputTokens,
              );
              const benchmark = costUsd(
                PAID_BENCHMARK,
                inputTokens,
                outputTokens,
              );

              let draftId: string | null = null;
              if (user) {
                draftId = await persist({
                  userId: user.id,
                  slug: docType.slug,
                  title: titleFor(answers),
                  answers,
                  sourceText: body.sourceText ?? null,
                  output: accumulated,
                  provider,
                  model,
                  inputTokens,
                  outputTokens,
                  costUsd: actual,
                  paidBenchmarkUsd: benchmark,
                });
              }

              /* The credit is now spent for good: it bought this document. Tying
               it to the draft also closes the refund path, so nobody can claim
               a refund for a draft they are holding. */
              if (draftId) await attachDraft(spendId, draftId);

              /* Send the new balance back with the draft. Without this the number
               in the rail is whatever the server rendered when the page was
               first opened — so a credit is spent, the database is correct, and
               the screen still says the old figure until a reload. Someone
               watching that concludes the deduction is broken; the far worse
               version is that they conclude it charged them twice. */
              const creditsLeft = await currentBalance();

              controller.enqueue(
                line({
                  t: "done",
                  creditsLeft,
                  provider,
                  model,
                  inputTokens,
                  outputTokens,
                  skipped,
                  costUsd: actual,
                  paidBenchmarkUsd: benchmark,
                  draftId,
                  saved: Boolean(draftId),
                }),
              );
            } else {
              await refundCredit(
                spendId,
                `provider: ${event.message}`.slice(0, 120),
              );
              controller.enqueue(line({ t: "error", v: event.message }));
            }
          }
        } catch (err) {
          /* Absorb ONLY our own deadline; every other failure is a real error
             and belongs to the outer catch, which reports it honestly. */
          if (!deadline.signal.aborted) throw err;
        }

        if (timedOut) {
          const seconds = Math.round((Date.now() - startedGenerating) / 1000);
          await refundCredit(spendId, "timed out");
          const waited = firstChunkAt
            ? `${firstChunkAt - startedGenerating}ms waiting, then ${Date.now() - firstChunkAt}ms generating`
            : "never received a first token — all of it was spent waiting on the model";
          console.warn(
            `[/api/generate] stopped at ${seconds}s with ${accumulated.length} chars ` +
              `(${waited}). Credit refunded.`,
          );

          /* ── KEEP WHAT WE HAVE ────────────────────────────────────────────
             By 50 seconds most of the document is usually written. Throwing it
             away because the last clause did not arrive is a waste of the
             model call AND of the person's time — they get nothing, having
             waited a minute.

             So a substantial partial draft is delivered, with the truncation
             stated in the document itself, not just in a toast that scrolls
             away. It is NOT saved as a finished draft and NOT charged for: it
             is something to read, not something to send. */
          const USABLE = 1200; // shorter than this is a fragment, not a draft
          if (accumulated.length >= USABLE) {
            controller.enqueue(
              line({
                t: "text",
                v:
                  "\n\n[[INCOMPLETE: generation was stopped after " +
                  seconds +
                  " seconds and this document is cut off here. Nothing was charged. " +
                  "Generate again for a complete draft.]]\n",
              }),
            );
            controller.enqueue(
              line({
                t: "done",
                partial: true,
                skipped,
                creditsLeft: await currentBalance(),
                draftId: null,
                saved: false,
              }),
            );
          } else {
            controller.enqueue(
              line({
                t: "error",
                v:
                  "The drafting service did not respond in time, so this was stopped and your " +
                  "credit returned. Nothing had been written yet. This is usually the model " +
                  "being busy rather than anything wrong with your answers — try again.",
                code: "timeout",
              }),
            );
          }
        }
      } catch (err) {
        console.error("[/api/generate]", err);
        /* Nobody pays for a draft they did not get. If the model timed out, was
           overloaded, or the key was wrong, the credit goes straight back. */
        await refundCredit(
          spendId,
          err instanceof Error ? err.name : "unknown error",
        );
        controller.enqueue(line({ t: "error", v: friendly(err) }));
      } finally {
        stopBeating();
        clearTimeout(deadlineTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Saves the draft and its usage row. Never throws into the stream: a database
 * hiccup must not lose a draft the lawyer is already reading on screen.
 */
async function persist(input: {
  userId: string;
  slug: string;
  title: string;
  answers: Answers;
  sourceText: string | null;
  output: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  paidBenchmarkUsd: number;
}): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { data: dt } = await supabase
      .from("doc_types")
      .select("id")
      .eq("slug", input.slug)
      .maybeSingle();

    const { data: draft, error } = await supabase
      .from("drafts")
      .insert({
        user_id: input.userId,
        doc_type_id: dt?.id ?? null,
        title: input.title,
        answers: input.answers,
        source_text: input.sourceText,
        output: input.output,
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !draft) {
      console.error("[/api/generate] could not save draft:", error?.message);
      return null;
    }

    const { error: versionError } = await supabase.from("draft_versions").insert({
      draft_id: draft.id,
      user_id: input.userId,
      version_number: 1,
      detail_level: 3,
      file_name: versionFileName(input.answers, 1, 3),
      instruction: "Initial draft generated from the user's answers.",
      output: input.output,
    });
    if (versionError) {
      console.error("[/api/generate] could not save version 1:", versionError.message);
    }

    const { error: usageError } = await supabase.from("usage_log").insert({
      user_id: input.userId,
      draft_id: draft.id,
      provider: input.provider,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      paid_benchmark_usd: input.paidBenchmarkUsd,
    });
    if (usageError)
      console.error("[/api/generate] could not log usage:", usageError.message);

    return draft.id;
  } catch (err) {
    console.error("[/api/generate] persist failed:", err);
    return null;
  }
}
