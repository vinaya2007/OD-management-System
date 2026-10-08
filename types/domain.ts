export type Role = "student" | "faculty" | "hod" | "admin";
export type ODStatus =
  | "PENDING_FACULTY"
  | "REJECTED_BY_FACULTY"
  | "PENDING_HOD"
  | "REJECTED_BY_HOD"
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
  | "Non-Technical"
  | "Technical"
  | "Club Organizer / Volunteer";

export type Profile = {
  id: string;
  authUserId?: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  departmentName?: string;
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
  facultyApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";
  hodApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "NOT_REACHED";
  status: ODStatus;
  createdAt: string;
  updatedAt: string;
};

export type ODLimit = {
  /** When omitted, this is a department-wide limit shared across OD categories. */
  category?: ODCategory;
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
  requester?: Profile;
  odStudents?: Profile[];
  odStudentIds?: string[];
  eventType?: string;
  organization?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  facultyId?: string;
  facultyActionAt?: string;
  facultyRemarks?: string;
  hodId?: string;
  hodActionAt?: string;
  hodRemarks?: string;
  requesterRemarks?: string;
  potentialDuplicate?: boolean;
  attendance?: ODAttendance[];
  approvalHistory?: ODApprovalHistory[];
  periods: ODPeriod[];
  approvals: (FacultyApproval & { faculty: Profile })[];
  specialPermission?: SpecialPermission;
};

export type ODAttendance = {
  id: string;
  odRequestId: string;
  studentId: string;
  status: "NOT_MARKED" | "PRESENT" | "ABSENT";
  markedBy: string;
  markedAt: string;
};

export type ODApprovalHistory = {
  id: string;
  actor?: Profile;
  role: Role;
  action: string;
  remarks?: string;
  createdAt: string;
};
