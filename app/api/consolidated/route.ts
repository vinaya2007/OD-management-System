import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";

const headers = ["OD Request ID", "Student Name", "Register Number", "Department", "Section", "OD Date", "OD Type", "OD Category", "Reason / Purpose", "Faculty Approval Status", "HOD Approval Status", "Overall Status", "Faculty Approval Date", "HOD Approval Date"];
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser();
    if (!actor.department_id || !["faculty", "hod"].includes(actor.role)) return NextResponse.json({ message: "Not authorized to view consolidated OD reports." }, { status: 403 });
    const db = await createSupabaseServerClient();
    let requestIds: string[] | null = null;
    if (actor.role === "faculty") {
      const { data: assigned, error } = await db.from("od_request_faculty").select("od_request_id").eq("faculty_id", actor.id);
      if (error) throw error;
      requestIds = [...new Set((assigned ?? []).map((item) => item.od_request_id))];
      if (!requestIds.length) return respond(request, []);
    }
    const params = request.nextUrl.searchParams;
    const from = params.get("from"), to = params.get("to"), category = params.get("category"), status = params.get("status"), section = params.get("section"), year = params.get("year");
    const rows: unknown[] = [];
    for (let page = 0; page < 100; page += 1) {
      let query = db.from("od_requests").select("id,od_number,department_id,od_category,event_name,reason,purpose,event_date,status,is_special_od,is_potential_duplicate,faculty_id,faculty_action_at,hod_action_at,department:departments(name,code),od_request_students(request_id,student_id,student:profiles!student_id(full_name,register_number,section,year)),od_request_faculty(faculty_id,status,action_at,faculty:profiles!faculty_id(full_name))")
        .eq("department_id", actor.department_id).order("event_date", { ascending: false }).range(page * 1000, page * 1000 + 999);
      if (requestIds) query = query.in("id", requestIds);
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("event_date", from);
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("event_date", to);
      if (category) query = query.eq("od_category", category);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
      if (page === 99) throw new Error("Report has too many rows to export at once. Add a date filter and retry.");
    }
    const records = rows.flatMap((raw) => {
      const row = raw as unknown as Record<string, unknown>;
      const department = row.department as { name?: string; code?: string } | null;
      const students = row.od_request_students as Array<{ student?: { full_name?: string; register_number?: string; section?: string; year?: string } | null }>;
      const facultyRows = (row.od_request_faculty ?? []) as Array<{ status?: string; action_at?: string | null; faculty?: { full_name?: string } | null }>;
      const facultyStatus = facultyRows.some((f) => f.status === "REJECTED") ? "Rejected" : facultyRows.length > 0 && facultyRows.every((f) => f.status === "APPROVED") ? "Approved" : facultyRows.length ? "Pending" : "Not assigned";
      const people = students?.length ? students.map((item) => item.student).filter((person): person is NonNullable<typeof person> => Boolean(person)) : [{ full_name: "", register_number: "", section: "", year: "" }];
      return people.filter((person) => (!section || person.section === section) && (!year || year === "All" || person.year === year)).map((person) => ({
        requestId: String(row.od_number ?? row.id), studentName: person.full_name ?? "", registerNumber: person.register_number ?? "",
        department: department?.name ?? department?.code ?? "", section: person.section ?? "", odDate: String(row.event_date ?? ""),
        odType: row.is_special_od === true ? "Special OD" : "Regular OD", category: String(row.od_category ?? ""), reason: String(row.purpose ?? row.reason ?? ""), facultyStatus,
        hodStatus: row.status === "PENDING_HOD" ? "Pending" : row.status === "APPROVED" ? "Approved" : String(row.status).startsWith("REJECTED_BY_HOD") ? "Rejected" : "Not reached",
        status: String(row.status ?? ""), facultyDate: facultyRows.map((f) => f.action_at).filter(Boolean).join(", "), hodDate: String(row.hod_action_at ?? "")
      }));
    });
    return respond(request, records);
  } catch (error) {
    console.error("[consolidated-report] query failed", error instanceof Error ? error.message : error);
    const issue = publicError(error);
    const status = issue.code === "UNAUTHORIZED" ? 401 : issue.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ message: status === 500 ? "Consolidated OD data could not be loaded." : issue.message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

function respond(request: NextRequest, records: Array<Record<string, string>>) {
  if (request.nextUrl.searchParams.get("format") === "xlsx") {
    const rows = [headers, ...records.map((row) => [row.requestId,row.studentName,row.registerNumber,row.department,row.section,row.odDate,row.odType,row.category,row.reason,row.facultyStatus,row.hodStatus,row.status,row.facultyDate,row.hodDate])];
    return new NextResponse(buildXlsx(rows), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=Consolidated_OD_Report.xlsx", "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ records }, { headers: { "Cache-Control": "private, no-store" } });
}
