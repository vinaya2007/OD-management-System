"use client";

import { useCallback, useEffect, useState } from "react";
import { decideSpecialFacultyODAction, decideSpecialHodODAction } from "@/app/actions/od";
import { getFacultySpecialODsAction, getHodSpecialODsAction, type SpecialODRow } from "@/app/actions/special-od";
import { useDemo } from "@/components/od/DemoProvider";

export function SpecialODQueue({ role }: { role: "faculty" | "hod" }) {
  const { currentUser, refresh } = useDemo();
  const [rows, setRows] = useState<SpecialODRow[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const getRows = useCallback(() => role === "faculty" ? getFacultySpecialODsAction() : getHodSpecialODsAction(), [role]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await getRows(); if (result.ok) setRows(result.data); else setError(result.message); }
    finally { setLoading(false); }
  }, [getRows]);
  useEffect(() => {
    let active = true;
    void getRows().then((result) => { if (!active) return; if (result.ok) setRows(result.data); else setError(result.message); }).catch(() => { if (active) setError("Special OD records could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getRows]);

  async function decide(row: SpecialODRow, approved: boolean) {
    const comment = comments[row.id]?.trim() ?? "";
    if (!approved && !comment) { setError("Enter a reason before rejecting this Special OD."); return; }
    setBusyId(row.id); setError(""); setSuccess("");
    const result = role === "faculty"
      ? await decideSpecialFacultyODAction({ odId: row.id, approved, comment })
      : await decideSpecialHodODAction({ odId: row.id, approved, comment });
    try {
      if (!result.ok) setError(result.message);
      else { setSuccess(approved ? role === "faculty" ? "Approved and forwarded to HOD." : "Special OD approved." : "Special OD rejected."); await Promise.all([load(), refresh()]); }
    } catch { setError("The decision was saved, but the latest portal data could not be refreshed."); }
    finally { setBusyId(""); }
  }

  return <section className="max-w-6xl">
    <h2 className="text-2xl font-bold text-navy">Special ODs</h2>
    <p className="mt-1 text-sm text-muted">{role === "faculty" ? "Special OD requests assigned to you for Faculty review." : `Special OD requests in ${currentUser.departmentName ?? currentUser.department}, including completed decisions.`}</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {success ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p> : null}
    {loading ? <p className="mt-5 rounded-lg border border-line bg-white p-6 text-sm text-muted">Loading Special OD records…</p>
      : rows.length ? <div className="mt-5 space-y-4">{rows.map((row) => <article key={row.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Special OD · {row.reference}</p><h3 className="mt-1 text-lg font-bold text-navy">{row.student} <span className="font-normal text-muted">· {row.registerNumber}</span></h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">{row.status.replaceAll("_", " ")}</span></div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><Detail label="Section" value={row.section} /><Detail label="OD Date" value={formatDate(row.date)} /><Detail label="Category" value={row.category} /><Detail label="Faculty Approval" value={readable(row.facultyStatus)} /><Detail label="HOD Approval" value={readable(row.hodStatus)} /><Detail label="Submitted" value={formatDateTime(row.submittedAt)} /><Detail label="Event" value={row.eventName} /><div className="sm:col-span-2 lg:col-span-3"><dt className="font-medium text-muted">Reason / Purpose</dt><dd className="mt-1 whitespace-pre-wrap text-ink">{row.reason || "—"}</dd></div></dl>
        {row.canReview ? <div className="mt-4 border-t border-line pt-4"><label className="block text-sm font-medium text-muted">{role === "faculty" ? "Faculty remarks" : "HOD remarks"}<textarea value={comments[row.id] ?? ""} onChange={(event) => setComments((all) => ({ ...all, [row.id]: event.target.value }))} maxLength={2000} className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2" placeholder="A reason is required to reject." /></label><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busyId === row.id} onClick={() => void decide(row, false)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{busyId === row.id ? "Saving…" : "Reject"}</button><button type="button" disabled={busyId === row.id} onClick={() => void decide(row, true)} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === row.id ? "Saving…" : role === "faculty" ? "Approve & Forward" : "Approve"}</button></div></div> : null}
      </article>)}</div> : <div className="mt-5 rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">No Special OD records are available for your review.</div>}
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="font-medium text-muted">{label}</dt><dd className="mt-1 text-ink">{value || "—"}</dd></div>; }
function readable(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—"; }
function formatDateTime(value: string) { return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
