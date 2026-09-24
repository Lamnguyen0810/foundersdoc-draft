-- ===========================================================================
-- FDAI — The playbook
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHAT A PLAYBOOK IS, AND IS NOT ──────────────────────────────────────────
-- The AI library (014) holds SAMPLE DOCUMENTS: finished agreements the model
-- is told to imitate in shape and tone. A playbook is the other layer — the
-- firm's RULES: how to number, which defined terms, what "shall" means here,
-- which clauses are never dropped, what goes in the boilerplate. Rules are
-- not an example of anything, so they cannot live in the library; a playbook
-- uploaded there would be read as a strangely shaped NDA.
--
-- Rules are read BEFORE the examples and are told to win where the two
-- disagree. See lib/prompt.ts.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────
-- One row per saved version. `scope` is a document type's slug, or '*' for
-- the firm-wide playbook that applies to every document. At most one version
-- per scope is live; the rest are history, kept so a change can be undone
-- from the dashboard and so the firm can see what the model was told last
-- month. Nothing is ever deleted from here by the app.
--
-- Drafting reads the live text through playbook_for() — the one opening in
-- the admin-only wall, as with ai_examples_for().
-- ===========================================================================

create table if not exists public.playbooks (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null,                       -- doc type slug, or '*'
  version         integer not null,
  content         text not null,
  chars           integer generated always as (length(content)) stored,
  filename        text,                                -- what was uploaded, if a file
  note            text,                                -- "why this version", optional
  live            boolean not null default false,
  saved_by        uuid references auth.users (id) on delete set null,
  saved_by_email  text,
  created_at      timestamptz not null default now(),
  unique (scope, version),
  check (scope = '*' or scope ~ '^[a-z0-9_-]+$'),
  check (length(content) between 1 and 200000)
);

create unique index if not exists playbooks_one_live_per_scope
  on public.playbooks (scope) where live;

create index if not exists playbooks_scope_version
  on public.playbooks (scope, version desc);

alter table public.playbooks enable row level security;

drop policy if exists "playbooks: admin" on public.playbooks;
create policy "playbooks: admin" on public.playbooks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────── save a version, make it live
/*
 * The dashboard's only write. A new version number, the new text, and the
 * switch of `live` from the old row to the new one, in one statement — so a
 * draft generated at that exact moment sees either the old playbook or the
 * new one, never none. Admin only, enforced here as well as by RLS.
 */
create or replace function public.save_playbook(
  p_scope text,
  p_content text,
  p_filename text default null,
  p_note text default null
)
returns public.playbooks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.playbooks;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_scope is null or btrim(p_scope) = '' then
    raise exception 'scope is required';
  end if;
  if p_content is null or btrim(p_content) = '' then
    raise exception 'the playbook is empty';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  update public.playbooks set live = false where scope = p_scope and live;

  insert into public.playbooks (scope, version, content, filename, note, live, saved_by, saved_by_email)
  values (
    p_scope,
    coalesce((select max(version) from public.playbooks where scope = p_scope), 0) + 1,
    p_content,
    nullif(btrim(coalesce(p_filename, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    true,
    auth.uid(),
    v_email
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_playbook(text, text, text, text) from public, anon;
grant execute on function public.save_playbook(text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────── bring a version back
/* "Restore" does not rewrite history: it saves the old text as a NEW live
   version, so the log still shows that the change happened and was undone. */
create or replace function public.restore_playbook(p_id uuid)
returns public.playbooks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.playbooks;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into v_old from public.playbooks where id = p_id;
  if v_old.id is null then
    raise exception 'no such version';
  end if;
  return public.save_playbook(
    v_old.scope,
    v_old.content,
    v_old.filename,
    'Restored version ' || v_old.version
  );
end;
$$;

revoke all on function public.restore_playbook(uuid) from public, anon;
grant execute on function public.restore_playbook(uuid) to authenticated;

-- ─────────────────────────────────────────────────────── switch one off
/* Retire the live version without deleting it. The next save makes a new
   live one; restore brings any old one back. */
create or replace function public.retire_playbook(p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.playbooks set live = false where scope = p_scope and live;
end;
$$;

revoke all on function public.retire_playbook(text) from public, anon;
grant execute on function public.retire_playbook(text) to authenticated;

-- ────────────────────────────────────────────────────── what drafting reads
/*
 * The live rules for one document type: the firm-wide playbook first (it
 * applies everywhere), then the type's own. Title and text, nothing else —
 * no versions, no authors. Any signed-in user may call it, because drafting
 * runs as the signed-in user; the table itself stays admin-only.
 */
create or replace function public.playbook_for(p_slug text)
returns table (scope text, title text, text text)
language sql
stable
security definer
set search_path = public
as $$
  select p.scope,
         case when p.scope = '*' then 'Firm-wide playbook'
              else coalesce((select d.label from public.doc_types d where d.slug = p.scope), p.scope) || ' playbook'
         end as title,
         p.content as text
  from public.playbooks p
  where p.live
    and p.scope in ('*', p_slug)
  order by case when p.scope = '*' then 0 else 1 end;
$$;

revoke all on function public.playbook_for(text) from public, anon;
grant execute on function public.playbook_for(text) to authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'playbooks') then
    raise notice 'OK    playbooks table is in place';
  end if;
  if exists (select 1 from pg_proc where proname = 'playbook_for') then
    raise notice 'OK    drafting can read the live playbook';
  end if;
  raise notice 'NEXT  Admin dashboard > AI files > Playbook: paste or upload the firm''s rules';
end $$;
