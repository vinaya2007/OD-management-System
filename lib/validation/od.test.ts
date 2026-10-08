import { describe, expect, it } from "vitest";
import { submitODRequestSchema } from "@/lib/validation/od";

const validRequest = {
  category: "Technical",
  eventName: "Inter-college Event",
  eventType: "Technical",
  eventDate: "2026-10-10",
  startTime: "09:00",
  endTime: "16:00",
  venue: "Main Auditorium",
  purpose: "Representing the department at the event.",
  startPeriod: 1,
  endPeriod: 6,
  facultyIds: ["00000000-0000-4000-8000-000000000002"],
};

describe("OD request submission validation", () => {
  it("accepts a request with a supported category and required purpose", () => {
    expect(submitODRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("accepts only the three canonical OD categories", () => {
    for (const category of ["Non-Technical", "Technical", "Club Organizer / Volunteer"]) {
      expect(submitODRequestSchema.safeParse({ ...validRequest, category }).success).toBe(true);
    }
    expect(submitODRequestSchema.safeParse({ ...validRequest, category: "" }).success).toBe(false);
    expect(submitODRequestSchema.safeParse({ ...validRequest, category: "Hackathon" }).success).toBe(false);
  });

  it("does not use browser student ids to establish ownership", () => {
    const request = submitODRequestSchema.parse({ ...validRequest, studentIds: ["00000000-0000-4000-8000-000000000001"] });
    expect("studentIds" in request).toBe(false);
  });

  it("rejects a missing purpose because the existing reason column is required", () => {
    expect(submitODRequestSchema.safeParse({ ...validRequest, purpose: "" }).success).toBe(false);
  });
});
