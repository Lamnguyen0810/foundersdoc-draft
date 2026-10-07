"use client";

/**
 * How comprehensive the document should be — one card, one vocabulary.
 *
 * There were two of these: the card on the drafting question, and a smaller,
 * plainer one beside the finished document. They disagreed. The question card
 * called level 2 "Basic"; the one beside the document called the same level
 * "Standard" — and both were on screen at once, one saying "2/5 · Basic" in
 * the answer summary and the other "2/5 · Standard" directly underneath.
 *
 * So there is now one component and one list of names, used in both places,
 * and a level cannot be called two things again.
 *
 * The NDA's five steps are the default. A document with its own scale (the
 * contractor agreement's three versions from the Master Menu) passes its
 * `steps`; the number of steps, the names and the guide all come from there.
 */

export { DETAIL_LABELS, DETAIL_LENGTHS, DETAIL_GUIDE, toLevel, type DetailLevel } from "@/lib/detail";
import { DETAIL_LABELS, DETAIL_LENGTHS, DETAIL_GUIDE, toLevel, type DetailLevel } from "@/lib/detail";
import InfoTip from "./InfoTip";

export interface SliderSteps {
  /** The names, in order: index 0 is level 1. */
  labels: readonly string[];
  /** A line under each name, "about 500–800 words" — optional. */
  lengths?: readonly string[];
  /** What each level is for, shown as the slider moves. */
  guide: readonly string[];
  /** The level marked "(recommended)". */
  recommended?: number;
  /** The card's title and the tip beside it. */
  title: string;
  tip: string;
  /** The line under the guide. */
  note?: string;
}

export const NDA_STEPS: SliderSteps = {
  labels: DETAIL_LABELS,
  lengths: DETAIL_LENGTHS,
  guide: DETAIL_GUIDE,
  recommended: 3,
  title: "Comprehensiveness",
  tip: "How much detail the NDA is written with. It never changes what is agreed.",
  note: "This changes how much detail is written, never what is agreed.",
};

export default function DetailSlider({
  value,
  onChange,
  disabled = false,
  label = "Initial NDA comprehensiveness",
  flat = false,
  steps = NDA_STEPS,
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
  steps?: SliderSteps;
}) {
  const n = steps.labels.length;
  const level = Math.min(n, Math.max(1, toLevel(value))) as DetailLevel;
  const marks = Array.from({ length: n }, (_, i) => i + 1);
  const length = steps.lengths?.[level - 1];
  const style = { "--gd-n": n } as React.CSSProperties;

  return (
    <div className={`gd${flat ? " gd-flat" : ""}`} style={style}>
      <div className="gd-head">
        <span className="gd-title">
          {steps.title}
          <InfoTip label={steps.title} text={`${steps.tip} Level ${level} of ${n} — ${steps.labels[level - 1]}${length ? `, ${length}` : ""}. ${steps.guide[level - 1]}`} />
          {flat && length && <span className="gd-len-inline">{length}</span>}
        </span>
        <span className="gd-readout">
          <b>{level} / {n}</b>
          <em>{steps.labels[level - 1]}</em>
        </span>
      </div>

      <div className="gd-track">
        <span className="gd-rail" aria-hidden="true">
          <span className="gd-fill" style={{ width: `${((level - 1) / (n - 1)) * 100}%` }} />
        </span>
        <span className="gd-dots" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark} className={`gd-dot${mark <= level ? " on" : ""}${mark === level ? " now" : ""}`} />
          ))}
        </span>
        <input
          type="range"
          min={1}
          max={n}
          step={1}
          value={level}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={`Level ${level}: ${steps.labels[level - 1]}`}
          onChange={(event) => onChange(Math.min(n, Math.max(1, toLevel(event.target.value))) as DetailLevel)}
        />
      </div>

      <div className="gd-scale" aria-hidden="true">
        {marks.map((mark) => (
          <span key={mark} className={mark === level ? "on" : ""}>
            <b>{mark}</b>
            <em>{steps.labels[mark - 1]}</em>
          </span>
        ))}
      </div>

      <div className="gd-guide" aria-live="polite">
        <p>
          <b>
            {steps.labels[level - 1]}
            {level === steps.recommended ? " (recommended)" : ""}
            {!flat && length ? ` · ${length}` : ""}
          </b>{" "}
          {steps.guide[level - 1]}
        </p>
        {!flat && steps.note && <small>{steps.note}</small>}
      </div>
    </div>
  );
}
