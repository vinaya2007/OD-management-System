"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";

export default function FacultyApprovalsPage() {
  const { currentUser, applications } = useDemo();
  const assigned = applications.filter((item) => item.approvals.some((approval) => approval.facultyId === currentUser.id && approval.status === "PENDING"));
  return <AppShell user={currentUser}><h2 className="mb-4 text-2xl font-bold text-navy">Pending Approvals</h2><ODTable records={assigned} role="faculty" /></AppShell>;
}
