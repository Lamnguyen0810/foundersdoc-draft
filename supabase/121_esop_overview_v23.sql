-- 121  ESOP dashboard: Rachel's new design (overview v23)
--
-- Run once in Supabase (SQL editor), after 105-118. Safe to run again.
-- Adds only; nothing is removed or renamed, and the approval, Zapier, FD Sign
-- and reset functions (106-118) read nothing new.
--
--   esop_companies.option_pool        the pool size, for the "Option pool" bar
--   esop_holders.topup_start          a top-up grant's own vesting start (its schedule)
--   esop_holders.topup_options_per_tranche
--   esop_documents.label              a Letter of Grant's kind: Original / Amended / Top-up
--   esop_documents kinds              + 'esop_rules', 'resolution', 'other': the company's own
--                                     documents (sidebar: ESOP rules, Resolutions, All documents),
--                                     with no holder
--
-- WHO CAN TOUCH IT. Same rules as 105: company members and Founders Doc admins read
-- and add; only admins delete. A company document (no holder) can only be one of the
-- three company kinds; a holder's document must belong to a holder of that company.

-- 1. Pool size (Founders Doc admins set it; 105's "admins write" policy covers it)
alter table public.esop_companies add column if not exists option_pool bigint check (option_pool is null or option_pool >= 0);

-- 2. A top-up grant's schedule (yearly tranches from its start, like a batch)
alter table public.esop_holders add column if not exists topup_start date;
alter table public.esop_holders add column if not exists topup_options_per_tranche int check (topup_options_per_tranche is null or topup_options_per_tranche >= 0);

-- 3. Documents: a label for letters, and company documents without a holder
alter table public.esop_documents add column if not exists label text check (label is null or label in ('Original', 'Amended', 'Top-up'));
alter table public.esop_documents alter column holder_id drop not null;
alter table public.esop_documents drop constraint if exists esop_documents_kind_check;
alter table public.esop_documents add constraint esop_documents_kind_check
  check (kind in ('letter_of_grant', 'certificate', 'esop_rules', 'resolution', 'other'));
alter table public.esop_documents drop constraint if exists esop_documents_holder_or_company;
alter table public.esop_documents add constraint esop_documents_holder_or_company
  check ((holder_id is not null and kind in ('letter_of_grant', 'certificate')) or (holder_id is null and kind in ('esop_rules', 'resolution', 'other')));

drop policy if exists "esop documents: add" on public.esop_documents;
create policy "esop documents: add" on public.esop_documents
  for insert to authenticated with check (
    public.esop_can(company_id)
    and (
      (holder_id is null and kind in ('esop_rules', 'resolution', 'other'))
      or exists (select 1 from public.esop_holders h where h.id = holder_id and h.company_id = esop_documents.company_id)
    )
  );

do $$ begin
  raise notice 'OK    ESOP overview v23 ready · pool set for % compan(ies) · documents: % holder, % company',
    (select count(*) from public.esop_companies where option_pool is not null),
    (select count(*) from public.esop_documents where holder_id is not null),
    (select count(*) from public.esop_documents where holder_id is null);
end $$;

-- Set HitPay's pool (Founders Doc, once; the dashboard can also set it):
--   update public.esop_companies set option_pool = 1111111 where slug = 'hitpay';
