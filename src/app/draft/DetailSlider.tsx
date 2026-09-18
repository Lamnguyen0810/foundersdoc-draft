"use client";

/**
 * How comprehensive the NDA should be — one card, one vocabulary.
 *
 * There were two of these: the card on the drafting question, and a smaller,
 * plainer one beside the finished document. They disagreed. The question card
 * called level 2 "Basic"; the one beside the document called the same level
 * "Standard" — and both were on screen at once, one saying "2/5 · Basic" in
 * the answer summary and the other "2/5 · Standard" directly underneath.
 *
 * So there is now one component and one list of names, used in both places,
 * and a level cannot be called two things again.
 */

/** The five steps, in order. The NUMBER is what reaches the prompt; these
 *  words are only how it reads on screen. */
export const DETAIL_LABELS = ["Minimal", "Basic", "Standard", "Detailed", "Comprehensive"] as const;

export const DETAIL_LENGTHS = [
  "about 500–800 words",
  "about 750–1,050 words",
  "about 1,000–1,400 words",
  "about 1,250–1,750 words",
  "about 1,500–2,200 words",
] as const;

export type DetailLevel = 1 | 2 | 3 | 4 | 5;

/** Anything at all, clamped to a level that exists. */
export function toLevel(raw: unknown): DetailLevel {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as DetailLevel;
}

export default function DetailSlider({
  value,
  onChange,
  disabled = false,
  label = "Initial NDA comprehensiveness",
  flat = false,
}: {
  value: number;
  onChange: (level: DetailLevel) => void;
  disabled?: boolean;
  /** What a screen reader calls it; the two uses are asking the same thing at
   *  different moments, so they are worth naming differently. */
  label?: string;
  /**
   * Wider and shorter, for beside the finished document.
   *
   * On the question this card is what the person is being asked, and it has
   * the room to say so. Beside the document it is a control they may never
   * touch, so it lies flat: the word count moves up beside the title instead
   * of taking a row of its own, and everything tightens.
   */
  flat?: boolean;
}) {
  const level = toLevel(value);

  return (
    <div className={`gd${flat ? " gd-flat" : ""}`}>
      <div className="gd-head">
        <span className="gd-title">
          Comprehensiveness
          <i
            className="gd-info"
            title={`Level ${level} of 5 — ${DETAIL_LABELS[level - 1]}. ${
              DETAIL_LENGTHS[level - 1]
            }. Changes drafting detail, never the commercial position.`}
            aria-hidden="true"
          >
            i
          </i>
          {flat && <span className="gd-len-inline">{DETAIL_LENGTHS[level - 1]}</span>}
        </span>
        <span className="gd-readout">
          <b>{level} / 5</b>
          <em>{DETAIL_LABELS[level - 1]}</em>
        </span>
      </div>

      <div className="gd-track">
        <span className="gd-rail" aria-hidden="true">
          <span className="gd-fill" style={{ width: `${((level - 1) / 4) * 100}%` }} />
        </span>
        <span className="gd-dots" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((mark) => (
            <span
              key={mark}
              className={`gd-dot${mark <= level ? " on" : ""}${mark === level ? " now" : ""}`}
            />
          ))}
        </span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={level}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={`Level ${level}: ${DETAIL_LABELS[level - 1]}`}
          onChange={(event) => onChange(toLevel(event.target.value))}
        />
      </div>

      <div className="gd-scale" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((mark) => (
          <span key={mark} className={mark === level ? "on" : ""}>
            <b>{mark}</b>
            <em>{DETAIL_LABELS[mark - 1]}</em>
          </span>
        ))}
      </div>

      {!flat && <p className="gd-length">{DETAIL_LENGTHS[level - 1]}</p>}
    </div>
  );
}
