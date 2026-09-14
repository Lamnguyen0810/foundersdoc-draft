# Sprint 2.1–2.2 — turning on accounts and the database

About 20 minutes. Free tier throughout. **The app works before you do any of this** — Supabase is additive, so if you get stuck halfway nothing is broken; you just fall back to no-login, no-saving mode.

---

## 1️⃣ Create the project (3 min)

1. <https://supabase.com> → sign up → **New project**
2. Name `fdai`, choose a region near Singapore (e.g. Southeast Asia), set a database password and **save it in your password manager** — it is not shown again
3. Wait ~2 minutes for provisioning

## 2️⃣ Run the schema (2 min)

1. Left sidebar → **SQL Editor** → **New query**
2. Open `supabase/001_schema.sql`, paste the whole file, **Run**
3. You want `Success. No rows returned`

This creates four tables — `profiles`, `doc_types`, `drafts`, `usage_log` — turns on row-level security on all of them, adds the policies, and installs a trigger that creates a profile row automatically for every new account.

⚠️ **Do not skip the RLS part by running only the `create table` statements.** Without those policies every signed-in user can read every other user's drafts.

## 3️⃣ Seed the document catalogue (1 min)

New query → paste `supabase/002_seed_doctypes.sql` → **Run**.

Check it landed: **Table Editor → doc_types** should show one row, `nda`, with a long `system_prompt` and a `fields` array of 17 entries.

> That file is generated, not hand-written. After editing a field list or a prompt in `src/lib/doctypes.data.mjs`, regenerate it:
> ```bash
> node scripts/build-seed-sql.mjs
> ```

## 4️⃣ Turn off public sign-up (1 min) — do not skip

**Authentication → Sign In / Providers → Email**

| Setting | Value |
|---|---|
| Enable Email provider | ✅ On |
| **Allow new users to sign up** | ❌ **Off** |
| Confirm email | ❌ Off (nobody external is signing up) |

🔒 If you leave sign-up on, anyone who finds the URL can create an account and spend your API quota.

## 5️⃣ Create your two accounts (2 min)

**Authentication → Users → Add user → Create new user**

- Email + password, tick **Auto Confirm User**
- Do this twice: one for you, one for the reviewing lawyer

The `profiles` row appears automatically. To make yourself an admin (needed later to edit `doc_types` from the app):

```sql
update public.profiles set role = 'admin' where email = 'you@foundersdoc.com';
```

## 6️⃣ Wire up the app (2 min)

**Project Settings → API Keys.** Copy the project URL and the **publishable** key (`sb_publishable_…`, or the older `anon` key — either works).

In `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

Restart `npm run dev`.

> **Why is a key called PUBLIC here when the README said never do that?**
> The publishable key is designed to be public — it goes to the browser and every request it makes is constrained by row-level security, which is why step 2 mattered. The **secret** (`service_role`) key is the opposite: it bypasses RLS entirely. Never put that one in a `NEXT_PUBLIC_` variable, in the repo, or in the browser. This app never needs it.

## 7️⃣ Check it worked

| Test | Expected |
|---|---|
| Open `/draft` signed out | Redirected to `/login` |
| Sign in with your account | Lands on `/draft`, your email in the header |
| Header note under "New draft" | *"Prompts loaded from **the database**"* |
| Generate a draft, then open **Past drafts** | It's listed |
| Supabase → Table Editor → `usage_log` | A row with token counts and a cost |
| Sign in as the lawyer's account, open **Past drafts** | **Empty** — RLS is working |

That last one is the test that matters. Two accounts, two isolated views. If the lawyer can see your drafts, the policies in step 2 did not apply — re-run `001_schema.sql`.

## 8️⃣ Prove the whole point of 2.2

1. Supabase → **Table Editor → doc_types** → open the `nda` row
2. Edit `system_prompt` — add a line to HARD RULES, e.g. *"Always write the term in both figures and words."*
3. Save
4. Generate a draft in the app — **no deploy, no restart**

That is sprint 2.2's actual deliverable: a lawyer can tune a prompt without a developer.

---

## 🩺 If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| "Sign-in is not configured" | Env vars missing, or dev server not restarted | Restart. On Vercel, redeploy after adding vars |
| Redirect loop on `/login` | Cookies blocked, or the URL has a typo | Check `NEXT_PUBLIC_SUPABASE_URL` exactly matches the dashboard |
| Signed in but *"built-in catalogue"* still shown | `002_seed_doctypes.sql` not run, or `is_active` false | Check Table Editor → `doc_types` |
| Draft generates but **Past drafts** is empty | `001_schema.sql` not run, or insert blocked | Check Supabase → Logs for a policy error |
| "Could not load drafts" | Tables don't exist | Run `001_schema.sql` |
| Another user can see your drafts | 🚨 RLS not applied | Re-run `001_schema.sql`; verify Table Editor shows RLS **enabled** on all four tables |
| Free project paused | ~1 week of inactivity on the free tier | Restore it from the dashboard; Pro at $25/mo removes this |

## ➡️ What's next

| Sprint | What |
|---|---|
| 2.3 | Reopen a saved draft for editing; pagination |
| 2.4 | `/usage` page — the monthly *"would have cost $X on the paid model"* figure |
| 3.1 | Upload `.pdf` / `.docx` and extract the text |
| 3.3 | Word export on firm letterhead |
