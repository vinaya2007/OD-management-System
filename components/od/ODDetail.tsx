"use client";

import { useState } from "react";
import { periodLabel } from "@/lib/od-rules";
import { StatusBadge } from "@/components/od/StatusBadge";
import type { ODRecord, Profile } from "@/types/domain";

export function ODDetail({ record, faculty, onReplaceFaculty, onWithdraw }: { record: ODRecord; faculty: Profile[]; onReplaceFaculty?: (approvalId: string, facultyId: string) => void; onWithdraw?: () => void }) {
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-navy">{record.id}</h2>
            <p className="mt-1 text-sm text-muted">{record.student.name} · {record.student.registerNumber} · {record.student.year}-{record.student.section}</p>
          </div>
          <div className="flex gap-2"><StatusBadge value={record.status} /><StatusBadge value={record.isSpecial ? "SPECIAL" : "REGULAR"} special={record.isSpecial} /></div>
        </div>
        <dl className="mt-5 grid gap-4 md:grid-cols-3">
          <Info label="Category" value={record.category} />
          <Info label="Event" value={record.eventName} />
          <Info label="Venue" value={record.venueType === "Other College" ? `${record.venueType} · ${record.collegeName}` : record.venueType} />
          <Info label="Date" value={`${record.startDate} to ${record.endDate}`} />
          <Info label="Period" value={periodLabel(record.periods)} />
          <Info label="Special Permission" value={record.specialPermissionStatus.replaceAll("_", " ")} />
        </dl>
        {record.purpose || record.additionalNotes ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{[record.purpose, record.additionalNotes].filter(Boolean).join(" · ")}</p> : null}
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h3 className="font-bold text-navy">Approval Timeline</h3>
        <div className="mt-4 grid gap-3">
          <Timeline label="Application Submitted" status="APPROVED" detail={new Date(record.createdAt).toLocaleString("en-IN")} />
          {record.approvals.map((approval) => (
            <div key={approval.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy">{approval.faculty.name}</p>
                  <p className="text-sm text-muted">{approval.faculty.designation}</p>
                  {approval.comment ? <p className="mt-2 text-sm text-slate-700">{approval.comment}</p> : null}
                </div>
                <StatusBadge value={approval.status} />
              </div>
              {onReplaceFaculty && ["PENDING", "CORRECTION_REQUESTED"].includes(approval.status) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <select value={replacement[approval.id] ?? ""} onChange={(event) => setReplacement((items) => ({ ...items, [approval.id]: event.target.value }))} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <option value="">Change Faculty</option>
                    {faculty.filter((item) => !record.approvals.some((existing) => existing.facultyId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.designation}</option>)}
                  </select>
                  <button className="rounded-lg border border-line px-3 py-2 text-sm font-semibold" onClick={() => replacement[approval.id] && onReplaceFaculty(approval.id, replacement[approval.id])}>Replace</button>
                </div>
              ) : null}
            </div>
          ))}
          <Timeline label="HOD Approval" status={record.status === "APPROVED" ? "APPROVED" : record.status === "REJECTED" ? "REJECTED" : "PENDING"} detail={record.status === "HOD_REVIEW" ? "Ready for HOD review" : record.status === "FACULTY_REVIEW" ? "Waiting for faculty approval" : ""} />
        </div>
        {onWithdraw && ["SUBMITTED", "FACULTY_REVIEW", "CORRECTION_REQUESTED", "HOD_REVIEW"].includes(record.status) ? <button onClick={onWithdraw} className="mt-5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Withdraw Application</button> : null}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-muted">{label}</dt><dd className="mt-1 font-medium text-ink">{value}</dd></div>;
}

function Timeline({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line p-4">
      <div><p className="font-semibold text-navy">{label}</p>{detail ? <p className="text-sm text-muted">{detail}</p> : null}</div>
      <StatusBadge value={status} />
    </div>
  );
}
