"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { loadAdminPageData } from "@/app/actions/admin-data";

export default function AdminDashboard() {
  const { currentUser } = useDemo();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void loadAdminPageData().then((result) => { if (!active) return; if (result.ok) setStats(result.data.stats); else setError(result.message); }); return () => { active = false; }; }, []);
  const cards = [["Total Students", "students"], ["Total Faculty", "faculty"], ["Total HODs", "hods"], ["Pending Faculty", "pendingFaculty"], ["Pending HOD", "pendingHod"], ["Total OD Requests", "totalRequests"], ["Approved ODs", "approved"], ["Rejected ODs", "rejected"]] as const;
  return (
    <AppShell user={currentUser}>
      <h2 className="text-2xl font-bold text-navy">Admin Dashboard</h2>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, key]) => <div key={key} className="rounded-lg border border-line bg-white p-5 shadow-soft"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-3xl font-bold text-navy">{stats[key] ?? "—"}</p></div>)}
      </div>
    </AppShell>
  );
}
