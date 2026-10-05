import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";
import { resolveStaffInvitation } from "@/lib/staff-invitations";

export async function getAuthenticatedDestination(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return null;
    if (!user?.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) return null;
    // Invited staff are authorized by the Admin-created invitation row until
    // setup provisions their normal application profile.
    const invitation = await resolveStaffInvitation(user);
    if (invitation.status === "pending") {
      const destination = `/${invitation.invitation.role}/register`;
      logAuthRedirect("login-page", destination);
      return destination;
    }
    if (invitation.status === "expired") return null;
    const { profile, error } = await lookupAuthenticatedProfile(supabase, user, "login-page");
    if (error) throw error;
    if (!profile?.is_active) return null;
    const destination = profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`;
    logAuthRedirect("login-page", destination);
    return destination;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("[auth:login-page] could not resolve authenticated destination", error);
    throw error;
  }
}

export async function getAuthenticatedInvitationNotice(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) return null;
  const invitation = await resolveStaffInvitation(user);
  return invitation.status === "expired" ? "invite-expired" : null;
}

