import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveStaffInvitation } from "@/lib/staff-invitations";
import { StaffAccountSetup } from "@/components/auth/StaffAccountSetup";

export async function StaffAccountSetupPage({ role }: { role: "faculty" | "hod" }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/login");
  const invitation = await resolveStaffInvitation(user);
  if (invitation.status === "expired") redirect("/login?error=invite-expired");
  if (invitation.status === "completed") redirect(`/${invitation.role}/dashboard`);
  if (invitation.status !== "pending") redirect("/login?error=invite-invalid");
  if (invitation.invitation.role !== role) redirect(`/${invitation.invitation.role}/register`);
  return <StaffAccountSetup />;
}
