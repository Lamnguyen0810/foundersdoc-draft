import "server-only";

/** Local preview only (no Supabase, so no saved drafts): one sample draft to try "Use an FD AI draft". */
export const SAMPLE_DRAFT = {
  id: "00000000-0000-4000-8000-0000000d0a17",
  title: "Mutual NDA - Northwind Labs (sample)",
  updated_at: new Date(Date.UTC(2026, 10, 5, 6, 0)).toISOString(),
  output: `MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is dated [●].

BETWEEN:

(1) NORTHWIND LABS PTE. LTD. (UEN 201912345K), a company incorporated in Singapore ("Northwind"); and

(2) FOUNDERS DOC PTE. LTD. (UEN [●]), a company incorporated in Singapore ("Founders Doc").

1. PURPOSE

1.1 The parties wish to discuss a possible collaboration (the "Purpose") and, for that Purpose, each may disclose Confidential Information to the other.

2. CONFIDENTIALITY

2.1 Each party shall keep the other party's Confidential Information confidential and shall use it only for the Purpose.

2.2 A party may disclose Confidential Information:

(a) to its employees and advisers who need to know it for the Purpose; and

(b) where required by law, after giving the other party notice where lawful to do so.

3. TERM

3.1 This Agreement lasts for two (2) years from the date above.

4. GOVERNING LAW

4.1 This Agreement is governed by the laws of Singapore.

SIGNED for and on behalf of NORTHWIND LABS PTE. LTD.
Signature: [●]
Name: [●]
Title: [●]

SIGNED for and on behalf of FOUNDERS DOC PTE. LTD.
Signature: [●]
Name: [●]
Title: [●]

DRAFTER'S NOTES

These notes are for the reviewing lawyer and are never part of the signed document.`,
};
