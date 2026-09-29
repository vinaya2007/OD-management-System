import { describe, expect, it } from "vitest";
import { registerStudentSchema, registerNumberSchema, srmistEmailSchema } from "@/lib/validation/auth";

describe("student registration validation", () => {
  it("accepts only the exact SRMIST email domain", () => {
    expect(srmistEmailSchema.safeParse("student@srmist.edu.in").success).toBe(true);
    for (const email of ["student@gmail.com", "student@outlook.com", "student@srmist.com", "student@srmist.edu.in.example.com"]) {
      expect(srmistEmailSchema.safeParse(email).success).toBe(false);
    }
  });

  it("accepts flexible RA register numbers while rejecting obvious invalid values", () => {
    expect(registerNumberSchema.safeParse("RA1234567890").success).toBe(true);
    expect(registerNumberSchema.safeParse("RA24ECE001").success).toBe(true);
    for (const value of ["123456", "RAX", "RA-123456", "RB12345678"]) expect(registerNumberSchema.safeParse(value).success).toBe(false);
  });

  it("requires matching passwords and an allowed section", () => {
    const base = { fullName: "Student Name", registerNumber: "RA24ECE001", department: "ECE", section: "A", email: "student@srmist.edu.in", password: "a-secure-password", confirmPassword: "a-secure-password" };
    expect(registerStudentSchema.safeParse(base).success).toBe(true);
    expect(registerStudentSchema.safeParse({ ...base, confirmPassword: "different-password" }).success).toBe(false);
    expect(registerStudentSchema.safeParse({ ...base, section: "C" }).success).toBe(false);
  });
});
