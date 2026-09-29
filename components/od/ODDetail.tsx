"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/od/StatusBadge";
import type { ODRecord, Profile } from "@/types/domain";

export function ODDetail({ record, faculty, onReplaceFaculty, onWithdraw, viewerId, viewerRole }: { record: ODRecord; faculty: Profile[]; onReplaceFaculty?: (approvalId: string, facultyId: string) => void; onWithdraw?: () => void; viewerId?: string; viewerRole?: Profile["role"] }) {
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-navy">{record.id}</h2>
            <p className="mt-1 text-sm text-muted">Requested by {record.requester?.name ?? record.student.name}</p>
          </div>
          <div className="flex gap-2"><StatusBadge value={record.status} /><StatusBadge value={record.isSpecial ? "SPECIAL" : "REGULAR"} special={record.isSpecial} /></div>
        </div>
        <dl className="mt-5 grid gap-4 md:grid-cols-3">
          <Info label="Event type" value={record.eventType ?? record.category} />
          <Info label="Event" value={record.eventName} />
          <Info label="Organization" value={record.organization ?? record.collegeName ?? "—"} />
          <Info label="Venue" value={record.venue ?? (record.venueType === "Other College" ? `${record.venueType} · ${record.collegeName}` : record.venueType)} />
          <Info label="Date and time" value={`${record.eventDate ?? record.startDate}${record.startTime ? ` · ${record.startTime}–${record.endTime}` : ""}`} />
          <Info label="Special Permission" value={record.specialPermissionStatus.replaceAll("_", " ")} />
        </dl>
        {record.purpose || record.additionalNotes ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{[record.purpose, record.additionalNotes].filter(Boolean).join(" · ")}</p> : null}
        {record.potentialDuplicate ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A similar event request already exists for at least one selected student and time. This request was kept for review.</p> : null}
        {record.odStudents?.length ? <div className="mt-5 overflow-x-auto"><h3 className="mb-2 font-semibold text-navy">OD Students</h3><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-muted"><th className="px-3 py-2">Name</th><th className="px-3 py-2">Register Number</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Attendance</th></tr></thead><tbody>{record.odStudents.map((student) => { const attendance = record.attendance?.find((row) => row.studentId === student.id); const canViewAttendance = viewerRole !== "student" || viewerId === student.id; return <tr key={student.id} className="border-b border-line"><td className="px-3 py-2">{student.name}</td><td className="px-3 py-2">{student.registerNumber ?? "—"}</td><td className="px-3 py-2">{student.section ?? "—"}</td><td className="px-3 py-2">{canViewAttendance ? attendance?.status ?? "Not Marked" : "—"}</td></tr>; })}</tbody></table></div> : null}
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
          {record.approvalHistory?.map((item) => <div key={item.id} className="rounded-lg border border-line p-4"><p className="font-semibold text-navy">{item.action.replaceAll("_", " ")}</p><p className="text-sm text-muted">{item.actor?.name ?? item.role} · {new Date(item.createdAt).toLocaleString("en-IN")}</p>{item.remarks ? <p className="mt-1 text-sm text-slate-700">{item.remarks}</p> : null}</div>)}
          <Timeline label="HOD Approval" status={record.status === "APPROVED" ? "APPROVED" : record.status === "REJECTED_BY_HOD" || record.status === "REJECTED" ? "REJECTED" : "PENDING"} detail={record.status === "PENDING_HOD" || record.status === "HOD_REVIEW" ? "Ready for HOD review" : record.status === "PENDING_FACULTY" || record.status === "FACULTY_REVIEW" ? "Waiting for faculty approval" : ""} />
        </div>
        {onWithdraw && ["SUBMITTED", "PENDING_FACULTY", "PENDING_HOD", "FACULTY_REVIEW", "CORRECTION_REQUESTED", "HOD_REVIEW"].includes(record.status) ? <button onClick={onWithdraw} className="mt-5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Withdraw Application</button> : null}
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
