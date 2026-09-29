import type { User } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ProfileLookup = {
  id: string;
  auth_user_id: string;
  full_name: string;
  name: string;
  email: string;
  role: "student" | "faculty" | "hod" | "admin";
  is_active: boolean;
  register_number: string | null;
  section: string | null;
  department_id: string | null;
};

export async function lookupAuthenticatedProfile(
  supabase: ServerSupabaseClient,
  user: User,
  source: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,auth_user_id,full_name,email,role,is_active,register_number,section,department_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (process.env.NODE_ENV === "development") {
    console.info(`[auth:${source}] profile lookup`, {
      authenticatedUserId: user.id,
      authenticatedEmail: user.email,
      profile: data ? { id: data.id, role: data.role, is_active: data.is_active } : null,
      error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
    });
  }

  if (error) return { profile: null, error };
  if (!data) return { profile: null, error: null };
  const profile = data as ProfileLookup;
  return { profile: { ...profile, name: profile.full_name }, error: null };
}

export function logAuthRedirect(source: string, destination: string) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[auth:${source}] redirect decision`, { destination });
  }
}
