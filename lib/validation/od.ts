import { z } from "zod";

export const OD_CATEGORIES = ["Technical Event", "Non-Technical Event", "Hackathon", "Sports", "College Event", "Internship", "Club Organizer / Coordinator", "Other"] as const;
const isoDate = z.string().date();
const periodSchema = z.object({ date: isoDate, fromPeriod: z.number().int().min(1).max(7), toPeriod: z.number().int().min(1).max(7) }).refine((period) => period.fromPeriod <= period.toPeriod, { message: "From period must not be later than To period.", path: ["toPeriod"] });

export const submitODSchema = z.object({
  idempotencyKey: z.string().uuid(), category: z.enum(OD_CATEGORIES), purpose: z.string().trim().max(2000).optional(), eventName: z.string().trim().min(2).max(250), venueType: z.enum(["Our College", "Other College"]), collegeName: z.string().trim().max(250).optional(), startDate: isoDate, endDate: isoDate, additionalNotes: z.string().trim().max(5000).optional(), periods: z.array(periodSchema).min(1).max(180), facultyIds: z.array(z.string().uuid()).min(1).max(3), specialReason: z.string().trim().min(5).max(2000).optional()
}).superRefine((value, context) => {
  if (value.endDate < value.startDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date." });
  if (value.venueType === "Other College" && !value.collegeName) context.addIssue({ code: "custom", path: ["collegeName"], message: "College name is required for an external venue." });
  if (value.category === "Other" && !value.purpose) context.addIssue({ code: "custom", path: ["purpose"], message: "Specify purpose is required for Other." });
  if (new Set(value.facultyIds).size !== value.facultyIds.length) context.addIssue({ code: "custom", path: ["facultyIds"], message: "Faculty selections must be unique." });
  if (new Set(value.periods.map((period) => period.date)).size !== value.periods.length) context.addIssue({ code: "custom", path: ["periods"], message: "Each date can have one period range." });
  if (value.periods.some((period) => period.date < value.startDate || period.date > value.endDate)) context.addIssue({ code: "custom", path: ["periods"], message: "Periods must be inside the OD date range." });
});
export const facultyDecisionSchema = z.object({ odId: z.string().uuid(), decision: z.enum(["APPROVED", "CORRECTION_REQUESTED", "REJECTED"]), comment: z.string().trim().max(2000).optional() }).superRefine((value, context) => { if (value.decision !== "APPROVED" && !value.comment) context.addIssue({ code: "custom", path: ["comment"], message: "A comment is required for correction or rejection." }); });
export const hodDecisionSchema = z.object({ odId: z.string().uuid(), approved: z.boolean(), comment: z.string().trim().max(2000).optional() }).superRefine((value, context) => { if (!value.approved && !value.comment) context.addIssue({ code: "custom", path: ["comment"], message: "A rejection reason is required." }); });
export const replaceFacultySchema = z.object({ odId: z.string().uuid(), approvalId: z.string().uuid(), facultyId: z.string().uuid() });
