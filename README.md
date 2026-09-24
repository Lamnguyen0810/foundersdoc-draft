# FDAI — drafting (Sprints 1, 2 and 3)

FoundersDoc's internal AI drafting tool. A lawyer picks a document type, answers a short form, and gets an editable first draft.

**Where this has got to — the product is complete enough to use on a real matter:**

| Sprint | Delivered |
|---|---|
| 1 | Form → prompt → model → streamed editable draft. One provider adapter, three backends plus a mock |
| 2.1 | Invite-only login, public sign-up disabled, anonymous requests blocked from the API |
| 2.2 | Four tables with row-level security; prompts and field lists **in the database**, editable with no deploy |
| 2.3 | Every draft saved; reopen from **Past drafts** to edit, save, or mark final; pagination |
| 2.4 | **Usage** page — tokens, actual spend, and what the month would cost on a paid model |
| 3.1 | Upload a `.docx` or `.pdf`, see exactly what the AI will read, feed it into the draft |
| 3.3 | **Download Word** on firm letterhead, with drafter's notes excluded by default |

**Everything is optional in layers.** With no keys at all it runs on a mock provider. With a free Gemini key it drafts for real. With Supabase it also has login and saving. Each layer is additive — a half-finished setup degrades, it does not break.

👉 **To turn on accounts and the database, follow [SETUP_SUPABASE.md](./SETUP_SUPABASE.md).**

---

## ⚡ Run it in two minutes, with no accounts

```bash
npm install
cp .env.example .env.local
# edit .env.local: set AI_PROVIDER=mock
npm run dev
```

Open <http://localhost:3000/draft>. The mock provider needs no key and no network. It streams back the **exact prompt that would have been sent**, which makes it the best prompt-debugging tool in the repo: if a field is missing there, the form is wrong; if a rule is missing there, the system prompt is wrong.

## 🔑 Then with a real (free) model

1. Get a key at <https://aistudio.google.com/apikey> — free, no card.
2. In `.env.local`: `AI_PROVIDER=gemini` and `GEMINI_API_KEY=...`
3. Check the key works before blaming the app:
   ```bash
   node --env-file=.env.local scripts/smoke-ai.mjs
   ```
   And if a draft ever fails with *"model was not found"*, ask your key what it
   can actually use — model ids change, and a stale one answers 404:
   ```bash
   node --env-file=.env.local scripts/list-models.mjs
   ```
4. `npm run dev`, then draft an NDA.

> ### ⚠️ Read this before typing a client's name
> Google's Gemini API terms provide that content submitted to the **unpaid** services is used to provide, improve and develop Google's products and machine-learning technologies, that human reviewers may read and annotate API input and output, and that sensitive, confidential or personal information should **not** be submitted to the unpaid services. The paid tier is the opposite — prompts and responses are not used to improve Google products.
>
> **So: anonymised, non-confidential material only until a paid key is in place.** The banner at the top of every page says the same thing. See "The swap" below.

---

## 🧱 How it is put together

| Path | What it does |
|---|---|
| `src/lib/ai/provider.ts` | ⭐ **The swap point.** The only module that knows which provider is in use |
| `src/lib/ai/gemini.ts` | Free tier today |
| `src/lib/ai/anthropic.ts` | Paid replacement, wired and ready, needs only env vars |
| `src/lib/ai/openai.ts` | OpenAI GPT-5.6 (Sol / Terra / Luna) — the drafting-test winners; env vars only |
| `src/lib/ai/ollama.ts` | A model on a machine you control — the Phase 3 private tier |
| `src/lib/ai/mock.ts` | No key, no network. Echoes the prompt |
| `src/lib/ai/pricing.ts` | The money meter: what each draft *would* cost on a paid model |
| `src/lib/doctypes.data.mjs` | ⭐ **The source of truth** for the NDA — plain JS so both the app and the seed generator read the same object |
| `src/lib/doctypes.ts` | Types over that data, plus the worked examples |
| `src/lib/doctypes.server.ts` | Reads doc types from Supabase, falls back to the built-in catalogue |
| `src/lib/supabase/` | Server, middleware and config clients. `config.ts` explains the key naming |
| `src/middleware.ts` | Refreshes the session and blocks anonymous requests — including to `/api/generate` |
| `supabase/001_schema.sql` | Tables, row-level security, policies, triggers |
| `supabase/002_seed_doctypes.sql` | Generated seed. Run `node scripts/build-seed-sql.mjs` after editing a prompt |
| `src/lib/prompt.ts` | Prompt assembly, required-field validation, drafter's-notes split |
| `src/lib/extract.ts` | `.docx` / `.pdf` text extraction. Sniffs by magic bytes, not extension |
| `src/lib/letterhead.ts` | ⚠️ **Firm details for the Word export — placeholders, replace these** |
| `src/app/api/export/route.ts` | Draft text → `.docx` on letterhead |
| `src/app/usage/page.tsx` | The money meter |
| `src/app/api/generate/route.ts` | Server route. Streams NDJSON. **The API key lives here and never reaches the browser** |
| `src/app/draft/DraftForm.tsx` | The form, the streaming editor, the copy button |
| `src/lib/examples/` | The two worked NDAs, plus the generator that bakes them into a module |

