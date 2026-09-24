"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { useDemo } from "@/components/od/DemoProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/types/domain";

const roles: { role: Role; label: string; description: string }[] = [
  { role: "student", label: "Student", description: "Apply for OD, track faculty/HOD approval, request corrections." },
  { role: "faculty", label: "Faculty", description: "Review assigned applications, request correction, approve or reject." },
  { role: "hod", label: "HOD", description: "Review complete faculty approval status and give final decision." },
  { role: "admin", label: "Admin", description: "Preview user, limit and department administration screens." }
];

export default function LoginContent({ setupError }: { setupError: string | null }) {
  const router = useRouter();
  const { setRole, isLive, collegeName, departmentName, allowedEmailDomain } = useDemo();
  const [message, setMessage] = useState("");

  function demoLogin(role: Role) {
    setRole(role);
    router.push(`/${role}/dashboard`);
  }

  async function signIn() {
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) setMessage("Sign-in could not be started. Please try again or contact your administrator.");
    } catch {
      setMessage("Sign-in is not configured yet. Please contact your administrator.");
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-6 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-accent">{departmentName} · {collegeName}</div>
          <h1 className="text-4xl font-bold leading-tight text-navy sm:text-5xl">Online On-Duty Management System</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">A role-based OD workflow for students, faculty and HODs with approval status, special permission, duplicate checks, and consolidated PDF output.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-white p-4"><GraduationCap className="text-accent" /><p className="mt-3 font-semibold text-navy">College email only</p><p className="mt-1 text-sm text-muted">Production sign-in uses Supabase Google OAuth and {allowedEmailDomain ? `@${allowedEmailDomain}` : "the configured college email domain"} profiles.</p></div>
            <div className="rounded-lg border border-line bg-white p-4"><ShieldCheck className="text-emerald-700" /><p className="mt-3 font-semibold text-navy">Database role authorization</p><p className="mt-1 text-sm text-muted">Protected actions check the signed-in profile and database policies.</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          {isLive ? <>
            <h2 className="text-xl font-bold text-navy">College account sign-in</h2>
            <p className="mt-1 text-sm text-muted">Use your authorized college Google account.</p>
            {setupError === "profile" ? <p role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Your college sign-in succeeded, but an active OD profile is not linked yet. Contact your department administrator to finish account setup.</p> : null}
            {setupError === "domain" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">Use an email account from your authorized college domain.</p> : null}
            <button onClick={signIn} className="focus-ring mt-5 w-full rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white">Continue with Google</button>
            {message ? <p role="alert" className="mt-3 text-sm text-red-700">{message}</p> : null}
          </> : <>
            <h2 className="text-xl font-bold text-navy">Demo Login</h2>
            <p className="mt-1 text-sm text-muted">Use these only for local development until Supabase OAuth is configured.</p>
            <div className="mt-5 grid gap-3">{roles.map((item) => <button key={item.role} onClick={() => demoLogin(item.role)} className="focus-ring rounded-lg border border-line p-4 text-left transition hover:border-accent hover:bg-blue-50"><span className="font-semibold text-navy">{item.label}</span><span className="mt-1 block text-sm text-muted">{item.description}</span></button>)}</div>
          </>}
        </div>
      </section>
    </main>
  );
}
