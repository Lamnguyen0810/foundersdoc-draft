/**
 * Status updates for the key controller (0296, Rachel): the person who follows a signing (e.g. the company
 * secretary, the lawyer or the deal lead) gets an email each time someone signs, showing who has signed and who
 * hasn't, so nobody has to ask around. They do not sign and get no link to the document: only names, roles and
 * dates. Pure: the server sends what this builds.
 */

export interface StatusSigner {
  name: string;
  role: string;
  status: "waiting" | "invited" | "signed";
  signedAt: string | null;
  /** 0308: what they do: sign (default), approve, or fill in */
  does?: "sign" | "approve" | "fill";
  /** 0308: waiting for these approvers first */
  heldFor?: string[];
  /** 0309: an approver no longer needed: this person already approved (one is enough) */
  notNeeded?: string;
  /** 0312: their signing step (same number = at the same time), for "after the directors" */
  step?: number;
}
export type StatusEvent = { kind: "signed"; name: string; role: string; /** 0312 */ did?: "signed" | "approved" | "filled" } | { kind: "completed" } | { kind: "voided" };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "26 Nov 2026, 3:05 pm" in Singapore */
export function sgtTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3_600_000);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** each signer's line: "Signed 26 Nov 2026, 3:05 pm" · "Their turn now" · "Waiting (signs after Alex)" */
export function statusLines(signers: StatusSigner[], voided = false): Array<{ name: string; role: string; done: boolean; text: string }> {
  return signers.map((s, i) => {
    const verb = s.does === "approve" ? "Approved" : s.does === "fill" ? "Filled in" : "Signed";
    if (s.status === "signed") return { name: s.name, role: s.role, done: true, text: `${verb} ${s.signedAt ? sgtTime(s.signedAt) : ""}`.trim() };
    const not = s.does === "approve" ? "Not approved yet" : s.does === "fill" ? "Not filled in yet" : "Not signed yet";
    if (!voided && s.notNeeded) return { name: s.name, role: s.role, done: false, text: `Not needed: ${s.notNeeded} has approved` };
    if (!voided && s.status === "waiting" && s.heldFor?.length) return { name: s.name, role: s.role, done: false, text: `${not}: waiting for approval by ${s.heldFor.join(" and ")}` };
    if (voided) return { name: s.name, role: s.role, done: false, text: "Not signed (request cancelled)" };
    if (s.status === "invited") return { name: s.name, role: s.role, done: false, text: `${not}: their turn now` };
    /* 0312: with steps, "after" names the people of the steps before who have not signed yet */
    const firstName = (x: StatusSigner) => x.name.split(/\s+/)[0];
    if (s.step !== undefined) {
      const before = signers.filter((x) => (x.step ?? 0) < s.step! && x.status !== "signed" && !x.notNeeded);
      const act = s.does === "approve" ? "approves" : s.does === "fill" ? "fills in" : "signs";
      if (!before.length) return { name: s.name, role: s.role, done: false, text: `${not}: next to ${s.does === "approve" ? "approve" : s.does === "fill" ? "fill in" : "sign"}` };
      return { name: s.name, role: s.role, done: false, text: `${not}: ${act} after ${before.length > 2 ? "the people above" : before.map(firstName).join(" and ")}` };
    }
    const prev = signers[i - 1];
    const next = signers.slice(0, i).every((x) => x.status === "signed");
    return { name: s.name, role: s.role, done: false, text: next ? `${not}: next to ${s.does === "approve" ? "approve" : s.does === "fill" ? "fill in" : "sign"}` : `${not}: ${s.does === "approve" ? "approves" : s.does === "fill" ? "fills in" : "signs"} after ${prev ? prev.name.split(/\s+/)[0] : "the others"}` };
  });
}

