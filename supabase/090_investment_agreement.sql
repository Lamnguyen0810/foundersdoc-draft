-- ============================================================================
-- 090 — The investment agreement (Beta)
--
-- An eighth assembled document, set up like the share subscription
-- agreement (089):
--
--   1. The document type: slug 'ia', engine 'assembly'. The draft page gives
--      it its own screen (Ia.tsx). There is no FD Lite question bank: the
--      questions and wording come from the two Founders Doc investment
--      agreements shared in #fdai-draft-investmentagreement as the
--      reference points — A, a simple investor (company and investor), and
--      B, a lead investor (company, founders and lead investor) — built into
--      src/lib/ia. Listed read-only in Admin → AI files → Questions →
--      Investment Agreement, with the generalisations, the FD supplementary
--      wording and the samples' slips.
--   2. Its folder in AI files: "Investment Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading the
--      REDACTED samples from the dashboard:
--        - "FD IA Sample A — Simple Investor (redacted)"
--        - "FD IA Sample B — Lead Investor (redacted)"
--      Filed as needs_review and not permitted, so the AI never reads them.
--      Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "Investment Agreement".
--
-- One credit per agreement; a red flag (an answer that cannot be used)
-- stops the draft, refunds the credit and Slack hears (draft_activity_ia if
-- set, else draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_ia', 'https://hooks.zapier.com/…');
--
-- Safe to run twice. Run after 089.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'ia',
  'Investment Agreement',
  'An investor puts money into a Singapore company for new (usually preference) shares: one investor on simple terms, or a lead investor with conditions, founder warranties, a board seat and the preference share terms. Assembled by rule from Founders Doc''s own investment agreements; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from Founders Doc investment agreements. The AI only flags points for the lawyer (upload the playbook under Playbook → Investment Agreement).',
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
insert into public.ai_folders (name) values ('Investment Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'ia', t.title, t.filename, 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false, t.note,
       'Placeholder — not uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
cross join (values
  ('FD IA Sample A — Simple Investor (redacted)', 'PLACEHOLDER_upload_IA_Sample_A_Simple_Investor_REDACTED.docx',
   'PLACEHOLDER. Upload IA_Sample_A_Simple_Investor_REDACTED.docx (the redacted copy only — never the client original) into this folder with this title, then delete this row. Its wording is built into the code (src/lib/ia/data/master.ts).'),
  ('FD IA Sample B — Lead Investor (redacted)', 'PLACEHOLDER_upload_IA_Sample_B_Lead_Investor_REDACTED.docx',
   'PLACEHOLDER. Upload IA_Sample_B_Lead_Investor_REDACTED.docx (the redacted copy only — never the client original) into this folder with this title, then delete this row. Its wording is built into the code (src/lib/ia/data/master.ts).')
) as t(title, filename, note)
where f.name = 'Investment Agreements'
  and not exists (select 1 from public.ai_sources s where s.doc_type_slug = 'ia' and s.title = t.title);

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
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Investment Agreement (Beta) is live in the catalogue. Folder "Investment Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'ia' and version = 'placeholder');
  raise notice 'NEXT  Upload the two REDACTED samples into AI files → Investment Agreements and delete the placeholders. Zapier: duplicate the SSA Zap for #fdai-draft-investmentagreement, then select public.set_webhook(''draft_activity_ia'', ''<hook url>'');';
end $$;
