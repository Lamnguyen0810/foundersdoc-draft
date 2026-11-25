-- 147 · OnPoint: edit or delete your own feedback while it is not done yet (0293). Safe to run more than once.
alter table public.onpoint_feedback add column if not exists edited_at timestamptz;
do $$ begin raise notice 'OK    OnPoint feedback: edit and delete ready.'; end $$;
