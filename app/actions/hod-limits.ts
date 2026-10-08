"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireHod } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ODCategory } from "@/types/domain";

const categories: ODCategory[] = ["Technical", "Non-Technical", "Club Organizer / Volunteer"];
export type HODLimitsResult = { ok: true; limits: Array<{ category: ODCategory; maxOds: number }>; academicYear: string } | { ok: false; message: string };

export async function getHodODLimitsAction(): Promise<HODLimitsResult> {
  try {
    const actor = await requireHod();
    if (!actor.department_id) return { ok: false, message: "Your HOD account is not linked to a department." };
    const supabase = await createSupabaseServerClient();
    const { data: year, error: yearError } = await supabase.from("academic_years").select("id,name").eq("is_active", true).maybeSingle();
    if (yearError || !year) return { ok: false, message: "No active academic year is configured." };
    const { data, error } = await supabase.from("od_limits").select("category,max_ods").eq("department_id", actor.department_id).eq("academic_year_id", year.id).not("category", "is", null);
    if (error) return { ok: false, message: "OD limits could not be loaded." };
    const rows = new Map((data ?? []).map((row) => [row.category, row.max_ods]));
    return { ok: true, academicYear: year.name, limits: categories.map((category) => ({ category, maxOds: rows.get(category) ?? (category === "Technical" ? 5 : 3) })) };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "OD limits could not be loaded." }; }
}

export async function saveHodODLimitsAction(input: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireHod();
    if (!Array.isArray(input) || input.length !== categories.length) return { ok: false, message: "Provide all three OD category limits." };
    const allowed = new Set(categories);
    const parsed = input.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("Invalid OD limit.");
      const item = entry as { category?: unknown; maxOds?: unknown };
      if (typeof item.category !== "string" || !allowed.has(item.category as ODCategory) || !Number.isInteger(item.maxOds) || (item.maxOds as number) < 0 || (item.maxOds as number) > 365) throw new Error("Limits must be whole numbers between 0 and 365.");
      return { category: item.category, max_ods: item.maxOds };
    });
    if (new Set(parsed.map((item) => item.category)).size !== categories.length) return { ok: false, message: "Each category must be provided exactly once." };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("save_hod_od_category_limits", { p_limits: parsed });
    if (error) return { ok: false, message: process.env.NODE_ENV === "development" ? `${error.code}: ${error.message}` : "OD limits could not be saved." };
    revalidatePath("/hod/limits");
    revalidatePath("/student/limits");
    return { ok: true };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "OD limits could not be saved." }; }
}
