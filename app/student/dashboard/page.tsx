"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { SummaryCard } from "@/components/od/SummaryCard";
import { CheckCircle2, Clock3, FilePlus2, XCircle } from "lucide-react";

export default function StudentDashboard() {
  const { currentUser, applications } = useDemo();
  const myOds = applications.filter((item) => (item.odStudentIds ?? [item.studentId]).includes(currentUser.id));
  const submitted = applications.filter((item) => item.requester?.id === currentUser.id);
  const pending = myOds.filter((item) => ["PENDING_FACULTY", "PENDING_HOD", "SUBMITTED", "FACULTY_REVIEW", "HOD_REVIEW"].includes(item.status)).length;
  const approved = myOds.filter((item) => item.status === "APPROVED").length;
  const rejected = myOds.filter((item) => ["REJECTED", "REJECTED_BY_FACULTY", "REJECTED_BY_HOD"].includes(item.status)).length;
  return <AppShell user={currentUser}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-navy">Student Dashboard</h2><p className="mt-1 text-sm text-muted">ODs where you are a participating student, plus requests you submitted.</p></div><Link href="/student/apply" className="rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white">Create OD request</Link></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="My ODs" value={myOds.length} icon={FilePlus2}/><SummaryCard label="Pending" value={pending} icon={Clock3} tone="amber"/><SummaryCard label="Approved" value={approved} icon={CheckCircle2} tone="green"/><SummaryCard label="Rejected" value={rejected} icon={XCircle} tone="red"/></div>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-bold text-navy">My ODs</h3><Link href="/student/applications" className="text-sm font-semibold text-accent">View all</Link></div><ODTable records={myOds.slice(0,5)} role="student"/></section>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-bold text-navy">Requests Submitted By Me</h3><Link href="/student/submitted" className="text-sm font-semibold text-accent">View all</Link></div><ODTable records={submitted.slice(0,5)} role="student"/></section>
  </AppShell>;
}