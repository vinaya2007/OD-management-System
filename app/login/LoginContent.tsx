"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, GraduationCap, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { srmistEmailSchema } from "@/lib/validation/auth";

export default function LoginContent({ setupError, setupDetail = null, collegeName, departmentName, allowedEmailDomain }: { setupError: string | null; setupDetail?: string | null; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (setupError === "profile-query" && setupDetail) {
      console.error("[auth] Supabase profile lookup failed:", setupDetail);
    }
  }, [setupError, setupDetail]);

  async function signIn() {
    setMessage("");
    const parsedEmail = srmistEmailSchema.safeParse(email.trim());
    if (!parsedEmail.success) { setMessage("Please use your official SRMIST email address."); return; }
    setSigningIn(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: parsedEmail.data.toLowerCase(), password });
      if (error) { setMessage("Sign-in failed. Check your college email and password."); return; }
      router.push("/auth/continue");
    } catch {
      setMessage("Sign-in is not configured yet. Please contact your administrator.");
    } finally {
      setSigningIn(false);
    }
  }

  async function signInGoogle() {
    setMessage("");
    setGoogleLoading(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) setMessage("Sign-in could not be started. Please try again or contact your administrator.");
    } catch {
      setMessage("Sign-in is not configured yet. Please contact your administrator.");
    } finally {
      setGoogleLoading(false);
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
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">SRMIST · ECE</p>
            <h2 className="mt-1 text-xl font-bold text-navy">Sign in to your college account</h2>
            <p className="mt-1 text-sm text-muted">Sign in with your verified {allowedEmailDomain || "college"} email account.</p>
            {setupError === "profile-provisioning" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">Sign-in succeeded, but the OD system could not retrieve an active profile for this account. Access was not granted. Contact the system administrator and provide your college email.</p> : null}
            {setupError === "profile-query" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">We could not verify your OD profile because of a database query error.{setupDetail ? <span className="mt-1 block font-mono text-xs">{setupDetail}</span> : " Check the browser console during development for details."}</p> : null}
            {setupError === "domain" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800"><strong>Access restricted. Please use your official SRMIST email address.</strong></p> : null}
            {setupError === "configuration" ? <p role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Supabase sign-in is not configured. Add the project URL and anon key to the local environment.</p> : null}
            {setupError === "authorization" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">This account is inactive and cannot access the OD system. Contact the system administrator.</p> : null}
            {setupError === "invite-expired" ? <p role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">This invitation link has expired or has already been used. Ask the ECE administrator to send a fresh invitation, then open the newest email link once.</p> : null}
            {setupError === "invite-invalid" ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">This account does not have a valid pending staff invitation. Ask the ECE administrator to send a new invitation.</p> : null}
            {["profile-provisioning", "profile-query", "authorization"].includes(setupError ?? "") ? <form action="/auth/signout" method="post" className="mt-3"><button className="text-sm font-medium text-accent">Sign out of this account</button></form> : null}
            <form onSubmit={(event) => { event.preventDefault(); void signIn(); }} className="mt-5 grid gap-3">
              <label className="text-sm font-medium text-muted">College Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label>
              <label className="text-sm font-medium text-muted">Password<span className="relative mt-1 block"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-line px-3 py-2 pr-11 text-ink" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
              <button disabled={signingIn} className="focus-ring w-full rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{signingIn ? "Signing in..." : "Sign In"}</button>
            </form>
            <button type="button" disabled={googleLoading} onClick={signInGoogle} className="focus-ring mt-3 w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold text-navy disabled:opacity-60">{googleLoading ? "Connecting to Google..." : "Continue with Google"}</button>
            <div className="mt-4 flex justify-between text-sm"><Link href="/forgot-password" className="font-medium text-accent">Forgot Password?</Link><Link href="/register" className="font-medium text-accent">Create Account</Link></div>
            <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">Don&apos;t have an account? <Link href="/register" className="font-semibold text-accent">Create Account</Link></p>
            {message ? <p role="alert" className="mt-3 text-sm text-red-700">{message}</p> : null}
          </>
        </div>
      </section>
    </main>
  );
}

