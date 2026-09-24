import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { hasAllowedEmailDomain } from "@/lib/env";

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
  const { data } = await supabase.auth.exchangeCodeForSession(code);
  if (!data.user || !hasAllowedEmailDomain(data.user.email ?? "")) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", requestUrl.origin));
  }
  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("auth_user_id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    return NextResponse.redirect(new URL("/login?error=profile", requestUrl.origin), { headers: response.headers });
  }
  return NextResponse.redirect(new URL(`/${profile.role}/dashboard`, requestUrl.origin), { headers: response.headers });
}
