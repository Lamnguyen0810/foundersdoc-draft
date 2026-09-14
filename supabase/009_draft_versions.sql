-- Preserve every generated document version instead of overwriting the only copy.
create table if not exists public.draft_versions (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.drafts (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  version_number  integer not null check (version_number > 0),
  detail_level    integer not null default 3 check (detail_level between 1 and 5),
  file_name       text not null,
  instruction     text,
  output          text not null,
  output_html     text,
  created_at      timestamptz not null default now(),
  unique (draft_id, version_number)
);

create index if not exists draft_versions_draft_version_idx
  on public.draft_versions (draft_id, version_number);

alter table public.draft_versions enable row level security;

drop policy if exists "draft_versions: own rows" on public.draft_versions;
create policy "draft_versions: own rows" on public.draft_versions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.draft_versions is
  'Immutable generated versions belonging to a draft. The drafts row points to the latest version.';
