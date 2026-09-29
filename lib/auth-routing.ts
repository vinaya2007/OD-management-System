import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";

export async function getAuthenticatedDestination(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return null;
    if (!user?.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) return null;
    const { profile, error } = await lookupAuthenticatedProfile(supabase, user, "login-page");
    if (error) throw error;
    if (!profile?.is_active) return null;
    if (profile.role === "student" && (!profile.register_number || !profile.section || !profile.department_id)) return "/student/complete-profile";
    const destination = `/${profile.role}/dashboard`;
    logAuthRedirect("login-page", destination);
    return destination;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("[auth:login-page] could not resolve authenticated destination", error);
    throw error;
  }
}
