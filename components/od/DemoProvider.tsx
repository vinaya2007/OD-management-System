"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { decideFacultyODAction, decideHodODAction, decideSpecialPermissionAction, markNotificationsReadAction, replacePendingFacultyAction, submitODAction, withdrawODAction } from "@/app/actions/od";
import { demoApplications, demoLimits, demoNotifications, demoProfiles } from "@/lib/demo-data";
import { allFacultyApproved, canReplaceFaculty, findOverlappingApplication } from "@/lib/od-rules";
import type { FacultyApprovalStatus, Notification, ODCategory, ODLimit, ODPeriod, ODRecord, Profile, Role } from "@/types/domain";

type DraftInput = { studentId: string; category: ODCategory; purpose?: string; eventName: string; venueType: "Our College" | "Other College"; collegeName?: string; startDate: string; endDate: string; additionalNotes?: string; periods: Pick<ODPeriod, "date" | "fromPeriod" | "toPeriod">[]; facultyIds: string[]; specialReason?: string };
type PortalPayload = { currentUser: Profile; profiles: Profile[]; applications: ODRecord[]; notifications: Notification[]; limits: ODLimit[] };
type Result = { ok: true; id: string } | { ok: false; reason: string; existingId?: string };
type DemoContextValue = {
  profiles: Profile[]; applications: ODRecord[]; notifications: Notification[]; limits: ODLimit[]; currentUser: Profile; isLive: boolean;
  collegeName: string; departmentName: string; allowedEmailDomain: string;
  setRole(role: Role): void; refresh(): Promise<void>; markNotificationsRead(notificationId?: string): Promise<void>; specialPermissionDecision(odId: string, approved: boolean, reason?: string): Promise<void>; createApplication(input: DraftInput): Promise<Result>; updateFacultyApproval(odId: string, facultyId: string, status: FacultyApprovalStatus, comment?: string): Promise<void>; replaceFaculty(odId: string, approvalId: string, facultyId: string): Promise<void>; hodDecision(odId: string, approved: boolean, reason?: string): Promise<void>; withdraw(odId: string): Promise<void>;
};
const DemoContext = createContext<DemoContextValue | null>(null);

function demoPayload(role: Role): PortalPayload {
  return { currentUser: demoProfiles.find((profile) => profile.role === role)!, profiles: demoProfiles, applications: demoApplications, notifications: demoNotifications, limits: demoLimits };
}

