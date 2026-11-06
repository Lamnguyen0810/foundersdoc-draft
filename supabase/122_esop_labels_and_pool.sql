-- 122  ESOP dashboard: label the letters already on file, set HitPay's option pool
--
-- Run once in Supabase (SQL editor), after 121. Safe to run again.
-- Changes data only (no tables or rules):
--
--   1. Letters of Grant and certificates uploaded before 121 have no label, so the
--      dashboard shows a top-up holder's Supplemental Letter as a second original.
--      The file name says which it is: "Supplemental" / "Top-up" -> Top-up,
--      "Amended" (letters only) -> Amended. Everything else is left as it is.
--   2. HitPay's option pool: 1,111,111 shares (from Rachel's design, 5 Nov 2026),
--      only if it is not set yet.

update public.esop_documents
   set label = 'Top-up'
 where label is null
   and holder_id is not null
   and kind in ('letter_of_grant', 'certificate')
   and file_name ~* '(supplemental|top[ _-]?up)';

update public.esop_documents
   set label = 'Amended'
 where label is null
   and holder_id is not null
   and kind = 'letter_of_grant'
   and file_name ~* 'amended';

update public.esop_companies
   set option_pool = 1111111
 where slug = 'hitpay' and option_pool is null;

do $$ begin
  raise notice 'OK    labels: % top-up, % amended · HitPay pool: %',
    (select count(*) from public.esop_documents where label = 'Top-up'),
    (select count(*) from public.esop_documents where label = 'Amended'),
    (select option_pool from public.esop_companies where slug = 'hitpay');
end $$;
