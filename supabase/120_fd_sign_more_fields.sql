-- 120  FD Sign: more field types (initials, text box, checkbox)
--
-- Run once in Supabase (SQL editor), after 113 and 119. Safe to run again.
--
-- WHAT CHANGES. sign_fields (113) gets three new kinds and three columns:
--   kind      + 'initials' (drawn from the signer's name), 'text' (the signer types it),
--               'checkbox' (the signer ticks it)
--   label     what the box asks for, e.g. "Company name" or "I have read clause 5"
--   required  the signer must fill it in before signing (default yes)
--   value     what the signer typed or ticked, saved when they sign
-- Existing boxes (signature / date / name, ESOP certificates included) keep
-- working exactly as before: nothing is removed and their rows are untouched.

alter table public.sign_fields add column if not exists label    text check (label is null or length(label) <= 60);
alter table public.sign_fields add column if not exists required boolean not null default true;
alter table public.sign_fields add column if not exists value    text check (value is null or length(value) <= 500);

-- allow the new kinds (the 113 check named sign_fields_kind_check, replaced in place)
alter table public.sign_fields drop constraint if exists sign_fields_kind_check;
alter table public.sign_fields add constraint sign_fields_kind_check
  check (kind in ('signature', 'date', 'name', 'initials', 'text', 'checkbox'));

do $$ begin
  raise notice 'OK    FD Sign field types ready · boxes: % (signature %, other %)',
    (select count(*) from public.sign_fields),
    (select count(*) from public.sign_fields where kind = 'signature'),
    (select count(*) from public.sign_fields where kind <> 'signature');
end $$;

-- Check (read-only):
--   select kind, label, required, value from public.sign_fields where kind in ('initials', 'text', 'checkbox') order by id desc limit 20;
