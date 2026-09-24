"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser, requireFaculty, requireHod, requireStudent } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { facultyDecisionSchema, hodDecisionSchema, replaceFacultySchema, submitODSchema } from "@/lib/validation/od";

type ActionResult = { ok: true; id?: string } | { ok: false; code: string; message: string };

async function callRpc(name: string, payload: Record<string, unknown>): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(name, payload);
    if (error) throw new AppError("DATABASE_ERROR", "The OD workflow could not be updated.");
    revalidatePath("/");
    return { ok: true, id: typeof data === "string" ? data : undefined };
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function submitODAction(input: unknown): Promise<ActionResult> {
  try {
    await requireStudent();
    const parsed = submitODSchema.parse(input);
    return callRpc("submit_od_application", { p_payload: {
      idempotency_key: parsed.idempotencyKey, category: parsed.category, purpose: parsed.purpose ?? null,
      event_name: parsed.eventName, venue_type: parsed.venueType, college_name: parsed.collegeName ?? null,
      start_date: parsed.startDate, end_date: parsed.endDate, additional_notes: parsed.additionalNotes ?? null,
      periods: parsed.periods.map((item) => ({ date: item.date, from_period: item.fromPeriod, to_period: item.toPeriod })),
      faculty_ids: parsed.facultyIds, special_reason: parsed.specialReason ?? null
    }});
  } catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideFacultyODAction(input: unknown): Promise<ActionResult> {
  try { await requireFaculty(); const parsed = facultyDecisionSchema.parse(input); return callRpc("decide_faculty_od", { p_od_id: parsed.odId, p_decision: parsed.decision, p_comment: parsed.comment ?? null }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
}

export async function decideHodODAction(input: unknown): Promise<ActionResult> {
  try { await requireHod(); const parsed = hodDecisionSchema.parse(input); return callRpc("decide_hod_od", { p_od_id: parsed.odId, p_approved: parsed.approved, p_comment: parsed.comment ?? null }); }
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
  try { await requireStudent(); return callRpc("withdraw_od", { p_od_id: odId }); }
  catch (error) { return { ok: false, ...publicError(error) }; }
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
