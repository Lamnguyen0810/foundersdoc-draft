-- ===========================================================================
-- FDAI — stop a stuck lock taking drafting down with it
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHAT WENT WRONG ────────────────────────────────────────────────────────
-- consume_credit() takes a row lock (SELECT ... FOR UPDATE) so that two drafts
-- started at the same instant cannot spend the same last credit. That part is
-- right and is tested.
--
-- What was missing is a limit on how long it will WAIT for that lock. When a
-- serverless function is killed mid-request — which is exactly what a Vercel
-- timeout does — its transaction can be left open for a while, still holding
-- the row. Every later request then queues behind it: measured at 11 seconds
-- and climbing in a local reproduction. Those requests then time out
-- themselves, leaving more stuck locks. One slow draft becomes every draft
-- failing, which is what a 504 three times in a row looks like.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
-- Wait three seconds, no more. If the lock cannot be had in that time the
-- database is in trouble, not the customer's balance — so say so distinctly
-- rather than reporting "no credits", which would wrongly show a paywall to
-- someone who has plenty.
-- ===========================================================================

create or replace function public.consume_credit(p_draft_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_grant uuid;
  v_spend uuid;
begin
  if v_user is null then
    return null;
  end if;

  -- Never queue behind a stuck transaction for longer than this.
  set local lock_timeout = '3s';

  begin
    select id into v_grant
    from public.credit_grants
    where user_id = v_user
      and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    limit 1
    for update;
  exception when lock_not_available then
    -- Distinct on purpose: the caller must be able to tell "the database is
    -- busy" from "you have run out", and treat them very differently.
    raise exception 'credit_lock_timeout' using errcode = '55P03';
  end;

  if v_grant is null then
    return null;              -- genuinely no credit available
  end if;

  update public.credit_grants set remaining = remaining - 1 where id = v_grant;
  insert into public.credit_spends (user_id, grant_id, draft_id)
  values (v_user, v_grant, p_draft_id)
  returning id into v_spend;
  return v_spend;
end;
$$;

grant execute on function public.consume_credit(uuid) to authenticated;
