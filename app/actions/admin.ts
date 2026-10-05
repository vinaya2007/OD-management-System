"use server";

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireHod } from "@/lib/auth";
import { hasAllowedEmailDomain } from "@/lib/env";
import { findPendingStaffInvitation } from "@/lib/staff-invitations";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Admin provisioning is not configured. Add SUPABASE_SERVICE_ROLE_KEY to the server environment.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function safeMessage(error: unknown, operation = "account operation") {
  if (error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY")) return "Staff invitations need the server-only SUPABASE_SERVICE_ROLE_KEY. Existing accounts can still have their role changed from the Accounts list.";
  const databaseError = error as { code?: string; message?: string; status?: number } | null;
  console.error(`[admin-action:${operation}] operation failed`, { code: databaseError?.code, status: databaseError?.status, message: databaseError?.message, error });
  if (["PGRST202", "42883"].includes(databaseError?.code ?? "")) return "The Admin directory database function is missing. Apply the latest Supabase migration and try again.";
  if (["PGRST205", "PGRST204", "42P01", "42703"].includes(databaseError?.code ?? "")) return "The staff invitation database schema is missing. Apply migrations 202610010001, 202610020001, and 202610060001 in Supabase, then retry.";
  if (["23505", "email_exists"].includes(databaseError?.code ?? "")) return "This email already has an account that is not an incomplete staff invitation. Use Accounts to manage its role.";
  if (databaseError?.status === 422 || /already registered/i.test(databaseError?.message ?? "")) return "Supabase Auth already has this account. If it is an incomplete staff invitation, apply the latest migrations and retry the invitation.";
  if (operation === "send invitation email") {
    const code = databaseError?.code ?? "";
    const message = databaseError?.message ?? "";
    if (code === "over_email_send_rate_limit" || databaseError?.status === 429) return "Supabase is rate-limiting invitation emails. Wait before retrying, or configure your own SMTP provider and its Auth email rate limit.";
    if (code === "email_address_not_authorized" || /email address not authorized/i.test(message)) return "Supabase’s default mailer only sends to authorized project team addresses. Configure custom SMTP under Supabase Authentication → Emails → SMTP Settings to invite SRMIST accounts.";
    if (/smtp|email provider|mailer/i.test(message)) return "Supabase Auth could not deliver this invitation. Check Authentication → Emails → SMTP Settings and the Auth logs in Supabase.";
    if (process.env.NODE_ENV === "development") return `Supabase could not send the invitation (${code || databaseError?.status || "Auth error"}): ${message || "check the Supabase Auth logs"}`;
    return "Supabase Auth could not send this invitation. Check Authentication → Emails → SMTP Settings and the project Auth logs.";
  }
  return "The requested account operation could not be completed.";
}

export async function getStaffSetupInfoAction(): Promise<ActionResult<{ email: string; department: string; role: string }>> {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) return { ok: false, message: "Open the invitation link from your verified SRMIST email to continue." };
    const invitation = await findPendingStaffInvitation(user);
    if (!invitation) return { ok: false, message: "There is no pending staff invitation for this account." };
    const admin = adminClient();
    const { data: department, error: departmentError } = await admin.from("departments").select("name,code,is_active").eq("id", invitation.department_id).maybeSingle();
    if (departmentError) throw departmentError;
    if (!department || department.code !== "ECE" || !department.is_active) return { ok: false, message: "The invited ECE department is unavailable. Contact an administrator." };
    return { ok: true, data: { email: invitation.email, department: department.name, role: invitation.role } };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function completeStaffSetupAction(input: { fullName: string; facultyId: string; password: string; confirmPassword: string }): Promise<ActionResult<null>> {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) return { ok: false, message: "Open the invitation link from your verified SRMIST email to continue." };
    const fullName = input.fullName.trim(), facultyId = input.facultyId.trim();
    if (fullName.length < 2 || fullName.length > 120) return { ok: false, message: "Enter your full name (2 to 120 characters)." };
    if (facultyId.length < 1 || facultyId.length > 120) return { ok: false, message: "Enter a Faculty ID (up to 120 characters)." };
    if (input.password.length < 10 || input.password.length > 128) return { ok: false, message: "Choose a password between 10 and 128 characters." };
    if (input.password !== input.confirmPassword) return { ok: false, message: "The passwords do not match." };
    const invitation = await findPendingStaffInvitation(user);
    if (!invitation) return { ok: false, message: "This staff invitation has already been completed or is no longer valid." };
    const { error: passwordError } = await supabase.auth.updateUser({ password: input.password });
    if (passwordError) throw passwordError;
    const { error } = await supabase.rpc("complete_staff_account_setup", { p_full_name: fullName, p_faculty_id: facultyId });
    if (error) throw error;
    revalidatePath("/admin/users");
    return { ok: true, data: null };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function searchAdminUsersAction(query = ""): Promise<ActionResult<Array<{ id: string; name: string; email: string; role: string; registerNumber: string | null; department: string; isActive: boolean }>>> {
  try {
    await requireAdmin();
    const client = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const term = query.trim().replace(/[,%()]/g, " ").slice(0, 80);
    const { data, error } = await client.rpc("admin_profile_directory", { p_search: term || null });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; full_name: string | null; email: string; role: string; register_number: string | null; department_name: string | null; department_code: string | null; is_active: boolean }>;
    return { ok: true, data: rows.slice(0, 100).map((row) => ({ id: row.id, name: row.full_name ?? "", email: row.email, role: row.role, registerNumber: row.register_number, department: row.department_name ?? row.department_code ?? "", isActive: row.is_active })) };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function sendStaffInvitationAction(input: { email: string; role: "faculty" | "hod"; departmentId: string }): Promise<ActionResult<{ email: string; role: string }>> {
  let operation = "validate invitation";
  try {
    const actor = await requireAdmin();
    const email = input.email.trim().toLowerCase();
    if (!hasAllowedEmailDomain(email) || !["faculty", "hod"].includes(input.role) || !/^[0-9a-f-]{36}$/i.test(input.departmentId)) {
      return { ok: false, message: "Enter a valid SRMIST email, staff role, and department." };
    }
    operation = "check department";
    const client = adminClient();
    const { data: department, error: departmentError } = await client.from("departments").select("id,code").eq("id", input.departmentId).eq("is_active", true).maybeSingle();
    if (departmentError) throw departmentError;
    if (!department || department.code !== "ECE") return { ok: false, message: "Choose the active ECE department." };
    operation = "check existing profile";
    const { data: existingProfile, error: profileLookupError } = await client.from("profiles").select("id,auth_user_id,role,department_id,staff_setup_pending").eq("email", email).maybeSingle();
    if (profileLookupError) throw profileLookupError;
    if (existingProfile && (!existingProfile.staff_setup_pending || existingProfile.role !== input.role || existingProfile.department_id !== input.departmentId)) return { ok: false, message: "An account already exists for this email. Use the Accounts list to manage its role." };
    // A pending, inactive invite can be safely restarted if its one-time link
    // expired or was consumed by an email security scanner.
    if (existingProfile?.auth_user_id) {
      operation = "reset incomplete account";
      const { error: deleteError } = await client.auth.admin.deleteUser(existingProfile.auth_user_id);
      if (deleteError) throw deleteError;
    }
    const redirectTo = `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/auth/callback`;
    operation = "save invitation";
    const { error: inviteError } = await client.from("staff_account_invitations").upsert({ email, role: input.role, department_id: input.departmentId, invited_by: actor.id, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), auth_user_id: null, claimed_at: null, completed_at: null }, { onConflict: "email" });
    if (inviteError) throw inviteError;
    operation = "send invitation email";
    const { error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) {
      // Keep the trusted invite record. Supabase may have created the Auth
      // user or delivered mail even when its response reports a send error;
      // deleting the invite here could make a received link unusable.
      throw error;
    }
    revalidatePath("/admin/users");
    return { ok: true, data: { email, role: input.role } };
  } catch (error) { return { ok: false, message: safeMessage(error, operation) }; }
}

export async function setAdminUserActiveAction(userId: string, active: boolean): Promise<ActionResult<null>> {
  try {
    const actor = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(userId) || actor.id === userId) return { ok: false, message: "You cannot change your own account status." };
    const client = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { error } = await client.rpc("admin_set_profile_active", { p_profile_id: userId, p_is_active: active });
    if (error) throw error;
    revalidatePath("/admin/users");
    return { ok: true, data: null };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function setAdminUserRoleAction(userId: string, role: "student" | "faculty" | "hod"): Promise<ActionResult<null>> {
  try {
    const actor = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(userId) || actor.id === userId) return { ok: false, message: "You cannot change your own role." };
    if (!["student", "faculty", "hod"].includes(role)) return { ok: false, message: "Choose Student, Faculty, or HOD." };
    const client = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { error } = await client.rpc("admin_set_profile_role", { p_profile_id: userId, p_role: role });
    if (error) throw error;
    for (const path of ["/admin/users", "/admin/students", "/admin/faculty", "/admin/hods", "/admin/dashboard"]) revalidatePath(path);
    return { ok: true, data: null };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function createFacultyRoleRequestAction(input: { email: string; reason: string }): Promise<ActionResult<null>> {
  try {
    await requireHod();
    const email = input.email.trim().toLowerCase();
    const reason = input.reason.trim();
    if (!hasAllowedEmailDomain(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !reason || reason.length > 2000) return { ok: false, message: "Enter a valid SRMIST staff email and a reason (up to 2000 characters)." };
    const supabase = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { error } = await supabase.rpc("submit_faculty_role_request", { p_email: email, p_reason: reason });
    if (error) {
      if (error.code === "P0001" && error.message === "FACULTY_REQUEST_ALREADY_PENDING") return { ok: false, message: "A Faculty account request for this email is already pending." };
      if (error.code === "P0001" && error.message === "FACULTY_ACCOUNT_EXISTS") return { ok: false, message: "A Faculty account already exists for this email." };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, message: "Faculty request submission is not available yet. Apply migrations 202610080001_hod_faculty_requests.sql and 202610080002_hod_faculty_request_reason.sql in Supabase, then retry." };
      throw error;
    }
    revalidatePath("/hod/dashboard");
    revalidatePath("/admin/users");
    return { ok: true, data: null };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function listFacultyRoleRequestsAction(): Promise<ActionResult<Array<{ id: string; email: string; reason: string; status: string; createdAt: string; requester: string; department: string }>>> {
  try {
    await requireAdmin();
    const client = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { data, error } = await client.from("faculty_role_requests").select("id,email,reason,status,created_at,requester:profiles!requester_id(full_name),department:departments(name)").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { ok: true, data: (data ?? []).map((row) => ({ id: row.id, email: row.email, reason: row.reason, status: row.status, createdAt: row.created_at, requester: ((row.requester as { full_name?: string; name?: string } | null)?.full_name ?? (row.requester as { name?: string } | null)?.name ?? ""), department: (row.department as { name?: string } | null)?.name ?? "" })) };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function reviewFacultyRoleRequestAction(requestId: string, approved: boolean): Promise<ActionResult<{ email?: string }>> {
  try {
    await requireAdmin();
    const client = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { data: request, error: requestError } = await client.from("faculty_role_requests").select("id,email,department_id,status").eq("id", requestId).eq("status", "PENDING").maybeSingle();
    if (requestError) throw requestError;
    if (!request) return { ok: false, message: "This request is no longer pending." };
    let invitation: { email?: string } = {};
    if (approved) {
      const provisioned = await sendStaffInvitationAction({ email: request.email, role: "faculty", departmentId: request.department_id });
      if (!provisioned.ok) return provisioned;
      invitation = { email: provisioned.data.email };
    }
    const reviewer = await requireAdmin();
    const { error } = await client.from("faculty_role_requests").update({ status: approved ? "APPROVED" : "REJECTED", reviewed_by: reviewer.id, reviewed_at: new Date().toISOString() }).eq("id", requestId).eq("status", "PENDING");
    if (error) throw error;
    revalidatePath("/admin/users");
    return { ok: true, data: invitation };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}

export async function listMyFacultyRoleRequestsAction(): Promise<ActionResult<Array<{ id: string; email: string; reason: string; status: string; createdAt: string }>>> {
  try {
    const actor = await requireHod();
    const supabase = await (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const { data, error } = await supabase.from("faculty_role_requests").select("id,email,reason,status,created_at").eq("requester_id", actor.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { ok: true, data: (data ?? []).map((row) => ({ id: row.id, email: row.email, reason: row.reason, status: row.status, createdAt: row.created_at })) };
  } catch (error) { return { ok: false, message: safeMessage(error) }; }
}
