"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { decideFacultyODAction, decideHodODAction, decideSpecialPermissionAction, markODAttendanceAction, markNotificationsReadAction, replacePendingFacultyAction, submitODAction, withdrawODAction } from "@/app/actions/od";
import { demoApplications, demoLimits, demoNotifications, demoProfiles } from "@/lib/demo-data";
import { allFacultyApproved, canReplaceFaculty } from "@/lib/od-rules";
import type { FacultyApprovalStatus, Notification, ODCategory, ODLimit, ODRecord, Profile, Role } from "@/types/domain";

type DraftInput = { id: string; idempotencyKey: string; studentIds: string[]; category: ODCategory; eventType: string; eventName: string; organization?: string; eventDate: string; startTime: string; endTime: string; venue: string; purpose?: string; requesterRemarks?: string; facultyIds: string[] };
type PortalPayload = { currentUser: Profile; profiles: Profile[]; applications: ODRecord[]; notifications: Notification[]; limits: ODLimit[] };
type Result = { ok: true; id: string } | { ok: false; reason: string; existingId?: string };
type DemoContextValue = {
  profiles: Profile[]; applications: ODRecord[]; notifications: Notification[]; limits: ODLimit[]; currentUser: Profile; isLive: boolean;
  collegeName: string; departmentName: string; allowedEmailDomain: string;
  setRole(role: Role): void; refresh(): Promise<void>; markNotificationsRead(notificationId?: string): Promise<void>; specialPermissionDecision(odId: string, approved: boolean, reason?: string): Promise<void>; createApplication(input: DraftInput): Promise<Result>; updateFacultyApproval(odId: string, facultyId: string, status: FacultyApprovalStatus, comment?: string): Promise<void>; replaceFaculty(odId: string, approvalId: string, facultyId: string): Promise<void>; hodDecision(odId: string, approved: boolean, reason?: string): Promise<void>; markAttendance(requestId: string, studentId: string, status: "PRESENT" | "ABSENT"): Promise<void>; withdraw(odId: string): Promise<void>;
};
const DemoContext = createContext<DemoContextValue | null>(null);

function demoPayload(role: Role): PortalPayload {
  return { currentUser: demoProfiles.find((profile) => profile.role === role)!, profiles: demoProfiles, applications: demoApplications, notifications: demoNotifications, limits: demoLimits };
}

export function DemoProvider({ children, demoEnabled, collegeName, departmentName, allowedEmailDomain }: { children: React.ReactNode; demoEnabled: boolean; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  const pathname = usePathname();
  const [, setRoleState] = useState<Role>("student");
  const [data, setData] = useState<PortalPayload | null>(() => demoEnabled ? demoPayload("student") : null);
  const [ready, setReady] = useState(demoEnabled || ["/", "/login", "/register", "/forgot-password", "/auth/reset-password", "/student/complete-profile"].includes(pathname));
  const [loadError, setLoadError] = useState(false);
  const isLive = !demoEnabled;
  const publicAuthRoute = pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname === "/auth/reset-password" || pathname === "/student/complete-profile";
  const refresh = useCallback(async () => {
    if (demoEnabled) return;
    const response = await fetch("/api/portal", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your OD workspace.");
    setData(await response.json() as PortalPayload);
    setLoadError(false);
  }, [demoEnabled]);

  // Startup synchronization with the browser's persisted demo session / live API.
  useEffect(() => {
    if (publicAuthRoute) return;
    // Fetch the authenticated user's workspace after navigation to a protected route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!demoEnabled) { refresh().catch(() => setLoadError(true)).finally(() => setReady(true)); return; }
    const saved = localStorage.getItem("demoRole") as Role | null;
    if (saved) { setRoleState(saved); setData(demoPayload(saved)); }
  }, [demoEnabled, pathname, publicAuthRoute, refresh]);

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
        const result = await submitODAction(input);
        if (!result.ok) return { ok: false, reason: result.message };
        await refresh(); return { ok: true, id: result.id! };
      }
      const id = input.id;
      const recipients = input.studentIds.map((studentId) => demoProfiles.find((profile) => profile.id === studentId)).filter((profile): profile is Profile => Boolean(profile));
      if (recipients.length !== input.studentIds.length) return { ok: false, reason: "Select existing student profiles only." };
      const student = recipients[0]!;
      const now = new Date().toISOString();
      const next: ODRecord = { id, studentId: student.id, student, requester: portalData.currentUser, odStudents: recipients, odStudentIds: recipients.map((item) => item.id), departmentId: "ece", category: input.category, eventType: input.eventType, organization: input.organization, eventDate: input.eventDate, startTime: input.startTime, endTime: input.endTime, venue: input.venue, purpose: input.purpose, eventName: input.eventName, venueType: "Other College", collegeName: input.organization, startDate: input.eventDate, endDate: input.eventDate, additionalNotes: input.requesterRemarks, requesterRemarks: input.requesterRemarks, isSpecial: false, specialPermissionStatus: "NOT_REQUIRED", status: "PENDING_FACULTY", createdAt: now, updatedAt: now, periods: [], approvals: input.facultyIds.map((facultyId) => ({ id: `ap-${id}-${facultyId}`, odId: id, facultyId, status: "PENDING", updatedAt: now, faculty: demoProfiles.find((profile) => profile.id === facultyId)! })) };
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
    async markAttendance(requestId, studentId, status) {
      if (isLive) { const result = await markODAttendanceAction({ requestId, studentId, status }); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      const now = new Date().toISOString();
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => item.id !== requestId ? item : ({ ...item, attendance: [...(item.attendance ?? []).filter((attendance) => attendance.studentId !== studentId), { id: `${requestId}-${studentId}`, odRequestId: requestId, studentId, status, markedBy: current.currentUser.id, markedAt: now }] })) }) : current);
    },
    async withdraw(odId) {
      if (isLive) { const result = await withdrawODAction(odId); if (!result.ok) throw new Error(result.message); await refresh(); return; }
      setData((current) => current ? ({ ...current, applications: current.applications.map((item) => item.id === odId ? { ...item, status: "WITHDRAWN", updatedAt: new Date().toISOString() } : item) }) : current);
    }
  }), [portalData, isLive, collegeName, departmentName, allowedEmailDomain, setRole, refresh]);

  if (!ready) return <main className="grid min-h-screen place-items-center bg-canvas text-sm font-medium text-muted">Loading your OD workspace...</main>;
  if ((loadError || !data) && !publicAuthRoute) return <main role="alert" className="grid min-h-screen place-items-center bg-canvas px-6 text-center text-sm font-medium text-muted">Unable to load your OD workspace. Refresh the page or sign in again.</main>;
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error("useDemo must be used inside DemoProvider."); return context; }
