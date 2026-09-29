"use server";

import { requireStudent } from "@/lib/auth";
import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeStudentProfileSchema, registerStudentSchema } from "@/lib/validation/auth";

export type AuthActionResult = { ok: true; emailConfirmationRequired?: boolean } | { ok: false; message: string };

export async function registerStudentAction(input: unknown): Promise<AuthActionResult> {
  try {
    const parsed = registerStudentSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email.toLowerCase(), password: parsed.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=%2Fstudent%2Fcomplete-profile`,
        data: { full_name: parsed.fullName, register_number: parsed.registerNumber, section: parsed.section }
      }
    });
    if (error || !data.user) throw new AppError("VALIDATION_ERROR", "We could not create the account. Check the details or contact your administrator.");
    return { ok: true, emailConfirmationRequired: !data.session };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof Error && "issues" in error) return { ok: false, message: "Check the name, register number, department, section, college email, and password fields." };
    console.error("[auth] student registration failed", error);
    return { ok: false, message: "We could not create the account. Please try again." };
  }
}

export async function completeStudentProfileAction(input: unknown): Promise<AuthActionResult> {
  try {
    await requireStudent();
    const parsed = completeStudentProfileSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("complete_student_profile", {
      p_full_name: parsed.fullName, p_register_number: parsed.registerNumber, p_section: parsed.section
    });
    if (error) throw new AppError("DATABASE_ERROR", "The profile could not be saved. Check that the register number is not already in use.");
    return { ok: true };
  } catch (error) {
    const issue = publicError(error);
    return { ok: false, message: issue.message };
  }
}
