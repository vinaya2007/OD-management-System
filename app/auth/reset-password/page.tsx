"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password.length < 10 || password.length > 128) { setError("Use a password between 10 and 128 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password }); setBusy(false);
    if (updateError) setError("The reset link may have expired. Request a new password reset link."); else setSaved(true);
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8"><section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft"><h1 className="text-2xl font-bold text-navy">Choose a new password</h1>{saved ? <><p role="status" className="mt-4 text-sm text-emerald-800">Password updated. Sign in with your new password.</p><Link href="/login" className="mt-4 inline-block font-semibold text-accent">Sign in</Link></> : <form onSubmit={submit} className="mt-5 grid gap-4"><label className="text-sm font-medium text-muted">New Password<input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label><label className="text-sm font-medium text-muted">Confirm Password<input required type="password" minLength={10} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={busy} className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Update Password"}</button></form>}</section></main>;
}
