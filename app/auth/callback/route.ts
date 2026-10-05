import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";
import { resolveStaffInvitation } from "@/lib/staff-invitations";

function requestCookies(request: Request) {
  return request.headers.get("cookie")?.split(";").map((item) => { const [name, ...rest] = item.trim().split("="); return { name, value: rest.join("=") }; }) ?? [];
}

function supportedOtpType(type: string | null): type is EmailOtpType {
  return type === "signup" || type === "invite" || type === "magiclink" || type === "recovery" || type === "email_change" || type === "email";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const authError = requestUrl.searchParams.get("error_code") ?? requestUrl.searchParams.get("error");
  const requestedNext = requestUrl.searchParams.get("next");

  if (process.env.NODE_ENV === "development") {
    // Log only parameter presence/type, never credentials or the full URL.
    console.info("[auth:callback] query received", { hasCode: Boolean(code), hasTokenHash: Boolean(tokenHash), otpType: type, hasError: Boolean(authError), next: requestedNext });
  }
  if (authError) return NextResponse.redirect(new URL(`/login?error=${authError === "otp_expired" ? "invite-expired" : "domain"}`, requestUrl.origin));

  // Implicit-flow invite links carry tokens in the URL fragment, which browsers
  // intentionally omit from HTTP requests. Send those callbacks to the client
  // finisher; browsers preserve the fragment during this same-origin redirect.
  if (!code && !tokenHash) return NextResponse.redirect(new URL("/auth/callback/complete", requestUrl.origin));
  if (!code && (!tokenHash || !supportedOtpType(type))) return NextResponse.redirect(new URL("/login?error=domain", requestUrl.origin));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL("/login?error=configuration", requestUrl.origin));
  const response = NextResponse.redirect(new URL("/login", requestUrl.origin));
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => requestCookies(request),
    setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  } });
  const authResult = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  const { data, error } = authResult;
  if (error || !data.user || !data.user.email_confirmed_at || !hasAllowedEmailDomain(data.user.email ?? "")) {
    const failure = NextResponse.redirect(new URL(`/login?error=${error && /expired/i.test(error.message) ? "invite-expired" : "domain"}`, requestUrl.origin));
    response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
    return failure;
  }

  if (type !== "recovery") {
    const invitation = await resolveStaffInvitation(data.user);
    if (invitation.status === "expired") {
      const failure = NextResponse.redirect(new URL("/login?error=invite-expired", requestUrl.origin));
      response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
      return failure;
    }
    if (invitation.status === "pending") {
      const setupPath = `/${invitation.invitation.role}/register`;
      const success = NextResponse.redirect(new URL(setupPath, requestUrl.origin));
      response.cookies.getAll().forEach((cookie) => success.cookies.set(cookie));
      logAuthRedirect("auth-callback", setupPath);
      return success;
    }
  }

  const { profile, error: profileError } = await lookupAuthenticatedProfile(supabase, data.user, "auth-callback");
  if (profileError || !profile || !profile.is_active && !profile.staff_setup_pending) {
    if (process.env.NODE_ENV === "development" && profileError) console.error("[auth:callback] verified user profile lookup failed", { code: profileError.code, message: profileError.message });
    const failure = NextResponse.redirect(new URL(`/login?error=${profileError ? "profile-query" : profile ? "authorization" : "profile-provisioning"}`, requestUrl.origin));
    response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
    return failure;
  }

  const destination = profile.staff_setup_pending ? `/${profile.role}/register`
    : requestedNext === "/auth/reset-password" || type === "recovery" ? "/auth/reset-password"
    : profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`;
  logAuthRedirect("auth-callback", destination);
  const success = NextResponse.redirect(new URL(destination, requestUrl.origin));
  response.cookies.getAll().forEach((cookie) => success.cookies.set(cookie));
  return success;
}
