import { NextResponse, type NextRequest } from "next/server";
import { hasAllowedEmailDomain } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";
import { resolveStaffInvitation } from "@/lib/staff-invitations";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", request.url));
  }
  const invitation = await resolveStaffInvitation(user);
  if (invitation.status === "pending") return NextResponse.redirect(new URL(`/${invitation.invitation.role}/register`, request.url));
  if (invitation.status === "expired") return NextResponse.redirect(new URL("/login?error=invite-expired", request.url));
  const { profile, error } = await lookupAuthenticatedProfile(supabase, user, "email-login");
  if (error) {
    const detail = process.env.NODE_ENV === "development" ? `&detail=${encodeURIComponent(`${error.code ?? "SupabaseError"}: ${error.message}`)}` : "";
    logAuthRedirect("email-login", "/login?error=profile-query");
    return NextResponse.redirect(new URL(`/login?error=profile-query${detail}`, request.url));
  }
  if (!profile) {
    logAuthRedirect("email-login", "/login?error=profile-provisioning");
    return NextResponse.redirect(new URL("/login?error=profile-provisioning", request.url));
  }
  if (profile.staff_setup_pending) return NextResponse.redirect(new URL(`/${profile.role}/register`, request.url));
  if (!profile.is_active) {
    logAuthRedirect("email-login", "/login?error=authorization");
    return NextResponse.redirect(new URL("/login?error=authorization", request.url));
  }
  const target = profile.must_change_password ? "/auth/change-password" : profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`;
  logAuthRedirect("email-login", target);
  return NextResponse.redirect(new URL(target, request.url));
}


