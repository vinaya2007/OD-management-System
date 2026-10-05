"use server";

import { requireFaculty } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FacultyHistoryKind = "approved" | "rejected";
export type FacultyHistoryEntry = {
  id: string;
  requestId: string;
  reference: string;
  eventName: string;
  category: string;
  eventDate: string;
  reason: string;
  actionAt: string;
  status: string;
  remarks: string | null;
  students: { name: string; registerNumber: string }[];
};
type HistoryRow = {
  id: string;
  od_request_id: string;
  action: string;
  created_at: string;
  remarks: string | null;
  request: {
    id: string;
    od_number: string | null;
    event_name: string;
    od_category: string;
    reason: string | null;
    purpose: string | null;
    event_date: string;
    status: string;
    od_request_students: { student: { full_name: string; register_number: string | null } | null }[];
  };
};
type ActionResult = { ok: true; data: FacultyHistoryEntry[] } | { ok: false; message: string };

export async function getFacultyActionHistoryAction(kind: FacultyHistoryKind, page = 0): Promise<ActionResult> {
  try {
    if (kind !== "approved" && kind !== "rejected") throw new AppError("VALIDATION_ERROR", "Invalid faculty history filter.");
    if (!Number.isInteger(page) || page < 0 || page > 1000) throw new AppError("VALIDATION_ERROR", "Invalid history page.");
    const faculty = await requireFaculty();
    const supabase = await createSupabaseServerClient();
    const action = kind === "approved" ? "FACULTY_APPROVED" : "FACULTY_REJECTED";
    const { data, error } = await supabase.from("od_approval_history")
      .select("id,od_request_id,action,created_at,remarks,request:od_requests!inner(id,od_number,event_name,od_category,reason,purpose,event_date,status,od_request_students(student:profiles!student_id(full_name,register_number)))")
      .eq("actor_id", faculty.id)
      .eq("actor_role", "faculty")
      .eq("action", action)
      .order("created_at", { ascending: false })
      .range(page * 50, page * 50 + 49);
    if (error) {
      if (process.env.NODE_ENV === "development") console.error("[faculty-history] query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      throw new AppError("DATABASE_ERROR", "Could not load your Faculty action history.");
    }

    const rows = (data ?? []) as unknown as HistoryRow[];
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        requestId: row.request.id || row.od_request_id,
        reference: row.request.od_number || row.request.id || row.od_request_id,
        eventName: row.request.event_name,
        category: row.request.od_category,
        eventDate: row.request.event_date,
        reason: row.request.purpose || row.request.reason || "",
        actionAt: row.created_at,
        status: row.request.status,
        remarks: row.action === "FACULTY_REJECTED" ? row.remarks : null,
        students: (row.request.od_request_students ?? []).map(({ student }) => ({
          name: student?.full_name ?? "Student",
          registerNumber: student?.register_number ?? "Register number unavailable"
        }))
      }))
    };
  } catch (error) {
    return { ok: false, message: publicError(error).message };
  }
}
