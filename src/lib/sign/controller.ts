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
}
export type StatusEvent = { kind: "signed"; name: string; role: string } | { kind: "completed" } | { kind: "voided" };

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
    if (s.status === "signed") return { name: s.name, role: s.role, done: true, text: `Signed ${s.signedAt ? sgtTime(s.signedAt) : ""}`.trim() };
    if (voided) return { name: s.name, role: s.role, done: false, text: "Not signed (request cancelled)" };
    if (s.status === "invited") return { name: s.name, role: s.role, done: false, text: "Not signed yet: their turn now" };
    const prev = signers[i - 1];
    const next = signers.slice(0, i).every((x) => x.status === "signed");
    return { name: s.name, role: s.role, done: false, text: next ? "Not signed yet: next to sign" : `Not signed yet: signs after ${prev ? prev.name.split(/\s+/)[0] : "the others"}` };
  });
}

export function statusMail(p: { title: string; signers: StatusSigner[]; event: StatusEvent; from: string | null; to?: "controller" | "sender" }): { subject: string; html: string; text: string } {
  /* 0303: the sender gets the same update after each signature, with their own footer */
  const mine = p.to === "sender";
  const done = p.signers.filter((s) => s.status === "signed").length;
  const total = p.signers.length;
  const voided = p.event.kind === "voided";
  const head =
    p.event.kind === "signed"
      ? `${p.event.name} (${p.event.role}) has signed`
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
  const rows = lines
    .map(
      (l) =>
        `<tr><td width="30" valign="top" style="width:30px;padding:10px 0 10px 0;border-bottom:1px solid #ecebe6;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:${l.done ? "#1f9d6b" : "#b0b0aa"};">${l.done ? "&#10003;" : "&#9675;"}</td>` +
        `<td valign="top" style="padding:10px 0;border-bottom:1px solid #ecebe6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#161616;"><b>${esc(l.name)}</b> <span style="color:#8a8a86;">${esc(l.role)}</span><br><span style="font-size:13px;color:${l.done ? "#1f7a54" : "#8a6528"};">${esc(l.text)}</span></td></tr>`,
    )
    .join("");
  const pct = total ? Math.round((done / total) * 100) : 0;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4" style="width:100%;background-color:#f6f6f4;"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #ebebe8;">
<tr><td style="padding:22px 32px;border-bottom:1px solid #ecebe6;"><img src="https://foundersdoc.com/email/hitpay-esop/fd-logo.png" width="150" height="28" alt="Founders Doc" style="display:block;width:150px;height:28px;border:0;"></td></tr>
<tr><td style="padding:30px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;display:inline-block;background-color:#161616;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:2px;padding:5px 10px;">FD SIGN &middot; STATUS UPDATE</p>
<p style="margin:14px 0 0 0;font-size:24px;line-height:30px;font-weight:bold;color:#161616;">${esc(head)}</p></td></tr>
<tr><td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#666666;">
<p style="margin:0 0 10px 0;">Document${esc(by)}:</p>
<p style="margin:0;padding:12px 14px;background-color:#f4f4f4;border-radius:8px;color:#161616;font-weight:bold;">${esc(p.title)}</p></td></tr>
<tr><td style="padding:20px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 8px 0;font-size:13px;line-height:18px;font-weight:bold;color:#161616;">${esc(count)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td bgcolor="#ecebe6" style="background-color:#ecebe6;border-radius:4px;height:8px;font-size:1px;line-height:1px;"><table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0" style="width:${pct}%;"><tr><td bgcolor="${voided ? "#b0b0aa" : "#1f9d6b"}" style="background-color:${voided ? "#b0b0aa" : "#1f9d6b"};border-radius:4px;height:8px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr></table></td></tr>
<tr><td style="padding:10px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${rows}</table></td></tr>
<tr><td style="padding:22px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8a8a86;">
${p.event.kind === "completed" ? `<p style="margin:0 0 10px 0;color:#666666;">The signed copy has gone to everyone who signed, and to anyone given a copy.</p>` : voided ? "" : `<p style="margin:0 0 10px 0;color:#666666;">You will get an email each time someone signs.</p>`}
<p style="margin:0;">${mine ? "You get these updates because you sent this document for signing." : `You get these updates as the <b style="color:#666666;">key controller</b> for this document. You do not need to do anything.`}</p>
<p style="margin:10px 0 0 0;">Sent with FD Sign by Founders Doc.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