### The Founders Doc design system

`src/app/globals.css` carries the tokens, type scale, buttons and card treatment
ported straight from the marketing homepage — the same greys, the same gold
(`#f3bf4b`), Geist for headings and Inter for body, the same `.btn` variants. The
app is deliberately **light only**: foundersdoc.com has no dark mode, and a tool
that flips theme halfway through a journey reads as broken.

`src/components/SiteChrome.tsx` holds the slim working nav and the site footer.
The nav is intentionally *not* the marketing nav — no FD AI / Services /
Resources dropdowns. This is a screen people work in, and the navigation should
not compete with the form. The footer is the full one, so the app still reads as
part of foundersdoc.com.

Fonts load via `<link>` in the root layout, the same way the homepage does it,
rather than `next/font`. `next/font` self-hosts, which is better — but it fetches
from Google **at build time**, and a build that depends on reaching Google is a
build that can fail.

### The one rule that makes this reversible

**No file outside `src/lib/ai` may import a model SDK or call a model HTTP endpoint.** Everything else calls `generateDraft()` or `generateDraftStream()` and has no idea which provider answered. That is why switching from a free Gemini key to a paid Anthropic one is two environment variables rather than a rewrite. If you are about to `fetch` an AI API from a component or a route, stop and add a provider instead.

### Prompts and examples are deliberately separate

`systemPrompt` holds the instructions; `examples` holds the worked documents. They are separate fields so that swapping in the firm's own sanitised NDAs at sprint 2.2 changes nothing else. Never paste an example inline into the prompt text.

### The playbook is a third thing

**Admin → AI files → Playbook.** The firm's drafting *rules* — numbering, defined terms, clauses never dropped, wording to use or avoid — firm-wide and per document type. Paste or upload (Word, PDF, Markdown, text); every save is a version, any version can be read or restored, "Switch off" retires the live one. Storage is `supabase/044_playbook.sql`.

The model reads the playbook **before** the worked examples and is told it wins where they differ (`playbookBlock()` in `lib/prompt.ts`). Do not put a playbook in the training library: the library holds documents to imitate, and a page of rules would be imitated as if it were one.

---

## 🚀 Deploying to Vercel

The weekly Zapier analytics report also requires a server-only
`ANALYTICS_REPORT_SECRET`. Generate a long random value, add it to Vercel, and
send the same value from Zapier as `Authorization: Bearer <value>` when posting
to `/api/analytics/weekly`. Never prefix this variable with `NEXT_PUBLIC_`.

The AI app lives in **its own Vercel project**, separate from the marketing site, so an AI experiment can never break foundersdoc.com.

```bash
git init && git add -A && git commit -m "FDAI drafting: sprints 1 and 2.1-2.2"
gh repo create fdai-draft --private --source=. --push
```

Then in Vercel:

1. **Add New → Project**, import `fdai-draft`. Put it in the **same Vercel team that owns foundersdoc.com** — if that team is already Pro, this project costs nothing extra.
2. **Settings → Environment Variables**: add `AI_PROVIDER` and `GEMINI_API_KEY` (and `GEMINI_MODEL` if you want to pin it). Apply to Production, Preview and Development.
3. **Settings → Environment Variables**: also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` once you have followed [SETUP_SUPABASE.md](./SETUP_SUPABASE.md). Env vars are only picked up by a **new build** — redeploy after adding them.
4. **Settings → Deployment Protection → Vercel Authentication**: keep this **On** until Supabase login is working, then you may turn it off — the app's own login has taken over. Leaving it on is also fine; it just means signing in twice.
5. **Settings → Domains**: add `app.foundersdoc.com` and create the CNAME Vercel shows you.
6. On the marketing site, add one nav link to `https://app.foundersdoc.com`. That link is the entire integration.

### Google sign-in (free, on your own domain)

"Continue with Google" is handled by this app, not by Supabase's OAuth redirect — so Google's consent screen says **foundersdoc.com**, not a `*.supabase.co` address, and Google's free brand verification can be granted. Supabase still owns every account; it just receives Google's ID token instead of running the handshake (`signInWithIdToken`). Set-up, once:

1. **Google Cloud → APIs & Services → Credentials → your OAuth web client.** Authorised redirect URI: `https://foundersdoc.com/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local work). The old `…supabase.co/auth/v1/callback` entry can go.
2. **Vercel → Environment Variables:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (server-only — no `NEXT_PUBLIC_`), plus `NEXT_PUBLIC_GOOGLE_AUTH=1` to show the button and `NEXT_PUBLIC_SITE_URL=https://foundersdoc.com` so the redirect URI matches byte for byte. Redeploy.
3. **Supabase → Authentication → Providers → Google:** enabled, with the same Client ID in the **Client IDs** box — that is what lets Supabase accept the token.
4. **Supabase SQL editor:** run `supabase/042_google_on_our_domain.sql`.
5. **Google Auth Platform → Branding / Audience / Verification Centre:** app name, support email, homepage, privacy and terms URLs on foundersdoc.com, authorised domain `foundersdoc.com`, status *In production*, submit. Until approval the screen reads "Sign in to foundersdoc.com"; after it, "Founders Doc".

