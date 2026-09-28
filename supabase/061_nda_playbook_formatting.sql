-- ============================================================================
-- 061 · The NDA playbook: formatting and layout (the HitPay template)
-- ============================================================================
--
-- The firm chose the layout of its one-way NDA template (Dec 2022) for every
-- NDA FD AI drafts. Formatting belongs in the playbook, so this saves a NEW
-- version of the NDA playbook: a FORMATTING AND LAYOUT section at the top,
-- followed by the live NDA playbook exactly as it is now. Nothing in the
-- existing text is changed or removed.
--
-- The section is formatting only. It says how the draft is set out (numbering,
-- headings, bold, signature blocks) and what the page and the Word file are
-- set in (the key: value lines, which FD AI reads: lib/playbook.ts). It says
-- nothing about what any clause contains.
--
-- Run AFTER patch 0049 is live. Safe to run again: if the live NDA playbook
-- already has the section, nothing happens.
--
-- To undo: Admin dashboard → AI files → Playbook → NDA → restore the
-- previous version.
-- ============================================================================

do $$
declare
  v_old     text;
  v_section text := $fmt$FORMATTING AND LAYOUT

This section governs how an NDA is formatted and set out. Where anything later in this playbook describes formatting differently, this section wins. It is about formatting only and says nothing about what the clauses contain. The title and the opening line are not affected.

House style (FD AI reads these lines to set the page on screen and the Word file):
layout: formal
font: Arial
body_size_pt: 10
line_spacing: 1.26
space_after_pt: 12
heading_space_before_pt: 0
heading_space_after_pt: 12
alignment_body: justified

What that means: A4 with one-inch margins; Arial 10 point, justified; lines at 1.1 in Word; a blank line's worth of space after every paragraph; page numbers ("Page 1 of 3") centred at the foot of every page. The application sets all of this; do not write it into the text.

F1. After the opening line, a line reading only "Between:".

F2. Parties. Each party is its own paragraph, numbered (1), (2). The party's name is in bold.

F3. Background. A line reading only "WHEREAS:", then each recital as its own paragraph, numbered (A), (B).

F4. The words that introduce the clauses are in bold, as their own paragraph.

F5. Clause headings. Each on its own line, numbered and in capitals: 1. CONFIDENTIALITY. They are set bold with the words underlined, the number hung in the margin.

F6. Sub-clauses. Numbered 1.1, 1.2 and so on. Each begins with a short heading in bold ending in a full stop, then its text: 1.1 **Confidential Information.** Under this Agreement, …

F7. Lists. A list inside a sub-clause is lettered (a), (b), (c), each item on its own line. A list inside an item is numbered (i), (ii). Words that continue a sub-clause after its list are their own paragraph, with no number.

F8. Defined terms. In bold, in quotation marks and brackets where they are first defined: (the "**Purpose**").

F9. Paragraphs. Every paragraph is separated by a blank line. Bold is written between double asterisks: **like this**.

F10. Signature blocks. At the end, one block per party. The blocks are set side by side, each under a line to sign on, which the application draws. Write each block's lines on consecutive lines, with a blank line between one party's block and the next:
For and on behalf of
**<PARTY NAME>**
Name: [●]
Title: [●]
For a party who is an individual, write "Signed by" instead of "For and on behalf of". Where the answers give the signatory's name or title, write it in place of the [●]. There is no "Signature:" line (the line to sign on is drawn) and no "Date:" line (the agreement is dated at the top).$fmt$;
  v_content text;
begin
  select content into v_old from public.playbooks where scope = 'nda' and live;

  if v_old is not null and position('FORMATTING AND LAYOUT' in v_old) > 0 and position('layout: formal' in v_old) > 0 then
    raise notice 'SKIP  the live NDA playbook already has the formatting section';
    return;
  end if;

  v_content := v_section || coalesce(E'\n\n' || v_old, '');

  update public.playbooks set live = false where scope = 'nda' and live;

  insert into public.playbooks (scope, version, content, filename, note, live, saved_by_email)
  values (
    'nda',
    coalesce((select max(version) from public.playbooks where scope = 'nda'), 0) + 1,
    v_content,
    null,
    'Formatting and layout from the HitPay NDA template (patch 0049). The rest of the playbook is unchanged.',
    true,
    'FD AI patch 0049'
  );

  raise notice 'OK    NDA playbook saved as a new live version with the formatting section at the top';
  if v_old is null then
    raise notice 'NOTE  there was no NDA playbook before; the new one holds the formatting section only';
  end if;
end;
$$;

-- ─── check ─────────────────────────────────────────────────────────────────
--   select version, live, note, left(content, 60) from public.playbooks where scope = 'nda' order by version desc limit 3;
