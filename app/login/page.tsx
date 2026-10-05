import LoginContent from "@/app/login/LoginContent";
import { redirect } from "next/navigation";
import { getAuthenticatedDestination, getAuthenticatedInvitationNotice } from "@/lib/auth-routing";
import { env } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; error_code?: string; detail?: string }> }) {
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
  const { error, error_code, detail } = await searchParams;
  const authError = error_code === "otp_expired" || error === "access_denied" ? "invite-expired" : error ?? await getAuthenticatedInvitationNotice();
  return <LoginContent setupError={profileQueryDetail ? "profile-query" : authError} setupDetail={profileQueryDetail ?? (process.env.NODE_ENV === "development" ? detail ?? null : null)} collegeName={env.collegeName} departmentName={env.collegeDepartment} allowedEmailDomain={env.allowedEmailDomain} />;
}
