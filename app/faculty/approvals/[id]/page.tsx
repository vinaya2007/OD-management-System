"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODDetail } from "@/components/od/ODDetail";

export default function FacultyReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, applications, updateFacultyApproval } = useDemo();
  const [comment, setComment] = useState("");
  const record = applications.find((item) => item.id === params.id);
  const ownApproval = record?.approvals.find((approval) => approval.facultyId === currentUser.id);

  function decide(status: "APPROVED" | "CORRECTION_REQUESTED" | "REJECTED") {
    if (!record || !ownApproval) return;
    if (status !== "APPROVED" && !comment.trim()) {
      alert(status === "REJECTED" ? "Rejection reason is required." : "Correction comment is required.");
      return;
    }
    updateFacultyApproval(record.id, currentUser.id, status, comment);
    router.push("/faculty/dashboard");
  }

  return (
    <AppShell user={currentUser}>
      {record ? (
        <>
          <ODDetail record={record} faculty={[]} />
          {ownApproval ? (
            <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-soft">
              <h3 className="font-bold text-navy">Faculty Action</h3>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment or rejection reason" className="mt-3 min-h-24 w-full rounded-lg border border-line px-3 py-2" />
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => decide("APPROVED")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve</button>
                <button onClick={() => decide("CORRECTION_REQUESTED")} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Request Correction</button>
                <button onClick={() => decide("REJECTED")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Reject</button>
              </div>
            </section>
          ) : null}
        </>
      ) : <div className="rounded-lg border border-line bg-white p-8 text-center text-muted">You don&apos;t have permission to view this application.</div>}
    </AppShell>
  );
}
