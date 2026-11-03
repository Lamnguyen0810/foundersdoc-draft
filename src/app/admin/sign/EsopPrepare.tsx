"use client";

import { useEffect, useState } from "react";

/* FD Sign step 1, "From the ESOP dashboard": pick an approved vesting, check
   each holder's certificate details (filled from the dashboard, or read from
   their uploaded Letter of Grant), then create the Option Certificates
   straight into the send form. Nothing is typed twice; Founders Doc checks. */

interface Run {
  ref: string;
  batch: number;
  tranche: number;
  vestDate: string | null;
  approvedAt: string;
  approvedBy: string | null;
}
interface Holder {
  id: string;
  name: string;
  legalName: string;
  email: string | null;
  sendTo: string | null;
  idNo: string;
  nationality: string;
  grantDate: string;
  options: number;
  certificateNo: number | null;
  hasLetter: boolean;
}
interface Prep {
  ref: string;
  batch: number;
  tranche: number;
  vestDate: string | null;
  approved: boolean;
  simulation: string | null;
  company: { name: string; director: string; shareClass: string; contactEmail: string | null; sendTo: string | null };
  holders: Holder[];
  leavers: string[];
}
type Edit = { on: boolean; legalName: string; nationality: string; idNo: string; grantDate: string; options: string; read: string[]; note: string };
export interface Prepared {
  holderId: string;
  tranche: number;
  title: string;
  fileName: string;
  pdf: string;
  signer: { name: string; email: string; realEmail: string | null };
}

const FIELDS: Array<[keyof Edit, string, string]> = [
  ["legalName", "Full legal name", "As in the Letter of Grant"],
  ["nationality", "Nationality", "e.g. Vietnamese citizenship"],
  ["idNo", "ID number", ""],
  ["grantDate", "Grant date", "e.g. 24 October 2023"],
  ["options", "Options", ""],
];