export function statusMail(p: { title: string; signers: StatusSigner[]; event: StatusEvent; from: string | null; to?: "controller" | "sender" }): { subject: string; html: string; text: string } {
  /* 0303: the sender gets the same update after each signature, with their own footer */
  const mine = p.to === "sender";
  const done = p.signers.filter((s) => s.status === "signed").length;
  /* 0312: an approver who is no longer needed is not counted */
  const total = p.signers.filter((s) => s.status === "signed" || !s.notNeeded).length;
  const voided = p.event.kind === "voided";
  const head =
    p.event.kind === "signed"
      ? `${p.event.name} (${p.event.role}) has ${p.event.did === "approved" ? "approved" : p.event.did === "filled" ? "filled in their part" : "signed"}`
      : p.event.kind === "completed"
        ? "Everyone has signed"
        : "This signing request was cancelled";
  const count = voided ? `${done} of ${total} signed before it was cancelled` : `${done} of ${total} signed`;
  const subject = `${p.event.kind === "completed" ? "All signed" : voided ? "Cancelled" : `${done} of ${total} signed`}: ${p.title}`.slice(0, 200);
  const lines = statusLines(p.signers, voided);
  const by = p.from && !mine ? ` sent by ${p.from}` : "";
  const why = mine ? "You get these updates because you sent this document for signing." : "You get these updates as the key controller for this document. You do not need to do anything.";
  const text = [
    `${head}.`,
    "",
    `Document: ${p.title}${by}`,
    `Progress: ${count}`,
    "",
    ...lines.map((l) => `${l.done ? "[x]" : "[ ]"} ${l.name} (${l.role}): ${l.text}`),
    "",
    p.event.kind === "completed" ? "The signed copy has gone to everyone who signed, and to anyone given a copy." : voided ? "" : "You will get an email each time someone signs.",
    "",
    why,
  ]
    .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
    .join("\n");
  /* 0312: a modern, formal status email: a dark header with a live-status badge, three figures (done, still to do,
     who is next), a segmented bar (one segment per person), then the people grouped by signing step with their
     status and time. Tables and inline styles only (Outlook and Gmail); no images, no link to the document. */
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const MONO = "font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;";
  type L = (typeof lines)[number];
  const kind = (l: L) =>
    /^Not needed/.test(l.text) ? "skip" : /^Approved/.test(l.text) ? "approved" : /^(Signed|Filled in)/.test(l.text) ? "done" : /their turn now/.test(l.text) ? "now" : "wait";
  const C = {
    done: { dot: "#16a34a", bg: "#e8f7ee", fg: "#15803d", label: "SIGNED" },
    approved: { dot: "#2563eb", bg: "#e8effd", fg: "#1d4ed8", label: "APPROVED" },
    now: { dot: "#d4a017", bg: "#fdf4d8", fg: "#8a6200", label: "THEIR TURN" },
    wait: { dot: "#c9ccd3", bg: "#f2f3f5", fg: "#6b7280", label: "WAITING" },
    skip: { dot: "#e2e4e8", bg: "#f2f3f5", fg: "#9ca3af", label: "NOT NEEDED" },
  } as const;
  const labelOf = (l: L) => (kind(l) === "done" && /^Filled in/.test(l.text) ? "FILLED IN" : voided && kind(l) !== "done" && kind(l) !== "approved" ? "NOT SIGNED" : C[kind(l)].label);
  const when = (l: L) => {
    const m = /^(?:Signed|Approved|Filled in)\s+(.+)$/.exec(l.text);
    if (m) return m[1]!;
    if (kind(l) === "skip") return l.text.replace(/^Not needed:\s*/, "");
    const t = l.text.replace(/^Not (signed|approved|filled in) yet:\s*/, "");
    return /^their turn now$/.test(t) || voided ? "" : t.charAt(0).toUpperCase() + t.slice(1);
  };
  const steps = p.signers.map((x, i) => x.step ?? i + 1);
  const grouped = p.signers.some((x) => x.step !== undefined) && new Set(steps).size < steps.length;
  const turn = lines.filter((l) => kind(l) === "now").map((l) => l.name.split(/\s+/)[0]!);
  const left = lines.filter((l) => kind(l) === "now" || kind(l) === "wait").length;
  const listNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));
  const next =
    p.event.kind === "completed"
      ? "Everyone has signed. The signed copy has gone to everyone who signed, and to anyone given a copy."
      : voided
        ? "This request was cancelled. Nobody else will be asked to sign."
        : turn.length
          ? `Now with ${listNames(turn)}. You will get an email each time someone signs.`
          : "You will get an email each time someone signs.";
  const badge =
    p.event.kind === "completed" ? { t: "COMPLETED", c: "#22c55e" } : voided ? { t: "CANCELLED", c: "#9ca3af" } : { t: "LIVE STATUS", c: "#22c55e" };
  const stamp = sgtTime(new Date().toISOString());
  /* a person icon drawn with HTML (no images: email apps block them, and Gmail drops SVG):
     black once they have signed or approved, grey while not yet, pale when no longer needed */
  const ink = (l: L) => (kind(l) === "done" || kind(l) === "approved" ? "#0f1115" : kind(l) === "skip" ? "#e5e7eb" : "#c4c7ce");
  const human = (color: string, size = 1, ring = false) => {
    const h = Math.round(9 * size);
    const bw = Math.round(17 * size);
    const bh = Math.round(9 * size);
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;${ring ? `border-bottom:2px solid #d4a017;padding-bottom:2px;` : ""}"><tr><td align="center" style="padding:0;line-height:0;font-size:0;">` +
      `<div style="width:${h}px;height:${h}px;border-radius:${h}px;background-color:${color};margin:0 auto;font-size:0;line-height:0;">&nbsp;</div>` +
      `<div style="width:${bw}px;height:${bh}px;border-radius:${bh}px ${bh}px 3px 3px;background-color:${color};margin:${Math.round(2 * size)}px auto 0 auto;font-size:0;line-height:0;">&nbsp;</div>` +
      `</td></tr></table>`
    );
  };
  const person = (l: L, i: number) => {
    const k = kind(l);
    const c = C[k];
    const w = when(l);
    return (
      `<tr><td width="34" valign="top" style="width:34px;padding:12px 0;">${human(ink(l), 1, k === "now" && !voided)}</td>` +
      `<td valign="top" style="padding:12px 8px 12px 0;${F}"><div style="font-size:15px;line-height:20px;font-weight:bold;color:${k === "skip" ? "#9ca3af" : "#0f1115"};">${esc(l.name)}</div>` +
      `<div style="font-size:12.5px;line-height:18px;color:#6b7280;">${esc(l.role)}</div></td>` +
      `<td align="right" valign="top" style="padding:12px 0;"><span style="display:inline-block;padding:3px 8px;border-radius:5px;background-color:${c.bg};color:${c.fg};${MONO}font-size:10.5px;line-height:14px;font-weight:bold;letter-spacing:1px;white-space:nowrap;">${labelOf(l)}</span>` +
      (w ? `<div style="${MONO}font-size:11px;line-height:16px;color:#9ca3af;margin-top:5px;white-space:nowrap;">${esc(w)}</div>` : "") +
      `</td></tr>` +
      (i < lines.length - 1 ? `<tr><td colspan="3" style="border-top:1px solid #f0f1f3;font-size:1px;line-height:1px;">&nbsp;</td></tr>` : "")
    );
  };
  let people = "";
  if (grouped) {
    const order = [...new Set(steps)].sort((x, y) => x - y);
    people = order
      .map((st, gi) => {
        const idx = steps.map((x, i) => (x === st ? i : -1)).filter((i) => i >= 0);
        const label = `STEP ${gi + 1}${idx.length > 1 ? " &middot; AT THE SAME TIME" : ""}`;
        return (
          `<tr><td colspan="3" style="padding:${gi ? 18 : 4}px 0 2px 0;${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#9ca3af;">${label}</td></tr>` +
          idx.map((i, k) => person(lines[i]!, k === idx.length - 1 ? lines.length - 1 : i)).join("")
        );
      })
      .join("");
  } else people = lines.map((l, i) => person(l, i)).join("");
  /* 0312 (Rachel: "from a glance I still don't get a sense of who has signed and who hasn't and how many more to
     go"): one panel answers all three. "2 signed · 3 to go" in big type; every person as an icon with their first
     name under it, black once signed, grey while not yet, a gold line under whoever has it now; then two lists:
     who has signed, and who still has to (with "their turn" on the ones it is with). */
  const firstOf = (l: L) => l.name.split(/\s+/)[0]!;
  /* approvers have their own column: approving is not signing (Lam, 0312) */
  const isApprover = (l: L) => p.signers[lines.indexOf(l)]?.does === "approve";
  const doneL = lines.filter((l) => !isApprover(l) && (kind(l) === "done" || kind(l) === "approved"));
  const todoL = lines.filter((l) => !isApprover(l) && (kind(l) === "now" || kind(l) === "wait"));
  const apprL = lines.filter(isApprover);
  /* a loading bar: one segment per person, filling up from the left as people sign. Two colours only (Lam, 0312):
     green once signed or approved, grey while not yet. Approvers get a blue "APPROVAL" bracket above their
     segment(s), pointing down onto them (side-by-side approvers share one), so it reads at a glance (Rachel). The stripes are a background pattern (Apple Mail, Gmail); where an email app drops
     it (Outlook) the segment is plain green. The person icons stay in the signing order below. */
  const pctDone = total ? Math.round((done / total) * 100) : 0;
  const isDone = (l: L) => kind(l) === "done" || kind(l) === "approved";
  const fill = (l: L) =>
    isDone(l)
      ? "background-color:#16a34a;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.18) 0,rgba(255,255,255,0.18) 6px,rgba(255,255,255,0) 6px,rgba(255,255,255,0) 12px);"
      : "background-color:#e5e7eb;";
  const shown = lines.filter((l) => kind(l) !== "skip").sort((x, y) => Number(isDone(y)) - Number(isDone(x)));
  const w = (100 / Math.max(shown.length, 1)).toFixed(2);
  /* side-by-side approvers share one bracket: runs of [isApprover, count] */
  const runs: Array<[boolean, number]> = [];
  shown.forEach((l) => {
    const last = runs[runs.length - 1];
    if (last && last[0] === isApprover(l) && isApprover(l)) last[1]++;
    else runs.push([isApprover(l), 1]);
  });
  let at = 0;
  const brackets = runs
    .map(([ap, n]) => {
      const end = (at += n) === shown.length;
      const pad = `padding:0 ${end ? 0 : 3}px 4px 0;`;
      return ap
        ? `<td colspan="${n}" align="center" valign="bottom" style="${pad}">` +
            `<div style="${F}font-size:10px;line-height:13px;font-weight:bold;letter-spacing:0.6px;color:#1d4ed8;white-space:nowrap;padding-bottom:3px;">APPROVAL</div>` +
            `<div style="height:5px;border:2px solid #2563eb;border-bottom:0;border-radius:4px 4px 0 0;font-size:1px;line-height:1px;">&nbsp;</div></td>`
        : Array.from({ length: n }, () => `<td style="${pad}font-size:1px;line-height:1px;">&nbsp;</td>`).join("");
    })
    .join("");
  const bar =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin-top:14px;">` +
    (shown.some(isApprover) ? `<tr>${brackets}</tr>` : "") +
    `<tr>` +
    shown
      .map(
        (l, i) =>
          `<td width="${w}%" style="padding:0 ${i === shown.length - 1 ? 0 : 3}px 0 0;"><div style="height:16px;${fill(l)}border-radius:${i === 0 ? "8px" : "2px"} ${i === shown.length - 1 ? "8px 8px" : "2px 2px"} ${i === 0 ? "8px" : "2px"};font-size:1px;line-height:1px;">&nbsp;</div></td>`,
      )
      .join("") +
    `</tr><tr>` +
    shown
      .map(
        (l) =>
          `<td width="${w}%" align="center" valign="top" style="padding:6px 3px 0 0;${F}font-size:11px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isDone(l) ? "#15803d" : "#9ca3af"};font-weight:${isDone(l) ? "bold" : "normal"};">${esc(firstOf(l))}</td>`,
      )
      .join("") +
    `</tr></table>`;
  const nameList = (xs: L[], mark: (l: L) => string) =>
    xs.length
      ? xs
          .map(
            (l) =>
              `<div style="${F}font-size:13.5px;line-height:20px;color:#1f2937;padding:2px 0;">${mark(l)} ${esc(l.name)}` +
              (kind(l) === "now" && !voided ? `<div style="${MONO}font-size:9.5px;line-height:13px;letter-spacing:1px;color:#8a6200;white-space:nowrap;padding-left:16px;">THEIR TURN</div>` : "") +
              `</div>`,
          )
          .join("")
      : `<div style="${F}font-size:13.5px;line-height:21px;color:#9ca3af;">Nobody yet</div>`;
  const big = (n: number, label: string, color: string) => `<span style="${F}font-size:34px;line-height:38px;font-weight:bold;color:${color};">${n}</span><span style="${F}font-size:15px;line-height:20px;color:#6b7280;"> ${label}</span>`;
  const glance =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:20px 20px 18px 20px;">` +
    `<div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#9ca3af;">AT A GLANCE</div>` +
    /* the percentage sits on the headline row, so the bar gets the full width (room for "APPROVAL" on a phone) */
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:8px;"><tr><td valign="bottom">${big(done, apprL.length ? "done" : "signed", "#15803d")}<span style="${F}font-size:22px;color:#d1d5db;"> &nbsp;&middot;&nbsp; </span>${voided ? `<span style="${F}font-size:15px;color:#6b7280;">request cancelled</span>` : p.event.kind === "completed" ? `<span style="${F}font-size:15px;color:#15803d;font-weight:bold;">all done</span>` : big(left, "to go", "#8a6200")}</td><td width="60" align="right" valign="bottom" style="width:60px;padding-bottom:4px;${MONO}font-size:14px;line-height:18px;font-weight:bold;color:#0f1115;">${pctDone}%</td></tr></table>` +
    bar +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:16px;border-top:1px solid #f0f1f3;"><tr>` +
    `<td width="${apprL.length ? 34 : 50}%" valign="top" style="padding:12px 10px 0 0;"><div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#15803d;margin-bottom:4px;">SIGNED (${doneL.length})</div>${nameList(doneL, () => `<span style="color:#16a34a;font-weight:bold;">&#10003;</span>`)}</td>` +
    `<td width="${apprL.length ? 33 : 50}%" valign="top" style="padding:12px ${apprL.length ? 10 : 0}px 0 10px;"><div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#8a6200;margin-bottom:4px;">STILL TO ${voided ? "SIGN (CANCELLED)" : "SIGN"} (${todoL.length})</div>${nameList(todoL, () => `<span style="color:#c4c7ce;">&#9675;</span>`)}</td>` +
    /* 0312: approvers on their own: approved, still to approve, or no longer needed */
    (apprL.length
      ? `<td width="33%" valign="top" style="padding:12px 0 0 10px;"><div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#1d4ed8;margin-bottom:4px;">APPROVAL (${apprL.filter((l) => kind(l) === "approved" || kind(l) === "done").length}/${apprL.filter((l) => kind(l) !== "skip").length || apprL.length})</div>` +
        apprL
          .map((l) => {
            const k = kind(l);
            const mark = k === "approved" || k === "done" ? `<span style="color:#2563eb;font-weight:bold;">&#10003;</span>` : k === "skip" ? `<span style="color:#d1d5db;">&ndash;</span>` : `<span style="color:#c4c7ce;">&#9675;</span>`;
            const tag = k === "skip" ? "NOT NEEDED" : k === "now" && !voided ? "TO APPROVE" : "";
            return `<div style="${F}font-size:13.5px;line-height:20px;color:${k === "skip" ? "#9ca3af" : "#1f2937"};padding:2px 0;">${mark} ${esc(l.name)}${tag ? `<div style="${MONO}font-size:9.5px;line-height:13px;letter-spacing:1px;white-space:nowrap;padding-left:16px;color:${k === "skip" ? "#9ca3af" : "#1d4ed8"};">${tag}</div>` : ""}</div>`;
          })
          .join("") +
        `</td>`
      : "") +
    `</tr></table></td></tr></table>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#eef0f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(`${count}. ${next}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f3" style="width:100%;background-color:#eef0f3;"><tr><td align="center" style="padding:28px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="#0f1115" style="background-color:#0f1115;border-radius:14px 14px 0 0;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><span style="display:inline-block;border:1px solid #ffffff;padding:6px 12px;${F}font-size:11px;line-height:14px;letter-spacing:4px;font-weight:bold;color:#ffffff;">FOUNDERS DOC</span></td>
