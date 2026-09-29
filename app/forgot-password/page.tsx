"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { srmistEmailSchema } from "@/lib/validation/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    const parsed = srmistEmailSchema.safeParse(email);
    if (!parsed.success) { setError("Enter your @srmist.edu.in email address."); return; }
    setBusy(true);
    const { error: resetError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(parsed.data.toLowerCase(), { redirectTo: `${window.location.origin}/auth/callback?next=%2Fauth%2Freset-password` });
    setBusy(false);
    if (resetError) setError("We could not send the reset email. Check the address or contact the administrator.");
    else setMessage("If the account exists, a password reset link has been sent to its SRMIST inbox.");
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8"><section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft"><p className="text-xs font-bold uppercase tracking-widest text-accent">SRMIST · ECE</p><h1 className="mt-1 text-2xl font-bold text-navy">Reset password</h1><p className="mt-2 text-sm text-muted">We will send a secure reset link to your college email.</p><form onSubmit={submit} className="mt-5 grid gap-4"><label className="text-sm font-medium text-muted">College Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label><button disabled={busy} className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending..." : "Send Reset Link"}</button></form>{error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}{message ? <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p> : null}<Link href="/login" className="mt-5 inline-block text-sm font-semibold text-accent">Back to Login</Link></section></main>;
}