export default function EsopPrepare({
  onCreate,
}: {
  onCreate: (p: { files: Prepared[]; director: { name: string; email: string; realEmail: string | null }; simulation: string | null; label: string }) => void;
}) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [ref, setRef] = useState("");
  const [prep, setPrep] = useState<Prep | null>(null);
  const [edit, setEdit] = useState<Record<string, Edit>>({});
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/sign/esop")
      .then((r) => r.json())
      .then((j: { runs?: Run[]; error?: string }) => {
        if (!alive) return;
        if (j.error) setErr(j.error);
        setRuns(j.runs ?? []);
      })
      .catch(() => alive && setErr("Could not read the ESOP dashboard."));
    return () => {
      alive = false;
    };
  }, []);

  async function pick(r: string) {
    setRef(r);
    setPrep(null);
    setErr("");
    if (!r) return;
    setBusy("load");
    try {
      const res = await fetch(`/api/sign/esop?ref=${encodeURIComponent(r)}`);
      const j = (await res.json()) as Prep & { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not load.");
      setPrep(j);
      setEdit(
        Object.fromEntries(
          j.holders.map((h) => [h.id, { on: true, legalName: h.legalName, nationality: h.nationality, idNo: h.idNo, grantDate: h.grantDate, options: h.options ? h.options.toLocaleString("en-US") : "", read: [], note: "" }]),
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setBusy("");
    }
  }

  const set = (id: string, patch: Partial<Edit>) => setEdit((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  async function readLetter(h: Holder) {
    if (!prep) return;
    set(h.id, { note: "Reading the Letter of Grant…" });
    try {
      const res = await fetch("/api/sign/esop/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holderId: h.id }) });
      const j = (await res.json()) as { error?: string; legalName?: string | null; idNo?: string | null; letterDate?: string | null; trancheOptions?: number[]; found?: string[] };
      if (!res.ok) throw new Error(j.error || "Could not read it.");
      const opt = j.trancheOptions?.[prep.tranche - 1];
      const patch: Partial<Edit> = { read: [], note: "" };
      const read: string[] = [];
      if (j.legalName) {
        patch.legalName = j.legalName;
        read.push("legalName");
      }
      if (j.idNo) {
        patch.idNo = j.idNo;
        read.push("idNo");
      }
      if (j.letterDate) {
        patch.grantDate = j.letterDate;
        read.push("grantDate");
      }
      if (opt) {
        patch.options = opt.toLocaleString("en-US");
        read.push("options");
      }
      patch.read = read;
      patch.note = read.length ? `Read from the Letter of Grant: ${j.found?.join(", ")}. Nationality is not in the letter: please check it.` : "Nothing could be read from this letter: please type the details.";
      set(h.id, patch);
    } catch (e) {
      set(h.id, { note: e instanceof Error ? e.message : "Could not read it." });
    }
  }
  async function readAll() {
    if (!prep) return;
    setBusy("letters");
    for (const h of prep.holders) if (h.hasLetter && edit[h.id]?.on) await readLetter(h);
    setBusy("");
  }

  async function create() {
    if (!prep) return;
    setErr("");
    const chosen = prep.holders.filter((h) => edit[h.id]?.on);
    if (!chosen.length) return setErr("Tick at least one holder.");
    setBusy("create");
    try {
      const res = await fetch("/api/sign/esop/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: prep.ref, save, rows: chosen.map((h) => ({ holderId: h.id, ...edit[h.id] })) }),
      });
      const j = (await res.json()) as { error?: string; files?: Prepared[]; director?: { name: string; email: string; realEmail: string | null }; simulation?: string | null };
      if (!res.ok || !j.files || !j.director) throw new Error(j.error || "Could not create the certificates.");
      onCreate({ files: j.files, director: j.director, simulation: j.simulation ?? null, label: `Batch ${prep.batch}, Tranche ${prep.tranche}${prep.vestDate ? ` (vesting ${prep.vestDate})` : ""}` });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the certificates.");
    } finally {
      setBusy("");
    }
  }

  const n = prep ? prep.holders.filter((h) => edit[h.id]?.on).length : 0;
  return (
    <div className="fs-esop">
      <div className="fs-esop-pick">
        <label className="fs-field">
          <span>Approved vesting</span>
          <select className="input" value={ref} onChange={(e) => void pick(e.target.value)} disabled={!runs}>
            <option value="">{runs ? (runs.length ? "Choose a vesting…" : "No approved vesting yet: approve one on the ESOP dashboard") : "Loading…"}</option>
            {runs?.map((r) => (
              <option key={r.ref} value={r.ref}>
                Batch {r.batch} · Tranche {r.tranche}
                {r.vestDate ? ` · vests ${r.vestDate}` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="fs-hint">Only approved vestings are listed: approval on the dashboard gives each holder their certificate number.</p>
      </div>
      {busy === "load" && <p className="fs-hint">Loading the holders…</p>}
      {prep && (
        <>
          {prep.simulation && (
            <p className="fs-sim">
              <b>Simulation on:</b> every email goes to <b>{prep.simulation}</b> instead of HitPay and the holders. Real addresses are shown greyed out.
            </p>
          )}
          <div className="fs-esop-head">
            <span>
              <b>{prep.holders.length}</b> active holder{prep.holders.length === 1 ? "" : "s"} · {prep.company.name}
              {prep.leavers.length ? ` · ${prep.leavers.length} leaver${prep.leavers.length === 1 ? "" : "s"} (no certificate)` : ""}
            </span>
            <button className="dbtn" disabled={!!busy || !prep.holders.some((h) => h.hasLetter)} onClick={() => void readAll()}>
              {busy === "letters" ? "Reading letters…" : "Read all Letters of Grant"}
            </button>
          </div>
          {prep.holders.map((h) => {
            const e = edit[h.id];
            if (!e) return null;
            return (
              <div key={h.id} className={`fs-esop-row ${e.on ? "" : "off"}`}>
                <div className="fs-esop-top">
                  <label className="fs-esop-check">
                    <input type="checkbox" checked={e.on} onChange={(x) => set(h.id, { on: x.target.checked })} />
                    <b>{h.name}</b>
                  </label>
                  <span className="fs-hint">
                    Certificate No. <b>{h.certificateNo ?? "—"}</b> · {prep.simulation ? <s title="real address">{h.email || "no email"}</s> : h.email || "no email on the dashboard"}
                  </span>
                  <button className="dbtn" disabled={!h.hasLetter || !!busy} onClick={() => void readLetter(h)} title={h.hasLetter ? "Fill the details from the uploaded Letter of Grant" : "No Letter of Grant uploaded for this holder"}>
                    {h.hasLetter ? "Read Letter of Grant" : "No letter uploaded"}
                  </button>
                </div>
                {e.on && (
                  <div className="fs-esop-fields">
                    {FIELDS.map(([k, label, ph]) => (
                      <label key={k} className={`${e.read.includes(k) ? "read" : ""} ${String(e[k]).trim() ? "" : "empty"}`}>
                        {label}
                        <input className="input" value={String(e[k])} placeholder={ph} onChange={(x) => set(h.id, { [k]: x.target.value, read: e.read.filter((r) => r !== k) } as Partial<Edit>)} />
                      </label>
                    ))}
                  </div>
                )}
                {e.note && <p className="fs-hint">{e.note}</p>}
              </div>
            );
          })}
          <label className="fs-esop-save">
            <input type="checkbox" checked={save} onChange={(x) => setSave(x.target.checked)} /> Save these details on the holders&rsquo; rows in the ESOP dashboard
          </label>
          {err && <p className="fs-err">{err}</p>}
          <div className="fs-sendbar">
            <span className="fs-hint">Director: {prep.company.director || "not set on the dashboard"} · each holder signs their own certificate</span>
            <button className="btn btn-black" disabled={!!busy || !n || !prep.approved} onClick={() => void create()}>
              {busy === "create" ? "Creating…" : `Create ${n} certificate${n === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
      {!prep && err && <p className="fs-err">{err}</p>}
    </div>
  );
}
