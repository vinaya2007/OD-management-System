"use client";

import { CheckCircle2, Clock, FileText, ShieldAlert, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { SummaryCard } from "@/components/od/SummaryCard";

export default function HodDashboard() {
  const { currentUser, applications } = useDemo();
  const ece = applications.filter((item) => item.student.department === "ECE");
  return (
    <AppShell user={currentUser}>
      <h2 className="mb-5 text-2xl font-bold text-navy">HOD Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Pending HOD" value={ece.filter((item) => item.status === "HOD_REVIEW").length} icon={Clock} tone="amber" />
        <SummaryCard label="Approved today" value={ece.filter((item) => item.status === "APPROVED").length} icon={CheckCircle2} tone="green" />
        <SummaryCard label="Rejected" value={ece.filter((item) => item.status === "REJECTED").length} icon={XCircle} tone="red" />
        <SummaryCard label="Total approved" value={ece.filter((item) => item.status === "APPROVED").length} icon={FileText} />
        <SummaryCard label="Special ODs" value={ece.filter((item) => item.isSpecial).length} icon={ShieldAlert} tone="purple" />
      </div>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">Special Permission Requests</h3>
        <ODTable records={ece.filter((item) => item.isSpecial && item.specialPermissionStatus === "PENDING")} role="hod" />
      </section>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">Ready for HOD Review</h3>
        <ODTable records={ece.filter((item) => item.status === "HOD_REVIEW")} role="hod" />
      </section>
    </AppShell>
  );
}
