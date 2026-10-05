"use client";

import { useEffect, useState } from "react";
import { getHodDepartmentODsAction, getHodDepartmentReportsAction, type HodODRow, type HodReports } from "@/app/actions/hod-dashboard";

export function HodSecondarySection({ section }: { section: "all" | "special" | "reports" }) {
  const [rows, setRows] = useState<HodODRow[]>([]);
  const [reports, setReports] = useState<HodReports | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      const result = section === "reports" ? await getHodDepartmentReportsAction() : await getHodDepartmentODsAction();
      if (!active) return;
      if (!result.ok) setError(result.message);
      else if (section === "reports") setReports(result.data as HodReports);
      else setRows(result.data as HodODRow[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [section]);

  const title = section === "all" ? "All ODs" : section === "special" ? "Special ODs" : "Reports";
  const visible = section === "special" ? rows.filter((row) => row.category.toLowerCase().includes("special")) : rows;
  return <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
    <h2 className="text-2xl font-bold text-navy">{title}</h2>
    <p className="mt-1 text-sm text-muted">Live records for your authorized department.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {loading ? <p className="mt-5 text-sm text-muted">Loading department records…</p> : null}
    {!loading && !error && section === "reports" && reports ? <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total ODs" value={reports.total} /><Metric label="Pending HOD" value={reports.pendingHod} /><Metric label="Approved ODs" value={reports.approved} /><Metric label="Rejected ODs" value={reports.rejected} /><Metric label="Special ODs" value={reports.special} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-3"><Breakdown title="By category" items={reports.categories} /><Breakdown title="By section" items={reports.sections} /><Breakdown title="By month" items={reports.months} /><Breakdown title="By approval status" items={reports.statuses} /><Breakdown title="Top students by OD count" items={reports.students} /></div>
      <p className="mt-4 text-xs text-muted">Special ODs are counted only when the stored category is explicitly marked “special”; the current schema has no separate special-OD flag.</p>
    </> : null}
    {!loading && !error && section !== "reports" ? <>
      {section === "special" ? <p className="mt-1 text-sm text-muted">Records are included only when their stored OD category explicitly contains “special”.</p> : null}
      <ODListing rows={visible} empty={section === "special" ? "No special-category ODs are recorded for your department." : "No ODs are recorded for your department."} />
    </> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-line p-4"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p></div>; }
function Breakdown({ title, items }: { title: string; items: HodReports["categories"] }) { return <div><h3 className="font-semibold text-navy">{title}</h3>{items.length ? <ul className="mt-2 divide-y divide-line text-sm">{items.map((item) => <li key={item.label} className="flex justify-between gap-3 py-2"><span>{item.label}</span><b>{item.count}</b></li>)}</ul> : <p className="mt-2 text-sm text-muted">No records.</p>}</div>; }
function ODListing({ rows, empty }: { rows: HodODRow[]; empty: string }) {
  return rows.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b border-line text-muted">{["OD Reference","Student(s) / Register No.","Department","Section","Category","Date","Reason / Purpose","Faculty","HOD","Overall Status"].map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-line align-top"><td className="px-3 py-3 font-semibold text-navy">{row.reference}</td><td className="px-3 py-3">{row.students.map((student) => <div key={`${student.registerNumber}-${student.name}`}>{student.name}<div className="text-xs text-muted">{student.registerNumber}</div></div>)}</td><td className="px-3 py-3">{row.department||"—"}</td><td className="px-3 py-3">{row.students.map((student) => <div key={student.registerNumber}>{student.section}</div>)}</td><td className="px-3 py-3">{row.category}</td><td className="px-3 py-3">{row.date || "—"}</td><td className="max-w-xs whitespace-pre-wrap px-3 py-3">{row.reason || "—"}</td><td className="px-3 py-3">{row.facultyStatus}</td><td className="px-3 py-3">{row.hodStatus}</td><td className="px-3 py-3">{readableStatus(row.status)}</td></tr>)}</tbody></table></div> : <div className="mt-5 rounded-lg border border-line p-6 text-center text-sm text-muted">{empty}</div>;
}

function readableStatus(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
