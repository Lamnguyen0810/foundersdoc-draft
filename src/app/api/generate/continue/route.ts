/**
 * Finishing a draft the time limit cut off.
 *
 * /api/generate saves a draft that ran out of time as far as it got — the
 * person's credit is kept for it — and the browser at once asks here for the
 * rest. The model is given the same prompt the draft began with, plus the
 * text already written, and told to carry on from the exact point it
 * stopped. Nothing already written is written, or paid for, again.
 *
 * The draft is read from the database, never from the browser, so what is
 * continued is what was saved. Each draft may be continued a few times at
 * most (drafts.continuations, 063), so a continuation cannot be used to buy
 * unlimited model time on one credit.
 */

import { NextRequest } from "next/server";
import { loadDocType } from "@/lib/doctypes.server";
import type { Answers } from "@/lib/prompt";
import { generateDraftStream } from "@/lib/ai/provider";
import { PAID_BENCHMARK, costUsd, priceFor } from "@/lib/ai/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { currentBalance } from "@/lib/billing/credits";
import { BUDGET_MS, MAX_CONTINUATIONS, draftPrompt, friendly, line } from "@/lib/generate/shared";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  draftId?: string | null;
  /* Used only without a database (local development). */
  docTypeSlug?: string;
  answers?: Answers;
  sourceText?: string;
  detailLevel?: number;
  sofar?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The rest, without any of the end of what was already written that the
 *  model repeated before carrying on. */
