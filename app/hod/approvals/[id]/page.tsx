"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODDetail } from "@/components/od/ODDetail";
import { allFacultyApproved } from "@/lib/od-rules";

export default function HodReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, applications, hodDecision, specialPermissionDecision } = useDemo();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const record = applications.find((item) => item.id === params.id);
  const ready = record ? allFacultyApproved(record.approvals) : false;

  async function decide(approved: boolean) {
    setError("");
    if (!record) return;
    if (!ready) {
      alert("Waiting for faculty approval.");
      return;
    }
    if (!approved && !reason.trim()) {
      alert("Rejection reason is required.");
      return;
    }
    try { await hodDecision(record.id, approved, reason); router.push("/hod/dashboard"); }
    catch { setError("The OD decision could not be saved. Refresh and try again."); }
  }

  async function decideSpecial(approved: boolean) {
    if (!record) return;
    setError("");
    if (!approved && !reason.trim()) { setError("A reason is required when rejecting special permission."); return; }
    try { await specialPermissionDecision(record.id, approved, reason); router.push("/hod/dashboard"); }
    catch { setError("The special permission decision could not be saved. Refresh and try again."); }
  }

  return (
    <AppShell user={currentUser}>
      {record ? (
        <>
          <ODDetail record={record} faculty={[]} />
          {record.isSpecial && record.specialPermissionStatus === "PENDING" ? <section className="mt-5 rounded-lg border border-purple-200 bg-purple-50 p-5">
            <h3 className="font-bold text-purple-950">Special Permission Review</h3>
            <p className="mt-1 text-sm text-purple-900">This decision grants the OD limit exception only. Faculty and HOD review still apply.</p>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required when rejecting" className="mt-3 min-h-24 w-full rounded-lg border border-purple-200 px-3 py-2" />
            {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 flex gap-3"><button onClick={() => decideSpecial(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve Special Permission</button><button onClick={() => decideSpecial(false)} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Reject Request</button></div>
          </section> : null}
          <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">Final HOD Decision</h3>
            {record.specialPermissionStatus === "PENDING" ? <p className="mt-2 rounded-lg bg-purple-50 p-3 text-sm font-semibold text-purple-800">Special permission must be approved first.</p> : null}
            {record.isSpecial && record.specialPermissionStatus !== "APPROVED" ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">Special permission is not approved.</p> : null}
            {!ready ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">Waiting for faculty approval.</p> : null}
            {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required when rejecting" className="mt-3 min-h-24 w-full rounded-lg border border-line px-3 py-2" />
            <div className="mt-4 flex gap-3">
              <button disabled={!ready || (record.isSpecial && record.specialPermissionStatus !== "APPROVED")} onClick={() => decide(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">FINAL APPROVE</button>
              <button onClick={() => decide(false)} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">REJECT</button>
            </div>
          </section>
        </>
      ) : <div className="rounded-lg border border-line bg-white p-8 text-center text-muted">You don&apos;t have permission to view this application.</div>}
    </AppShell>
  );
}
