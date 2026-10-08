"use client";

import { useEffect, useState } from "react";
import { getHodODLimitsAction, saveHodODLimitsAction } from "@/app/actions/hod-limits";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import type { ODCategory } from "@/types/domain";

const categoryList: ODCategory[] = ["Technical", "Non-Technical", "Club Organizer / Volunteer"];
export function HODLimitsEditor() {
  const { currentUser } = useDemo();
  const [year, setYear] = useState("");
  const [limits, setLimits] = useState<Record<ODCategory, number>>({ Technical: 5, "Non-Technical": 3, "Club Organizer / Volunteer": 3 });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => { void getHodODLimitsAction().then((result) => {
    if (!result.ok) setMessage(result.message);
    else { setYear(result.academicYear); setLimits(Object.fromEntries(result.limits.map((item) => [item.category, item.maxOds])) as Record<ODCategory, number>); }
  }).catch(() => setMessage("OD limits could not be loaded.")).finally(() => setBusy(false)); }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const result = await saveHodODLimitsAction(categoryList.map((category) => ({ category, maxOds: limits[category] })));
      setMessage(result.ok ? "OD limits saved." : result.message ?? "OD limits could not be saved.");
    } catch { setMessage("OD limits could not be saved."); }
    finally { setBusy(false); }
  }
  return <AppShell user={currentUser}><section className="max-w-3xl rounded-lg border border-line bg-white p-6 shadow-soft">
    <h2 className="text-2xl font-bold text-navy">OD Limits</h2><p className="mt-1 text-sm text-muted">Limits for your department · {year || "Active academic year"}</p>
    <div className="mt-5 grid gap-4">{categoryList.map((category) => <label key={category} className="grid items-center gap-2 text-sm font-medium text-ink sm:grid-cols-[1fr_8rem]">{category}<input type="number" min={0} max={365} step={1} value={limits[category]} onChange={(event) => setLimits((old) => ({ ...old, [category]: Number(event.target.value) }))} className="rounded-lg border border-line px-3 py-2" /></label>)}</div>
    {message ? <p role="status" className={`mt-4 text-sm ${message === "OD limits saved." ? "text-emerald-700" : "text-red-700"}`}>{message}</p> : null}
    <button type="button" onClick={() => void save()} disabled={busy} className="mt-5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Loading..." : "Save Changes"}</button>
  </section></AppShell>;
}
