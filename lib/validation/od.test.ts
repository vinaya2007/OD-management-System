import { describe, expect, it } from "vitest";
import { submitODRequestSchema } from "@/lib/validation/od";

const validRequest = {
  category: "Hackathon",
  eventName: "Inter-college Hackathon",
  eventType: "Hackathon",
  eventDate: "2026-10-10",
  startTime: "09:00",
  endTime: "16:00",
  venue: "Main Auditorium",
  purpose: "Representing the department at the event.",
  studentIds: ["00000000-0000-4000-8000-000000000001"],
  startPeriod: 1,
  endPeriod: 6,
  facultyIds: ["00000000-0000-4000-8000-000000000002"],
};

describe("OD request submission validation", () => {
  it("accepts a request with a supported category and required purpose", () => {
    expect(submitODRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects a missing or unsupported category before the database call", () => {
    expect(submitODRequestSchema.safeParse({ ...validRequest, category: "" }).success).toBe(false);
    expect(submitODRequestSchema.safeParse({ ...validRequest, category: "Unlisted" }).success).toBe(false);
  });

  it("rejects a missing purpose because the existing reason column is required", () => {
    expect(submitODRequestSchema.safeParse({ ...validRequest, purpose: "" }).success).toBe(false);
  });
});