<td align="right" valign="middle" style="${MONO}font-size:10.5px;line-height:14px;letter-spacing:1.5px;color:#d1d5db;white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background-color:${badge.c};margin-right:6px;">&nbsp;</span>FD SIGN &middot; ${badge.t}</td>
</tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 28px 0 28px;${F}">
<div style="${MONO}font-size:10.5px;line-height:14px;letter-spacing:1.5px;color:#9ca3af;">STATUS UPDATE &middot; ${esc(stamp.toUpperCase())} SGT</div>
<div style="font-size:24px;line-height:31px;font-weight:bold;color:#0f1115;margin-top:10px;">${esc(head)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:14px;"><tr><td style="border-left:3px solid #d4a017;padding:2px 0 2px 12px;">
<div style="${F}font-size:15px;line-height:21px;font-weight:bold;color:#1f2937;">${esc(p.title)}</div>
${by ? `<div style="${F}font-size:12.5px;line-height:18px;color:#6b7280;margin-top:2px;">${esc(by.trim().replace(/^sent by/, "Sent by"))}</div>` : ""}
</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 28px 0 28px;">
${glance}
<div style="${F}font-size:13.5px;line-height:20px;color:#374151;margin-top:12px;">${esc(next)}</div>
</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 28px 6px 28px;">
<div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#9ca3af;padding-bottom:4px;border-bottom:1px solid #e5e7eb;">SIGNING ORDER</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${people}</table></td></tr>
<tr><td bgcolor="#f8f9fb" style="background-color:#f8f9fb;border-top:1px solid #e5e7eb;border-radius:0 0 14px 14px;padding:18px 28px 22px 28px;${F}font-size:12px;line-height:18px;color:#6b7280;">
<div>${mine ? "You get these updates because you sent this document for signing." : `You get these updates as the <b style="color:#374151;">key controller</b> for this document. You do not need to do anything. For privacy, this email has no link to the document.`}</div>
<div style="${MONO}font-size:10.5px;line-height:16px;letter-spacing:1px;color:#9ca3af;margin-top:10px;">FD SIGN BY FOUNDERS DOC &middot; EVERY STEP IS RECORDED IN THE AUDIT TRAIL</div>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
