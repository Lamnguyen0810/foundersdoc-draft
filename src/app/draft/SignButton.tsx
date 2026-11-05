"use client";

/* "Send for signing" beside Download Word (0190): opens FD Sign with this
   draft as the document. The draft's saved text is used, so the PDF matches
   what was last saved. Hidden until the draft is saved (no id yet). */
export default function SignButton({ draftId, disabled }: { draftId: string | null; disabled?: boolean }) {
  if (!draftId) return null;
  return (
    <a
      className="dbtn"
      href={`/fd-sign/new?draft=${encodeURIComponent(draftId)}`}
      aria-disabled={disabled || undefined}
      onClick={(e) => disabled && e.preventDefault()}
      title="Send this draft for signing with FD Sign: signers get an email, no account needed"
    >
      Send for signing
    </a>
  );
}
