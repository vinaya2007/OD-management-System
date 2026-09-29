import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { hasAllowedEmailDomain } from "@/lib/env";
import { logAuthRedirect, lookupAuthenticatedProfile } from "@/lib/auth-profile";

const protectedPrefixes = ["/student", "/faculty", "/hod", "/admin", "/dashboard"];

export async function proxy(request: NextRequest) {
  if (process.env.ENABLE_DEMO_AUTH === "true") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const protectedPath = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const authPage = ["/", "/login", "/register"].includes(pathname);
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
  const { profile, error: profileError } = await lookupAuthenticatedProfile(supabase, user, `proxy:${pathname}`);
  if (profileError) {
    const detail = process.env.NODE_ENV === "development" ? `&detail=${encodeURIComponent(`${profileError.code ?? "SupabaseError"}: ${profileError.message}`)}` : "";
    return protectedPath ? redirectWithRefreshedCookies(`/login?error=profile-query${detail}`) : response;
  }
  if (!profile?.is_active) return protectedPath ? redirectWithRefreshedCookies("/login?error=profile") : response;
  if (authPage) {
    const destination = profile.role === "student" && (!profile.register_number || !profile.section || !profile.department_id)
      ? "/student/complete-profile" : `/${profile.role}/dashboard`;
    logAuthRedirect(`proxy:${pathname}`, destination);
    return redirectWithRefreshedCookies(destination);
  }
  if (profile.role === "student" && (!profile.register_number || !profile.section || !profile.department_id) && pathname !== "/student/complete-profile") {
    return redirectWithRefreshedCookies("/student/complete-profile");
  }
  if (profile.role !== pathname.split("/")[1]) {
    const destination = `/${profile.role}/dashboard`;
    logAuthRedirect(`proxy:${pathname}`, destination);
    return redirectWithRefreshedCookies(destination);
  }
  return response;
}
export const config = { matcher: ["/", "/login", "/register", "/student/:path*", "/faculty/:path*", "/hod/:path*", "/admin/:path*", "/dashboard"] };
