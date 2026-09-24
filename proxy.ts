import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const protectedPrefixes = ["/student", "/faculty", "/hod", "/admin"];

export async function proxy(request: NextRequest) {
  if (process.env.ENABLE_DEMO_AUTH === "true") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  const response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("auth_user_id", user.id).maybeSingle();
  if (!profile?.is_active) return NextResponse.redirect(new URL("/login?error=authorization", request.url));
  if (profile.role !== pathname.split("/")[1]) return NextResponse.redirect(new URL(`/${profile.role}/dashboard`, request.url));
  return response;
}
export const config = { matcher: ["/student/:path*", "/faculty/:path*", "/hod/:path*", "/admin/:path*"] };
