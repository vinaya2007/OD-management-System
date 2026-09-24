"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";

export default function AdminDashboard() {
  const { currentUser, profiles, limits } = useDemo();
  return (
    <AppShell user={currentUser}>
      <h2 className="text-2xl font-bold text-navy">Admin Dashboard</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft"><p className="text-sm text-muted">Active users</p><p className="mt-2 text-3xl font-bold text-navy">{profiles.filter((item) => item.isActive).length}</p></div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft"><p className="text-sm text-muted">Faculty</p><p className="mt-2 text-3xl font-bold text-navy">{profiles.filter((item) => item.role === "faculty").length}</p></div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft"><p className="text-sm text-muted">Configured limits</p><p className="mt-2 text-3xl font-bold text-navy">{limits.length}</p></div>
      </div>
    </AppShell>
  );
}
