-- 146 · OnPoint: feedback with a kind and an optional screenshot (0292). Safe to run more than once.

alter table public.onpoint_feedback
  add column if not exists kind      text not null default 'change' check (kind in ('change', 'add', 'fix', 'question')),
  add column if not exists shot_path text check (shot_path is null or length(shot_path) <= 400);

do $$ begin raise notice 'OK    OnPoint feedback: kind and screenshot ready.'; end $$;
