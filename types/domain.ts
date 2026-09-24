export type Role = "student" | "faculty" | "hod" | "admin";
export type ODStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "FACULTY_REVIEW"
  | "CORRECTION_REQUESTED"
  | "FACULTY_APPROVED"
  | "HOD_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";
export type FacultyApprovalStatus = "PENDING" | "APPROVED" | "CORRECTION_REQUESTED" | "REJECTED";
export type SpecialPermissionStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
export type ODCategory =
  | "Technical Event"
  | "Non-Technical Event"
  | "Hackathon"
  | "Sports"
  | "College Event"
  | "Internship"
  | "Club Organizer / Coordinator"
  | "Other";

export type Profile = {
  id: string;
  authUserId?: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  registerNumber?: string;
  year?: "I" | "II" | "III" | "IV";
  section?: string;
  designation?: string;
  isActive: boolean;
};

export type ODPeriod = {
  id: string;
  odId: string;
  date: string;
  fromPeriod: number;
  toPeriod: number;
};

export type FacultyApproval = {
  id: string;
  odId: string;
  facultyId: string;
  status: FacultyApprovalStatus;
  comment?: string;
  approvedAt?: string;
  updatedAt: string;
};

export type SpecialPermission = {
  id: string;
  odId: string;
  requestedBy: string;
  reason: string;
  additionalInformation?: string;
  status: SpecialPermissionStatus;
  approverId?: string;
  approverComment?: string;
  approvedAt?: string;
};

export type ODApplication = {
  id: string;
  studentId: string;
  departmentId: string;
  category: ODCategory;
  purpose?: string;
  eventName: string;
  venueType: "Our College" | "Other College";
  collegeName?: string;
  startDate: string;
  endDate: string;
  additionalNotes?: string;
  isSpecial: boolean;
  specialPermissionStatus: SpecialPermissionStatus;
  status: ODStatus;
  createdAt: string;
  updatedAt: string;
};

export type ODLimit = {
  category: ODCategory;
  limitCount: number;
  academicYear: string;
  isActive: boolean;
};

export type Notification = {
  id: string;
  userId: string;
  odId?: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type ODRecord = ODApplication & {
  student: Profile;
  periods: ODPeriod[];
  approvals: (FacultyApproval & { faculty: Profile })[];
  specialPermission?: SpecialPermission;
};
