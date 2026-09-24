"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";

export default function HodApprovalsPage() {
  const { currentUser, applications } = useDemo();
  return <AppShell user={currentUser}><h2 className="mb-4 text-2xl font-bold text-navy">Pending HOD Approvals</h2><ODTable records={applications.filter((item) => item.status === "HOD_REVIEW")} role="hod" /></AppShell>;
}
