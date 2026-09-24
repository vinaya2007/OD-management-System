import { describe, expect, it } from "vitest";
import { approvedUsage, assertValidPeriod, canReplaceFaculty, findOverlappingApplication, hasPeriodOverlap } from "@/lib/od-rules";
import type { ODRecord } from "@/types/domain";

const period = (date: string, fromPeriod: number, toPeriod: number) => ({ id: "period", odId: "od-1", date, fromPeriod, toPeriod });

const record = (status: ODRecord["status"], periods: ODRecord["periods"]): ODRecord => ({
  id: "od-1", studentId: "student-1", departmentId: "ece", category: "Hackathon", eventName: "Event", venueType: "Our College",
  startDate: "2026-09-25", endDate: "2026-09-25", isSpecial: false, specialPermissionStatus: "NOT_REQUIRED", status,
  createdAt: "2026-09-01", updatedAt: "2026-09-01", student: { id: "student-1", name: "Student", email: "s@example.edu", role: "student", department: "ECE", isActive: true },
  periods, approvals: []
});

describe("OD business rules", () => {
  it("accepts only integer period ranges from 1 through 7", () => {
    expect(() => assertValidPeriod({ fromPeriod: 1, toPeriod: 7 })).not.toThrow();
    for (const invalid of [{ fromPeriod: 0, toPeriod: 2 }, { fromPeriod: 2, toPeriod: 8 }, { fromPeriod: 4, toPeriod: 3 }, { fromPeriod: 1.5, toPeriod: 2 }]) {
      expect(() => assertValidPeriod(invalid)).toThrow();
    }
  });

  it("detects overlapping periods while allowing separate periods on the same date", () => {
    expect(hasPeriodOverlap(period("2026-09-25", 2, 4), period("2026-09-25", 4, 6))).toBe(true);
    expect(hasPeriodOverlap(period("2026-09-25", 2, 3), period("2026-09-25", 4, 6))).toBe(false);
    expect(hasPeriodOverlap(period("2026-09-25", 2, 3), period("2026-09-26", 2, 3))).toBe(false);
  });

  it("blocks overlaps for active requests but ignores rejected and withdrawn requests", () => {
    const existing = [record("FACULTY_REVIEW", [{ ...period("2026-09-25", 2, 4), id: "p1", odId: "od-1" }])];
    expect(findOverlappingApplication(existing, "student-1", [period("2026-09-25", 4, 5)])?.id).toBe("od-1");
    expect(findOverlappingApplication([record("REJECTED", existing[0].periods)], "student-1", [period("2026-09-25", 2, 2)])).toBeUndefined();
    expect(findOverlappingApplication([record("WITHDRAWN", existing[0].periods)], "student-1", [period("2026-09-25", 2, 2)])).toBeUndefined();
  });

  it("counts only approved applications toward limits", () => {
    const records = ["APPROVED", "SUBMITTED", "REJECTED", "WITHDRAWN"].map((status) => record(status as ODRecord["status"], []));
    expect(approvedUsage(records, "student-1", "Hackathon")).toBe(1);
  });

  it("allows replacement only for pending faculty approvals", () => {
    expect(canReplaceFaculty({ status: "PENDING" } as never)).toBe(true);
    expect(canReplaceFaculty({ status: "APPROVED" } as never)).toBe(false);
    expect(canReplaceFaculty({ status: "CORRECTION_REQUESTED" } as never)).toBe(false);
  });
});
