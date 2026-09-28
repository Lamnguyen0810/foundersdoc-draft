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

export { DETAIL_LABELS, DETAIL_LENGTHS, DETAIL_GUIDE, toLevel, type DetailLevel } from "@/lib/detail";
import { DETAIL_LABELS, DETAIL_LENGTHS, DETAIL_GUIDE, toLevel, type DetailLevel } from "@/lib/detail";
import InfoTip from "./InfoTip";

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
          <InfoTip
            label="Comprehensiveness"
            text={`How much detail the NDA is written with. Level ${level} of 5 — ${DETAIL_LABELS[level - 1]}, ${
              DETAIL_LENGTHS[level - 1]
            }. ${DETAIL_GUIDE[level - 1]} It never changes what is agreed.`}
          />
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

      <div className="gd-guide" aria-live="polite">
        <p>
          <b>
            {DETAIL_LABELS[level - 1]}
            {level === 3 ? " (recommended)" : ""}
            {!flat ? ` · ${DETAIL_LENGTHS[level - 1]}` : ""}
          </b>{" "}
          {DETAIL_GUIDE[level - 1]}
        </p>
        {!flat && <small>This changes how much detail is written, never what is agreed.</small>}
      </div>
    </div>
  );
}
