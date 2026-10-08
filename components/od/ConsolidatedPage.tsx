"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";

type ReportRow = { requestId: string; studentName: string; registerNumber: string; department: string; section: string; odDate: string; odType: string; category: string; reason: string; facultyStatus: string; hodStatus: string; status: string; facultyDate: string; hodDate: string };
const columns: Array<[keyof ReportRow, string]> = [["requestId","OD Request ID"],["studentName","Student"],["registerNumber","Register Number"],["department","Department"],["section","Section"],["odDate","OD Date"],["odType","OD Type"],["category","Category"],["reason","Reason / Purpose"],["facultyStatus","Faculty Approval"],["hodStatus","HOD Approval"],["status","Overall Status"],["facultyDate","Faculty Approval Date"],["hodDate","HOD Approval Date"]];

export function ConsolidatedPage() {
  const { currentUser } = useDemo();
  const [year, setYear] = useState("");
  const [section, setSection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<ReportRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const getUrl = useCallback((format?: string) => {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (section) params.set("section", section);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (format) params.set("format", format);
    return `/api/consolidated?${params.toString()}`;
  }, [year, section, from, to, category, status]);
  useEffect(() => {
    let active = true;
    void fetch(getUrl(), { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { records?: ReportRow[]; message?: string };
      if (!response.ok) throw new Error(body.message ?? "Report could not be loaded.");
      if (active) setRecords(body.records ?? []);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Report could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getUrl]);
  async function exportXlsx() {
    setExporting(true); setError("");
    try {
      const response = await fetch(getUrl("xlsx"), { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "Excel export failed."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "Consolidated_OD_Report.xlsx"; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Excel export failed."); }
    finally { setExporting(false); }
  }
  return <AppShell user={currentUser}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-navy">OD Consolidation</h2><p className="mt-1 text-sm text-muted">Live OD report for records you are authorized to view.</p></div><button type="button" onClick={() => void exportXlsx()} disabled={exporting || loading} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{exporting ? "Exporting..." : "Export Excel"}</button></div>
    <section className="mb-5 rounded-lg border border-line bg-white p-4 shadow-soft"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm font-medium text-muted">Year<select value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option>{["I","II","III","IV"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm font-medium text-muted">Section<select value={section} onChange={(event) => setSection(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>A</option><option>B</option></select></label>
      <label className="text-sm font-medium text-muted">From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
      <label className="text-sm font-medium text-muted">To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
      <label className="text-sm font-medium text-muted">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>Non-Technical</option><option>Technical</option><option>Club Organizer / Volunteer</option></select></label>
      <label className="text-sm font-medium text-muted">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>PENDING_FACULTY</option><option>PENDING_HOD</option><option>APPROVED</option><option>REJECTED_BY_FACULTY</option><option>REJECTED_BY_HOD</option><option>WITHDRAWN</option></select></label>
    </div></section>
    {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <section className="overflow-x-auto rounded-lg border border-line bg-white shadow-soft"><table className="min-w-[1500px] w-full text-left text-sm"><thead className="bg-slate-50 text-muted"><tr>{columns.map(([, title]) => <th key={title} className="whitespace-nowrap p-3">{title}</th>)}</tr></thead><tbody>{records.map((row, index) => <tr key={`${row.requestId}-${row.registerNumber}-${index}`} className="border-t border-line align-top">{columns.map(([key]) => <td key={key} className="max-w-72 whitespace-pre-wrap p-3 text-ink">{row[key] || "—"}</td>)}</tr>)}</tbody></table>
      {!loading && !records.length ? <p className="p-8 text-center text-sm text-muted">No OD records match these filters.</p> : null}{loading ? <p className="p-8 text-center text-sm text-muted">Loading report…</p> : null}</section>
  </AppShell>;
}
