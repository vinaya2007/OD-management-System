"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { completeStudentProfileAction } from "@/app/actions/auth";

export default function CompleteStudentProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", registerNumber: "", section: "A" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const result = await completeStudentProfileAction({ ...form, registerNumber: form.registerNumber.toUpperCase(), section: form.section.toUpperCase() });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    router.push("/auth/continue");
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8"><section className="w-full max-w-xl rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8"><h1 className="text-2xl font-bold text-navy">Complete your student profile</h1><p className="mt-2 text-sm text-muted">Your Google account is verified. Add the details needed to identify your SRMIST ECE profile. Your role remains student.</p><form onSubmit={submit} className="mt-5 grid gap-4"><label className="text-sm font-medium text-muted">Full Name<input required minLength={2} maxLength={120} value={form.fullName} onChange={(e) => setForm((value) => ({ ...value, fullName: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label><label className="text-sm font-medium text-muted">Register Number<input required placeholder="RA..." value={form.registerNumber} onChange={(e) => setForm((value) => ({ ...value, registerNumber: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink" /></label><label className="text-sm font-medium text-muted">Department<input readOnly value="Electronics and Communication Engineering" className="mt-1 w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-ink" /></label><label className="text-sm font-medium text-muted">Section<select value={form.section} onChange={(e) => setForm((value) => ({ ...value, section: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-ink"><option>A</option><option>B</option></select></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={busy} className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save Profile"}</button></form><form action="/auth/signout" method="post" className="mt-4"><button className="text-sm text-accent">Sign out</button></form></section></main>;
}
