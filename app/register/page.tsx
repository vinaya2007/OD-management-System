import { redirect } from "next/navigation";
import { getAuthenticatedDestination } from "@/lib/auth-routing";
import RegisterForm from "@/app/register/RegisterForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ECE_DEPARTMENT = { id: "ECE", name: "Electronics and Communication Engineering", code: "ECE" };

export default async function RegisterPage() {
  const destination = await getAuthenticatedDestination();
  if (destination) redirect(destination);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("departments").select("id,name,code").eq("is_active", true).order("name");
  // Anonymous registration may not be allowed to enumerate departments by RLS.
  // ECE is the only department this application accepts; the auth trigger verifies it server-side.
  const departments = data?.some((department) => department.code === "ECE") ? data : [ECE_DEPARTMENT];
  return <RegisterForm departments={departments} departmentError={null} />;
}


