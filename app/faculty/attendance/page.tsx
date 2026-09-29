"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";

export default function FacultyAttendancePage() {
  const { currentUser, applications, markAttendance } = useDemo();
  const [error, setError] = useState("");
  const approved = applications.filter((record) => record.status === "APPROVED");
  async function mark(requestId: string, studentId: string, status: "PRESENT" | "ABSENT") {
    setError("");
    try { await markAttendance(requestId, studentId, status); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Attendance could not be saved."); }
  }
  return <AppShell user={currentUser}><h2 className="mb-4 text-2xl font-bold text-navy">Approved OD Attendance</h2>{error ? <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="grid gap-4">{approved.map((record) => <section key={record.id} className="rounded-lg border border-line bg-white p-5 shadow-soft"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold text-navy">{record.eventName}</h3><p className="text-sm text-muted">{record.eventDate ?? record.startDate} · {record.startTime ?? ""}–{record.endTime ?? ""} · {record.venue ?? record.collegeName}</p></div><span className="h-fit rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">APPROVED</span></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted"><th className="p-2">Student</th><th className="p-2">Register No.</th><th className="p-2">Section</th><th className="p-2">Attendance</th><th className="p-2">Mark</th></tr></thead><tbody>{(record.odStudents ?? [record.student]).map((student) => { const attendance = record.attendance?.find((item) => item.studentId === student.id); return <tr key={student.id} className="border-b border-line"><td className="p-2">{student.name}</td><td className="p-2">{student.registerNumber}</td><td className="p-2">{student.section}</td><td className="p-2">{attendance?.status ?? "Not Marked"}</td><td className="p-2"><div className="flex gap-2"><button onClick={() => mark(record.id, student.id, "PRESENT")} className="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white">Present</button><button onClick={() => mark(record.id, student.id, "ABSENT")} className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">Absent</button></div></td></tr>; })}</tbody></table></div>
    </section>)}{!approved.length ? <p className="rounded-lg border border-line bg-white p-6 text-sm text-muted">No approved OD requests are available for attendance.</p> : null}</div>
  </AppShell>;
}
