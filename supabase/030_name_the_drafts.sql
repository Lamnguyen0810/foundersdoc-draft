-- ===========================================================================
-- FDAI — every draft gets a name
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- WHY
-- The old naming rule read two answer keys, party_a and party_b, and gave up
-- when neither was there. Any document type published from the admin console
-- with its own field names therefore produced "Untitled draft" — which is how
-- a list of drafts comes to say the same thing six times.
--
-- New drafts are named as they are made. This names the ones already saved,
-- using the same rule the application uses, from the answers those drafts
-- already carry. Nothing is invented: where the answers name the parties the
-- name says so, where they only say what the matter is about the name says
-- that, and where they say nothing the name is the document type and the day
-- it was made — which is still true, and still tells one draft from another.
--
-- Only rows with no name, a blank name, or the literal "Untitled draft" are
-- touched. A name a person typed themselves is never overwritten.
-- ===========================================================================

-- ─────────────────────────────────────────────────── the rule, in SQL
-- Mirrors src/lib/draft-name.ts (nameFromAnswers). If one changes, change both.
create or replace function public.draft_name_from_answers(
  p_answers jsonb,
  p_fields  jsonb,
  p_label   text,
  p_created timestamptz
)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  -- Field names that point at a side of the deal...
  c_party   constant text :=
    '(party|parties|counterparty|client|customer|company|supplier|vendor|contractor|landlord|tenant|employer|employee|discloser|recipient|buyer|seller|investor|founder)';
  -- ...but an address is not a name, and neither is a country.
  c_not     constant text := '(address|jurisdiction|law|country|registered office|postal)';
  -- Field names that say what the matter is about.
  c_subject constant text := '(purpose|matter|project|subject|scope|transaction|deal|engagement|about|description)';
  -- The corporate tail, which is the same on nearly every Singapore company.
  c_tail    constant text :=
    '[[:space:],]+(pte\.?[[:space:]]*ltd\.?|private[[:space:]]+limited|limited|ltd\.?|llp|llc|inc\.?|incorporated|corp\.?|corporation|co\.?|pty\.?[[:space:]]*ltd\.?|sdn\.?[[:space:]]*bhd\.?|gmbh|b\.?v\.?)$';

  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_type    text;
  v_raw     text;
  v_name    text;
  v_parties text[] := '{}';
  v_subject text := null;
  v_out     text;
  v_day     text;
begin
  for v_field in select * from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb))
  loop
    v_key   := coalesce(v_field->>'key', '');
    v_label := coalesce(v_field->>'label', '');
    v_type  := coalesce(v_field->>'type', 'text');
    v_raw   := btrim(coalesce(p_answers->>v_key, ''));

    -- An unanswered question and a deliberately skipped one both say nothing
    -- about what this draft is; only a real answer can name it.
    continue when v_raw = '' or v_raw = '__fd_skipped__';

    if (v_key ~* c_party or v_label ~* c_party)
       and v_key !~* c_not and v_label !~* c_not
       and v_type not in ('select', 'number')
    then
      -- Drop the bracketed UEN, collapse the spaces, take the shouting out of
      -- an ACRA-style name, then drop the corporate tail.
      v_name := btrim(regexp_replace(split_part(v_raw, '(', 1), '[[:space:]]+', ' ', 'g'));
      v_name := regexp_replace(v_name, '[,;:.]+$', '');
      if v_name = upper(v_name) and v_name ~ '[A-Z]{4}' then
        v_name := initcap(v_name);
      end if;
      v_name := btrim(regexp_replace(v_name, c_tail, '', 'i'));
      v_name := btrim(regexp_replace(v_name, c_tail, '', 'i'));
      v_name := regexp_replace(v_name, '[,;:.]+$', '');

      -- The same company on both sides reads once, not twice.
      if v_name <> '' and not (lower(v_name) = any (select lower(unnest(v_parties)))) then
        v_parties := v_parties || v_name;
      end if;

    elsif v_subject is null
          and (v_key ~* c_subject or v_label ~* c_subject)
          and v_type in ('text', 'textarea')
    then
      v_subject := btrim(regexp_replace(split_part(v_raw, '(', 1), '[[:space:]]+', ' ', 'g'));
      v_subject := btrim(array_to_string((string_to_array(v_subject, ' '))[1:8], ' '));
      v_subject := regexp_replace(v_subject, '[[:space:],;:.-]+$', '');
      if v_subject = '' then v_subject := null; end if;
    end if;
  end loop;

  if array_length(v_parties, 1) >= 2 then
    v_out := v_parties[1] || ' and ' || v_parties[2] || ' — ' || p_label;
  elsif array_length(v_parties, 1) = 1 then
    v_out := v_parties[1] || ' — ' || p_label;
  elsif v_subject is not null then
    v_out := v_subject || ' — ' || p_label;
  else
    -- Singapore time, because that is the day the person remembers drafting it.
    v_day := to_char(p_created at time zone 'Asia/Singapore', 'FMDD Mon YYYY');
    -- en-GB writes the ninth month "Sept"; Postgres writes "Sep". The screen
    -- and the database should not disagree about the name of a month.
    v_day := replace(v_day, 'Sep ', 'Sept ');
    v_out := p_label || ' · ' || v_day;
  end if;

  -- The column is text, but a name nobody can read at a glance is not a name.
  if length(v_out) > 80 then
    v_out := btrim(regexp_replace(left(v_out, 79), '[[:space:],;:.-]+$', '')) || '…';
  end if;

  return v_out;
