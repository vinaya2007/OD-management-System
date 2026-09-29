import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";

function requestCookies(request: Request) {
  return request.headers.get("cookie")?.split(";").map((item) => { const [name, ...rest] = item.trim().split("="); return { name, value: rest.join("=") }; }) ?? [];
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", requestUrl.origin));
  const code = requestUrl.searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !url || !key) return response;
  const supabase = createServerClient(url, key, { cookies: { getAll: () => requestCookies(request), setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user || !data.user.email_confirmed_at || !hasAllowedEmailDomain(data.user.email ?? "")) {
    await supabase.auth.signOut();
    response.headers.set("Location", new URL("/login?error=domain", requestUrl.origin).toString());
    return response;
  }
  const { profile, error: profileError } = await lookupAuthenticatedProfile(supabase, data.user, "oauth-callback");
  if (profileError) {
    const detail = process.env.NODE_ENV === "development" ? `&detail=${encodeURIComponent(`${profileError.code ?? "SupabaseError"}: ${profileError.message}`)}` : "";
    const failure = NextResponse.redirect(new URL(`/login?error=profile-query${detail}`, requestUrl.origin));
    response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
    logAuthRedirect("oauth-callback", "/login?error=profile-query");
    return failure;
  }
  if (!profile || !profile.is_active) {
    const failure = NextResponse.redirect(new URL("/login?error=profile", requestUrl.origin));
    response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
    logAuthRedirect("oauth-callback", "/login?error=profile");
    return failure;
  }
  const requestedNext = requestUrl.searchParams.get("next");
  const destination = requestedNext === "/auth/reset-password" ? requestedNext
    : profile.role === "student" && (!profile.register_number || !profile.section || !profile.department_id) ? "/student/complete-profile"
    : `/${profile.role}/dashboard`;
  logAuthRedirect("oauth-callback", destination);
  const success = NextResponse.redirect(new URL(destination, requestUrl.origin));
  response.cookies.getAll().forEach((cookie) => success.cookies.set(cookie));
  return success;
}
