"use server";

import "server-only";
import { requireHod } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export type HodODRow = {
  id: string;
  reference: string;
  department: string;
  category: string;
  date: string;
  reason: string;
  status: string;
  facultyStatus: string;
  hodStatus: string;
  isSpecial: boolean;
  students: Array<{ name: string; registerNumber: string; section: string }>;
};

export type HodReports = {
  total: number;
  pendingHod: number;
  approved: number;
  rejected: number;
  special: number;
  categories: Array<{ label: string; count: number }>;
  sections: Array<{ label: string; count: number }>;
  months: Array<{ label: string; count: number }>;
  students: Array<{ label: string; count: number }>;
  statuses: Array<{ label: string; count: number }>;
};

function readableStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function loadDepartmentRequests() {
  const actor = await requireHod();
  if (!actor.department_id) throw new Error("Your HOD profile is not linked to a department.");
  const supabase = await createSupabaseServerClient();
  const selected: Array<Record<string, unknown>> = [];
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await supabase
      .from("od_requests")
      .select("id,od_number,department_id,od_category,event_date,reason,purpose,status,is_special_od,created_at,department:departments(name,code),requester:profiles!requester_id(full_name,register_number,section),od_request_students(request_id,student:profiles!student_id(full_name,register_number,section)),od_request_faculty(status)")
      .eq("department_id", actor.department_id)
      .order("created_at", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) {
      console.error("[hod-dashboard] department OD query failed", { code: error.code, message: error.message });
      throw new Error("Department OD records could not be loaded. Check the latest Supabase migrations and access policies.");
    }
    selected.push(...(data ?? []) as unknown as Array<Record<string, unknown>>);
    if ((data ?? []).length < 1000) break;
    if (page === 99) throw new Error("There are too many department OD records to load in one report. Refine the reporting period and try again.");
  }
  return selected.map((row) => {
    const requester = row.requester as { full_name?: string | null; register_number?: string | null; section?: string | null } | null;
    const department = row.department as { name?: string | null; code?: string | null } | null;
    const links = (row.od_request_students ?? []) as Array<{ student?: { full_name?: string | null; register_number?: string | null; section?: string | null } | null }>;
    const people = links.map((entry) => entry.student).filter((person): person is NonNullable<typeof person> => Boolean(person));
    if (!people.length && requester) people.push(requester);
    const faculty = (row.od_request_faculty ?? []) as Array<{ status?: string }>;
    const approvedFaculty = faculty.filter((item) => item.status === "APPROVED").length;
    const rejectedFaculty = faculty.some((item) => item.status === "REJECTED");
    const facultyStatus = rejectedFaculty ? "Rejected" : faculty.length > 0 && approvedFaculty === faculty.length ? "Approved" : faculty.length ? "Pending" : "Not assigned";
    const status = String(row.status);
    return {
      id: String(row.id), reference: String(row.od_number || row.id), department: department?.name || department?.code || "",
      category: String(row.od_category || "Uncategorized"), date: String(row.event_date || ""),
      reason: String(row.purpose || row.reason || ""), status,
      facultyStatus,
      hodStatus: status === "PENDING_HOD" ? "Pending" : status === "APPROVED" ? "Approved" : status === "REJECTED_BY_HOD" ? "Rejected" : "Not reached",
      isSpecial: row.is_special_od === true,
      students: people.map((person) => ({ name: person.full_name || "—", registerNumber: person.register_number || "—", section: person.section || "—" }))
    } satisfies HodODRow;
  });
}

export async function getHodDepartmentODsAction(): Promise<Result<HodODRow[]>> {
  try { return { ok: true, data: await loadDepartmentRequests() }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Department OD records could not be loaded." }; }
}

export async function getHodDepartmentReportsAction(): Promise<Result<HodReports>> {
  try {
    const rows = await loadDepartmentRequests();
    const count = (predicate: (row: HodODRow) => boolean) => rows.filter(predicate).length;
    const group = (key: (row: HodODRow) => string) => {
      const counts = new Map<string, number>();
      rows.forEach((row) => { const label = key(row) || "Unspecified"; counts.set(label, (counts.get(label) ?? 0) + 1); });
      return [...counts].map(([label, value]) => ({ label, count: value })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };
    return { ok: true, data: {
      total: rows.length,
      pendingHod: count((row) => row.status === "PENDING_HOD"),
      approved: count((row) => row.status === "APPROVED"),
      rejected: count((row) => ["REJECTED", "REJECTED_BY_FACULTY", "REJECTED_BY_HOD"].includes(row.status)),
      special: count((row) => row.isSpecial),
      categories: group((row) => row.category),
      sections: groupStudentSections(rows),
      months: group((row) => row.date.length >= 7 ? row.date.slice(0, 7) : "Unspecified"),
      students: groupStudents(rows),
      statuses: group((row) => readableStatus(row.status))
    } };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Department reports could not be loaded." }; }
}

function groupStudentSections(rows: HodODRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => [...new Set(row.students.map((student) => student.section).filter((section) => section !== "—"))].forEach((section) => counts.set(section, (counts.get(section) ?? 0) + 1)));
  return [...counts].map(([label, value]) => ({ label, count: value })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function groupStudents(rows: HodODRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => row.students.forEach((student) => { const label = student.name === "—" ? student.registerNumber : student.name; if (label && label !== "—") counts.set(label, (counts.get(label) ?? 0) + 1); }));
  return [...counts].map(([label, value]) => ({ label, count: value })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 20);
}
