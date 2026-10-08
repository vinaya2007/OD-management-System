"use client";

import { CheckCircle2, Clock, FileText, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { createFacultyRoleRequestAction, listMyFacultyRoleRequestsAction } from "@/app/actions/admin";
import { useDemo } from "@/components/od/DemoProvider";
import { ODTable } from "@/components/od/ODTable";
import { SummaryCard } from "@/components/od/SummaryCard";
import { SpecialODQueue } from "@/components/od/SpecialODQueue";

export default function HodDashboard() {
  const { currentUser, applications } = useDemo();
  const [staffEmail, setStaffEmail] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [facultyRequests, setFacultyRequests] = useState<Array<{id:string;email:string;reason:string;status:string;createdAt:string}>>([]);
  async function refreshFacultyRequests() { const result = await listMyFacultyRoleRequestsAction(); if (result.ok) setFacultyRequests(result.data); else setRequestMessage(result.message); }
  useEffect(() => { const timer = window.setTimeout(() => void refreshFacultyRequests(), 0); return () => window.clearTimeout(timer); }, []);
  async function submitFacultyRequest(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setRequestBusy(true); setRequestMessage(""); const result = await createFacultyRoleRequestAction({ email: staffEmail, reason: requestReason }); setRequestBusy(false); if (!result.ok) { setRequestMessage(result.message); return; } setStaffEmail(""); setRequestReason(""); setRequestMessage("Faculty role request submitted to the administrator."); await refreshFacultyRequests(); }
  const validStaffEmail = /^[^\s@]+@srmist\.edu\.in$/i.test(staffEmail.trim());
  const ece = applications.filter((item) => item.student.department === "ECE");
  return (
    <AppShell user={currentUser}>
      <h2 className="mb-5 text-2xl font-bold text-navy">HOD Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Pending HOD" value={ece.filter((item) => item.status === "PENDING_HOD").length} icon={Clock} tone="amber" />
        <SummaryCard label="Approved ODs" value={ece.filter((item) => item.status === "APPROVED").length} icon={CheckCircle2} tone="green" />
        <SummaryCard label="Rejected" value={ece.filter((item) => ["REJECTED_BY_FACULTY", "REJECTED_BY_HOD", "REJECTED"].includes(item.status)).length} icon={XCircle} tone="red" />
        <SummaryCard label="Total approved" value={ece.filter((item) => item.status === "APPROVED").length} icon={FileText} />
        <SummaryCard label="Special ODs" value={ece.filter((item) => item.isSpecial).length} icon={ShieldAlert} tone="purple" />
      </div>
      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft"><h3 className="font-bold text-navy">Request Faculty Account</h3><p className="mt-1 text-sm text-muted">The administrator reviews the request and sends the existing Faculty invitation if approved.</p><form onSubmit={submitFacultyRequest}><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm text-muted">SRMIST faculty email<input type="email" required maxLength={254} value={staffEmail} onChange={e=>setStaffEmail(e.target.value)} placeholder="name@srmist.edu.in" className="mt-1 w-full rounded-lg border border-line px-3 py-2"/></label><label className="text-sm text-muted">Reason<textarea required maxLength={2000} value={requestReason} onChange={e=>setRequestReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"/><span className="mt-1 block text-xs">Enter a reason (1–2000 characters).</span></label></div>{requestMessage&&<p role={requestMessage.includes("submitted")?"status":"alert"} className="mt-2 text-sm text-muted">{requestMessage}</p>}<button type="submit" disabled={requestBusy||!validStaffEmail||!requestReason.trim()} className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{requestBusy?"Submitting...":"Submit Faculty Request"}</button><button type="button" onClick={()=>void refreshFacultyRequests()} className="ml-3 text-sm font-semibold text-accent">Refresh my requests</button></form><ul className="mt-3 space-y-2 text-sm">{facultyRequests.map(item=><li key={item.id} className="rounded border border-line p-3">{item.email} · {item.status}<p className="text-xs text-muted">{item.reason}</p><p className="text-xs text-muted">Submitted {new Date(item.createdAt).toLocaleDateString("en-IN")}</p></li>)}</ul></section>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">Special Permission Requests</h3>
        <SpecialODQueue role="hod" />
      </section>
      <section className="mt-6">
        <h3 className="mb-3 text-lg font-bold text-navy">Ready for HOD Review</h3>
        <ODTable records={ece.filter((item) => !item.isSpecial && item.status === "PENDING_HOD")} role="hod" />
      </section>
    </AppShell>
  );
}
