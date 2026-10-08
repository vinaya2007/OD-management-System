"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminPageData = {
  users: Array<{ id: string; name: string; email: string; role: string; department: string; code: string; active: boolean; createdAt: string | null; mustChangePassword: boolean }>;
  departments: Array<{ id: string; name: string; code: string; active: boolean }>;
  years: Array<{ id: string; name: string; startDate: string; endDate: string; active: boolean }>;
  stats: Record<string, number>;
};

export async function loadAdminPageData(): Promise<{ ok: true; data: AdminPageData } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    const db = await createSupabaseServerClient();
    const [profiles, departments, years, requests, pendingFaculty, pendingHod, approved, rejectedFaculty, rejectedHod] = await Promise.all([
      db.rpc("admin_profile_directory", { p_search: null }),
      db.from("departments").select("id,name,code,is_active").order("name"),
      db.from("academic_years").select("id,name,start_date,end_date,is_active").order("start_date", { ascending: false }),
      db.from("od_requests").select("id", { count: "exact", head: true }),
      db.from("od_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING_FACULTY"),
      db.from("od_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING_HOD"),
      db.from("od_requests").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
      db.from("od_requests").select("id", { count: "exact", head: true }).eq("status", "REJECTED_BY_FACULTY"),
      db.from("od_requests").select("id", { count: "exact", head: true }).eq("status", "REJECTED_BY_HOD")
    ]);
    for (const [table, error] of [["profiles", profiles.error], ["departments", departments.error], ["academic_years", years.error], ["od_requests", requests.error], ["pending faculty count", pendingFaculty.error], ["pending HOD count", pendingHod.error], ["approved count", approved.error], ["rejected faculty count", rejectedFaculty.error], ["rejected HOD count", rejectedHod.error]] as const) {
      if (error) {
        console.error(`[admin:${table}]`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
        throw new Error(process.env.NODE_ENV === "development" ? `Admin ${table} query failed (${error.code}): ${error.message}` : "Admin data could not be loaded. Confirm that the latest Supabase migrations are applied.");
      }
    }
    const profileRows = (profiles.data ?? []) as Array<{ id: string; full_name: string | null; email: string; role: string; department_name: string | null; department_code: string | null; is_active: boolean; created_at: string | null; must_change_password: boolean }>;
    const users = profileRows.map((row) => {
      return { id: row.id, name: row.full_name ?? "", email: row.email, role: row.role, department: row.department_name ?? "—", code: row.department_code ?? "", active: row.is_active, createdAt: row.created_at, mustChangePassword: row.must_change_password };
    });
    const departmentRows = (departments.data ?? []).map((row) => ({ id: row.id, name: row.name, code: row.code, active: row.is_active }));
    const yearRows = (years.data ?? []).map((row) => ({ id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date, active: row.is_active }));
    return { ok: true, data: {
      users, departments: departmentRows, years: yearRows,
      stats: {
        students: users.filter((u) => u.role === "student").length,
        faculty: users.filter((u) => u.role === "faculty").length,
        hods: users.filter((u) => u.role === "hod").length,
        activeUsers: users.filter((u) => u.active).length,
        totalRequests: requests.count ?? 0,
        pendingFaculty: pendingFaculty.count ?? 0,
        pendingHod: pendingHod.count ?? 0,
        approved: approved.count ?? 0,
        rejected: (rejectedFaculty.count ?? 0) + (rejectedHod.count ?? 0)
      }
    } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Admin data could not be loaded." };
  }
}

export async function setDepartmentActiveAction(id: string, active: boolean): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid department." };
    const db = await createSupabaseServerClient();
    const { error } = await db.from("departments").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { console.error("[admin:department-update]", { code: error.code, message: error.message }); throw new Error("Department status could not be updated."); }
    revalidatePath("/admin/departments");
    return { ok: true };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Department status could not be updated." }; }
}

export async function saveAcademicYearAction(input: { name: string; startDate: string; endDate: string }): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireAdmin();
    const name = input.name.trim();
    if (name.length < 4 || name.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) {
      return { ok: false, message: "Enter a year name and a valid start/end date range." };
    }
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("admin_save_academic_year", { p_name: name, p_start_date: input.startDate, p_end_date: input.endDate });
    if (error) {
      console.error("[admin:save-academic-year]", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return { ok: false, message: process.env.NODE_ENV === "development" ? `${error.code}: ${error.message}` : "The academic year could not be saved. Confirm the latest Supabase migration is applied." };
    }
    for (const path of ["/admin/settings", "/admin/dashboard", "/student/apply"]) revalidatePath(path);
    return { ok: true };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "The academic year could not be saved." }; }
}
