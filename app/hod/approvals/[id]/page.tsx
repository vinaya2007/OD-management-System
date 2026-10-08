"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODDetail } from "@/components/od/ODDetail";

export default function HodReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, applications, hodDecision } = useDemo();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const record = applications.find((item) => item.id === params.id);
  const ready = record?.status === "PENDING_HOD" && !record.isSpecial;

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

  return (
    <AppShell user={currentUser}>
      {record ? (
        <>
          <ODDetail record={record} faculty={[]} viewerId={currentUser.id} viewerRole={currentUser.role} />
          <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-soft">
            <h3 className="font-bold text-navy">Final HOD Decision</h3>
            {record.isSpecial ? <p className="mt-2 rounded-lg bg-purple-50 p-3 text-sm font-semibold text-purple-900">Special OD decisions are handled in the Special ODs section.</p> : null}
            {!ready && !record.isSpecial ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">Waiting for faculty approval.</p> : null}
            {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required when rejecting" className="mt-3 min-h-24 w-full rounded-lg border border-line px-3 py-2" />
            <div className="mt-4 flex gap-3">
              <button disabled={!ready} onClick={() => decide(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">FINAL APPROVE</button>
              <button disabled={!ready} onClick={() => decide(false)} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">REJECT</button>
            </div>
          </section>
        </>
      ) : <div className="rounded-lg border border-line bg-white p-8 text-center text-muted">You don&apos;t have permission to view this application.</div>}
    </AppShell>
  );
}
