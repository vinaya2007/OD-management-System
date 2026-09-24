import type { FacultyApproval, ODApplication, ODLimit, ODPeriod, ODRecord, Profile } from "@/types/domain";

export const ACTIVE_BLOCKING_STATUSES = [
  "SUBMITTED",
  "FACULTY_REVIEW",
  "CORRECTION_REQUESTED",
  "FACULTY_APPROVED",
  "HOD_REVIEW",
  "APPROVED"
] as const;

export function periodLabel(periods: ODPeriod[]) {
  return periods
    .map((period) => `${formatDate(period.date)} P${period.fromPeriod}-P${period.toPeriod}`)
    .join(", ");
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function assertValidPeriod(period: Pick<ODPeriod, "fromPeriod" | "toPeriod">) {
  if (!Number.isInteger(period.fromPeriod) || !Number.isInteger(period.toPeriod) || period.fromPeriod < 1 || period.fromPeriod > 7 || period.toPeriod < 1 || period.toPeriod > 7 || period.fromPeriod > period.toPeriod) {
    throw new Error("Select a valid period range between 1 and 7.");
  }
}

export function hasPeriodOverlap(a: ODPeriod, b: ODPeriod) {
  return a.date === b.date && a.fromPeriod <= b.toPeriod && b.fromPeriod <= a.toPeriod;
}

export function findOverlappingApplication(records: ODRecord[], studentId: string, periods: ODPeriod[], currentOdId?: string) {
  return records.find((record) => {
    if (record.studentId !== studentId || record.id === currentOdId) return false;
    if (!ACTIVE_BLOCKING_STATUSES.includes(record.status as (typeof ACTIVE_BLOCKING_STATUSES)[number])) return false;
    return record.periods.some((existing) => periods.some((incoming) => hasPeriodOverlap(existing, incoming)));
  });
}

export function approvedUsage(records: ODRecord[], studentId: string, category: ODApplication["category"]) {
  return records.filter((record) => record.studentId === studentId && record.category === category && record.status === "APPROVED").length;
}

export function getLimitState(records: ODRecord[], limits: ODLimit[], studentId: string, category: ODApplication["category"]) {
  const limit = limits.find((item) => item.category === category && item.isActive);
  const used = approvedUsage(records, studentId, category);
  return {
    used,
    allowed: limit?.limitCount ?? 0,
    exceeded: Boolean(limit && used >= limit.limitCount)
  };
}

export function allFacultyApproved(approvals: FacultyApproval[]) {
  return approvals.length > 0 && approvals.every((approval) => approval.status === "APPROVED");
}

export function canReplaceFaculty(approval: FacultyApproval) {
  return approval.status === "PENDING";
}

export function eligibleFaculty(profiles: Profile[]) {
  return profiles.filter((profile) => profile.role === "faculty" && profile.isActive);
}

export function statusTone(status: string) {
  if (status.includes("APPROVED")) return "green";
  if (status.includes("REJECTED") || status === "WITHDRAWN") return "red";
  if (status.includes("CORRECTION")) return "amber";
  if (status.includes("PENDING") || status.includes("REVIEW") || status === "SUBMITTED") return "yellow";
  return "blue";
}
