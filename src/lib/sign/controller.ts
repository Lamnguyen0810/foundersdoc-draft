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
  /** 0317: when their link was emailed ("Emailed 27 Nov, 11:20 am") */
  invitedAt?: string | null;
  /** 0317: an approver: the first name of the person whose signature they approve */
  approvesFor?: string;
  /** 0317: an approver where one approval is enough ("Any 1 of 2") */
  anyOne?: boolean;
  /** 0317: a signer who needs an approval first (shown in the step after their approvers) */
  afterApproval?: boolean;
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

export function statusMail(p: { title: string; signers: StatusSigner[]; event: StatusEvent; from: string | null; to?: "controller" | "sender"; /** 0317: when it was sent */ sentAt?: string | null }): { subject: string; html: string; text: string } {
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
  /* 0317 (Rachel: "this looks better", with colours other than yellow): a formal status email. A dark header,
     what just happened, the document, a progress card (one bar split by action: green = signed, blue = approved,
     orange = their turn, grey = not yet), done / pending / next, then a signing register: step, party, status,
     date and time. Tables and inline styles only (Outlook and Gmail); no images, no link to the document. */
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const MONO = "font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;";
  type L = (typeof lines)[number];
  type K = "skip" | "approved" | "done" | "now" | "wait";
  const kind = (l: L): K =>
    /^Not needed/.test(l.text) ? "skip" : /^Approved/.test(l.text) ? "approved" : /^(Signed|Filled in)/.test(l.text) ? "done" : /their turn now/.test(l.text) ? "now" : "wait";
  const first = (n: string) => n.split(/\s+/)[0]!;
  const listNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));
  const short = (iso: string) => sgtTime(iso).replace(/ \d{4},/, ",");
  const GREEN = "#16a34a";
  const BLUE = "#2563eb";
  const ORANGE = "#f97316";
  const GREY = "#e5e7eb";
  /* the register's rows in signing order. Within a step, approvers are listed first, and someone who needs their
     approval in that same step moves to the next step shown (they are emailed only once it is approved). */
  type R = { s: StatusSigner; l: L; k: K; i: number; step: number; sub: number };
  const stepAt = (s: StatusSigner, i: number) => s.step ?? i + 1;
  const rows: R[] = p.signers
    .map((s, i) => {
      const step = stepAt(s, i);
      const heldHere = !!s.afterApproval && p.signers.some((x, j) => x.does === "approve" && x.approvesFor === s.name.split(/\s+/)[0] && stepAt(x, j) === step);
      return { s, l: lines[i]!, k: kind(lines[i]!), i, step, sub: heldHere ? 1 : 0 };
    })
    .sort((a, b) => a.step - b.step || a.sub - b.sub || (a.s.does === "approve" ? 0 : 1) - (b.s.does === "approve" ? 0 : 1) || a.i - b.i);
  const keyOf = (r: R) => `${r.step}.${r.sub}`;
  const groupNo = new Map<string, number>();
  for (const r of rows) if (!groupNo.has(keyOf(r))) groupNo.set(keyOf(r), groupNo.size + 1);
  const act = (r: R) => (r.s.does === "approve" ? "Approve" : r.s.does === "fill" ? "Fill in" : "Sign");
  const isDone = (r: R) => r.k === "done" || r.k === "approved";
  const colour = (r: R) => (isDone(r) ? (r.k === "approved" || r.s.does === "approve" ? BLUE : GREEN) : r.k === "now" && !voided ? ORANGE : GREY);
  const ink = (c: string) => (c === GREEN ? "#15803d" : c === BLUE ? "#1d4ed8" : c === ORANGE ? "#c2410c" : "#9ca3af");
  const counted = rows.filter((r) => r.k !== "skip");
  const turn = counted.filter((r) => r.k === "now").map((r) => first(r.s.name));
  const next =
    p.event.kind === "completed"
      ? "Everyone has signed. The signed copy has gone to everyone who signed, and to anyone given a copy."
      : voided
        ? "This request was cancelled. Nobody else will be asked to sign."
        : turn.length
          ? `Now with ${listNames(turn)}. You will get an email each time someone signs.`
          : "You will get an email each time someone signs.";
  /* under the heading: who has just been emailed because of this step */
  const ev = p.event;
  const evAt = ev.kind === "signed" ? p.signers.find((s) => s.name === ev.name && s.status === "signed")?.signedAt : null;
  const fresh = counted.filter((r) => r.k === "now" && r.s.invitedAt && evAt && Date.parse(r.s.invitedAt) >= Date.parse(evAt) - 60_000);
  const freshVerb = fresh.every((r) => r.s.does === "approve") ? "approve" : fresh.every((r) => r.s.does === "fill") ? "fill in their part" : "sign";
  const subline =
    ev.kind === "completed"
      ? "The signed copy has gone to everyone who signed, and to anyone given a copy."
      : voided
        ? "Nobody else will be asked to sign."
        : fresh.length
          ? `${listNames(fresh.map((r) => first(r.s.name)))} ${fresh.length > 1 ? "have" : "has"} now been emailed to ${freshVerb}.`
          : turn.length
            ? `Still with ${listNames(turn)}.`
            : "";
  const badge = ev.kind === "completed" ? { t: "COMPLETED", c: "#22c55e" } : voided ? { t: "CANCELLED", c: "#9ca3af" } : { t: "LIVE STATUS", c: "#22c55e" };
  const stamp = sgtTime(new Date().toISOString());
  const pc = total ? Math.round((done / total) * 100) : 0;
  /* the bar: one part per action, side by side parts of the same colour and action merged ("SIGN ×2") */
  const segs: Array<{ c: string; a: string; n: number }> = [];
  for (const r of counted) {
    const c = colour(r);
    const last = segs[segs.length - 1];
    if (last && last.c === c && last.a === act(r)) last.n++;
    else segs.push({ c, a: act(r), n: 1 });
  }
  const pct = (n: number) => ((n / Math.max(counted.length, 1)) * 100).toFixed(2);
  const bar =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin-top:14px;"><tr>` +
    segs.map((g) => `<td width="${pct(g.n)}%" style="height:8px;background-color:${g.c};font-size:1px;line-height:1px;">&nbsp;</td>`).join("") +
    `</tr><tr>` +
    segs
      .map(
        (g, i) =>
          `<td width="${pct(g.n)}%" align="${i === segs.length - 1 && segs.length > 1 ? "right" : "left"}" style="padding-top:7px;${MONO}font-size:10px;line-height:13px;letter-spacing:1.5px;font-weight:bold;color:${ink(g.c)};white-space:nowrap;overflow:hidden;">${g.a.toUpperCase()}${g.n > 1 ? ` &times;${g.n}` : ""}</td>`,
      )
      .join("") +
    `</tr></table>`;
  const cell = (label: string, dot: string, names: string[], lastCell = false) =>
    `<td width="33%" valign="top" style="padding:14px 18px 16px 18px;${lastCell ? "" : "border-right:1px solid #e5e7eb;"}">` +
    `<div style="${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#6b7280;"><span style="display:inline-block;width:7px;height:7px;border-radius:4px;background-color:${dot};margin-right:7px;">&nbsp;</span>${label}</div>` +
    `<div style="${F}font-size:15px;line-height:21px;font-weight:bold;color:#0f1115;margin-top:6px;">${names.length ? esc(names.join(", ")) : "&ndash;"}</div></td>`;
  const card =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;">` +
    `<tr><td style="padding:18px 18px 16px 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>` +
    `<td valign="bottom"><span style="${F}font-size:28px;line-height:32px;font-weight:bold;color:#0f1115;">${pc}%</span><span style="${F}font-size:14px;line-height:20px;color:#6b7280;"> &nbsp;complete &middot; ${done} of ${total} actions</span></td>` +
    `<td align="right" valign="bottom" style="${F}font-size:13.5px;line-height:20px;color:#374151;">${ev.kind === "completed" ? "<b>All done</b>" : voided ? "<b>Cancelled</b>" : turn.length ? `Now with <b style="color:#0f1115;">${esc(turn.join(", "))}</b>` : ""}</td>` +
    `</tr></table>${bar}</td></tr>` +
    `<tr><td bgcolor="#f8f9fb" style="background-color:#f8f9fb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>` +
    cell("DONE", GREEN, counted.filter(isDone).map((r) => first(r.s.name))) +
    cell(voided ? "NOT SIGNED" : "PENDING", voided ? "#c9ccd3" : ORANGE, voided ? counted.filter((r) => !isDone(r)).map((r) => first(r.s.name)) : turn) +
    cell("NEXT", "#d1d5db", voided ? [] : counted.filter((r) => r.k === "wait").map((r) => first(r.s.name)), true) +
    `</tr></table></td></tr></table>`;
  /* the signing register */
  const oneOf = (r: R) => rows.filter((x) => x.s.does === "approve" && x.s.approvesFor && x.s.approvesFor === r.s.approvesFor);
  const pill = (r: R) => {
    const [t, bg, fg] =
      r.k === "approved" || (r.k === "done" && r.s.does === "approve")
        ? ["APPROVED", BLUE, "#ffffff"]
        : r.k === "done"
          ? [r.s.does === "fill" ? "FILLED IN" : "SIGNED", GREEN, "#ffffff"]
          : voided
            ? ["NOT SIGNED", "#f2f3f5", "#6b7280"]
            : r.k === "skip"
              ? ["NOT NEEDED", "#f2f3f5", "#9ca3af"]
              : r.k === "now"
                ? ["THEIR TURN", ORANGE, "#ffffff"]
                : ["NOT YET SENT", "#f2f3f5", "#6b7280"];
    return `<span style="display:inline-block;padding:4px 9px;border-radius:5px;background-color:${bg};color:${fg};${MONO}font-size:10.5px;line-height:14px;font-weight:bold;letter-spacing:1.5px;white-space:nowrap;">${t}</span>`;
  };
  const whenOf = (r: R) => {
    if (isDone(r)) return r.s.signedAt ? short(r.s.signedAt) : "";
    if (voided) return "Request cancelled";
    if (r.k === "skip") return `${r.s.notNeeded ?? "Another approver"} approved first`;
    if (r.k === "now") return r.s.invitedAt ? `Emailed ${short(r.s.invitedAt)}` : "Emailed";
    if (r.s.heldFor?.length) {
      const any = rows.some((x) => x.s.does === "approve" && x.s.anyOne && x.s.approvesFor === first(r.s.name));
      return `Emailed after ${r.s.heldFor.join(any ? " or " : " and ")} ${any || r.s.heldFor.length === 1 ? "approves" : "approve"}`;
    }
    const prior = counted.filter((x) => (groupNo.get(keyOf(x)) ?? 0) < (groupNo.get(keyOf(r)) ?? 0) && !isDone(x));
    const before = prior.map((x) => first(x.s.name));
    const approving = prior.length > 0 && prior.every((x) => x.s.does === "approve");
    return before.length ? `Emailed after ${before.length > 3 ? "the people above" : listNames(before)} ${approving ? (before.length === 1 ? "approves" : "approve") : before.length === 1 ? "signs" : "sign"}` : "Emailed next";
  };
  const TH = `${MONO}font-size:10px;line-height:14px;letter-spacing:1.5px;color:#6b7280;font-weight:bold;padding:11px 12px;border-bottom:1px solid #e5e7eb;`;
  const seen = new Set<string>();
  const register =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;">` +
    `<tr bgcolor="#f8f9fb"><td width="15%" style="${TH}">STEP</td><td width="35%" style="${TH}">PARTY</td><td width="22%" style="${TH}">STATUS</td><td width="28%" style="${TH}">DATE &amp; TIME</td></tr>` +
    rows
      .map((r, idx) => {
        const g = keyOf(r);
        const head = !seen.has(g);
        seen.add(g);
        const size = rows.filter((x) => keyOf(x) === g).length;
        const extra =
          head && r.s.does === "approve" && r.s.anyOne && oneOf(r).length > 1
            ? ` &middot; Any 1 of ${oneOf(r).length}`
            : head && size > 1 && r.s.does !== "approve"
              ? " &middot; At the same time"
              : "";
        const bg = r.k === "now" && !voided ? "background-color:#fff7ed;" : "";
        const line = idx < rows.length - 1 ? "border-bottom:1px solid #eef0f3;" : "";
        const TD = `vertical-align:top;padding:13px 12px;${bg}${line}`;
        return (
          `<tr>` +
          `<td style="${TD}">${head ? `<div style="${F}font-size:15px;line-height:20px;font-weight:bold;color:#0f1115;">${groupNo.get(g)}</div>` : ""}${head || act(r) !== act(rows.find((x) => keyOf(x) === g)!) ? `<div style="${F}font-size:12.5px;line-height:17px;color:#6b7280;${head ? "" : "padding-top:20px;"}">${act(r)}</div>` : ""}</td>` +
          `<td style="${TD}"><div style="${F}font-size:15px;line-height:20px;font-weight:bold;color:${r.k === "skip" ? "#9ca3af" : "#0f1115"};">${esc(r.s.name)}</div><div style="${F}font-size:12.5px;line-height:17px;color:#6b7280;">${esc(r.s.role)}${extra}</div></td>` +
          `<td style="${TD}">${pill(r)}</td>` +
          `<td style="${TD}${MONO}font-size:11.5px;line-height:17px;color:#6b7280;">${esc(whenOf(r))}</td>` +
          `</tr>`
        );
      })
      .join("") +
    `</table>`;
  /* e.g. "Step 3 was released when Legal Team approved at 11:20 am. Only one approval is needed in Step 2." */
  const released = rows
    .filter((r) => r.s.does === "approve" && isDone(r) && r.s.approvesFor && r.s.signedAt)
    .map((r) => {
      const target = rows.find((x) => first(x.s.name) === r.s.approvesFor && x.s.does !== "approve");
      if (!target || target.k === "wait") return "";
      const t = sgtTime(r.s.signedAt!).split(", ").pop();
      return `Step ${groupNo.get(keyOf(target))} was released when ${r.s.name} approved at ${t}.${r.s.anyOne && oneOf(r).length > 1 ? ` Only one approval is needed in Step ${groupNo.get(keyOf(r))}.` : ""}`;
    })
    .filter(Boolean)
    .join(" ");
  const sentLine = [mine ? "Sent by you" : p.from ? `Sent by ${p.from}` : "", p.sentAt ? sgtTime(p.sentAt) : ""].filter(Boolean).join(" · ");
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
<div style="font-size:25px;line-height:32px;font-weight:bold;color:#0f1115;margin-top:10px;">${esc(head)}</div>
${subline ? `<div style="font-size:15px;line-height:22px;color:#6b7280;margin-top:6px;">${esc(subline)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px;"><tr><td style="border-left:3px solid #0f1115;padding:2px 0 2px 14px;">
<div style="${F}font-size:15.5px;line-height:22px;font-weight:bold;color:#0f1115;">${esc(p.title)}</div>
${sentLine ? `<div style="${F}font-size:13px;line-height:19px;color:#6b7280;margin-top:2px;">${esc(sentLine)}</div>` : ""}
</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 28px 0 28px;">${card}</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:26px 28px 6px 28px;">
<div style="${MONO}font-size:10.5px;line-height:14px;letter-spacing:2px;color:#6b7280;margin-bottom:12px;">SIGNING REGISTER</div>
${register}
${released ? `<div style="${F}font-size:13px;line-height:20px;color:#6b7280;margin-top:12px;">${esc(released)}</div>` : ""}
</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 16px 0;font-size:1px;line-height:1px;">&nbsp;</td></tr>
<tr><td bgcolor="#f8f9fb" style="background-color:#f8f9fb;border-top:1px solid #e5e7eb;border-radius:0 0 14px 14px;padding:18px 28px 22px 28px;${F}font-size:12px;line-height:18px;color:#6b7280;">
<div>${mine ? "You get these updates because you sent this document for signing." : `You get these updates as the <b style="color:#374151;">key controller</b> for this document. You do not need to do anything. For privacy, this email has no link to the document.`}</div>
<div style="${MONO}font-size:10.5px;line-height:16px;letter-spacing:1px;color:#9ca3af;margin-top:10px;">FD SIGN BY FOUNDERS DOC &middot; EVERY STEP IS RECORDED IN THE AUDIT TRAIL</div>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