export function DemoProvider({ children, demoEnabled, collegeName, departmentName, allowedEmailDomain }: { children: React.ReactNode; demoEnabled: boolean; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  const pathname = usePathname();
  const [, setRoleState] = useState<Role>("student");
  const [data, setData] = useState<PortalPayload | null>(() => demoEnabled ? demoPayload("student") : null);
  const [ready, setReady] = useState(demoEnabled || pathname === "/login");
  const [loadError, setLoadError] = useState(false);
  const isLive = !demoEnabled;
  const refresh = useCallback(async () => {
    if (demoEnabled) return;
    const response = await fetch("/api/portal", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your OD workspace.");
    setData(await response.json() as PortalPayload);
    setLoadError(false);
  }, [demoEnabled]);

  // Startup synchronization with the browser's persisted demo session / live API.
  useEffect(() => {
    if (pathname === "/login") return;
    // Fetch the authenticated user's workspace after navigation to a protected route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!demoEnabled) { refresh().catch(() => setLoadError(true)).finally(() => setReady(true)); return; }
    const saved = localStorage.getItem("demoRole") as Role | null;
    if (saved) { setRoleState(saved); setData(demoPayload(saved)); }
  }, [demoEnabled, pathname, refresh]);

  const setRole = useCallback((nextRole: Role) => {
    if (!demoEnabled) return;
    localStorage.setItem("demoRole", nextRole); setRoleState(nextRole); setData(demoPayload(nextRole));
  }, [demoEnabled]);
  const portalData = data ?? demoPayload("student");

  const value = useMemo<DemoContextValue>(() => ({
    ...portalData, isLive, collegeName, departmentName, allowedEmailDomain, setRole, refresh,
    async markNotificationsRead(notificationId) {
      if (isLive) {
        const result = await markNotificationsReadAction(notificationId);
        if (!result.ok) throw new Error(result.message);
        await refresh();
        return;
      }
      setData((current) => current ? ({ ...current, notifications: current.notifications.map((item) => !notificationId || item.id === notificationId ? { ...item, isRead: true } : item) }) : current);
    },
    async specialPermissionDecision(odId, approved, reason) {
      if (isLive) {
        const result = await decideSpecialPermissionAction({ odId, approved, comment: reason });
        if (!result.ok) throw new Error(result.message);
        await refresh();
        return;
      }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => item.id !== odId ? item : ({ ...item, specialPermissionStatus: approved ? "APPROVED" : "REJECTED", status: approved ? item.status : "REJECTED" })) }) : current);
    },
    async createApplication(input) {
      if (isLive) {
        const result = await submitODAction({ ...input, idempotencyKey: crypto.randomUUID() });
        if (!result.ok) return { ok: false, reason: result.message };
        await refresh(); return { ok: true, id: result.id! };
      }
      const periods = input.periods.map((period, index) => ({ id: `per-new-${Date.now()}-${index}`, odId: "pending", ...period }));
      const existing = findOverlappingApplication(portalData.applications, input.studentId, periods);
      if (existing) return { ok: false, reason: "Existing OD found covering part of this time.", existingId: existing.id };
      const id = `OD-${Math.floor(2000 + Math.random() * 7000)}`;
      const student = demoProfiles.find((profile) => profile.id === input.studentId)!;
      const next: ODRecord = { id, studentId: input.studentId, student, departmentId: "ece", category: input.category, purpose: input.purpose, eventName: input.eventName, venueType: input.venueType, collegeName: input.collegeName, startDate: input.startDate, endDate: input.endDate, additionalNotes: input.additionalNotes, isSpecial: Boolean(input.specialReason), specialPermissionStatus: input.specialReason ? "PENDING" : "NOT_REQUIRED", status: "FACULTY_REVIEW", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), periods: periods.map((period) => ({ ...period, odId: id })), approvals: input.facultyIds.map((facultyId) => ({ id: `ap-${id}-${facultyId}`, odId: id, facultyId, status: "PENDING", updatedAt: new Date().toISOString(), faculty: demoProfiles.find((profile) => profile.id === facultyId)! })) };
      setData((current) => current ? ({ ...current, applications: [next, ...current.applications] }) : current); return { ok: true, id };
    },
    async updateFacultyApproval(odId, facultyId, status, comment) {
      if (isLive) { const result = await decideFacultyODAction({ odId, decision: status, comment }); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => {
        if (item.id !== odId) return item;
        const approvals = item.approvals.map((approval) => approval.facultyId === facultyId ? { ...approval, status, comment, approvedAt: status === "APPROVED" ? new Date().toISOString() : approval.approvedAt, updatedAt: new Date().toISOString() } : approval);
        const nextStatus = status === "REJECTED" ? "REJECTED" : status === "CORRECTION_REQUESTED" ? "CORRECTION_REQUESTED" : allFacultyApproved(approvals) ? "HOD_REVIEW" : "FACULTY_REVIEW";
        return { ...item, approvals, status: nextStatus, updatedAt: new Date().toISOString() };
      }) }) : current);
    },
    async replaceFaculty(odId, approvalId, facultyId) {
      if (isLive) { const result = await replacePendingFacultyAction({ odId, approvalId, facultyId }); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => {
        if (item.id !== odId || item.approvals.some((approval) => approval.facultyId === facultyId)) return item;
        return { ...item, approvals: item.approvals.map((approval) => approval.id === approvalId && canReplaceFaculty(approval) ? { ...approval, facultyId, faculty: demoProfiles.find((profile) => profile.id === facultyId)!, status: "PENDING", comment: undefined, updatedAt: new Date().toISOString() } : approval) };
      }) }) : current);
    },
    async hodDecision(odId, approved, reason) {
      if (isLive) { const result = await decideHodODAction({ odId, approved, comment: reason }); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => item.id === odId ? { ...item, status: approved ? "APPROVED" : "REJECTED", updatedAt: new Date().toISOString() } : item) }) : current);
    },
    async withdraw(odId) {
      if (isLive) { const result = await withdrawODAction(odId); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => item.id === odId ? { ...item, status: "WITHDRAWN", updatedAt: new Date().toISOString() } : item) }) : current);
    }
  }), [portalData, isLive, collegeName, departmentName, allowedEmailDomain, setRole, refresh]);

  if (!ready) return <main className="grid min-h-screen place-items-center bg-canvas text-sm font-medium text-muted">Loading your OD workspace...</main>;
  if ((loadError || !data) && pathname !== "/login") return <main role="alert" className="grid min-h-screen place-items-center bg-canvas px-6 text-center text-sm font-medium text-muted">Unable to load your OD workspace. Refresh the page or sign in again.</main>;
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error("useDemo must be used inside DemoProvider."); return context; }
