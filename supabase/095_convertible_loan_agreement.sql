-- ============================================================================
-- 095 — The convertible loan agreement (Beta)
--
-- An eleventh assembled document, set up like the loan agreement (094):
--
--   1. The document type: slug 'cln', engine 'assembly', in the Fundraising
--      folder of the catalogue; the draft page gives it its own screen
--      (Cln.tsx). The wording is the Founders Doc master (Convertible Loan
--      Agreement — Master Template), built into src/lib/cln; its bracketed
--      choices and drafting notes are the questions, and its Schedule 3
--      (Jurisdiction Rider) is filled from the governing law the user picks
--      (Singapore, England and Wales, Hong Kong, Delaware, New York, or
--      another, left as [●] and flagged). The user says whether they are the
--      Company or the Investor, and the usual answers lean to that side.
--      FD AI reviews the answers for points for the lawyer
--      (src/lib/ai/review.ts). Listed read-only in Admin → AI files →
--      Questions → Convertible Loan Agreement.
--   2. Its folder in AI files: "Convertible Loan Agreements".
--   3. A PLACEHOLDER in that folder, for FD to replace by uploading the
--      master from the dashboard: "FD Master Convertible Loan Agreement".
--      Filed as needs_review and not permitted, so the AI never reads it.
--      Delete it once the real file is uploaded.
--   4. Slack calls it "Convertible Loan Agreement".
--
-- One credit per agreement; a red flag (an answer that cannot be used, or
-- the Company also named as the Investor) stops the draft, refunds the
-- credit and Slack hears (draft_activity_cln if set, else draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_cln', '<hook url>');
--
-- Safe to run twice. Run after 094.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'cln',
  'Convertible Loan Agreement',
  'A convertible loan from one investor to a company, converting into ordinary shares at a qualifying round, a sale or listing, or at maturity: valuation cap (pre- or post-money), optional discount, interest paid at maturity, an Exercise Notice and the conversion calculation. Singapore, England and Wales, Hong Kong, Delaware, New York or another law. The usual answers lean to the side of the user (Company or Investor). Assembled by rule from the Founders Doc master convertible loan agreement; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from the Founders Doc master convertible loan agreement. The AI only flags points for the lawyer (upload the playbook under Playbook → Convertible Loan Agreement).',
  '[]'::jsonb,
  'assembly',
  true
)
on conflict (slug) do update
  set label       = excluded.label,
      description = excluded.description,
      engine      = 'assembly',
      is_active   = true,
      updated_at  = now();

-- 2. Its folder ----------------------------------------------------------------
insert into public.ai_folders (name) values ('Convertible Loan Agreements') on conflict (name) do nothing;

-- 3. The placeholder -------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'cln', 'FD Master Convertible Loan Agreement', 'PLACEHOLDER_upload_FD_Master_Convertible_Loan_Agreement.docx', 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the FD master convertible loan agreement (Convertible Loan Agreement — Master Template) into this folder with this title, then delete this row. Its wording is built into the code (src/lib/cln/data/master.ts).',
       'Placeholder — not uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Convertible Loan Agreements'
  and not exists (select 1 from public.ai_sources s where s.doc_type_slug = 'cln' and s.title = 'FD Master Convertible Loan Agreement');

-- 4. Slack's name for it ----------------------------------------------------------
create or replace function public.doc_short_name(p_slug text)
returns text
language sql
immutable
as $$
  select case p_slug
    when 'nda'        then 'NDA'
    when 'term'       then 'Term Sheet'
    when 'employment' then 'Employment Contract'
    when 'contractor' then 'Contractor Agreement'
    when 'cofounder'  then 'Co-Founder Agreement'
    when 'sha'        then 'Shareholders Agreement'
    when 'spa'        then 'SPA'
    when 'ssa'        then 'SSA'
    when 'ia'         then 'Investment Agreement'
    when 'services'   then 'Services Agreement'
    when 'loan'       then 'Loan Agreement'
    when 'cln'        then 'Convertible Loan Agreement'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Convertible Loan Agreement (Beta) is live in the catalogue. Folder "Convertible Loan Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'cln' and version = 'placeholder');
  raise notice 'NEXT  Upload the master into AI files → Convertible Loan Agreements and delete the placeholder. Zapier: duplicate the Loan Agreement Zap for the CLN channel, then select public.set_webhook(''draft_activity_cln'', ''<hook url>'');';
end $$;
