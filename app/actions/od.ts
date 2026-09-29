"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser, requireFaculty, requireHod, requireStudent } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attendanceSchema, facultyDecisionSchema, hodDecisionSchema, replaceFacultySchema, submitODRequestSchema } from "@/lib/validation/od";

type ActionResult = { ok: true; id?: string; potentialDuplicate?: boolean } | { ok: false; code: string; message: string };

async function callRpc(name: string, payload: Record<string, unknown>): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(name, payload);
    if (error) throw new AppError("DATABASE_ERROR", "The OD workflow could not be updated.");
    revalidatePath("/");
    if (typeof data === "string") return { ok: true, id: data };
    if (data && typeof data === "object") {
      const result = data as { id?: unknown; potentialDuplicate?: unknown };
      return { ok: true, id: typeof result.id === "string" ? result.id : undefined, potentialDuplicate: result.potentialDuplicate === true };
    }
    return { ok: true };
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function submitODAction(input: unknown): Promise<ActionResult> {
  try {
    await requireStudent();
    const parsed = submitODRequestSchema.parse(input);
    return callRpc("submit_od_request", { p_payload: {
      id: parsed.id, idempotency_key: parsed.idempotencyKey, event_name: parsed.eventName, event_type: parsed.eventType,
      organization: parsed.organization ?? null, event_date: parsed.eventDate, start_time: parsed.startTime,
      end_time: parsed.endTime, venue: parsed.venue, purpose: parsed.purpose ?? null,
      requester_remarks: parsed.requesterRemarks ?? null, student_ids: parsed.studentIds, faculty_ids: parsed.facultyIds
    }});
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideFacultyODAction(input: unknown): Promise<ActionResult> {
  try { await requireFaculty(); const parsed = facultyDecisionSchema.parse(input); return callRpc("decide_od_request_faculty", { p_request_id: parsed.odId, p_approved: parsed.decision === "APPROVED", p_remarks: parsed.comment ?? null }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideHodODAction(input: unknown): Promise<ActionResult> {
  try { await requireHod(); const parsed = hodDecisionSchema.parse(input); return callRpc("decide_od_request_hod", { p_request_id: parsed.odId, p_approved: parsed.approved, p_remarks: parsed.comment ?? null }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideSpecialPermissionAction(input: unknown): Promise<ActionResult> {
  try {
    await requireHod();
    const parsed = hodDecisionSchema.parse(input);
    return callRpc("decide_special_permission", { p_od_id: parsed.odId, p_approved: parsed.approved, p_comment: parsed.comment ?? null });
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function replacePendingFacultyAction(input: unknown): Promise<ActionResult> {
  try { await requireStudent(); const parsed = replaceFacultySchema.parse(input); return callRpc("replace_pending_faculty", { p_od_id: parsed.odId, p_approval_id: parsed.approvalId, p_faculty_id: parsed.facultyId }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function withdrawODAction(odId: string): Promise<ActionResult> {
  try { await requireStudent(); return callRpc("withdraw_od_request", { p_request_id: odId }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function markODAttendanceAction(input: unknown): Promise<ActionResult> {
  try {
    await requireFaculty(); const parsed = attendanceSchema.parse(input);
    return callRpc("mark_od_attendance", { p_request_id: parsed.requestId, p_student_id: parsed.studentId, p_status: parsed.status });
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function markNotificationsReadAction(notificationId?: string): Promise<ActionResult> {
  try {
    await requireAuthenticatedUser();
    if (notificationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
      throw new AppError("VALIDATION_ERROR", "Invalid notification.");
    }
    return callRpc("mark_notification_read", { p_notification_id: notificationId ?? null });
  } catch (error) { return { ok: false, ...publicError(error) }; }
}
