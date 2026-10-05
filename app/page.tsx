import { redirect } from "next/navigation";
import { getAuthenticatedDestination, getAuthenticatedInvitationNotice } from "@/lib/auth-routing";
import LoginContent from "@/app/login/LoginContent";
import { env } from "@/lib/env";

export default async function Home() {
  const destination = await getAuthenticatedDestination();
  if (destination) redirect(destination);
  const setupError = await getAuthenticatedInvitationNotice();
  return <LoginContent setupError={setupError} collegeName={env.collegeName} departmentName={env.collegeDepartment} allowedEmailDomain={env.allowedEmailDomain} />;
}
