"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { decideFacultyODAction, decideHodODAction, markODAttendanceAction, markNotificationsReadAction, replacePendingFacultyAction, submitODAction, withdrawODAction } from "@/app/actions/od";
import { submitSpecialODAction } from "@/app/actions/special-od";
import type { FacultyApprovalStatus, Notification, ODCategory, ODLimit, ODRecord, Profile } from "@/types/domain";

type DraftInput = { category: ODCategory; eventType: string; eventName: string; organization?: string; eventDate: string; startPeriod: number; endPeriod: number; startTime: string; endTime: string; venue: string; purpose?: string; requesterRemarks?: string; facultyIds: string[] };
type PortalPayload = { currentUser: Profile; profiles: Profile[]; applications: ODRecord[]; notifications: Notification[]; limits: ODLimit[] };
type Result = { ok: true; id: string } | { ok: false; reason: string; existingId?: string };
type PortalContextValue = PortalPayload & {
  isLive: true; collegeName: string; departmentName: string; allowedEmailDomain: string;
  refresh(): Promise<void>; markNotificationsRead(notificationId?: string): Promise<void>; createApplication(input: DraftInput): Promise<Result>; createSpecialApplication(input: DraftInput): Promise<Result>; updateFacultyApproval(odId: string, facultyId: string, status: FacultyApprovalStatus, comment?: string): Promise<void>; replaceFaculty(odId: string, approvalId: string, facultyId: string): Promise<void>; hodDecision(odId: string, approved: boolean, reason?: string): Promise<void>; markAttendance(requestId: string, studentId: string, status: "PRESENT" | "ABSENT"): Promise<void>; withdraw(odId: string): Promise<void>;
};
const PortalContext = createContext<PortalContextValue | null>(null);
// Staff setup is a pre-profile onboarding route. The page itself verifies the
// authenticated user's trusted invitation; loading the OD portal here would
// require the profile that this form is responsible for creating.
const routesWithoutPortal = new Set(["/", "/login", "/register", "/forgot-password", "/auth/reset-password", "/auth/callback/complete", "/staff/complete-profile", "/faculty/register", "/hod/register"]);

export function DemoProvider({ children, collegeName, departmentName, allowedEmailDomain }: { children: React.ReactNode; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  const pathname = usePathname();
  const publicRoute = routesWithoutPortal.has(pathname);
  const [data, setData] = useState<PortalPayload | null>(null);
  const [ready, setReady] = useState(publicRoute);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/portal", { cache: "no-store" });
    if (!response.ok) {
      const issue = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(issue?.message || "Could not load your OD workspace.");
    }
    setData(await response.json() as PortalPayload);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (publicRoute) return;
    let active = true;
    const timer = window.setTimeout(() => { refresh().catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load your OD workspace."); }).finally(() => { if (active) setReady(true); }); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pathname, publicRoute, refresh]);

  const value = useMemo<PortalContextValue | null>(() => data ? ({
    ...data, isLive: true as const, collegeName, departmentName, allowedEmailDomain, refresh,
    async markNotificationsRead(notificationId) {
      const result = await markNotificationsReadAction(notificationId);
      if (!result.ok) throw new Error(result.message);
      await refresh();
    },
    async createApplication(input) {
      const result = await submitODAction(input);
      if (!result.ok) return { ok: false as const, reason: result.message };
      await refresh();
      return { ok: true as const, id: result.id! };
    },
    async createSpecialApplication(input) {
      const result = await submitSpecialODAction(input);
      if (!result.ok) return { ok: false as const, reason: result.message };
      await refresh();
      return { ok: true as const, id: result.id! };
    },
    async updateFacultyApproval(odId, _facultyId, status, comment) {
      const result = await decideFacultyODAction({ odId, decision: status, comment });
      if (!result.ok) throw new Error(result.message);
      await refresh();
    },
    async replaceFaculty(odId, approvalId, facultyId) {
      const result = await replacePendingFacultyAction({ odId, approvalId, facultyId });
      if (!result.ok) throw new Error(result.message);
      await refresh();
    },
    async hodDecision(odId, approved, reason) {
      const result = await decideHodODAction({ odId, approved, comment: reason });
      if (!result.ok) throw new Error(result.message);
      await refresh();
    },
    async markAttendance(requestId, studentId, status) {
      const result = await markODAttendanceAction({ requestId, studentId, status });
      if (!result.ok) throw new Error(result.message);
      await refresh();
    },
    async withdraw(odId) {
      const result = await withdrawODAction(odId);
      if (!result.ok) throw new Error(result.message);
      await refresh();
    }
  }) : null, [data, collegeName, departmentName, allowedEmailDomain, refresh]);

  if (publicRoute) return <>{children}</>;
  if (!ready) return <main className="grid min-h-screen place-items-center bg-canvas text-sm font-medium text-muted">Loading your OD workspace...</main>;
  if (loadError || !value) return <main role="alert" className="grid min-h-screen place-items-center bg-canvas px-6 text-center text-sm font-medium text-muted">{process.env.NODE_ENV === "development" && loadError ? `Unable to load your OD workspace: ${loadError}` : "Unable to load your OD workspace. Refresh the page or sign in again."}</main>;
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function useDemo() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("Live OD portal data is only available on authenticated routes.");
  return context;
}
