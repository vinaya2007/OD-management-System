"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";

export default function SecondaryPage() {
  const { currentUser } = useDemo();
  const params = useParams<{ section: string }>();
  const title = params.section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return (
    <AppShell user={currentUser}>
      <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
        <h2 className="text-2xl font-bold text-navy">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          This management screen is reserved in the navigation and route structure. Connect it to Supabase records and college-specific policy once the deployment profile, official users, and administration permissions are finalized.
        </p>
      </div>
    </AppShell>
  );
}
