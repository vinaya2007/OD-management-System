"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAuthenticatedUser, requireFaculty, requireHod, requireStudent } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attendanceSchema, facultyDecisionSchema, hodDecisionSchema, replaceFacultySchema, submitODRequestSchema } from "@/lib/validation/od";

type ActionResult = { ok: true; id?: string; potentialDuplicate?: boolean } | { ok: false; code: string; message: string };

async function callRpc(name: string, payload: Record<string, unknown>): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(name, payload);
    if (error) {
      console.error("[od-rpc] request failed", { operation: name, code: error.code, message: error.message, details: error.details, hint: error.hint });
      const knownBusinessErrors = new Set([
        "No active academic year is configured.",
        "Required student identity details are missing from the OD record. Contact the ECE administrator.",
        "Select at least one faculty reviewer.", "Select one to three faculty reviewers.", "OD category is required.", "Select a valid OD category.", "A purpose of at least 5 characters is required.",
        "OD limit reached for this category.",
        "One or more faculty reviewers are unavailable.", "End time must be after start time.",
        "Select a valid period range from 1 to 9.", "FORBIDDEN", "INVALID_STATUS_TRANSITION", "NOT_FOUND"
      ]);
      const message = error.code === "P0001" && knownBusinessErrors.has(error.message)
        ? error.message === "No active academic year is configured."
          ? "OD submission is unavailable because no active academic year is configured. Ask an Admin to set one under Settings."
          : error.message
        : process.env.NODE_ENV === "development" ? `${error.code}: ${error.message}` : "The OD workflow could not be updated. Please check the form and try again.";
      throw new AppError("DATABASE_ERROR", message);
    }
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
      idempotency_key: randomUUID(), event_name: parsed.eventName, od_category: parsed.category, event_type: parsed.eventType,
      organization: parsed.organization ?? null, event_date: parsed.eventDate, start_period: parsed.startPeriod, end_period: parsed.endPeriod, start_time: parsed.startTime,
      end_time: parsed.endTime, venue: parsed.venue, reason: parsed.purpose, purpose: parsed.purpose,
      requester_remarks: parsed.requesterRemarks ?? null, faculty_ids: parsed.facultyIds
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

export async function decideSpecialFacultyODAction(input: unknown): Promise<ActionResult> {
  try { await requireFaculty(); const parsed = hodDecisionSchema.parse(input); return callRpc("decide_special_od_faculty", { p_request_id: parsed.odId, p_approved: parsed.approved, p_remarks: parsed.comment ?? null }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideSpecialHodODAction(input: unknown): Promise<ActionResult> {
  try { await requireHod(); const parsed = hodDecisionSchema.parse(input); return callRpc("decide_special_od_hod", { p_request_id: parsed.odId, p_approved: parsed.approved, p_remarks: parsed.comment ?? null }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
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
