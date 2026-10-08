import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { notificationFromRow, profileFromRow, recordFromRequestRow } from "@/lib/portal-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const profile = await requireAuthenticatedUser();
    const supabase = await createSupabaseServerClient();
    const [applicationsResult, facultyResult, limitsResult, notificationsResult] = await Promise.all([
      supabase.from("od_requests").select("id,od_number,requester_id,department_id,event_name,od_category,reason,event_type,purpose,organization,event_date,start_period,end_period,start_time,end_time,venue,requester_remarks,status,is_special_od,is_potential_duplicate,supporting_document_url,faculty_id,faculty_action_at,faculty_remarks,faculty_rejection_reason,hod_id,hod_action_at,hod_remarks,hod_rejection_reason,created_at,updated_at,requester:profiles!requester_id(id,full_name,role,department_id,register_number,section,designation,department:departments(code)),od_request_students(student_id,student:profiles!student_id(id,full_name,role,department_id,register_number,section,designation,department:departments(code))),od_request_faculty(id,od_request_id,faculty_id,status,remarks,action_at,created_at,faculty:profiles!faculty_id(id,full_name,role,department_id,designation,department:departments(code))),od_attendance(id,request_id,student_id,attendance_status,marked_by,marked_at,created_at,updated_at),od_approval_history(id,actor_id,actor_role,action,remarks,created_at,actor:profiles!actor_id(id,full_name,role,department_id,designation))").order("created_at", { ascending: false }).limit(200),
      profile.role === "admin"
        ? supabase.from("profiles").select("id,name:full_name,role,department_id,designation,is_active,department:departments(code)").eq("is_active", true).order("full_name").limit(500)
        : supabase.from("profiles").select("id,name:full_name,role,department_id,designation,is_active,department:departments(code)").eq("role", "faculty").eq("is_active", true).eq("department_id", profile.department_id).order("full_name"),
      supabase.from("od_limits").select("category,max_ods, academic_year:academic_years(name,is_active)").eq("department_id", profile.department_id),
      supabase.from("notifications").select("id,user_id,od_request_id,notification_type,title,message,is_read,created_at").order("created_at", { ascending: false }).limit(50)
    ]);
    const failedQuery = [
      ["od_requests", applicationsResult.error],
      ["faculty profiles", facultyResult.error],
      ["od_limits", limitsResult.error],
      ["notifications", notificationsResult.error]
    ].find(([, error]) => error);
    if (failedQuery) {
      const [name, error] = failedQuery;
      if (process.env.NODE_ENV === "development") console.error(`[portal] ${name} query failed`, error);
      throw new AppError("DATABASE_ERROR", process.env.NODE_ENV === "development" ? `${name}: ${(error as Error).message}` : "Portal data could not be loaded.");
    }
    const departmentResult = profile.department_id ? await supabase.from("departments").select("code,name").eq("id", profile.department_id).maybeSingle() : { data: null, error: null };
    if (departmentResult.error) {
      if (process.env.NODE_ENV === "development") console.error("[portal] department query failed", departmentResult.error);
      throw new AppError("DATABASE_ERROR", process.env.NODE_ENV === "development" ? `Department: ${departmentResult.error.message}` : "Portal data could not be loaded.");
    }
    return NextResponse.json({
      currentUser: profileFromRow({ ...profile, department_code: departmentResult.data?.code, department_name: departmentResult.data?.name }),
      profiles: (facultyResult.data ?? []).map((row) => profileFromRow(row)),
      applications: (applicationsResult.data ?? []).map((row) => recordFromRequestRow(row)),
      limits: (limitsResult.data ?? [])
        .filter((row) => row.category !== null && row.max_ods !== null && (row.academic_year as { is_active?: boolean } | null)?.is_active)
        .map((row) => ({
          ...(row.category ? { category: row.category as import("@/types/domain").ODCategory } : {}),
          limitCount: row.max_ods as number,
          academicYear: (row.academic_year as { name?: string } | null)?.name ?? "Current academic year",
          isActive: true
        })),
      notifications: (notificationsResult.data ?? []).map((row) => notificationFromRow(row))
    });
  } catch (error) {
    const issue = publicError(error);
    const status = issue.code === "UNAUTHORIZED" ? 401 : issue.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(issue, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