end;
$$;

-- ─────────────────────────────────────────────── name the ones already saved
do $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before
  from public.drafts
  where title is null or btrim(title) = '' or title = 'Untitled draft';

  update public.drafts d
  set title = public.draft_name_from_answers(
        d.answers,
        t.fields,
        coalesce(t.label, 'Draft'),
        d.created_at
      )
  from (select id, fields, label from public.doc_types) t
  where d.doc_type_id = t.id
    and (d.title is null or btrim(d.title) = '' or d.title = 'Untitled draft');

  -- A draft whose document type was deleted still deserves a name.
  update public.drafts d
  set title = public.draft_name_from_answers(d.answers, '[]'::jsonb, 'Draft', d.created_at)
  where d.doc_type_id is null
    and (d.title is null or btrim(d.title) = '' or d.title = 'Untitled draft');

  select count(*) into v_after
  from public.drafts
  where title is null or btrim(title) = '' or title = 'Untitled draft';

  raise notice 'OK    % drafts were unnamed; % still are', v_before, v_after;
end $$;

-- ──────────────────────────────────────────────────────────── worked example
-- Proves the rule on the seeded NDA's own field list, so the answer can be
-- read here rather than taken on trust.
do $$
declare
  v_fields jsonb := '[
    {"key":"nda_direction","label":"Direction","type":"select"},
    {"key":"party_a","label":"Your company — legal name and UEN","type":"text"},
    {"key":"party_a_address","label":"Your registered address","type":"textarea"},
    {"key":"party_b","label":"The other side — legal name and UEN","type":"text"},
    {"key":"purpose","label":"What are you working on together?","type":"textarea"}
  ]'::jsonb;
  v_name text;
begin
  v_name := public.draft_name_from_answers(
    '{"party_a":"MERIDIAN LOGISTICS PTE. LTD. (UEN 201812345K)",
      "party_b":"KESTREL ANALYTICS PTE. LTD. (UEN 202045678M)",
      "party_a_address":"8 Shenton Way",
      "purpose":"Route-optimisation analytics."}'::jsonb,
    v_fields, 'Non-Disclosure Agreement', timestamptz '2026-09-17 10:00+08');
  if v_name = 'Meridian Logistics and Kestrel Analytics — Non-Disclosure Agreement' then
    raise notice 'OK    two parties → %', v_name;
  else
    raise notice 'FAIL  two parties → %', v_name;
  end if;

  v_name := public.draft_name_from_answers(
    '{"party_a":"__fd_skipped__","party_b":"__fd_skipped__"}'::jsonb,
    v_fields, 'Non-Disclosure Agreement', timestamptz '2026-09-17 10:00+08');
  if v_name = 'Non-Disclosure Agreement · 17 Sept 2026' then
    raise notice 'OK    nothing answered → %', v_name;
  else
    raise notice 'FAIL  nothing answered → %', v_name;
  end if;

  v_name := public.draft_name_from_answers(
    '{"purpose":"Joint bid for the Tuas port maintenance tender, 2027 season"}'::jsonb,
    v_fields, 'Non-Disclosure Agreement', timestamptz '2026-09-17 10:00+08');
  if v_name = 'Joint bid for the Tuas port maintenance tender — Non-Disclosure Agreement' then
    raise notice 'OK    purpose only → %', v_name;
  else
    raise notice 'FAIL  purpose only → %', v_name;
  end if;
end $$;
