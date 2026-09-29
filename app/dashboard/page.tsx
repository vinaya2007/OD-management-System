import { redirect } from "next/navigation";
import { getAuthenticatedDestination } from "@/lib/auth-routing";

export default async function DashboardAliasPage() {
  redirect(await getAuthenticatedDestination() ?? "/login");
}
