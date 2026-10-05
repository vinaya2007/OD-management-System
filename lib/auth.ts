import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAllowedEmailDomain } from "@/lib/env";
import { lookupAuthenticatedProfile } from "@/lib/auth-profile";

export type DatabaseRole = "student" | "faculty" | "hod" | "admin";
export type AuthenticatedProfile = { id: string; auth_user_id: string; full_name: string; name: string; email: string; role: DatabaseRole; department_id: string | null; register_number: string | null; section: string | null; year: string | null; must_change_password: boolean; staff_setup_pending: boolean; designation?: string | null; is_active: boolean };

export async function requireAuthenticatedUser(): Promise<AuthenticatedProfile> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) throw new AppError("UNAUTHORIZED", "Please sign in with a verified @srmist.edu.in account.");
  const { profile, error } = await lookupAuthenticatedProfile(supabase, user, "server-authorization");
  if (error) {
    console.error("[auth:server-authorization] profile query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new AppError("DATABASE_ERROR", "The OD profile could not be checked. Please try again or contact the administrator.");
  }
  if (!profile || !profile.is_active) throw new AppError("FORBIDDEN", "Your college account is not authorized for OD Management.");
  return profile as AuthenticatedProfile;
}

export async function requireRole(role: DatabaseRole) {
  const profile = await requireAuthenticatedUser();
  if (profile.role !== role) throw new AppError("FORBIDDEN", "You are not authorized for this action.");
  return profile;
}
export const requireStudent = () => requireRole("student");
export const requireFaculty = () => requireRole("faculty");
export const requireHod = () => requireRole("hod");
export const requireAdmin = () => requireRole("admin");
export async function redirectToAuthorizedArea() { const profile = await requireAuthenticatedUser(); redirect(`/${profile.role}/dashboard`); }
