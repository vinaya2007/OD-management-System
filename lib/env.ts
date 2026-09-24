const requiredPublic = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase(),
  demoAuthEnabled: process.env.ENABLE_DEMO_AUTH === "true",
  emailProvider: process.env.EMAIL_PROVIDER?.trim().toLowerCase(),
  emailFrom: process.env.EMAIL_FROM?.trim(),
  collegeName: process.env.COLLEGE_NAME?.trim() || "College",
  collegeDepartment: process.env.COLLEGE_DEPARTMENT?.trim() || "Department"
} as const;

export function assertSupabaseConfigured() {
  const missing = requiredPublic.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Supabase configuration: ${missing.join(", ")}`);
}

export function hasAllowedEmailDomain(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  return Boolean(env.allowedEmailDomain) && at > 0 && normalized.slice(at + 1) === env.allowedEmailDomain;
}
