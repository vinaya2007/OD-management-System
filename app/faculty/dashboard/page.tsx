"use client";

import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { SummaryCard } from "@/components/od/SummaryCard";

export default function FacultyDashboard() {
  const { currentUser, applications } = useDemo();
  const assigned = applications.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id));
  return (
    <AppShell user={currentUser}>
      <h2 className="mb-5 text-2xl font-bold text-navy">Faculty Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pending approvals" value={assigned.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id && approval.status === "PENDING")).length} icon={Clock} tone="amber" />
        <SummaryCard label="Approved" value={assigned.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id && approval.status === "APPROVED")).length} icon={CheckCircle2} tone="green" />
        <SummaryCard label="Rejected" value={assigned.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id && approval.status === "REJECTED")).length} icon={XCircle} tone="red" />
        <SummaryCard label="Correction requested" value={assigned.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id && approval.status === "CORRECTION_REQUESTED")).length} icon={RotateCcw} tone="blue" />
      </div>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">Pending OD Applications</h3>
        <ODTable records={assigned.filter((item) => item.status !== "WITHDRAWN")} role="faculty" />
      </section>
    </AppShell>
  );
}
