-- ============================================================================
-- 094 — The loan agreement (Beta)
--
-- A tenth assembled document, set up like the services agreement (093):
--
--   1. The document type: slug 'loan', engine 'assembly'. It is new to the
--      catalogue (Fundraising folder); the draft page gives it its own
--      screen (Loan.tsx). There is no FD Lite question bank: the wording is
--      the Founders Doc master loan agreement (Master Loan Agreement
--      Template — Universal, as updated by Rachel), and the questions are
--      the permutations shown by four reference loan agreements — a
--      short-form facility agreement, a term loan with a share pledge, and
--      a bank loan and security agreement with an amendment — built into
--      src/lib/loan. The share pledge is an option, never the usual answer,
--      and is flagged. The user says whether they are the Lender or the
--      Borrower, and the usual answers lean to that side. Listed read-only
--      in Admin → AI files → Questions → Loan Agreement.
--   2. Its folder in AI files: "Loan Agreements".
--   3. PLACEHOLDERS in that folder, for FD to replace by uploading the
--      master and REDACTED reference agreements from the dashboard:
--        - "FD Master Loan Agreement (Universal)"
--        - "FD Loan Reference B — Short-Form Facility Agreement (redacted)"
--        - "FD Loan Reference C — Term Loan with Share Pledge (redacted)"
--        - "FD Loan Reference D — Loan and Security Agreement (redacted)"
--      Filed as needs_review and not permitted, so the AI never reads them.
--      Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "Loan Agreement".
--
-- One credit per agreement; a red flag (an answer that cannot be used, or
-- the Borrower also named as a Lender) stops the draft, refunds the credit
-- and Slack hears (draft_activity_loan if set, else draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_loan', '<hook url>');
--
-- Safe to run twice. Run after 093.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'loan',
  'Loan Agreement',
  'A Singapore-law agreement to lend or borrow money: one lender or several (through an authorised representative), to an individual or a company, including a founder borrowing for their company. Tiered interest, a rate a year, a flat charge or interest-free; repayment on request, at maturity or by instalments. The usual answers lean to the side of the user (Lender or Borrower). Assembled by rule from the Founders Doc master loan agreement; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from the Founders Doc master loan agreement. The AI only flags points for the lawyer (upload the playbook under Playbook → Loan Agreement).',
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
insert into public.ai_folders (name) values ('Loan Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'loan', t.title, t.filename, 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false, t.note,
       'Placeholder — not uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
cross join (values
  ('FD Master Loan Agreement (Universal)', 'PLACEHOLDER_upload_FD_Master_Loan_Agreement_Universal.docx',
   'PLACEHOLDER. Upload the FD master loan agreement (Rachel''s updated version) into this folder with this title, then delete this row. Its wording is built into the code (src/lib/loan/data/master.ts).'),
  ('FD Loan Reference B — Short-Form Facility Agreement (redacted)', 'PLACEHOLDER_upload_Loan_Reference_B_Short_Form_REDACTED.docx',
   'PLACEHOLDER. Upload the REDACTED short-form facility agreement (never a client original) with this title, then delete this row. Reference only: its permutations are built into src/lib/loan.'),
  ('FD Loan Reference C — Term Loan with Share Pledge (redacted)', 'PLACEHOLDER_upload_Loan_Reference_C_Term_Loan_REDACTED.docx',
   'PLACEHOLDER. Upload the REDACTED term loan agreement (never the client original) with this title, then delete this row. Reference only. Its share pledge is not normal for a loan agreement: offered as an option and flagged.'),
  ('FD Loan Reference D — Loan and Security Agreement (redacted)', 'PLACEHOLDER_upload_Loan_Reference_D_Loan_and_Security_REDACTED.docx',
   'PLACEHOLDER. Upload the REDACTED bank loan and security agreement and its amendment (never the client originals) with this title, then delete this row. Reference only, for the shape of security and default provisions.')
) as t(title, filename, note)
where f.name = 'Loan Agreements'
  and not exists (select 1 from public.ai_sources s where s.doc_type_slug = 'loan' and s.title = t.title);

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
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Loan Agreement (Beta) is live in the catalogue. Folder "Loan Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'loan' and version = 'placeholder');
  raise notice 'NEXT  Upload the master and the REDACTED reference agreements into AI files → Loan Agreements and delete the placeholders. Zapier: duplicate the Services Agreement Zap for the loan channel, then select public.set_webhook(''draft_activity_loan'', ''<hook url>'');';
end $$;
