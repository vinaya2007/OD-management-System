"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";

export default function SpecialPermissionPage() {
  const { currentUser, applications } = useDemo();
  return (
    <AppShell user={currentUser}>
      <h2 className="text-2xl font-bold text-navy">Special Permission / Special OD</h2>
      <p className="mt-1 text-sm text-muted">Track Special OD requests submitted from your authenticated student account.</p>
      {applications.filter((item) => item.studentId === currentUser.id && item.isSpecial).length ? <div className="mt-5 space-y-4">{applications.filter((item) => item.studentId === currentUser.id && item.isSpecial).map((item) => <article key={item.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-purple-700">{item.category} Special OD</p><h3 className="mt-1 text-lg font-bold text-navy">{item.eventName}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">{item.status.replaceAll("_", " ")}</span></div>
        <p className="mt-2 text-sm text-muted">{item.eventDate} · Submitted {new Date(item.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{item.purpose || "—"}</p>
        <div className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2"><p><span className="font-medium text-muted">Faculty Approval: </span>{readable(item.facultyApprovalStatus ?? "PENDING")}</p><p><span className="font-medium text-muted">HOD Approval: </span>{readable(item.hodApprovalStatus ?? "NOT_REACHED")}</p></div>
      </article>)}</div> : <div className="mt-5"><ODTable records={[]} role="student" /></div>}
    </AppShell>
  );
}

function readable(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
