"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Create your ESOP dashboard": the company's name, then straight to its new, empty dashboard. */
export default function CreateDashboard({ first }: { first: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Type your company's name.");
    setBusy(true);
    try {
      const res = await fetch("/api/esop/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; slug?: string; preview?: boolean; error?: string };
      if (!out.ok || !out.slug) return setError(out.error ?? "Could not create the dashboard.");
      router.push(`/esop/${out.slug}${out.preview ? "?demo=new" : ""}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="esop-create" onSubmit={(e) => void create(e)}>
      <h2>{first ? "Create your ESOP dashboard" : "Create another dashboard"}</h2>
      <p>Track every option holder, vesting date and certificate in one place. Free to start; you can invite your team after.</p>
      <label>
        Company name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Pte. Ltd." maxLength={80} autoFocus={first} />
      </label>
      {error && <p className="esop-create-err" role="alert">{error}</p>}
      <button className="e-btn g" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create dashboard"}
      </button>
    </form>
  );
}
