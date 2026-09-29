"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { registerStudentAction } from "@/app/actions/auth";
import { registerStudentSchema } from "@/lib/validation/auth";

type FormValues = { fullName: string; registerNumber: string; department: "ECE"; section: "A" | "B"; email: string; password: string; confirmPassword: string };
type Field = keyof FormValues;
const fieldNames: Record<Field, string> = { fullName: "Full Name", registerNumber: "Register Number", department: "Department", section: "Section", email: "Email", password: "Password", confirmPassword: "Confirm Password" };

export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>({ fullName: "", registerNumber: "", department: "ECE", section: "A", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const update = (key: Field, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const errorFor = (field: Field) => errors[field] ? <span id={`${field}-error`} className="mt-1 block text-xs font-medium text-red-700">{errors[field]}</span> : null;
  const inputClass = (field: Field) => `mt-1 w-full rounded-lg border ${errors[field] ? "border-red-400" : "border-line"} px-3 py-2 text-ink`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrors({}); setFormError(""); setMessage("");
    const parsed = registerStudentSchema.safeParse({ ...form, registerNumber: form.registerNumber.toUpperCase().trim(), email: form.email.trim().toLowerCase() });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (fieldNames[field] && !next[field]) {
          next[field] = field === "email" ? "Please use your official SRMIST email address."
            : field === "registerNumber" ? "Please enter a valid SRMIST register number."
            : field === "confirmPassword" ? "Passwords do not match."
            : field === "section" ? "Please choose section A or B."
            : field === "department" ? "Please select your department."
            : field === "password" ? "Password must contain at least 10 characters."
            : "Please enter your full name.";
        }
      }
      setErrors(next); return;
    }
    setBusy(true);
    const result = await registerStudentAction(parsed.data);
    setBusy(false);
    if (!result.ok) { setFormError(result.message); return; }
    if (result.emailConfirmationRequired) { setMessage("Account created. Check your SRMIST inbox to verify your email address, then sign in."); return; }
    router.push("/auth/continue");
  }

  return <main className="min-h-screen bg-canvas px-4 py-8"><div className="mx-auto max-w-2xl rounded-lg border border-line bg-white p-5 shadow-soft sm:p-7">
    <p className="text-xs font-bold uppercase tracking-widest text-accent">SRMIST · ECE</p>
    <h1 className="mt-1 text-2xl font-bold text-navy">Create your account</h1>
    <p className="mt-1 text-sm text-muted">Register with your official college details. New accounts receive the student role.</p>
    <form noValidate onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label htmlFor="fullName" className="text-sm font-medium text-muted">Full Name<input id="fullName" required autoComplete="name" value={form.fullName} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "fullName-error" : undefined} onChange={(event) => update("fullName", event.target.value)} className={inputClass("fullName")} /></label>{errorFor("fullName")}</div>
      <div><label htmlFor="registerNumber" className="text-sm font-medium text-muted">Register Number<input id="registerNumber" required autoCapitalize="characters" placeholder="RA..." value={form.registerNumber} aria-invalid={Boolean(errors.registerNumber)} aria-describedby={errors.registerNumber ? "registerNumber-error" : undefined} onChange={(event) => update("registerNumber", event.target.value)} className={inputClass("registerNumber")} /></label>{errorFor("registerNumber")}</div>
      <div><label htmlFor="department" className="text-sm font-medium text-muted">Department<select id="department" required value={form.department} onChange={(event) => update("department", event.target.value)} className={inputClass("department")}><option value="ECE">Electronics and Communication Engineering</option></select></label>{errorFor("department")}</div>
      <div><label htmlFor="section" className="text-sm font-medium text-muted">Section<select id="section" required value={form.section} onChange={(event) => update("section", event.target.value as "A" | "B")} className={inputClass("section")}><option value="A">A</option><option value="B">B</option></select></label>{errorFor("section")}</div>
      <div className="sm:col-span-2"><label htmlFor="email" className="text-sm font-medium text-muted">College Email ID<input id="email" required type="email" autoComplete="email" placeholder="name@srmist.edu.in" value={form.email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} onChange={(event) => update("email", event.target.value)} className={inputClass("email")} /></label>{errorFor("email")}</div>
      <div><label htmlFor="password" className="text-sm font-medium text-muted">Password<span className="relative mt-1 block"><input id="password" required type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : "password-help"} onChange={(event) => update("password", event.target.value)} className={`w-full rounded-lg border ${errors.password ? "border-red-400" : "border-line"} px-3 py-2 pr-11 text-ink`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>{errorFor("password")}<span id="password-help" className="mt-1 block text-xs text-muted">Use at least 10 characters.</span></div>
      <div><label htmlFor="confirmPassword" className="text-sm font-medium text-muted">Confirm Password<span className="relative mt-1 block"><input id="confirmPassword" required type={showConfirmation ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined} onChange={(event) => update("confirmPassword", event.target.value)} className={`w-full rounded-lg border ${errors.confirmPassword ? "border-red-400" : "border-line"} px-3 py-2 pr-11 text-ink`} /><button type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted">{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>{errorFor("confirmPassword")}</div>
      {formError ? <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError}</p> : null}
      {message ? <p role="status" className="sm:col-span-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      <div className="flex items-center justify-between gap-3 sm:col-span-2"><p className="text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-accent">Sign In</Link></p><button disabled={busy} className="rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating account..." : "Create Account"}</button></div>
    </form>
  </div></main>;
}
