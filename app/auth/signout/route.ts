import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.headers.get("cookie")?.split(";").map((item) => { const [name, ...rest] = item.trim().split("="); return { name, value: rest.join("=") }; }) ?? [],
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  }});
  await supabase.auth.signOut();
  return response;
}
