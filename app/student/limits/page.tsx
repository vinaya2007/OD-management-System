"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { getLimitState } from "@/lib/od-rules";

export default function LimitsPage() {
  const { currentUser, applications, limits } = useDemo();
  return (
    <AppShell user={currentUser}>
      <h2 className="text-2xl font-bold text-navy">OD Limits</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {limits.map((limit) => {
          const state = getLimitState(applications, limits, currentUser.id, limit.category ?? "Non-Technical");
          return (
            <div key={`${limit.category ?? "all"}-${limit.academicYear}`} className="rounded-lg border border-line bg-white p-5 shadow-soft">
              <p className="font-semibold text-navy">{limit.category ?? "All OD categories"}</p>
              <p className="mt-1 text-sm text-muted">{limit.academicYear}</p>
              <p className="mt-2 text-2xl font-bold">{state.used} / {state.allowed}</p>
              <p className="mt-1 text-sm text-muted">Only fully approved ODs count toward this limit.</p>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
