"use server";

import { AppError, publicError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registerStudentSchema } from "@/lib/validation/auth";

export type AuthActionResult = { ok: true; emailConfirmationRequired?: boolean } | { ok: false; message: string };

export async function registerStudentAction(input: unknown): Promise<AuthActionResult> {
  try {
    const parsed = registerStudentSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    let departmentCode = "ECE";
    if (parsed.departmentId !== "ECE") {
      const { data: department, error: departmentError } = await supabase.from("departments")
        .select("id,code,is_active").eq("id", parsed.departmentId).eq("is_active", true).maybeSingle();
      if (departmentError) {
        if (process.env.NODE_ENV === "development") console.error("[auth] registration department lookup failed", departmentError);
        return { ok: false, message: process.env.NODE_ENV === "development" ? "Department lookup failed: " + departmentError.message : "We could not verify the selected department. Please try again." };
      }
      if (!department || department.code !== "ECE") return { ok: false, message: "Select an active department available in the OD system." };
      departmentCode = department.code;
    }
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email.toLowerCase(), password: parsed.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
        data: { full_name: parsed.fullName, register_number: parsed.registerNumber, department_code: departmentCode, section: parsed.section, year: parsed.year }
      }
    });
    if (error || !data.user) {
      if (error && process.env.NODE_ENV === "development") console.error("[auth] registration/provisioning failed", { code: error.code, message: error.message });
      if (error?.code === "23505" || /already (exists|registered)|duplicate key/i.test(error?.message ?? "")) {
        return { ok: false, message: "That college email or register number is already in use." };
      }
      const databaseDetail = process.env.NODE_ENV === "development" && error?.message ? ` (${error.message})` : "";
      throw new AppError("DATABASE_ERROR", `We could not securely provision your student account. Please contact the ECE administrator${databaseDetail}.`);
    }
    return { ok: true, emailConfirmationRequired: !data.session };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof Error && "issues" in error) return { ok: false, message: "Check the name, register number, department, section, college email, and password fields." };
    console.error("[auth] student registration failed", error);
    const issue = publicError(error);
    return { ok: false, message: issue.message };
  }
}



