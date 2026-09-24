import type { Notification, ODLimit, ODRecord, Profile } from "@/types/domain";

export const demoProfiles: Profile[] = [
  { id: "stu-1", name: "Aarav Narayanan", email: "aarav.n@srms.edu.in", role: "student", department: "ECE", registerNumber: "ECE23001", year: "III", section: "A", isActive: true },
  { id: "stu-2", name: "Meera Srinivasan", email: "meera.s@srms.edu.in", role: "student", department: "ECE", registerNumber: "ECE23002", year: "III", section: "A", isActive: true },
  { id: "stu-3", name: "Rahul Venkatesh", email: "rahul.v@srms.edu.in", role: "student", department: "ECE", registerNumber: "ECE23003", year: "III", section: "A", isActive: true },
  { id: "stu-4", name: "Nisha Iyer", email: "nisha.i@srms.edu.in", role: "student", department: "ECE", registerNumber: "ECE24011", year: "II", section: "B", isActive: true },
  { id: "stu-5", name: "Kavin Kumar", email: "kavin.k@srms.edu.in", role: "student", department: "ECE", registerNumber: "ECE22018", year: "IV", section: "A", isActive: true },
  { id: "fac-1", name: "Dr. Arun Kumar", email: "arun.k@srms.edu.in", role: "faculty", department: "ECE", designation: "Class Faculty", isActive: true },
  { id: "fac-2", name: "Ms. Priya S", email: "priya.s@srms.edu.in", role: "faculty", department: "ECE", designation: "Faculty", isActive: true },
  { id: "fac-3", name: "Mr. Karthik R", email: "karthik.r@srms.edu.in", role: "faculty", department: "ECE", designation: "Club Coordinator", isActive: true },
  { id: "fac-4", name: "Dr. Lakshmi Menon", email: "lakshmi.m@srms.edu.in", role: "faculty", department: "ECE", designation: "Event Coordinator", isActive: true },
  { id: "fac-5", name: "Mr. Naveen Raj", email: "naveen.r@srms.edu.in", role: "faculty", department: "ECE", designation: "Sports Coordinator", isActive: true },
  { id: "hod-1", name: "Dr. Revathi Raman", email: "hod.ece@srms.edu.in", role: "hod", department: "ECE", designation: "HOD", isActive: true },
  { id: "admin-1", name: "System Admin", email: "admin@srms.edu.in", role: "admin", department: "ECE", designation: "Admin", isActive: true }
];

export const demoLimits: ODLimit[] = [
  { category: "Technical Event", limitCount: 5, academicYear: "2026-27", isActive: true },
  { category: "Non-Technical Event", limitCount: 2, academicYear: "2026-27", isActive: true },
  { category: "Hackathon", limitCount: 5, academicYear: "2026-27", isActive: true },
  { category: "Sports", limitCount: 5, academicYear: "2026-27", isActive: true },
  { category: "College Event", limitCount: 6, academicYear: "2026-27", isActive: true },
  { category: "Internship", limitCount: 10, academicYear: "2026-27", isActive: true },
  { category: "Club Organizer / Coordinator", limitCount: 8, academicYear: "2026-27", isActive: true },
  { category: "Other", limitCount: 2, academicYear: "2026-27", isActive: true }
];

const p = (id: string, date: string, fromPeriod: number, toPeriod: number) => ({ id: `per-${id}`, odId: id, date, fromPeriod, toPeriod });
const approval = (odId: string, facultyId: string, status: ODRecord["approvals"][number]["status"], comment = "") => ({
  id: `ap-${odId}-${facultyId}`,
  odId,
  facultyId,
  status,
  comment,
  approvedAt: status === "APPROVED" ? "2026-09-23T05:20:00.000Z" : undefined,
  updatedAt: "2026-09-23T05:20:00.000Z",
  faculty: demoProfiles.find((item) => item.id === facultyId)!
});

