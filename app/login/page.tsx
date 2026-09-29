import LoginContent from "@/app/login/LoginContent";
import { redirect } from "next/navigation";
import { getAuthenticatedDestination } from "@/lib/auth-routing";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string }> }) {
  let destination: string | null = null;
  let profileQueryDetail: string | null = null;
  try {
    destination = await getAuthenticatedDestination();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      const detail = error as { code?: string; message?: string };
      profileQueryDetail = `${detail.code ?? "SupabaseError"}: ${detail.message ?? "Profile query failed"}`;
    } else {
      profileQueryDetail = error instanceof Error ? error.message : "Unexpected profile lookup error";
    }
  }
  if (destination) redirect(destination);
  const { error, detail } = await searchParams;
  return <LoginContent setupError={profileQueryDetail ? "profile-query" : error ?? null} setupDetail={profileQueryDetail ?? (process.env.NODE_ENV === "development" ? detail ?? null : null)} />;
}
