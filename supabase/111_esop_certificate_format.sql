-- 111  ESOP: the Option Certificate reads like HitPay's issued certificates
--
-- Run once in Supabase (SQL editor), after 105-110. Safe to run again.
--
-- Checked against HitPay's issued certificates (No. 18, No. 44) and the
-- holder's Letter of Grant:
--   * the holder appears by FULL LEGAL NAME (as in the Letter of Grant), while
--     the schedule uses short names -> esop_holders.legal_name; the certificate,
--     Slack and the document title use it when set, the dashboard keeps the
--     short name.
--   * options are written with a thousands separator ("4,400 Class B ESOP
--     Shares") -> 'options' is now that text; the plain number moves to
--     'options_number'. No Zapier change: the certificate box already maps
--     5. Options.
--   * nationality is written "<Nationality> citizenship" (e.g. "Malaysian
--     citizenship") and the grant date "24 October 2023" (already so).

alter table public.esop_holders add column if not exists legal_name text;

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
    'contact_email', coalesce(c.email_override, c.contact_email, ''),
    'real_contact_email', coalesce(c.contact_email, ''),
    'simulation', c.email_override is not null,
    'simulation_note', case when c.email_override is not null
                            then '[SIMULATION] All emails go to ' || c.email_override || ', not to the client or holders.'
                            else '' end,
    'slack_ts', (select a.slack_ts from public.esop_alerts a where a.company_id = p_company and a.ref = v_ref),
    'holders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'holder_id', h.id,
               'name', coalesce(nullif(trim(h.legal_name), ''), h.name),
               'list_name', h.name,
               'email', coalesce(c.email_override, h.email, ''),
               'real_email', coalesce(h.email, ''),
               'id_no', coalesce(h.id_no, ''),
               'nationality', coalesce(h.nationality, ''),
               'grant_date_text', coalesce(to_char(h.grant_date, 'FMDD FMMonth YYYY'), ''),
               'options', to_char(h.options_per_tranche, 'FM999,999,990'),
               'options_number', h.options_per_tranche,
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

do $$ begin raise notice 'OK    ESOP certificate format (legal name, 4,400 options) ready'; end $$;
