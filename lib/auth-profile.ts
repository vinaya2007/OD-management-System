import type { User } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type DatabaseProfile = {
  id: string;
  auth_user_id: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  role: "student" | "faculty" | "hod" | "admin";
  is_active: boolean;
  must_change_password?: boolean | null;
  staff_setup_pending?: boolean | null;
  register_number: string | null;
  section: string | null;
  year: string | null;
  department_id: string | null;
};

export async function lookupAuthenticatedProfile(
  supabase: ServerSupabaseClient,
  user: User,
  source: string,
) {
  // Read the caller's own profile under profiles RLS. Avoid depending on an RPC
  // that may not exist in an already-provisioned Supabase schema.
  const { data, error, count } = await supabase.from("profiles").select("id,auth_user_id,full_name,role,is_active,department_id,register_number,section,year,must_change_password,staff_setup_pending,designation", { count: "exact" })
    .eq("auth_user_id", user.id).maybeSingle();
  const profileData = data as unknown as DatabaseProfile | null;

  if (process.env.NODE_ENV === "development") {
    console.info(`[auth:${source}] profile lookup`, {
      authenticatedUserId: user.id,
      authenticatedEmail: user.email,
      profile: profileData ? { id: profileData.id, auth_user_id: profileData.auth_user_id, email: profileData.email, role: profileData.role, is_active: profileData.is_active } : null,
      profileQueryCount: count,
      error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
    });
  }

  if (error) return { profile: null, error };
  if (!profileData) return { profile: null, error: null };
  const name = profileData.full_name ?? profileData.name ?? "";
  const profile = {
    ...profileData,
    full_name: name,
    auth_user_id: user.id,
    email: user.email ?? profileData.email,
    name,
    must_change_password: profileData.must_change_password ?? false,
    staff_setup_pending: profileData.staff_setup_pending ?? false,
  };
  return { profile, error: null };
}

export function logAuthRedirect(source: string, destination: string) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[auth:${source}] redirect decision`, { destination });
  }
}



