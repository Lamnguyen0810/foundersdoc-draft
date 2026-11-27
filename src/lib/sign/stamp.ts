import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * 0316 (Rachel): "ensure every page has a doc ID". A small grey line at the top left of every page,
 * "FD Sign Document ID: <envelope id>", the same ID as on the audit trail page, so any printed or
 * downloaded page can be traced back to its signing request. Drawn on the copy that is shown or
 * downloaded; the stored original (and its fingerprint on the audit trail) is never changed.
 * Rotated pages get it at the top left as the page is seen.
 */
export const idLine = (envelopeId: string) => `FD Sign Document ID: ${envelopeId.toUpperCase()}`;

export async function stampId(bytes: Uint8Array, envelopeId: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = idLine(envelopeId);
  const size = 6.5;
  const color = rgb(0.45, 0.45, 0.45);
  for (const page of doc.getPages()) {
    const b = page.getCropBox();
    const [x0, y0, x1, y1] = [b.x, b.y, b.x + b.width, b.y + b.height];
    /* (dx, dy): from the top left of the page as it is seen */
    const dx = 18;
    const dy = 13;
    const angle = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const at =
      angle === 90 ? { x: x0 + dy, y: y0 + dx } : angle === 180 ? { x: x1 - dx, y: y0 + dy } : angle === 270 ? { x: x1 - dy, y: y1 - dx } : { x: x0 + dx, y: y1 - dy };
    page.drawText(text, { ...at, size, font, color, rotate: degrees(angle) });
  }
  return doc.save();
}
