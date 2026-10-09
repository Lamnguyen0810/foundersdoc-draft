-- ============================================================================
-- 086 — The co-founder agreement (Beta)
--
-- A fourth assembled document, set up like the contractor agreement (083):
--
--   1. The document type: slug 'cofounder', engine 'assembly'. The draft
--      page gives it its own screen (Cofounder.tsx); the questions are the
--      firm's twenty-five (FDL CFA I TF Questions, 4 June 2025, with the
--      June 2025 bug-test changes), built into src/lib/cofounder, and listed
--      read-only in Admin → AI files → Questions → Co-Founder Agreement,
--      with the master menu beneath.
--   2. Its folder in AI files: "Co-Founder Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading from
--      the dashboard:
--        - "FD Master Co-Founders Agreement"  — the master wording (redacted)
--        - "Co-Founder Agreement — Clause Sheet" — the Gsheet of June 2025:
--          question → answer → clause text, with the default answers
--      They are filed as needs_review and not permitted, so the AI never
--      reads them. Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "Co-Founder Agreement".
--
-- Until the master is transcribed into src/lib/cofounder/data/master.ts, a
-- co-founder draft is saved as `stopped` with the answers and the review
-- points, Slack hears (via draft_activity_cofounder if set, else
-- draft_activity), and a lawyer sends the draft by hand. No credit is taken.
--
-- Slack: select public.set_webhook('draft_activity_cofounder', 'https://hooks.zapier.com/…');
--
-- Safe to run twice.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'cofounder',
  'Co-Founder Agreement',
  'Set out how the co-founders run the startup: the split, vesting, roles, decisions, deadlock, leavers and exit. Assembled from the FD Master Co-Founders Agreement (Singapore) by rule from twenty-five questions; FD AI flags points for the lawyer. Beta: until the master is loaded, the answers are saved and the firm sends the draft.',
  '[]'::jsonb,
  'Assembled from the FD master co-founders agreement. The AI only flags points for the lawyer (upload the playbook under Playbook → Co-Founder Agreement).',
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
insert into public.ai_folders (name) values ('Co-Founder Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'cofounder', 'FD Master Co-Founders Agreement', 'PLACEHOLDER_upload_the_master.docx', 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the firm''s master co-founders agreement (Word, hidden metadata removed) into this folder with this title, then delete this row. Lam transcribes it into the assembler and the Beta drafts by itself.',
       'Placeholder — the FD Master Co-Founders Agreement has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Co-Founder Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'cofounder' and title = 'FD Master Co-Founders Agreement');

insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'cofounder', 'Co-Founder Agreement — Clause Sheet', 'PLACEHOLDER_upload_the_clause_sheet.pdf', 'pdf', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the CFA Gsheet of June 2025 (question → answer → clause text, with the default answers) as PDF (File → Download → PDF) into this folder with this title, then delete this row. The code''s own map is under Questions → Co-Founder Agreement.',
       'Placeholder — the clause sheet has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Co-Founder Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'cofounder' and title = 'Co-Founder Agreement — Clause Sheet');

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
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Co-Founder Agreement (Beta) is live in the catalogue. Folder "Co-Founder Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'cofounder' and version = 'placeholder');
  raise notice 'NEXT  Zapier: duplicate the contractor Zap for #fdai-draft-cfa, then select public.set_webhook(''draft_activity_cofounder'', ''<hook url>'');';
end $$;
