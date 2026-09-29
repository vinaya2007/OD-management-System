import Link from "next/link";
import { periodLabel } from "@/lib/od-rules";
import { StatusBadge } from "@/components/od/StatusBadge";
import type { ODRecord, Role } from "@/types/domain";

export function ODTable({ records, role }: { records: ODRecord[]; role: Role }) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
        <p className="text-lg font-semibold text-navy">You&apos;re all caught up.</p>
        <p className="mt-1 text-sm text-muted">No OD applications match this view.</p>
      </div>
    );
  }

  const detailBase = role === "student" ? "/student/applications" : role === "faculty" ? "/faculty/approvals" : "/hod/approvals";

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="px-4 py-3">OD ID</th>
              <th className="px-4 py-3">Requester / OD Students</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records.map((record) => (
              <tr key={record.id} className="align-top">
                <td className="px-4 py-3 font-semibold text-navy">{record.id}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{record.requester?.name ?? record.student.name}</span>
                  <span className="block text-xs text-muted">Requested by · {record.odStudents?.length ?? 1} OD student{(record.odStudents?.length ?? 1) === 1 ? "" : "s"}</span>
                  {(record.odStudents ?? [record.student]).slice(0, 3).map((student) => <span key={student.id} className="block text-xs text-muted">{student.name} · {student.registerNumber} · Section {student.section}</span>)}
                  {(record.odStudents?.length ?? 0) > 3 ? <span className="block text-xs text-muted">and {record.odStudents!.length - 3} more</span> : null}
                </td>
                <td className="px-4 py-3">{record.category}</td>
                <td className="px-4 py-3">{record.eventName}</td>
              <td className="px-4 py-3">{record.eventDate ?? (record.periods.length ? periodLabel(record.periods) : record.startDate)}{record.startTime ? <span className="block text-xs text-muted">{record.startTime}–{record.endTime}</span> : null}</td>
                <td className="px-4 py-3"><StatusBadge value={record.status} /></td>
                <td className="px-4 py-3"><StatusBadge value={record.isSpecial ? "SPECIAL" : "REGULAR"} special={record.isSpecial} /></td>
                <td className="px-4 py-3 text-right">
                  <Link className="font-semibold text-accent" href={`${detailBase}/${record.id}`}>Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
