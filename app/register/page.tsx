import { redirect } from "next/navigation";
import { getAuthenticatedDestination } from "@/lib/auth-routing";
import RegisterForm from "@/app/register/RegisterForm";

export default async function RegisterPage() {
  const destination = await getAuthenticatedDestination();
  if (destination) redirect(destination);
  return <RegisterForm />;
}
