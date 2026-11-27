import type { SignField } from "./store";

/**
 * 0316 (Rachel): "Justin should be able to see that someone will be populating it later". On a signing
 * page, the boxes other people still have to fill in (a date, a name, a text box) show as grey
 * placeholders with who fills them in, and when the person filling them in comes last and only fills
 * in (e.g. Founders Doc dating the resolutions), a note says so: "… will fill in the Day and Month boxes
 * once everyone has signed". Signatures and ticks of others are not shown. Nobody's values are shown. Pure.
 */

export interface LaterBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** what the box is for: its label, or Date / Name / Text */
  label: string;
  /** who fills it in */
  by: string;
  /** they fill it in at the end, once everyone has signed */
  atEnd: boolean;
}

export interface LaterPerson {
  position: number;
  name: string;
  role: string;
  step: number;
  /** has signed / filled in / approved already */
  done: boolean;
  /** only fills in (no signature) */
  fillOnly: boolean;
  /** an approver no longer needed */
  skip: boolean;
}

const KINDS = new Set<SignField["kind"]>(["text", "date", "name"]);
const DEFAULT: Partial<Record<SignField["kind"], string>> = { date: "Date", name: "Name", text: "Text" };

const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));

export function laterBoxes(p: { me: { position: number; step: number }; people: LaterPerson[]; fields: SignField[] }): { boxes: LaterBox[]; note: string | null } {
  const last = Math.max(0, ...p.people.map((x) => x.step));
  const boxes: LaterBox[] = [];
  for (const f of p.fields) {
    if (f.position === p.me.position || !KINDS.has(f.kind)) continue;
    const who = p.people.find((x) => x.position === f.position);
    if (!who || who.done || who.skip) continue;
    boxes.push({
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      label: (f.label ?? "").trim() || DEFAULT[f.kind] || "Text",
      by: who.name,
      atEnd: who.fillOnly && who.step === last && who.step > p.me.step,
    });
  }
  const notes = p.people
    .filter((x) => boxes.some((b) => b.atEnd && b.by === x.name))
    .map((x) => {
      const labels = [...new Set(boxes.filter((b) => b.atEnd && b.by === x.name).map((b) => b.label))];
      return `${x.name} (${x.role}) will fill in the ${and(labels)} ${labels.length === 1 ? "box" : "boxes"} once everyone has signed.`;
    });
  return { boxes, note: notes.length ? notes.join(" ") : null };
}
