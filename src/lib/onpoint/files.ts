import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OpError, type Me } from "./server";

/**
 * OnPoint's file folder (0286): every invoice file uploaded (PDF invoices, invoice lists, client sheets) is kept,
 * private, in Supabase Storage (bucket "onpoint-files"), with the day, who uploaded it and what came of it.
 * Only the website's server reads it; a file opens through a link that works for one minute.
 */

const BUCKET = "onpoint-files";
const db = () => supabaseAdmin();
export type FileKind = "pdf" | "list" | "sheet";
export interface StoredFile {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  uploaded_by: string | null;
  uploaded_at: string;
  invoice_id: string | null;
  import_id: number | null;
  details: Record<string, unknown>;
}
const FILE_COLS = "id, name, kind, size, uploaded_by, uploaded_at, invoice_id, import_id, details";

export async function filesReady(): Promise<boolean> {
  const r = await db().from("onpoint_files").select("id").limit(1);
  return !r.error;
}

/** keep the file; null (and nothing kept) before supabase/143 is run */
export async function storeFile(m: Me, buf: Buffer, name: string, kind: FileKind, type: string): Promise<string | null> {
  if (!(await filesReady())) return null;
  const id = crypto.randomUUID();
  const safe = name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-120);
  const path = `${m.ws.id}/${new Date().toISOString().slice(0, 10)}/${id}-${safe}`;
  const up = await db().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (up.error) throw new OpError(`The file could not be kept: ${up.error.message}`, 500);
  const r = await db().from("onpoint_files").insert({ id, workspace_id: m.ws.id, name: name.slice(0, 200), kind, size: buf.length, path, uploaded_by: m.email, details: {} });
  if (r.error) throw new OpError(r.error.message, 500);
  return id;
}

export async function noteFile(m: Me, id: string | null, patch: { invoice_id?: string | null; import_id?: number | null; details?: Record<string, unknown> }) {
  if (!id) return;
  await db().from("onpoint_files").update(patch).eq("workspace_id", m.ws.id).eq("id", id);
}

export async function listFiles(wsId: string): Promise<StoredFile[] | null> {
  const r = await db().from("onpoint_files").select(FILE_COLS).eq("workspace_id", wsId).order("uploaded_at", { ascending: false }).range(0, 499);
  return r.error ? null : ((r.data ?? []) as StoredFile[]);
}

export async function fileLink(m: Me, id: string): Promise<string> {
  const f = (await db().from("onpoint_files").select("path, name").eq("workspace_id", m.ws.id).eq("id", id).maybeSingle()).data as { path: string; name: string } | null;
  if (!f) throw new OpError("That file is no longer there.", 404);
  const s = await db().storage.from(BUCKET).createSignedUrl(f.path, 60, { download: false });
  if (s.error || !s.data?.signedUrl) throw new OpError("The file could not be opened.", 500);
  return s.data.signedUrl;
}

export async function removeFile(m: Me, id: string) {
  const f = (await db().from("onpoint_files").select("path").eq("workspace_id", m.ws.id).eq("id", id).maybeSingle()).data as { path: string } | null;
  if (!f) throw new OpError("That file is no longer there.", 404);
  await db().storage.from(BUCKET).remove([f.path]);
  const r = await db().from("onpoint_files").delete().eq("workspace_id", m.ws.id).eq("id", id);
  if (r.error) throw new OpError(r.error.message, 500);
}
