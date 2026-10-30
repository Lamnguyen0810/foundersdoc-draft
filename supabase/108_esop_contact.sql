-- 108  ESOP: the client's contact person (who gets the payment link)
--
-- Run once in Supabase (SQL editor), after 105, 106 and 107. Safe to run again.
--
-- WHY. When a vesting is approved, Zapier emails the Stripe payment link to the
-- client. Who that is (name + email) now lives with the company here, not typed
-- into Zapier, so each client gets their own and go-live is one update below.
-- esop_item() returns two new fields, contact_name and contact_email, so the
-- Approve hand-over and the weekly alert carry them with no code change.

alter table public.esop_companies add column if not exists contact_name text;
alter table public.esop_companies add column if not exists contact_email text;
do $$ begin
  alter table public.esop_companies add constraint esop_companies_contact_email_ok
    check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
exception when duplicate_object then null; end $$;

-- DEMO: Rachel plays the client, so the payment email goes to her and greets her.
-- GOING LIVE: run instead
--   update public.esop_companies set contact_name = 'Aditya', contact_email = '<HitPay billing email>' where slug = 'hitpay';
update public.esop_companies
   set contact_name = coalesce(contact_name, 'Rachel'),
       contact_email = coalesce(contact_email, 'rachel.wong@foundersdoc.com')
 where slug = 'hitpay';

create or replace function public.esop_item(p_company uuid, p_batch int, p_tranche int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c       public.esop_companies;
  b       public.esop_batches;
  v_ref   text := 'B' || p_batch || '-T' || p_tranche;
  v_vest  date;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  r       public.esop_tranche_runs;
begin
  select * into c from public.esop_companies where id = p_company;
  select * into b from public.esop_batches where company_id = p_company and batch = p_batch;
  if b.vesting_start is null or p_tranche < 1 or p_tranche > b.tranches then return null; end if;
  v_vest := (b.vesting_start + make_interval(years => p_tranche))::date;
  select * into r from public.esop_tranche_runs where company_id = p_company and esop_tranche_runs.ref = v_ref;

  return jsonb_build_object(
    'ref', v_ref,
    'batch', p_batch,
    'tranche', p_tranche,
    'vest_date', v_vest,
    'vest_date_text', to_char(v_vest, 'FMDD Mon YYYY'),
    'days_left', v_vest - v_today,
    'done', r.ref is not null,
    'approved_by', r.approved_by,
    'approved_at', r.approved_at,
    'sent', r.sent_at is not null,
    'invoice_no', coalesce(r.payment_link, r.invoice_no),
    'payment_link', r.payment_link,
    'company_legal_name', coalesce(c.legal_name, c.name),
    'company_reg_no', coalesce(c.reg_no, ''),
    'director_name', coalesce(c.director_name, ''),
    'share_class', c.share_class,
    'contact_name', coalesce(c.contact_name, ''),
    'contact_email', coalesce(c.contact_email, ''),
    'slack_ts', (select a.slack_ts from public.esop_alerts a where a.company_id = p_company and a.ref = v_ref),
    'holders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'holder_id', h.id,
               'name', h.name,
               'email', coalesce(h.email, ''),
               'id_no', coalesce(h.id_no, ''),
               'nationality', coalesce(h.nationality, ''),
               'grant_date_text', coalesce(to_char(h.grant_date, 'FMDD FMMonth YYYY'), ''),
               'options', h.options_per_tranche,
               'certificate_no', coalesce((select ec.number::text from public.esop_certificates ec
                                            where ec.company_id = p_company and ec.ref = v_ref and ec.holder_id = h.id), '')
             ) order by h.name)
      from public.esop_holders h
      where h.company_id = p_company and h.batch = p_batch and h.status = 'Active'
    ), '[]'::jsonb),
    'leavers', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'leaver_type', coalesce(l.leaver_type, 'Good'), 'last_day', l.last_day) order by l.name)
      from public.esop_holders l
      where l.company_id = p_company and l.batch = p_batch and l.status = 'Leaver'
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.esop_item(uuid, int, int) from public, anon, authenticated;

do $$ begin raise notice 'OK    ESOP client contact: %', (select contact_name || ' <' || contact_email || '>' from public.esop_companies where slug = 'hitpay'); end $$;
