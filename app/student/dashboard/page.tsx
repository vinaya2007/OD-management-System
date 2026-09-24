"use client";

import { CheckCircle2, Clock, FileText, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { SummaryCard } from "@/components/od/SummaryCard";
import { getLimitState } from "@/lib/od-rules";

export default function StudentDashboard() {
  const { currentUser, applications, limits } = useDemo();
  const records = applications.filter((item) => item.studentId === currentUser.id);
  const stats = {
    total: records.length,
    approved: records.filter((item) => item.status === "APPROVED").length,
    pending: records.filter((item) => ["SUBMITTED", "FACULTY_REVIEW", "HOD_REVIEW", "CORRECTION_REQUESTED"].includes(item.status)).length,
    rejected: records.filter((item) => item.status === "REJECTED").length,
    special: records.filter((item) => item.isSpecial).length
  };

  return (
    <AppShell user={currentUser}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Student Dashboard</h2>
          <p className="mt-1 text-sm text-muted">{currentUser.registerNumber} · ECE · {currentUser.year}-{currentUser.section}</p>
        </div>
        <Link href="/student/apply" className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Apply for OD</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total ODs" value={stats.total} icon={FileText} />
        <SummaryCard label="Approved" value={stats.approved} icon={CheckCircle2} tone="green" />
        <SummaryCard label="Pending" value={stats.pending} icon={Clock} tone="amber" />
        <SummaryCard label="Rejected" value={stats.rejected} icon={XCircle} tone="red" />
        <SummaryCard label="Special ODs" value={stats.special} icon={ShieldAlert} tone="purple" />
      </div>
      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h3 className="text-lg font-bold text-navy">OD Limit Usage</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {limits.slice(0, 4).map((limit) => {
            const state = getLimitState(applications, limits, currentUser.id, limit.category);
            const pct = Math.min(100, Math.round((state.used / state.allowed) * 100));
            return (
              <div key={limit.category}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{limit.category}</span>
                  <span className="text-muted">{state.used} / {state.allowed} used</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">My OD Applications</h3>
        <ODTable records={records} role="student" />
      </section>
    </AppShell>
  );
}
