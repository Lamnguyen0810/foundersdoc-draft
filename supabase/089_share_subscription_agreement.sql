-- ============================================================================
-- 089 — The share subscription agreement (Beta)
--
-- A seventh assembled document, set up like the share purchase agreement
-- (088):
--
--   1. The document type: slug 'ssa', engine 'assembly'. The draft page
--      gives it its own screen (Ssa.tsx). The questions are the firm's
--      "FD LITE QUESTIONS BANK I SHARE SUBSCRIPTION AGREEMENT [FOR
--      INVESTORS]", all three versions (Basic / Standard / Complex), built
--      into src/lib/ssa. No FD Lite SSA template was available, so the
--      wording follows the Singapore VIMA Model Subscription Agreement,
--      simplified to the bank's versions. Listed read-only in Admin → AI
--      files → Questions → Share Subscription Agreement, with the source of
--      each part, the FD supplementary wording and VIMA's slips.
--   2. Its folder in AI files: "Share Subscription Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading from
--      the dashboard:
--        - "FD Lite SSA — Question Bank" (FD_Lite_I_Qns_Bank_SSA.docx)
--        - "FD Lite SSA — Template" (the FD Lite template, when found: the
--          code's wording then moves to it)
--      Filed as needs_review and not permitted, so the AI never reads them.
--      Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "SSA".
--
-- One credit per agreement; a red flag (company not incorporated, existing
-- shares transferred, company or investor not a party) stops the draft,
-- refunds the credit and Slack hears (draft_activity_ssa if set, else
-- draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_ssa', 'https://hooks.zapier.com/…');
--
-- Safe to run twice. Run after 088.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'ssa',
  'Share Subscription Agreement',
  'An investor subscribes for new shares in a Singapore company: the shares and amount, completion, warranties, caps and undertakings, in the FD Lite Basic, Standard or Complex version. Assembled by rule from the firm''s question bank; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from the FD Lite share subscription agreement question bank. The AI only flags points for the lawyer (upload the playbook under Playbook → Share Subscription Agreement).',
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
insert into public.ai_folders (name) values ('Share Subscription Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'ssa', t.title, t.filename, 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false, t.note,
       'Placeholder — not uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
cross join (values
  ('FD Lite SSA — Question Bank', 'PLACEHOLDER_upload_the_question_bank.docx',
   'PLACEHOLDER. Upload FD_Lite_I_Qns_Bank_SSA.docx into this folder with this title, then delete this row. The same questions are built into the code (src/lib/ssa/data/questionnaire.ts).'),
  ('FD Lite SSA — Template', 'PLACEHOLDER_upload_the_template.docx',
   'PLACEHOLDER. Upload the FD Lite Share Subscription Agreement template (from #fdai-draft-ssa-investors → Template) with this title, then delete this row. Until then the wording follows the VIMA model (src/lib/ssa/data/master.ts).')
) as t(title, filename, note)
where f.name = 'Share Subscription Agreements'
  and not exists (select 1 from public.ai_sources s where s.doc_type_slug = 'ssa' and s.title = t.title);

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
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Share Subscription Agreement (Beta) is live in the catalogue. Folder "Share Subscription Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'ssa' and version = 'placeholder');
  raise notice 'NEXT  Upload the question bank (and the FD Lite template, when found) into AI files → Share Subscription Agreements and delete the placeholders. Zapier: duplicate the SPA Zap for #fdai-draft-ssa-investors, then select public.set_webhook(''draft_activity_ssa'', ''<hook url>'');';
end $$;
