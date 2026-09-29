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
      supabase.from("od_requests").select("*, requester:profiles!requester_id(id,name:full_name,role,department_id,register_number,section,designation,department:departments(code)), od_request_students(student_id,student:profiles!student_id(id,name:full_name,role,department_id,register_number,section,designation,department:departments(code))), od_request_faculty(id,od_request_id,faculty_id,status,comment:remarks,action_at,created_at,faculty:profiles!faculty_id(id,name:full_name,role,department_id,designation,department:departments(code))), od_attendance(*), od_approval_history(id,actor_id,actor_role,action,remarks,created_at,actor:profiles!actor_id(id,name:full_name,role,department_id,designation))").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,name:full_name,role,department_id,designation,is_active,department:departments(code)").eq("role", "faculty").eq("is_active", true).order("full_name"),
      supabase.from("od_limits").select("category, limit_count, academic_year:academic_years(name), is_active").eq("is_active", true),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50)
    ]);
    if (applicationsResult.error || facultyResult.error || limitsResult.error || notificationsResult.error) throw new AppError("DATABASE_ERROR", "Portal data could not be loaded.");
    const departmentResult = profile.department_id ? await supabase.from("departments").select("code").eq("id", profile.department_id).maybeSingle() : { data: null, error: null };
    if (departmentResult.error) throw new AppError("DATABASE_ERROR", "Portal data could not be loaded.");
    return NextResponse.json({
      currentUser: profileFromRow({ ...profile, department_code: departmentResult.data?.code }),
      profiles: facultyResult.data.map((row) => profileFromRow(row)),
      applications: applicationsResult.data.map((row) => recordFromRequestRow(row)),
      limits: limitsResult.data.map((row) => ({ category: row.category, limitCount: row.limit_count, academicYear: (row.academic_year as { name?: string } | null)?.name, isActive: row.is_active })),
      notifications: notificationsResult.data.map((row) => notificationFromRow(row))
    });
  } catch (error) {
    const issue = publicError(error);
    const status = issue.code === "UNAUTHORIZED" ? 401 : issue.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(issue, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
