import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";

const protectedPrefixes = ["/student", "/faculty", "/hod", "/admin", "/dashboard", "/auth/change-password", "/staff"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPath = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const authPage = ["/", "/login", "/register"].includes(pathname);
  const passwordPage = pathname === "/auth/change-password";
  if (!protectedPath && !authPage) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return protectedPath ? NextResponse.redirect(new URL("/login?error=configuration", request.url)) : NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
      cookies.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    }
  } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const redirectWithRefreshedCookies = (path: string) => {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };
  if (userError || !user || !user.email_confirmed_at || !hasAllowedEmailDomain(user.email ?? "")) {
    return protectedPath ? redirectWithRefreshedCookies("/login") : response;
  }
  // These exact setup pages verify their trusted invitation on the server.
  // They must remain reachable before a profiles row exists.
  if (pathname === "/faculty/register" || pathname === "/hod/register") return response;
  const { profile, error: profileError } = await lookupAuthenticatedProfile(supabase, user, `proxy:${pathname}`);
  if (profileError) {
    const detail = process.env.NODE_ENV === "development" ? `&detail=${encodeURIComponent(`${profileError.code ?? "SupabaseError"}: ${profileError.message}`)}` : "";
    return protectedPath ? redirectWithRefreshedCookies(`/login?error=profile-query${detail}`) : response;
  }
  if (!profile) return protectedPath ? redirectWithRefreshedCookies("/login?error=profile-provisioning") : response;
  if (profile.staff_setup_pending) return pathname === `/${profile.role}/register` ? response : redirectWithRefreshedCookies(`/${profile.role}/register`);
  if (pathname.startsWith("/staff/")) return redirectWithRefreshedCookies(profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`);
  if (!profile.is_active) return protectedPath ? redirectWithRefreshedCookies("/login?error=authorization") : response;
  if (profile.must_change_password) return passwordPage ? response : redirectWithRefreshedCookies("/auth/change-password");
  if (passwordPage) return redirectWithRefreshedCookies(profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`);
  if (authPage) {
    const destination = profile.role === "student" ? "/student/dashboard" : `/${profile.role}/dashboard`;
    logAuthRedirect(`proxy:${pathname}`, destination);
    return redirectWithRefreshedCookies(destination);
  }
  if (pathname !== "/dashboard" && profile.role !== pathname.split("/")[1]) {
    const destination = `/${profile.role}/dashboard`;
    logAuthRedirect(`proxy:${pathname}`, destination);
    return redirectWithRefreshedCookies(destination);
  }
  return response;
}
export const config = { matcher: ["/", "/login", "/register", "/student/:path*", "/faculty/:path*", "/hod/:path*", "/admin/:path*", "/dashboard", "/auth/change-password", "/staff/:path*"] };




