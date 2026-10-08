"use server";

import { requireFaculty, requireHod, requireStudent } from "@/lib/auth";
import { publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OD_CATEGORIES, submitODRequestSchema } from "@/lib/validation/od";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };
export type SpecialEligibility = { eligible: boolean; used: number; limit: number };
export type SpecialODRow = {
  id: string; reference: string; student: string; registerNumber: string; section: string;
  date: string; category: string; eventName: string; reason: string; status: string;
  facultyStatus: string; hodStatus: string; submittedAt: string; canReview: boolean;
};

export async function getSpecialODEligibilityAction(category: string): Promise<ActionResult<SpecialEligibility>> {
  try {
    await requireStudent();
    if (!(OD_CATEGORIES as readonly string[]).includes(category)) return { ok: false, message: "Select a valid OD category." };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_special_od_eligibility", { p_category: category });
    if (error) throw error;
    const result = data as Record<string, unknown>;
    return { ok: true, data: { eligible: result.eligible === true, used: Number(result.used ?? 0), limit: Number(result.limit ?? 0) } };
  } catch (error) { const issue = publicError(error); return { ok: false, message: issue.message }; }
}

export async function submitSpecialODAction(input: unknown): Promise<{ ok: true; id?: string } | { ok: false; message: string }> {
  try {
    await requireStudent();
    const parsed = submitODRequestSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("submit_special_od_request", { p_payload: {
      idempotency_key: randomUUID(), event_name: parsed.eventName, od_category: parsed.category, event_type: parsed.eventType,
      organization: parsed.organization ?? null, event_date: parsed.eventDate, start_period: parsed.startPeriod, end_period: parsed.endPeriod,
      start_time: parsed.startTime, end_time: parsed.endTime, venue: parsed.venue, reason: parsed.purpose, purpose: parsed.purpose,
      requester_remarks: parsed.requesterRemarks ?? null, faculty_ids: parsed.facultyIds
    } });
    if (error) throw error;
    revalidatePath("/");
    const result = data as { id?: string } | string | null;
    return { ok: true, id: typeof result === "string" ? result : result?.id };
  } catch (error) { const issue = publicError(error); return { ok: false, message: issue.message }; }
}

export async function getFacultySpecialODsAction(): Promise<ActionResult<SpecialODRow[]>> {
  try {
    const actor = await requireFaculty();
    const supabase = await createSupabaseServerClient();
    const { data: assignments, error: assignmentError } = await supabase.from("od_request_faculty").select("od_request_id,status").eq("faculty_id", actor.id);
    if (assignmentError) throw assignmentError;
    const assigned = (assignments ?? []).map((entry) => entry.od_request_id);
    if (!assigned.length) return { ok: true, data: [] };
    const { data, error } = await supabase.from("od_requests")
      .select("id,od_number,event_name,od_category,reason,purpose,event_date,status,is_special_od,created_at,faculty_id,hod_id,requester:profiles!requester_id(full_name,register_number,section),od_request_faculty(faculty_id,status)")
      .eq("is_special_od", true).in("id", assigned).eq("department_id", actor.department_id)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return { ok: true, data: mapSpecialRows(data ?? [], actor.id) };
  } catch (error) { const issue = publicError(error); return { ok: false, message: issue.message }; }
}

export async function getHodSpecialODsAction(): Promise<ActionResult<SpecialODRow[]>> {
  try {
    const actor = await requireHod();
    if (!actor.department_id) return { ok: false, message: "Your HOD profile is not linked to a department." };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("od_requests")
      .select("id,od_number,event_name,od_category,reason,purpose,event_date,status,is_special_od,created_at,faculty_id,hod_id,requester:profiles!requester_id(full_name,register_number,section),od_request_faculty(faculty_id,status)")
      .eq("is_special_od", true).eq("department_id", actor.department_id).in("status", ["PENDING_HOD", "APPROVED", "REJECTED_BY_HOD"])
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return { ok: true, data: mapSpecialRows(data ?? []) };
  } catch (error) { const issue = publicError(error); return { ok: false, message: issue.message }; }
}

function mapSpecialRows(raw: Array<Record<string, unknown>>, facultyId?: string): SpecialODRow[] {
  return raw.filter((row) => row.is_special_od === true).map((row) => {
    const requester = row.requester as { full_name?: string | null; register_number?: string | null; section?: string | null } | null;
    const reviews = (row.od_request_faculty ?? []) as Array<{ faculty_id?: string; status?: string }>;
    const facultyStatus = reviews.some((review) => review.status === "REJECTED") ? "REJECTED" : reviews.length && reviews.every((review) => review.status === "APPROVED") ? "APPROVED" : reviews.length ? "PENDING" : "NOT_ASSIGNED";
    const status = String(row.status ?? "");
    return {
      id: String(row.id), reference: String(row.od_number ?? row.id), student: requester?.full_name ?? "—",
      registerNumber: requester?.register_number ?? "—", section: requester?.section ?? "—", date: String(row.event_date ?? ""),
      category: String(row.od_category ?? ""), eventName: String(row.event_name ?? ""), reason: String(row.purpose ?? row.reason ?? ""),
      status, facultyStatus, hodStatus: status === "PENDING_HOD" ? "PENDING" : status === "APPROVED" ? "APPROVED" : status === "REJECTED_BY_HOD" ? "REJECTED" : "NOT_REACHED",
      submittedAt: String(row.created_at ?? ""), canReview: facultyId ? status === "PENDING_FACULTY" && reviews.some((review) => review.faculty_id === facultyId && review.status === "PENDING") : status === "PENDING_HOD"
    };
  });
}
