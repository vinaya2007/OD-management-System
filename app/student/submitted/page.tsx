"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";

export default function SubmittedRequestsPage() {
  const { currentUser, applications } = useDemo();
  return <AppShell user={currentUser}><h2 className="mb-4 text-2xl font-bold text-navy">Requests Submitted By Me</h2><ODTable records={applications.filter((item) => item.requester?.id === currentUser.id)} role="student" /></AppShell>;
}
