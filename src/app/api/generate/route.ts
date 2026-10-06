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
import { missingRequired, skippedFields, type Answers } from "@/lib/prompt";
import { generateDraftStream } from "@/lib/ai/provider";
import { nameDraft } from "@/lib/draft-name";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  FAIR_USE_REACHED,
  attachDraft,
  currentBalance,
  refundCredit,
  reserveCredit,
} from "@/lib/billing/credits";
import { BUDGET_MS, USABLE_CHARS, draftPrompt, friendly, line, versionFileName } from "@/lib/generate/shared";

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

type Body = {
  docTypeSlug?: string;
  answers?: Answers;
  sourceText?: string;
  detailLevel?: number;
};

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

  /* A paying member who has reached the monthly fair-use ceiling. A paywall
     here would be wrong — they have already paid — so say what has actually
     happened and point them at a person rather than a payment form. */
  if (spendId === FAIR_USE_REACHED) {
    return Response.json(
      {
        error:
          "You have reached this month's fair-use limit on the Unlimited plan. Nothing is wrong " +
          "with your account and nothing has been charged — get in touch and we will raise it.",
        code: "fair_use",
      },
      { status: 429 },
    );
  }

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

  const detailLevel = Number.isInteger(body.detailLevel) &&
    Number(body.detailLevel) >= 1 && Number(body.detailLevel) <= 5
      ? (Number(body.detailLevel) as 1 | 2 | 3 | 4 | 5)
      : 3;
  const { system, user: user_message } = await draftPrompt(docType, answers, body.sourceText, detailLevel);

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

  /* ── THE NAME ──────────────────────────────────────────────────────────
     Started here, at the same moment as the draft itself, and not awaited
     until the draft is saved. Naming takes about a second and drafting takes
     tens of them, so by the time this is read it has long since settled: the
     person waits no longer for a named draft than for an unnamed one. It
     resolves whatever happens — see nameDraft — so there is nothing to catch,
     and no draft can fail to be named. */
  const naming = nameDraft(docType, answers, { signal: deadline.signal });

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
            cacheKey: `fdai-draft-${docType.slug}`,
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
              const { provider, model } = event.usage;

              /* The name was being written while the document was. Awaiting it
                 here costs nothing — it settled long ago — and it cannot reject.
                 Its tokens are added to the draft's own so the cost meter counts
                 everything this request actually bought, naming included. */
              const named = await naming;
              const inputTokens = event.usage.inputTokens + named.inputTokens;
              const outputTokens = event.usage.outputTokens + named.outputTokens;

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
                  title: named.title,
                  answers,
                  sourceText: body.sourceText ?? null,
                  output: accumulated,
                  provider,
                  model,
                  inputTokens,
                  outputTokens,
                  costUsd: actual,
                  paidBenchmarkUsd: benchmark,
                  detailLevel,
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
                  /* So the screen can show the draft's name the moment it is
                     made, rather than on the next page load. */
                  title: named.title,
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
          const waited = firstChunkAt
            ? `${firstChunkAt - startedGenerating}ms waiting, then ${Date.now() - firstChunkAt}ms generating`
            : "never received a first token — all of it was spent waiting on the model";

          /* ── CONTINUE, DON'T DISCARD ──────────────────────────────────────
             A draft cut off by the time limit used to be refunded and thrown
             away — the person paid nothing, but the model had been paid for
             every word of it, and a second attempt paid for them all again.

             Now what was written is SAVED (marked incomplete) and the credit
             is kept for it; the browser at once asks /api/generate/continue
             to write the rest, from where it stopped. The words already
             bought are never bought twice, and the person gets a whole
             document for their one credit. Only a fragment too short to be
             worth continuing is still refunded. */
          let savedId: string | null = null;
          let title = "";
          if (user && accumulated.length >= USABLE_CHARS) {
            const named = await naming;
            title = named.title;
            const inputTokens = Math.ceil((system.length + user_message.length) / 4) + named.inputTokens;
            const outputTokens = Math.ceil(accumulated.length / 4) + named.outputTokens;
            savedId = await persist({
              userId: user.id,
              slug: docType.slug,
              title,
              answers,
              sourceText: body.sourceText ?? null,
              output: accumulated,
              provider: "unknown",
              model: "unknown",
              inputTokens,
              outputTokens,
              costUsd: 0,
              paidBenchmarkUsd: 0,
              detailLevel,
              incomplete: true,
            });
          }

          if (!savedId && !isSupabaseConfigured() && accumulated.length >= USABLE_CHARS) {
            /* No database (local development): nothing to save, and nothing
               was charged; the browser continues from the text it has. */
            controller.enqueue(line({ t: "done", partial: true, continue: true, skipped, draftId: null, saved: false }));
          } else if (savedId) {
            await attachDraft(spendId, savedId);
            console.warn(
              `[/api/generate] stopped at ${seconds}s with ${accumulated.length} chars (${waited}). ` +
                `Saved as ${savedId.slice(0, 6)} to be continued.`,
            );
            controller.enqueue(
              line({
                t: "done",
                partial: true,
                continue: true,
                skipped,
                creditsLeft: await currentBalance(),
                draftId: savedId,
                saved: true,
                title,
              }),
            );
          } else {
            await refundCredit(spendId, "timed out");
            console.warn(
              `[/api/generate] stopped at ${seconds}s with ${accumulated.length} chars (${waited}). Credit refunded.`,
            );
            controller.enqueue(
              line({
                t: "error",
                v:
                  "The drafting service did not respond in time, so this was stopped and your " +
                  "credit returned. This is usually the model being busy rather than anything " +
                  "wrong with your answers — try again.",
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
  detailLevel: number;
  /** Cut off by the time limit, to be finished by /api/generate/continue. */
  incomplete?: boolean;
}): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { data: dt } = await supabase
      .from("doc_types")
      .select("id")
      .eq("slug", input.slug)
      .maybeSingle();

    const row: Record<string, unknown> = {
      user_id: input.userId,
      doc_type_id: dt?.id ?? null,
      title: input.title,
      answers: input.answers,
      source_text: input.sourceText,
      output: input.output,
      status: "draft",
    };
    /* `continuations` counts how often an incomplete draft has been
       continued (063); 0 marks it incomplete. Before 063 the column is
       absent and the draft is saved without it. */
    let { data: draft, error } = await supabase
      .from("drafts")
      .insert(input.incomplete ? { ...row, continuations: 0 } : row)
      .select("id")
      .single();
    if (error && input.incomplete && /continuations/.test(error.message)) {
      ({ data: draft, error } = await supabase.from("drafts").insert(row).select("id").single());
    }

    if (error || !draft) {
      console.error("[/api/generate] could not save draft:", error?.message);
      return null;
    }

    const { error: versionError } = await supabase.from("draft_versions").insert({
      draft_id: draft.id,
      user_id: input.userId,
      version_number: 1,
      detail_level: input.detailLevel,
      file_name: versionFileName(input.answers, 1, input.detailLevel),
      instruction: "Initial draft generated from the user's answers.",
      output: input.output,
    });
    if (versionError) {
      console.error("[/api/generate] could not save version 1:", versionError.message);
    }

    const { error: usageError } = await supabase.from("usage_log").insert({
      user_id: input.userId,
      draft_id: draft.id,
      kind: "draft",
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
