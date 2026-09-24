import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DatabaseRole = "student" | "faculty" | "hod" | "admin";
export type AuthenticatedProfile = { id: string; auth_user_id: string; name: string; email: string; role: DatabaseRole; department_id: string | null; is_active: boolean };

export async function requireAuthenticatedUser(): Promise<AuthenticatedProfile> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
  const { data, error } = await supabase.from("profiles").select("id, auth_user_id, name, email, role, department_id, is_active").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
  if (error || !data) throw new AppError("FORBIDDEN", "Your college account is not authorized for OD Management.");
  return data as AuthenticatedProfile;
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
