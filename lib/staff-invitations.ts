import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { hasAllowedEmailDomain } from "@/lib/env";

export type PendingStaffInvitation = {
  id: string;
  email: string;
  role: "faculty" | "hod";
  department_id: string;
};
export type StaffInvitationState =
  | { status: "pending"; invitation: PendingStaffInvitation }
  | { status: "expired"; role: "faculty" | "hod" }
  | { status: "completed"; role: "faculty" | "hod" }
  | { status: "none" };

function createInvitationAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Staff invitation lookup is not configured on the server.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Resolve invitation lifecycle state for this verified Auth user. */
export async function resolveStaffInvitation(user: User): Promise<StaffInvitationState> {
  const email = user.email?.trim().toLowerCase();
  if (!user.email_confirmed_at || !email || !hasAllowedEmailDomain(email)) return { status: "none" };

  const admin = createInvitationAdminClient();
  const { data, error } = await admin.from("staff_account_invitations")
    .select("id,email,role,department_id,auth_user_id,claimed_at,expires_at,completed_at")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["faculty", "hod"].includes(data.role) || (data.auth_user_id && data.auth_user_id !== user.id)) return { status: "none" };

  const role = data.role as "faculty" | "hod";
  if (data.completed_at) return { status: "completed", role };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { status: "expired", role };

  // Usually the Auth trigger binds the invite. If that trigger was absent when
  // this account was created, bind it now after Supabase has verified the email.
  if (!data.auth_user_id || !data.claimed_at) {
    const { data: claimed, error: claimError } = await admin.from("staff_account_invitations")
      .update({ auth_user_id: user.id, claimed_at: data.claimed_at ?? new Date().toISOString() })
      .eq("id", data.id)
      .eq("email", email)
      .or(`auth_user_id.is.null,auth_user_id.eq.${user.id}`)
      .is("completed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return { status: "none" };
  }

  return { status: "pending", invitation: { id: data.id, email, role, department_id: data.department_id } };
}

/** Resolve only a live, uncompleted invitation. */
export async function findPendingStaffInvitation(user: User): Promise<PendingStaffInvitation | null> {
  const state = await resolveStaffInvitation(user);
  return state.status === "pending" ? state.invitation : null;
}
