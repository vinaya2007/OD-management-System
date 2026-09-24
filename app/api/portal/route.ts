import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { notificationFromRow, profileFromRow, recordFromRow } from "@/lib/portal-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const profile = await requireAuthenticatedUser();
    const supabase = await createSupabaseServerClient();
    const [applicationsResult, facultyResult, limitsResult, notificationsResult] = await Promise.all([
      supabase.from("od_applications").select("*, student:profiles!student_id(*, department:departments(code)), od_periods(*), od_faculty_approvals(*, faculty:profiles!faculty_id(*, department:departments(code))), special_permissions(*)").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("*, department:departments(code)").eq("role", "faculty").eq("is_active", true).order("name"),
      supabase.from("od_limits").select("category, limit_count, academic_year, is_active").eq("is_active", true),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50)
    ]);
    if (applicationsResult.error || facultyResult.error || limitsResult.error || notificationsResult.error) throw new AppError("DATABASE_ERROR", "Portal data could not be loaded.");
    const departmentResult = profile.department_id ? await supabase.from("departments").select("code").eq("id", profile.department_id).maybeSingle() : { data: null, error: null };
    if (departmentResult.error) throw new AppError("DATABASE_ERROR", "Portal data could not be loaded.");
    return NextResponse.json({
      currentUser: profileFromRow({ ...profile, department_code: departmentResult.data?.code }),
      profiles: facultyResult.data.map((row) => profileFromRow(row)),
      applications: applicationsResult.data.map((row) => recordFromRow(row)),
      limits: limitsResult.data.map((row) => ({ category: row.category, limitCount: row.limit_count, academicYear: row.academic_year, isActive: row.is_active })),
      notifications: notificationsResult.data.map((row) => notificationFromRow(row))
    });
  } catch (error) {
    const issue = publicError(error);
    return NextResponse.json(issue, { status: issue.code === "UNAUTHORIZED" ? 401 : 403 });
  }
}
