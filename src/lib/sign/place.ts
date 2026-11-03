import "server-only";
import { autoPlace, readPdf } from "./boxes";
import { openPdfNode } from "./pdfjs-node";
import type { SignField } from "./store";

/**
 * Boxes for a document that has none stored (sent before 0175, or SQL 113 run
 * late): read the PDF's text on the server and put each signer's box on the
 * line above their label ("Director", "Option Holder"), exactly as the admin
 * page does. Kept in memory per envelope, so it runs once per server.
 */
const cache = new Map<string, SignField[]>();

export async function autoFields(envelopeId: string, original: Uint8Array, signers: Array<{ name: string; role: string }>): Promise<SignField[]> {
  const key = `${envelopeId}:${signers.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const doc = await openPdfNode(original);
    const info = await readPdf(doc as unknown as Parameters<typeof readPdf>[0]);
    void doc.destroy();
    const fields = autoPlace(info, signers).map(({ position, kind, page, x, y, w, h }) => ({ position, kind, page, x, y, w, h }));
    if (cache.size > 500) cache.clear();
    cache.set(key, fields);
    return fields;
  } catch (e) {
    console.error("[sign] auto-place failed:", e);
    return [];
  }
}
