-- ============================================================================
-- 087 — The shareholders agreement (Beta, Complex version)
--
-- A fifth assembled document, set up like the contractor agreement (083/084):
--
--   1. The document type: slug 'sha', engine 'assembly'. The draft page
--      gives it its own screen (Sha.tsx); the questions are the firm's
--      "FDL [SHA]: TF Qns" (Final Clean, 24 April 2025), built into
--      src/lib/sha, and FD AI assembles the agreement from the FD Lite SHA
--      master of 14 April 2025 (transcribed in src/lib/sha/data/master.ts).
--      Listed read-only in Admin → AI files → Questions → Shareholders'
--      Agreement, with the Master Menu, the FD supplementary wording and
--      the master's slips fixed in transcription.
--   2. Its folder in AI files: "Shareholders Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading from
--      the dashboard:
--        - "FD Lite Shareholders Agreement Master" — the REDACTED Word file
--          (FD_Lite_SHA_Master_140425_REDACTED.docx: tracked changes
--          accepted, comments and hidden metadata removed, client details
--          replaced by placeholders)
--        - "Shareholders Agreement — Master Menu" — the menu of 8 April 2025
--      They are filed as needs_review and not permitted, so the AI never
--      reads them. Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "Shareholders Agreement".
--
-- One credit per agreement, as for the contractor agreement; a red flag
-- stops the draft, refunds the credit and Slack hears (draft_activity_sha
-- if set, else draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_sha', 'https://hooks.zapier.com/…');
--
-- Safe to run twice. Run after 086.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'sha',
  'Shareholders Agreement',
  'How founders and investors run the company: the board, meetings, reserved matters, pre-emption, transfers (first offer, tag- and drag-along), exits, defaults, founder vesting and leavers. Assembled from the FD Lite Shareholders Agreement master (Singapore) by rule; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from the FD Lite shareholders agreement master. The AI only flags points for the lawyer (upload the playbook under Playbook → Shareholders Agreement).',
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
-- An earlier copy of this file spelt it "Shareholders' Agreements": rename it
-- (and its placeholders) if that copy was run.
update public.ai_folders set name = 'Shareholders Agreements'
 where name = 'Shareholders'' Agreements'
   and not exists (select 1 from public.ai_folders where name = 'Shareholders Agreements');
update public.ai_sources set title = replace(title, 'Shareholders'' Agreement', 'Shareholders Agreement')
 where doc_type_slug = 'sha' and title like '%Shareholders'' Agreement%';

insert into public.ai_folders (name) values ('Shareholders Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'sha', 'FD Lite Shareholders Agreement Master', 'PLACEHOLDER_upload_the_master.docx', 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload FD_Lite_SHA_Master_140425_REDACTED.docx (the master of 14 April 2025, redacted) into this folder with this title, then delete this row. The same wording is transcribed in the code (src/lib/sha/data/master.ts).',
       'Placeholder — the FD Lite Shareholders Agreement master has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Shareholders Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'sha' and title = 'FD Lite Shareholders Agreement Master');

insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'sha', 'Shareholders Agreement — Master Menu', 'PLACEHOLDER_upload_the_master_menu.docx', 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the Master Menu (8 April 2025) as Word or PDF into this folder with this title, then delete this row. Its Standard and Basic ticks are needed before FD AI offers those versions; the code''s own map is under Questions → Shareholders Agreement.',
       'Placeholder — the SHA Master Menu has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Shareholders Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'sha' and title = 'Shareholders Agreement — Master Menu');

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
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Shareholders Agreement (Beta, Complex) is live in the catalogue. Folder "Shareholders Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'sha' and version = 'placeholder');
  raise notice 'NEXT  Upload the redacted master into AI files → Shareholders Agreements and delete its placeholder. Zapier: duplicate the contractor Zap for the SHA channel, then select public.set_webhook(''draft_activity_sha'', ''<hook url>'');';
end $$;
