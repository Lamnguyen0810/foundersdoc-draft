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
export const maxDuration = 120;
const BUDGET_MS = 110_000;

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
  return lengthDelta >= 0.08 || changedAtPosition / Math.max(a.length, b.length, 1) >= 0.12;
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
    ? `${detailInstructions[targetDetailLevel]} This must be a genuine full-document rewrite, not light copy-editing. Do not invent facts or add a non-compete, indemnity, non-solicit or IP assignment unless already required by the current document.`
    : (body.instruction ?? "").trim();
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
        const maxAttempts = targetDetailLevel ? 2 : 1;
        attempts: for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          acc = "";
          const attemptMessage = attempt === 1
            ? userMessage
            : `${userMessage}\n\nRETRY REQUIREMENT: The previous attempt did not materially reach the requested comprehensiveness level. Rewrite the complete document more decisively and stay within the requested word range.`;

        for await (const event of generateDraftStream({ system: SYSTEM, user: attemptMessage })) {
          if (Date.now() - startedAt > BUDGET_MS) {
            if (spendId) await refundCredit(spendId, "timed out");
            controller.enqueue(
              line({
                t: "error",
                v: "That revision took longer than this plan allows and was stopped. Nothing was charged.",
                code: "timeout",
              }),
            );
            return;
          }
          if (event.type === "text") {
            acc += event.value;
            controller.enqueue(line({ t: "text", v: event.value }));
          } else if (event.type === "done") {
            // Legal drafts do not become invalid because a sensible clause puts
            // them just outside an arbitrary word band. Validate a broad band
            // and, more importantly, movement in the requested direction.
            // This avoids throwing away a genuinely expanded Maximum draft and
            // spending the remainder of the request budget on an unnecessary retry.
            const targetRanges = {
              1: [350, 900],
              2: [550, 1250],
              3: [800, 1650],
              4: [1050, 2100],
              5: [1200, 2800],
            } as const;
            const wordCount = acc.trim().split(/\s+/).length;
            const currentWordCount = text.trim().split(/\s+/).length;
            const range = targetDetailLevel ? targetRanges[targetDetailLevel] : null;
            const levelDifference = targetDetailLevel
              ? targetDetailLevel - currentDetailLevel
              : 0;
            const directionalMinimum = levelDifference > 0
              ? currentWordCount * (1 + Math.min(levelDifference * 0.12, 0.48))
              : 0;
            const directionalMaximum = levelDifference < 0
              ? currentWordCount * (1 - Math.min(Math.abs(levelDifference) * 0.1, 0.4))
              : Number.POSITIVE_INFINITY;
            const reachesLevel = !range || (
              wordCount >= range[0] &&
              wordCount <= range[1] &&
              wordCount >= directionalMinimum &&
              wordCount <= directionalMaximum
            );
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
