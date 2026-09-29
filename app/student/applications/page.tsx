"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";

export default function ApplicationsPage() {
  const { currentUser, applications } = useDemo();
  return (
    <AppShell user={currentUser}>
      <h2 className="mb-4 text-2xl font-bold text-navy">My ODs</h2>
      <ODTable records={applications.filter((item) => (item.odStudentIds ?? [item.studentId]).includes(currentUser.id))} role="student" />
    </AppShell>
  );
}
