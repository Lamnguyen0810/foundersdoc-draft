-- ===========================================================================
-- FDAI — the AI source library
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- WHAT THIS IS
--   The worked example documents Gemini reads when it drafts. Until now they
--   were baked into the code (src/lib/examples/*.txt), which meant nobody
--   could add one, replace one or delete one without a deployment — and the
--   admin console had nothing to show for them.
--
--   They live here now, as rows an administrator manages from the AI files
--   tab. The two NDAs that were in the code are imported below so that
--   drafting carries on exactly as before, and so that they appear in the
--   table as ordinary documents to be deleted once the firm's own samples
--   are in.
--
-- WHAT REACHES THE MODEL
--   Only a source whose status is 'ready'. A freshly uploaded file starts at
--   'needs_review', and it takes a human review (privacy judged) and an
--   approval to get to 'ready'. Nothing is sent to Gemini on upload.
--
-- WHO MAY SEE WHAT
--   The library is admin-only: every read and write on these tables requires
--   public.is_admin(). Drafting, which runs as the ordinary signed-in user,
--   reaches the READY sources through one SECURITY DEFINER function that
--   returns nothing else — not the notes, not who uploaded what, not the
--   ones still under review.
-- ===========================================================================

-- ------------------------------------------------------------------ folders
create table if not exists public.ai_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ sources
create table if not exists public.ai_sources (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid references public.ai_folders (id) on delete set null,

  -- Which document type this is an example FOR. An NDA sample is read when
  -- somebody drafts an NDA and at no other time.
  doc_type_slug text not null references public.doc_types (slug) on update cascade,

  title         text not null check (length(trim(title)) between 1 and 200),
  filename      text not null,
  file_ext      text not null check (file_ext in ('pdf', 'docx', 'doc', 'txt')),
  jurisdiction  text not null default 'Singapore',
  version       text,

  -- Privacy is a judgement a person records. The flags are what the upload
  -- scan found — counts of things that look like UENs, NRICs, email
  -- addresses — to help that person, not to replace them.
  privacy       text not null default 'pending'
                check (privacy in ('pending', 'clear', 'redacted', 'needs_redaction')),
  privacy_flags jsonb not null default '{}'::jsonb,

  status        text not null default 'needs_review'
                check (status in ('needs_review', 'reviewed', 'processing', 'ready')),

  -- The upload form's "Source is permitted for internal AI use" box.
  permitted     boolean not null default false,
  note          text,

  -- What Gemini reads. Extracted from the file on upload, on the server.
  content       text not null,
  bytes         integer not null check (bytes >= 0),

  uploaded_by   uuid references auth.users (id) on delete set null,
  uploaded_by_email text,
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ai_sources_type_status_idx on public.ai_sources (doc_type_slug, status);
create index if not exists ai_sources_folder_idx on public.ai_sources (folder_id);

drop trigger if exists ai_sources_touch on public.ai_sources;
create trigger ai_sources_touch before update on public.ai_sources
  for each row execute function public.touch_updated_at();

-- A source is only 'ready' if a person has judged its privacy and it is
-- permitted for AI use. The constraint is the rule; the UI merely reflects it.
alter table public.ai_sources drop constraint if exists ai_sources_ready_requires_review;
alter table public.ai_sources add constraint ai_sources_ready_requires_review
  check (status <> 'ready' or (privacy in ('clear', 'redacted') and permitted));

-- ------------------------------------------------------------------ RLS
alter table public.ai_folders enable row level security;
alter table public.ai_sources enable row level security;

drop policy if exists "ai_folders: admin" on public.ai_folders;
create policy "ai_folders: admin" on public.ai_folders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ai_sources: admin" on public.ai_sources;
create policy "ai_sources: admin" on public.ai_sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- WHAT DRAFTING READS
-- The one opening through the admin-only wall: the READY examples for one
-- document type, as title and text and nothing else.
-- ===========================================================================
create or replace function public.ai_examples_for(p_slug text)
returns table (title text, text text)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, s.content
  from public.ai_sources s
  where s.doc_type_slug = p_slug
    and s.status = 'ready'
  order by s.approved_at nulls last, s.created_at;
$$;

grant execute on function public.ai_examples_for(text) to authenticated;

-- ===========================================================================
-- IMPORT THE TWO NDAs THAT WERE IN THE CODE
-- Once each. They are fictional documents written to develop the product —
-- no real party, UEN or deal — so they are imported as clear, permitted and
-- ready, which is exactly how the code was treating them.
-- ===========================================================================
insert into public.ai_folders (name) values ('NDAs') on conflict (name) do nothing;

insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email, approved_at)
select f.id, 'nda', $ai$NDA-01 Mutual Standard (SG)$ai$, $ai$NDA-01_Mutual_Standard_SG.txt$ai$, 'txt', 'Singapore', null,
       'clear', 'ready', true, $ai$Auto-generated sample used during development. Replace with the firm's own.$ai$, $ai$MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement (this "Agreement") is made on 14 March 2026

BETWEEN:

(1) MERIDIAN LOGISTICS PTE. LTD. (UEN 201812345K), a company incorporated in Singapore with its registered office at 8 Jurong Port Road, #04-11, Singapore 619092 ("Meridian"); and

(2) KESTREL ANALYTICS PTE. LTD. (UEN 202045678M), a company incorporated in Singapore with its registered office at 71 Ayer Rajah Crescent, #02-18, Singapore 139951 ("Kestrel"),

each a "Party" and together the "Parties".

BACKGROUND

A. The Parties wish to explore a potential commercial arrangement under which Kestrel would provide route-optimisation analytics services in respect of Meridian's regional distribution network (the "Purpose").

B. In connection with the Purpose, each Party may disclose to the other certain confidential and proprietary information. The Parties enter into this Agreement to protect that information.

IT IS AGREED as follows:

1. DEFINITIONS

1.1 "Confidential Information" means all information disclosed by or on behalf of a Party (the "Discloser") to the other Party (the "Recipient") in connection with the Purpose, whether before or after the date of this Agreement, in any form and whether or not marked as confidential, including business plans, customer and supplier lists, pricing, route and volume data, forecasts, software, algorithms, source code, technical specifications, and the existence and contents of this Agreement and of the discussions between the Parties.

1.2 "Representatives" means, in relation to a Party, its directors, officers, employees, professional advisers and subcontractors who need to know the Confidential Information for the Purpose.

2. OBLIGATIONS OF THE RECIPIENT

2.1 The Recipient shall keep the Confidential Information confidential and shall not disclose it to any person other than its Representatives.

2.2 The Recipient shall use the Confidential Information solely for the Purpose and for no other purpose, and in particular shall not use it to compete with the Discloser or to solicit the Discloser's customers.

2.3 The Recipient shall apply to the Confidential Information at least the same degree of care that it applies to its own confidential information of like importance, and in no event less than a reasonable degree of care.

2.4 The Recipient shall ensure that each of its Representatives to whom Confidential Information is disclosed is made aware of, and complies with, obligations of confidentiality no less onerous than those in this Agreement. The Recipient remains liable for any act or omission of its Representatives that would be a breach of this Agreement if done by the Recipient.

3. EXCEPTIONS

3.1 The obligations in clause 2 do not apply to information which the Recipient can demonstrate by written records:

(a) is or becomes publicly available otherwise than through breach of this Agreement;

(b) was lawfully in the Recipient's possession, free of any obligation of confidence, before it was disclosed by the Discloser;

(c) is lawfully received from a third party who is free to disclose it; or

(d) is independently developed by the Recipient without use of or reference to the Confidential Information.

3.2 The Recipient may disclose Confidential Information to the extent required by law, by a court of competent jurisdiction or by a regulatory authority, provided that (where lawful and practicable) it gives the Discloser prompt written notice so that the Discloser may seek protective measures, and discloses only the minimum required.

4. NO LICENCE, NO REPRESENTATION

4.1 All Confidential Information remains the property of the Discloser. Nothing in this Agreement grants the Recipient any licence or other right in respect of the Confidential Information or any intellectual property of the Discloser, whether by implication or otherwise.

4.2 Neither Party makes any representation or warranty as to the accuracy or completeness of any Confidential Information disclosed by it. Neither Party shall be liable to the other in respect of any reliance placed on such information.

5. RETURN AND DESTRUCTION

5.1 On written request by the Discloser, or on termination of the discussions relating to the Purpose, the Recipient shall promptly return or destroy all Confidential Information in its possession and shall confirm in writing that it has done so.

5.2 Clause 5.1 does not require the deletion of copies retained in routine electronic backups made in the ordinary course of business, or of copies which the Recipient is required to retain by law or by the rules of a professional body, provided that such copies remain subject to this Agreement for as long as they are retained.

6. NO OBLIGATION TO PROCEED

Nothing in this Agreement obliges either Party to enter into any further agreement, to continue discussions, or to disclose any particular information. Each Party may terminate discussions at any time without liability.

7. TERM

7.1 This Agreement takes effect on the date first written above and continues for two (2) years, unless terminated earlier by either Party on thirty (30) days' written notice.

7.2 The obligations in clauses 2, 3, 4, 5 and 8 survive termination or expiry and continue for three (3) years from the date of termination or expiry.

8. REMEDIES

The Parties acknowledge that damages alone may not be an adequate remedy for breach of this Agreement, and that the Discloser shall be entitled to seek injunctive relief, specific performance or other equitable remedy in respect of any actual or threatened breach, without the need to prove special damage.

9. GENERAL

9.1 This Agreement constitutes the entire agreement between the Parties in respect of its subject matter and supersedes all prior discussions and understandings relating to it.

9.2 No variation of this Agreement is effective unless in writing and signed by both Parties.

9.3 No failure or delay by a Party in exercising a right is a waiver of that right.

9.4 If any provision is held invalid or unenforceable, the remaining provisions continue in full force, and the invalid provision shall be modified to the minimum extent necessary to make it enforceable.

9.5 Neither Party may assign or transfer this Agreement without the prior written consent of the other Party, such consent not to be unreasonably withheld.

9.6 A person who is not a Party to this Agreement has no right under the Contracts (Rights of Third Parties) Act 2001 to enforce any of its terms.

9.7 This Agreement may be executed in counterparts, each of which is an original and which together constitute one agreement. Signatures transmitted electronically are treated as originals.

10. GOVERNING LAW AND JURISDICTION

This Agreement and any dispute or claim arising out of or in connection with it are governed by the laws of Singapore. The Parties submit to the exclusive jurisdiction of the courts of Singapore.

SIGNED for and on behalf of MERIDIAN LOGISTICS PTE. LTD.

Name: Adeline Foo
Title: Chief Operating Officer
Date: 14 March 2026

SIGNED for and on behalf of KESTREL ANALYTICS PTE. LTD.

Name: Rahul Menon
Title: Director
Date: 14 March 2026
$ai$, 7172,
       'imported from code', now()
from public.ai_folders f
where f.name = 'NDAs'
  and not exists (select 1 from public.ai_sources where filename = $ai$NDA-01_Mutual_Standard_SG.txt$ai$);

insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email, approved_at)
select f.id, 'nda', $ai$NDA-04 Short Form (SG)$ai$, $ai$NDA-04_ShortForm_SG.txt$ai$, 'txt', 'Singapore', null,
       'clear', 'ready', true, $ai$Auto-generated sample used during development. Replace with the firm's own.$ai$, $ai$SHORT-FORM MUTUAL NON-DISCLOSURE AGREEMENT

Date: 9 June 2026

Parties: HARBOURLINE FOODS PTE. LTD. (UEN 202088776C), 25 Pandan Loop, #03-04, Singapore 128424, and SABLE & GROVE PTE. LTD. (UEN 202312009H), 60 Tras Street, #02-01, Singapore 078999.

Purpose: To discuss a possible co-manufacturing arrangement for chilled ready meals.

1. Each party may disclose confidential information to the other for the Purpose. Confidential information means any non-public information disclosed in connection with the Purpose, in any form, including recipes, specifications, costings, supplier terms and customer information.

2. The receiving party shall keep that information confidential, use it only for the Purpose, and disclose it only to those of its personnel and professional advisers who need to know it and who are bound to keep it confidential. The receiving party is responsible for their compliance.

3. Clause 2 does not apply to information which is public other than through breach of this agreement, was already lawfully held by the receiving party, is received from a third party free to disclose it, or is independently developed. A party may disclose where required by law or a regulator, giving the other party notice where it lawfully can.

4. No licence or other right in any intellectual property is granted. No party is obliged to proceed with the Purpose or to disclose anything.

5. On request, the receiving party shall return or destroy the confidential information, except for copies held in routine backups or required to be retained by law.

6. These obligations apply for two (2) years from the date of this agreement.

7. Damages may not be an adequate remedy and either party may seek injunctive relief.

8. This agreement is governed by Singapore law and the parties submit to the exclusive jurisdiction of the Singapore courts.

Signed:

For HARBOURLINE FOODS PTE. LTD.        For SABLE & GROVE PTE. LTD.
Name: Marcus Leong                      Name: Josephine Idris
Title: Managing Director                Title: Head of Operations
$ai$, 2061,
       'imported from code', now()
from public.ai_folders f
where f.name = 'NDAs'
  and not exists (select 1 from public.ai_sources where filename = $ai$NDA-04_ShortForm_SG.txt$ai$);


-- ###########################################################################
-- ##  VERIFICATION                                                         ##
-- ###########################################################################
do $$
declare ok boolean; n integer;
begin
  select count(*) = 1 into ok from pg_proc where proname = 'ai_examples_for';
  raise notice '% ai_examples_for()', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) into n from public.ai_sources where doc_type_slug = 'nda' and status = 'ready';
  raise notice '% % ready NDA source(s) — drafting an NDA reads these', case when n >= 2 then 'OK   ' else 'FAIL ' end, n;
end $$;