function withoutOverlap(sofar: string, rest: string): string {
  const tail = sofar.slice(-300);
  for (let n = Math.min(tail.length, rest.length); n >= 12; n--) {
    if (rest.startsWith(tail.slice(-n))) return rest.slice(n);
  }
  return rest;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const db = isSupabaseConfigured();
  const user = db ? await getUser() : null;
  if (db && !user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  let sofar = "";
  let slug = "";
  let answers: Answers = {};
  let sourceText: string | undefined;
  let detailLevel: 1 | 2 | 3 | 4 | 5 = 3;
  let draftId: string | null = null;
  let counted = false;
  let round = 0;

  if (db) {
    draftId = typeof body.draftId === "string" && UUID.test(body.draftId) ? body.draftId : null;
    if (!draftId) return Response.json({ error: "Which draft?" }, { status: 400 });
    const supabase = await createClient();
    /* RLS: only the person's own draft is found. */
    let { data, error } = await supabase
      .from("drafts")
      .select("id,output,answers,source_text,continuations,doc_types(slug),draft_versions(version_number,detail_level)")
      .eq("id", draftId)
      .maybeSingle();
    if (error && /continuations/.test(error.message)) {
      /* Before 063: no counter. Continue, but only this once per request. */
      ({ data, error } = await supabase
        .from("drafts")
        .select("id,output,answers,source_text,doc_types(slug),draft_versions(version_number,detail_level)")
        .eq("id", draftId)
        .maybeSingle());
    } else {
      counted = true;
    }
    const row = data as {
      output: string | null;
      answers: Answers | null;
      source_text: string | null;
      continuations?: number | null;
      doc_types: { slug: string } | { slug: string }[] | null;
      draft_versions: { version_number: number; detail_level: number | null }[] | null;
    } | null;
    if (error || !row) return Response.json({ error: "That draft could not be found." }, { status: 404 });
    if (counted) {
      if (row.continuations === null || row.continuations === undefined) {
        return Response.json({ error: "This draft is already complete." }, { status: 409 });
      }
      if (row.continuations >= MAX_CONTINUATIONS) {
        return Response.json(
          { error: "This draft could not be finished automatically. Generate it again, or contact us and we will sort it out." },
          { status: 429 },
        );
      }
      round = row.continuations + 1;
      /* Counted before the model is called, so two tabs cannot both use
         the last continuation. */
      await supabase.from("drafts").update({ continuations: round }).eq("id", draftId);
    }
    const dt = Array.isArray(row.doc_types) ? row.doc_types[0] : row.doc_types;
    slug = dt?.slug ?? "";
    sofar = row.output ?? "";
    answers = row.answers ?? {};
    sourceText = row.source_text ?? undefined;
    const v1 = (row.draft_versions ?? []).find((v) => v.version_number === 1);
    detailLevel = Math.min(5, Math.max(1, Number(v1?.detail_level) || 3)) as 1 | 2 | 3 | 4 | 5;
  } else {
    slug = body.docTypeSlug ?? "";
    sofar = typeof body.sofar === "string" ? body.sofar : "";
    answers = body.answers ?? {};
    sourceText = body.sourceText;
    detailLevel = Math.min(5, Math.max(1, Number(body.detailLevel) || 3)) as 1 | 2 | 3 | 4 | 5;
  }

  const docType = await loadDocType(slug);
  if (!docType) return Response.json({ error: "Unknown document type." }, { status: 400 });
  if (!sofar.trim()) return Response.json({ error: "There is nothing to continue." }, { status: 400 });

  const prompt = await draftPrompt(docType, answers, sourceText, detailLevel);
  const userMessage = [
    prompt.user,
    "",
    "YOUR DRAFT SO FAR",
    "You began this document and were cut off part-way through. Here it is exactly as far as it got:",
    "<<<",
    sofar,
    ">>>",
    "",
    "Continue the document from exactly where it stops — mid-sentence if it stops mid-sentence.",
    "Write only what comes next, to the end of the document. Do not repeat any of the text above,",
    "do not start again, and add no heading or preamble of your own.",
  ].join("\n");

  const started = Date.now();
  let timedOut = false;
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    deadline.abort(new Error("generate_budget_exhausted"));
  }, BUDGET_MS);

  const save = async (text: string, complete: boolean, usage?: { provider: string; model: string; inputTokens: number; outputTokens: number }) => {
    if (!db || !draftId || !user) return;
    try {
      const supabase = await createClient();
      const patch: Record<string, unknown> = { output: text, output_html: null };
      if (complete && counted) patch.continuations = null;
      await supabase.from("drafts").update(patch).eq("id", draftId);
      await supabase.from("draft_versions").update({ output: text }).eq("draft_id", draftId).eq("version_number", 1);
      if (usage) {
        await supabase.from("usage_log").insert({
          user_id: user.id,
          draft_id: draftId,
          provider: usage.provider,
          model: usage.model,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cost_usd: costUsd(priceFor(usage.model), usage.inputTokens, usage.outputTokens),
          paid_benchmark_usd: costUsd(PAID_BENCHMARK, usage.inputTokens, usage.outputTokens),
        });
      }
    } catch (err) {
      console.error("[/api/generate/continue] could not save:", err);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let rest = "";
      let sent = 0;
      let beat: ReturnType<typeof setInterval> | null = setInterval(() => {
        try {
          controller.enqueue(line({ t: "ping" }));
        } catch {
          /* closed */
        }
      }, 5_000);
      const stop = () => {
        if (beat) clearInterval(beat);
        beat = null;
      };
      /* Text goes out once the overlap with what was already written can be
         told apart — the first stretch is held back until then. */
      const flush = (final: boolean) => {
        const clean = withoutOverlap(sofar, rest);
        const settled = final || rest.length >= 320 ? clean.length : 0;
        if (settled > sent) {
          controller.enqueue(line({ t: "text", v: clean.slice(sent, settled) }));
          sent = settled;
        }
        return clean;
      };

      try {
        try {
          for await (const event of generateDraftStream({
            system: prompt.system,
            user: userMessage,
            signal: deadline.signal,
            cacheKey: `fdai-draft-${docType.slug}`,
          })) {
            if (Date.now() - started > BUDGET_MS) {
              timedOut = true;
              break;
            }
            if (event.type === "text") {
              stop();
              rest += event.value;
              flush(false);
            } else if (event.type === "done") {
              const full = sofar + flush(true);
              await save(full, true, event.usage);
              controller.enqueue(
                line({ t: "done", draftId, saved: Boolean(draftId), creditsLeft: db ? await currentBalance() : null }),
              );
            } else {
              const full = sofar + flush(true);
              if (rest) await save(full, false);
              controller.enqueue(line({ t: "error", v: event.message }));
            }
          }
        } catch (err) {
          if (!deadline.signal.aborted) throw err;
        }

        if (timedOut) {
          /* Out of time again: keep what this round wrote, and say whether
             another round is allowed. */
          const full = sofar + flush(true);
          if (rest) await save(full, false);
          console.warn(`[/api/generate/continue] round ${round} stopped after ${Math.round((Date.now() - started) / 1000)}s`);
          controller.enqueue(
            line({
              t: "done",
              partial: true,
              continue: !counted ? !db : round < MAX_CONTINUATIONS,
              draftId,
              saved: Boolean(draftId),
            }),
          );
        }
      } catch (err) {
        console.error("[/api/generate/continue]", err);
        if (rest) await save(sofar + withoutOverlap(sofar, rest), false);
        controller.enqueue(line({ t: "error", v: friendly(err) }));
      } finally {
        stop();
        clearTimeout(timer);
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