export const demoApplications: ODRecord[] = [
  {
    id: "OD-1042",
    studentId: "stu-1",
    student: demoProfiles[0],
    departmentId: "ece",
    category: "Hackathon",
    purpose: "Smart India Hackathon regional selection",
    eventName: "XYZ Hackathon",
    venueType: "Other College",
    collegeName: "ABC College",
    startDate: "2026-09-25",
    endDate: "2026-09-25",
    additionalNotes: "Team qualified for the final presentation round.",
    isSpecial: false,
    specialPermissionStatus: "NOT_REQUIRED",
    status: "FACULTY_REVIEW",
    createdAt: "2026-09-23T04:00:00.000Z",
    updatedAt: "2026-09-23T05:20:00.000Z",
    periods: [p("OD-1042", "2026-09-25", 3, 7)],
    approvals: [approval("OD-1042", "fac-1", "APPROVED"), approval("OD-1042", "fac-2", "PENDING"), approval("OD-1042", "fac-3", "PENDING")]
  },
  {
    id: "OD-1043",
    studentId: "stu-2",
    student: demoProfiles[1],
    departmentId: "ece",
    category: "Technical Event",
    eventName: "Circuit Debugging Symposium",
    venueType: "Our College",
    startDate: "2026-09-25",
    endDate: "2026-09-25",
    additionalNotes: "Participating in the final round.",
    isSpecial: false,
    specialPermissionStatus: "NOT_REQUIRED",
    status: "HOD_REVIEW",
    createdAt: "2026-09-22T04:00:00.000Z",
    updatedAt: "2026-09-23T06:20:00.000Z",
    periods: [p("OD-1043", "2026-09-25", 2, 5)],
    approvals: [approval("OD-1043", "fac-1", "APPROVED"), approval("OD-1043", "fac-4", "APPROVED")]
  },
  {
    id: "OD-1044",
    studentId: "stu-3",
    student: demoProfiles[2],
    departmentId: "ece",
    category: "Sports",
    eventName: "Inter-college Football",
    venueType: "Other College",
    collegeName: "City Engineering College",
    startDate: "2026-09-24",
    endDate: "2026-09-24",
    isSpecial: true,
    specialPermissionStatus: "APPROVED",
    status: "APPROVED",
    createdAt: "2026-09-20T04:00:00.000Z",
    updatedAt: "2026-09-21T06:20:00.000Z",
    periods: [p("OD-1044", "2026-09-24", 1, 5)],
    approvals: [approval("OD-1044", "fac-5", "APPROVED"), approval("OD-1044", "fac-1", "APPROVED")],
    specialPermission: { id: "sp-1", odId: "OD-1044", requestedBy: "stu-3", reason: "University team representation", status: "APPROVED", approverId: "hod-1", approvedAt: "2026-09-20T07:10:00.000Z" }
  },
  {
    id: "OD-1045",
    studentId: "stu-1",
    student: demoProfiles[0],
    departmentId: "ece",
    category: "Non-Technical Event",
    eventName: "Design Pitch",
    venueType: "Other College",
    collegeName: "Metro Arts College",
    startDate: "2026-09-26",
    endDate: "2026-09-26",
    isSpecial: false,
    specialPermissionStatus: "NOT_REQUIRED",
    status: "CORRECTION_REQUESTED",
    createdAt: "2026-09-21T04:00:00.000Z",
    updatedAt: "2026-09-22T05:20:00.000Z",
    periods: [p("OD-1045", "2026-09-26", 1, 3)],
    approvals: [approval("OD-1045", "fac-2", "CORRECTION_REQUESTED", "Please attach more context in the additional information field.")]
  },
  {
    id: "OD-1046",
    studentId: "stu-4",
    student: demoProfiles[3],
    departmentId: "ece",
    category: "Other",
    purpose: "Industry visit briefing",
    eventName: "Industry Visit Briefing",
    venueType: "Our College",
    startDate: "2026-09-27",
    endDate: "2026-09-27",
    isSpecial: false,
    specialPermissionStatus: "NOT_REQUIRED",
    status: "REJECTED",
    createdAt: "2026-09-21T04:00:00.000Z",
    updatedAt: "2026-09-22T05:20:00.000Z",
    periods: [p("OD-1046", "2026-09-27", 6, 7)],
    approvals: [approval("OD-1046", "fac-4", "REJECTED", "The purpose overlaps with a mandatory lab session.")]
  },
  {
    id: "OD-1047",
    studentId: "stu-5",
    student: demoProfiles[4],
    departmentId: "ece",
    category: "Internship",
    eventName: "Internship Review",
    venueType: "Other College",
    collegeName: "Signal Labs",
    startDate: "2026-09-28",
    endDate: "2026-09-30",
    isSpecial: true,
    specialPermissionStatus: "PENDING",
    status: "SUBMITTED",
    createdAt: "2026-09-22T04:00:00.000Z",
    updatedAt: "2026-09-22T05:20:00.000Z",
    periods: [p("OD-1047", "2026-09-28", 1, 7), p("OD-1047", "2026-09-29", 1, 7), p("OD-1047", "2026-09-30", 1, 7)],
    approvals: [approval("OD-1047", "fac-1", "PENDING")],
    specialPermission: { id: "sp-2", odId: "OD-1047", requestedBy: "stu-5", reason: "Internship review exceeds configured category limit.", status: "PENDING" }
  },
  {
    id: "OD-1048",
    studentId: "stu-2",
    student: demoProfiles[1],
    departmentId: "ece",
    category: "College Event",
    eventName: "ECE Expo Volunteering",
    venueType: "Our College",
    startDate: "2026-09-23",
    endDate: "2026-09-23",
    isSpecial: false,
    specialPermissionStatus: "NOT_REQUIRED",
    status: "WITHDRAWN",
    createdAt: "2026-09-18T04:00:00.000Z",
    updatedAt: "2026-09-19T05:20:00.000Z",
    periods: [p("OD-1048", "2026-09-23", 4, 7)],
    approvals: [approval("OD-1048", "fac-3", "PENDING")]
  }
];

export const demoNotifications: Notification[] = [
  { id: "not-1", userId: "stu-1", odId: "OD-1045", type: "correction", title: "Correction requested", message: "Ms. Priya S requested a correction on OD-1045.", isRead: false, createdAt: "2026-09-22T05:20:00.000Z" },
  { id: "not-2", userId: "stu-3", odId: "OD-1044", type: "approved", title: "OD fully approved", message: "Your sports OD has been approved by the HOD.", isRead: false, createdAt: "2026-09-21T06:20:00.000Z" }
];

export function getDemoUser(role: Profile["role"]) {
  return demoProfiles.find((profile) => profile.role === role)!;
}
