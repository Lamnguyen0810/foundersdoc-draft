-- 126  ESOP: the payment email from the website, and finance copies (0202)
--
-- Run once in Supabase (SQL editor), after 125. Safe to run again. Adds only.
--
--   esop_companies.finance_emails      who gets a copy of every payment email
--                                      (Settings → Finance copies), at most 5
--   esop_tranche_runs.payment_email_sent_at
--                                      when the payment email went out, so a re-run
--                                      of the Zap does not email twice within 20 hours
--   esop_set_finance_emails()          saves the list (company Admin or Founders Doc)

alter table public.esop_companies add column if not exists finance_emails text[] not null default '{}';
alter table public.esop_tranche_runs add column if not exists payment_email_sent_at timestamptz;

create or replace function public.esop_set_finance_emails(p_company uuid, p_emails text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v text[];
begin
  if not coalesce(public.esop_can_manage(p_company), false) then raise exception 'not allowed'; end if;
  select array_agg(distinct lower(trim(e))) into v from unnest(coalesce(p_emails, '{}')) e
   where lower(trim(e)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if coalesce(array_length(v, 1), 0) > 5 then raise exception 'too many emails'; end if;
  update public.esop_companies set finance_emails = coalesce(v, '{}') where id = p_company;
end $$;
revoke all on function public.esop_set_finance_emails(uuid, text[]) from public;
grant execute on function public.esop_set_finance_emails(uuid, text[]) to authenticated;

do $$ begin
  raise notice 'OK    payment email ready · finance copies set for % compan(ies)',
    (select count(*) from public.esop_companies where cardinality(finance_emails) > 0);
end $$;