> **Plan note.** Vercel's fair-use guidelines restrict the free Hobby plan to non-commercial personal use, and define commercial usage broadly enough to include a project whose code is written by a paid employee. Check which plan the foundersdoc.com team is on before assuming this is free.

---

## 📄 Before anyone downloads a draft: set the letterhead

`src/lib/letterhead.ts` ships with placeholders — `[Firm address line 1]`, a dummy phone number. Replace them. To use the real logo, drop it at `public/letterhead-logo.png` (about 150×45 px) and it is picked up automatically; if the file is missing the export falls back to a text header rather than failing.

**The drafter's notes are excluded from the plain download on purpose.** `[[TO CONFIRM]]` markers and internal assumptions must not leave the firm by accident. There is a separate link to download a copy *with* the notes, clearly headed "INTERNAL".

## 📎 What happens to an uploaded file

Nothing is stored. The file is read in memory, the text is extracted, and only that text is kept — in `drafts.source_text`. No Supabase Storage bucket, no binary sitting in the cloud while you are on a free-tier API key. If you later need the original kept, add a bucket and a `documents` row; `extract.ts` does not change.

Scanned PDFs are detected and refused with an explanation rather than silently producing an empty draft. OCR is not in scope.

## 🔁 The swap

| From | To | What changes |
|---|---|---|
| Gemini free | Anthropic paid | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. Nothing else |
| Gemini free | OpenAI paid | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6-sol` (or `-luna`). Optional `OPENAI_REASONING=none\|low\|medium\|high`, default low |
| Gemini free | Gemini paid | Enable billing on the Google Cloud project behind the key. No code change at all |
| Cloud | Local (Phase 3) | `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

The trigger for the first swap is not a feeling. It is either (a) a confidential document needs drafting, or (b) the gold-standard test set shows the free model failing scenarios the paid model passes.

---

## 🔐 A note on the two kinds of key

| Key | Prefix | Goes to the browser? | Why |
|---|---|---|---|
| Supabase **publishable** / `anon` | `NEXT_PUBLIC_` | ✅ Yes | Designed to be public. Every request it makes is constrained by row-level security |
| Supabase **secret** / `service_role` | never | ❌ Never | Bypasses RLS entirely. Used only by the Stripe webhook and by the Google callback's "is there an account for this email?" check |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | never | ❌ Never | Read only inside `/auth/google` and `/auth/google/callback` on the server |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | never | ❌ Never | Read only inside `/api/generate` on the server |

If you are ever unsure, the rule is: `NEXT_PUBLIC_` means "printed on the front page of a newspaper". Only the Supabase publishable key survives that test.

## ✅ What "done" looks like

- [x] `npm run build` passes
- [x] Required-field validation rejects an empty form before spending a request
- [x] A missing API key produces a readable message, not a stack trace
- [x] Rate limits and upstream errors are caught and explained
- [x] The draft streams in and is editable in place
- [x] Drafter's notes are split out and highlighted
- [x] Token counts and a paid-model cost estimate shown after every draft
- [x] Invite-only login; public sign-up disabled; anonymous requests cannot reach `/api/generate`
- [x] Four tables with row-level security; a user sees only their own drafts
- [x] Prompts and field lists in the database — a lawyer can tune a prompt with no deploy
- [x] Every draft saved, every generation logged with tokens and cost
- [x] Runs unconfigured, with a visible banner rather than a crash
- [x] Upload → extraction → "what the AI will see" → text reaches the prompt
- [x] Word export on letterhead, notes excluded by default
- [x] Usage page with the cost-per-draft figure Phase 2 pricing needs
- [ ] Letterhead details replaced ← *[src/lib/letterhead.ts](./src/lib/letterhead.ts)*
- [ ] Supabase project set up ← *[SETUP_SUPABASE.md](./SETUP_SUPABASE.md)*
- [ ] Deployed to Vercel ← *you do this*
- [ ] A real NDA generated from the live URL ← *the actual gate*

## ➡️ Next

1. **Replace the letterhead placeholders**, then deploy. See SETUP_SUPABASE.md and the Vercel steps above.
2. **Sprint 4.2 — hardening.** Rate-limit `/api/generate`, and write the test that proves user A cannot read user B's drafts.
3. **Sprint 4.3 — the gold-standard set.** 10 scenarios for the NDA, scored by the reviewing lawyer. This is what decides when to pay for a better model.
4. **More document types.** Copy the `NDA_DATA` block in `doctypes.data.mjs`, regenerate the seed. Letter of Demand, Letter of Engagement and the standard email are already written up in the prompt library.

## 🐛 Known limits, on purpose

| Limit | Fixed at |
|---|---|
| No rate limiting on `/api/generate` | Sprint 4.2 |
| Scanned PDFs are refused, not OCR'd | Out of scope; paste the text |
| Uploaded files are not kept, only their text | Deliberate — see above |
| One document type (NDA) | Add more in `doctypes.data.mjs` |
| Letterhead is a placeholder | `src/lib/letterhead.ts` |
| Free tier: ~15 requests/min | The swap |
