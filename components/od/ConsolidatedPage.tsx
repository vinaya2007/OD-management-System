"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { downloadConsolidatedPdf } from "@/lib/pdf/consolidated";

export function ConsolidatedPage() {
  const { currentUser, applications, collegeName, departmentName } = useDemo();
  const [year, setYear] = useState("III");
  const [section, setSection] = useState("A");
  const [date, setDate] = useState("2026-09-25");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");

  const records = useMemo(() => applications.filter((item) => {
    if (item.status !== "APPROVED") return false;
    if (year && item.student.year !== year) return false;
    if (section && item.student.section !== section) return false;
    if (date && !item.periods.some((period) => period.date === date)) return false;
    if (category && item.category !== category) return false;
    if (type === "Special" && !item.isSpecial) return false;
    if (type === "Regular" && item.isSpecial) return false;
    return true;
  }), [applications, year, section, date, category, type]);

  return (
    <AppShell user={currentUser}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-navy">OD Consolidation</h2>
          <p className="mt-1 text-sm text-muted">Generate approved ECE OD lists for class sharing and records.</p>
        </div>
        <button onClick={() => downloadConsolidatedPdf(records, { year, section, date }, { collegeName, departmentName })} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Download PDF</button>
      </div>
      <section className="mb-5 rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm font-medium text-muted">Year<select value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>I</option><option>II</option><option>III</option><option>IV</option></select></label>
          <label className="text-sm font-medium text-muted">Section<select value={section} onChange={(event) => setSection(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>A</option><option>B</option></select></label>
          <label className="text-sm font-medium text-muted">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
          <label className="text-sm font-medium text-muted">Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Any category" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
          <label className="text-sm font-medium text-muted">Type<select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">All</option><option>Regular</option><option>Special</option></select></label>
        </div>
      </section>
      <ODTable records={records} role={currentUser.role} />
    </AppShell>
  );
}
