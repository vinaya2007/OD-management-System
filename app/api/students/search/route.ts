import { NextResponse } from "next/server";

// Student selection for OD submissions was removed. Keep this route as a
// closed response for stale clients; it no longer queries student profiles.
export async function GET() {
  return NextResponse.json({ message: "Student search is no longer available." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
