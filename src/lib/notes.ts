/**
 * The playbook's in-text note for the reviewing lawyer: [FD Note: …].
 *
 * The playbook wraps it in bold italic, **_[FD Note: …]_**, but the model
 * does not always write the marks that way: ***[FD Note: …]***, _**[…]**_
 * and **[…].** all turn up. Taking the note out with only some of its marks
 * left the rest on the page — a draft with six notes at the top showed six
 * lines of "**". So every mix of up to three * or _ on either side goes with
 * the note, and a note may itself contain a gap, "[●]", without ending there.
 */

/** Up to three * or _ before the note. */
const OPEN = String.raw`[*_]{0,3}`;
/** The note; group 1 is its text. Square brackets inside it ("[●]") are allowed. */
const BODY = String.raw`\[\s*FD Note:\s*((?:[^\[\]]|\[[^\[\]]*\])*)\]`;
/** Its closing marks, and a full stop tucked inside them ("…]._**"). */
const CLOSE = String.raw`(?:\.?[*_]{1,3})?`;

/** A whole note with its marks. Group 1 is the note's text. */
export const noteSource = OPEN + BODY + CLOSE;

/** Every whole note in a text (global). */
export const noteRe = () => new RegExp(noteSource, "gi");

/** A text that is exactly one note with its marks. Group 1 is the note's text. */
export const wholeNoteRe = new RegExp(`^${noteSource}$`, "i");

/** A paragraph left with nothing but marks once its notes are gone. */
export const onlyMarks = /^[ \t]*[*_]+[ \t]*$/gm;
