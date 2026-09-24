import LoginContent from "@/app/login/LoginContent";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginContent setupError={error ?? null} />;
}
