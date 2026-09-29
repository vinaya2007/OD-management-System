import { NextResponse, type NextRequest } from "next/server";
import { requireStudent } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    await requireStudent();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 80) return NextResponse.json({ students: [] });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_ece_students", { p_query: query });
    if (error) throw new AppError("DATABASE_ERROR", "Student search is temporarily unavailable.");
    return NextResponse.json({ students: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const issue = publicError(error);
    const status = issue.code === "UNAUTHORIZED" ? 401 : issue.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ message: issue.message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
