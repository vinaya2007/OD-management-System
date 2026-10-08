import { describe, expect, it } from "vitest";
import { recordFromRequestRow } from "@/lib/portal-data";

describe("OD request mapping", () => {
  it("uses the canonical database flag to identify a Special OD", () => {
    const row = {
      id: "od-special", requester_id: "student-1", department_id: "ece", od_category: "Technical",
      event_name: "Technical event", event_date: "2026-10-08", status: "PENDING_HOD", is_special_od: true,
      requester: { id: "student-1", full_name: "Student A", role: "student", department_id: "ece", register_number: "RA001", is_active: true },
      od_request_students: [{ student: { id: "student-1", full_name: "Student A", role: "student", department_id: "ece", register_number: "RA001", is_active: true } }],
      od_request_faculty: [{ id: "approval-1", od_request_id: "od-special", faculty_id: "faculty-1", status: "APPROVED", faculty: { id: "faculty-1", full_name: "Faculty A", role: "faculty", department_id: "ece", is_active: true } }]
    };
    const mapped = recordFromRequestRow(row);
    expect(mapped.isSpecial).toBe(true);
    expect(mapped.facultyApprovalStatus).toBe("APPROVED");
    expect(mapped.hodApprovalStatus).toBe("PENDING");
  });

  it("does not infer Special OD from a category string", () => {
    const mapped = recordFromRequestRow({ id: "od-1", requester: { id: "student-1", role: "student" }, od_category: "Special Technical", status: "PENDING_FACULTY" });
    expect(mapped.isSpecial).toBe(false);
  });
});
