import type { FacultyApprovalStatus, Notification, ODRecord, Profile } from "@/types/domain";

type Row = Record<string, unknown>;

function text(value: unknown) { return typeof value === "string" ? value : ""; }

export function profileFromRow(row: Row): Profile {
  const department = row.department && typeof row.department === "object" ? row.department as Row : {};
  return {
    id: text(row.id), authUserId: text(row.auth_user_id) || undefined, name: text(row.name), email: text(row.email),
    role: text(row.role) as Profile["role"], department: text(department.code) || text(row.department_code) || text(row.department_id),
    registerNumber: text(row.register_number) || undefined, year: (text(row.year) || undefined) as Profile["year"], section: text(row.section) || undefined,
    designation: text(row.designation) || undefined, isActive: Boolean(row.is_active)
  };
}

export function recordFromRow(row: Row): ODRecord {
  const student = profileFromRow((row.student as Row) ?? {});
  const approvals = Array.isArray(row.od_faculty_approvals) ? row.od_faculty_approvals as Row[] : [];
  const periods = Array.isArray(row.od_periods) ? row.od_periods as Row[] : [];
  const permission = Array.isArray(row.special_permissions) ? row.special_permissions[0] as Row | undefined : undefined;
  return {
    id: text(row.id), studentId: text(row.student_id), departmentId: text(row.department_id), category: text(row.category) as ODRecord["category"], purpose: text(row.purpose) || undefined,
    eventName: text(row.event_name), venueType: text(row.venue_type) as ODRecord["venueType"], collegeName: text(row.college_name) || undefined,
    startDate: text(row.start_date), endDate: text(row.end_date), additionalNotes: text(row.additional_notes) || undefined, isSpecial: Boolean(row.is_special),
    specialPermissionStatus: text(row.special_permission_status) as ODRecord["specialPermissionStatus"], status: text(row.status) as ODRecord["status"],
    createdAt: text(row.created_at), updatedAt: text(row.updated_at), student,
    periods: periods.map((item) => ({ id: text(item.id), odId: text(item.od_id), date: text(item.date), fromPeriod: Number(item.from_period), toPeriod: Number(item.to_period) })),
    approvals: approvals.map((item) => ({ id: text(item.id), odId: text(item.od_id), facultyId: text(item.faculty_id), status: text(item.status) as FacultyApprovalStatus, comment: text(item.comment) || undefined, approvedAt: text(item.approved_at) || undefined, updatedAt: text(item.updated_at), faculty: profileFromRow((item.faculty as Row) ?? {}) })),
    specialPermission: permission ? { id: text(permission.id), odId: text(permission.od_id), requestedBy: text(permission.requested_by), reason: text(permission.reason), additionalInformation: text(permission.additional_information) || undefined, status: text(permission.status) as ODRecord["specialPermissionStatus"], approverId: text(permission.approver_id) || undefined, approverComment: text(permission.approver_comment) || undefined, approvedAt: text(permission.approved_at) || undefined } : undefined
  };
}

export function notificationFromRow(row: Row): Notification {
  return { id: text(row.id), userId: text(row.user_id), odId: text(row.od_id) || undefined, type: text(row.type), title: text(row.title), message: text(row.message), isRead: Boolean(row.is_read), createdAt: text(row.created_at) };
}
