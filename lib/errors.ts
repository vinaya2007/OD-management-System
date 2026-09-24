export type AppErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR" | "OD_LIMIT_REACHED" | "OD_OVERLAP" | "FACULTY_NOT_AVAILABLE" | "INVALID_STATUS_TRANSITION" | "NOT_FOUND" | "DATABASE_ERROR" | "EMAIL_CONFIGURATION_ERROR" | "PDF_GENERATION_ERROR";

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, message: string) { super(message); this.name = "AppError"; }
}

export function publicError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  console.error("[od-management] unexpected server error", error);
  return { code: "DATABASE_ERROR" as const, message: "We could not complete that request. Please try again." };
}
