import { z } from "zod";

export const srmistEmailSchema = z.string().trim().email().max(254).refine((email) => email.toLowerCase().split("@").at(-1) === "srmist.edu.in", {
  message: "Use your @srmist.edu.in email address."
});

export const registerNumberSchema = z.string().trim().toUpperCase().regex(/^RA[A-Z0-9]{6,18}$/, {
  message: "Enter a valid SRMIST register number beginning with RA."
});

export const registerStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  registerNumber: registerNumberSchema,
  departmentId: z.union([z.string().uuid(), z.literal("ECE")]),
  section: z.enum(["A", "B"]),
  year: z.enum(["I", "II", "III", "IV"]),
  email: srmistEmailSchema,
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128)
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"]
});

