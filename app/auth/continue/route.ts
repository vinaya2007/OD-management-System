import { NextResponse, type NextRequest } from "next/server";
import { hasAllowedEmailDomain } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", request.url));
  }
  const { profile, error } = await lookupAuthenticatedProfile(supabase, user, "email-login");
  if (error) {
    const detail = process.env.NODE_ENV === "development" ? `&detail=${encodeURIComponent(`${error.code ?? "SupabaseError"}: ${error.message}`)}` : "";
    logAuthRedirect("email-login", "/login?error=profile-query");
    return NextResponse.redirect(new URL(`/login?error=profile-query${detail}`, request.url));
  }
  if (!profile?.is_active) {
    logAuthRedirect("email-login", "/login?error=profile");
    return NextResponse.redirect(new URL("/login?error=profile", request.url));
  }
  const target = profile.role === "student" && (!profile.register_number || !profile.section || !profile.department_id)
    ? "/student/complete-profile" : `/${profile.role}/dashboard`;
  logAuthRedirect("email-login", target);
  return NextResponse.redirect(new URL(target, request.url));
}
