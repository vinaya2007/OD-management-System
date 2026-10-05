"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function supportedOtpType(type: string | null): type is "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" {
  return type === "signup" || type === "invite" || type === "magiclink" || type === "recovery" || type === "email_change" || type === "email";
}

export default function AuthCallbackCompletePage() {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function completeFragmentCallback() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const type = fragment.get("type");
      const authError = fragment.get("error_code") ?? fragment.get("error");
      if (process.env.NODE_ENV === "development") console.info("[auth:callback] fragment received", { hasSession: Boolean(accessToken && refreshToken), otpType: type, hasError: Boolean(authError) });
      if (authError) {
        router.replace(`/login?error=${authError === "otp_expired" ? "invite-expired" : "domain"}`);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      let error: { message: string } | null = null;
      if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      } else {
        // Some configured invitation templates place token_hash/type in the
        // fragment instead of the callback query.
        const tokenHash = fragment.get("token_hash");
        if (tokenHash && supportedOtpType(type)) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
        else error = { message: "No supported authentication credential was returned." };
      }
      if (error) {
        if (process.env.NODE_ENV === "development") console.error("[auth:callback] fragment verification failed", { message: error.message });
        router.replace(`/login?error=${/expired/i.test(error.message) ? "invite-expired" : "domain"}`);
        return;
      }
      router.replace(type === "recovery" ? "/auth/reset-password" : "/auth/continue");
    }
    void completeFragmentCallback().catch((error: unknown) => {
      if (process.env.NODE_ENV === "development") console.error("[auth:callback] fragment handler failed", error);
      router.replace("/login?error=configuration");
    });
  }, [router]);

  return <main className="grid min-h-screen place-items-center bg-surface px-4"><p role="status" className="rounded-lg border border-line bg-white px-6 py-4 text-sm text-muted shadow-soft">Verifying your secure sign-in link…</p></main>;
}
