-- ============================================================
-- SRMIST ECE OD MANAGEMENT SYSTEM
-- FINAL DATABASE SCHEMA
-- ============================================================
--
-- IMPORTANT:
-- 1. This script resets the application's public tables.
-- 2. It does NOT delete auth.users.
-- 3. Student authentication is handled by Supabase Auth.
-- 4. Staff accounts are created by Admin/server-side logic.
-- 5. No dummy student/faculty data is inserted.
--
-- WORKFLOW:
--
-- Student submits
--      ↓
-- PENDING_FACULTY
--      ↓
-- Faculty approves
--      ↓
-- PENDING_HOD
--      ↓
-- HOD approves
--      ↓
-- APPROVED
--
-- Rejections:
-- Faculty → REJECTED_BY_FACULTY
-- HOD     → REJECTED_BY_HOD
--
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 2. DROP OLD APPLICATION OBJECTS
-- ============================================================

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.od_attendance CASCADE;
DROP TABLE IF EXISTS public.od_request_students CASCADE;
DROP TABLE IF EXISTS public.od_requests CASCADE;
DROP TABLE IF EXISTS public.role_requests CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

DROP SEQUENCE IF EXISTS public.od_number_seq CASCADE;

DROP FUNCTION IF EXISTS public.generate_od_number() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.current_profile_id() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_department() CASCADE;
DROP FUNCTION IF EXISTS public.has_admin_access() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_user() CASCADE;

DROP TYPE IF EXISTS public.attendance_status CASCADE;
DROP TYPE IF EXISTS public.od_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;


-- ============================================================
-- 3. ENUMS
-- ============================================================

CREATE TYPE public.user_role AS ENUM (
    'student',
    'faculty',
    'hod',
    'admin'
);

CREATE TYPE public.od_status AS ENUM (
    'PENDING_FACULTY',
    'REJECTED_BY_FACULTY',
    'PENDING_HOD',
    'REJECTED_BY_HOD',
    'APPROVED'
);

CREATE TYPE public.attendance_status AS ENUM (
    'NOT_MARKED',
    'PRESENT',
    'ABSENT'
);


-- ============================================================
-- 4. DEPARTMENTS
-- ============================================================

CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name TEXT NOT NULL UNIQUE,

    code TEXT NOT NULL UNIQUE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. PROFILES
-- ============================================================
--
-- One profile corresponds to one Supabase Auth user.
--
-- Student registration:
-- role = student
-- is_admin_access = false
--
-- Admin can later grant:
-- faculty
-- hod
-- admin access
--
-- ============================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    auth_user_id UUID NOT NULL UNIQUE
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name TEXT NOT NULL,

    email TEXT NOT NULL UNIQUE,

    register_number TEXT UNIQUE,

    department_id UUID
        REFERENCES public.departments(id)
        ON DELETE SET NULL,

    section TEXT,

    year TEXT,

    role public.user_role NOT NULL DEFAULT 'student',

    is_admin_access BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT profiles_email_domain_check
        CHECK (
            LOWER(email) LIKE '%@srmist.edu.in'
        ),

    CONSTRAINT profiles_section_check
        CHECK (
            section IS NULL
            OR section IN ('A', 'B')
        ),

    CONSTRAINT profiles_year_check
        CHECK (
            year IS NULL
            OR year IN ('I', 'II', 'III', 'IV')
        ),

    CONSTRAINT profiles_register_number_check
        CHECK (
            register_number IS NULL
            OR register_number ~* '^RA[A-Z0-9]+$'
        ),

    CONSTRAINT profiles_admin_role_consistency
        CHECK (
            role <> 'admin'
            OR is_admin_access = TRUE
        )
);


-- ============================================================
-- 6. OD REQUESTS
-- ============================================================
--
-- requester_id = student who submitted the OD
--
-- The actual students covered by the OD are stored in
-- od_request_students.
--
-- Therefore:
--
-- Requester only
-- Requester + other students
-- Other students only
--
-- are all supported.
--
-- ============================================================

CREATE TABLE public.od_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    od_number TEXT UNIQUE,

    requester_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    department_id UUID NOT NULL
        REFERENCES public.departments(id)
        ON DELETE RESTRICT,

    event_name TEXT NOT NULL,

    od_category TEXT NOT NULL,

    reason TEXT NOT NULL,

    venue TEXT,

    organization TEXT,

    event_date DATE NOT NULL,

    start_period INTEGER NOT NULL,

    end_period INTEGER NOT NULL,

    start_time TIME,

    end_time TIME,

    status public.od_status NOT NULL DEFAULT 'PENDING_FACULTY',

    faculty_decision_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    faculty_decision_at TIMESTAMPTZ,

    faculty_remarks TEXT,

    hod_decision_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    hod_decision_at TIMESTAMPTZ,

    hod_remarks TEXT,

    supporting_document_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT od_period_start_check
        CHECK (
            start_period BETWEEN 1 AND 9
        ),

    CONSTRAINT od_period_end_check
        CHECK (
            end_period BETWEEN 1 AND 9
        ),

    CONSTRAINT od_period_order_check
        CHECK (
            end_period >= start_period
        ),

    CONSTRAINT od_time_order_check
        CHECK (
            start_time IS NULL
            OR end_time IS NULL
            OR end_time >= start_time
        )
);


-- ============================================================
-- 7. OD REQUEST STUDENTS
-- ============================================================
--
-- Allows unlimited students per OD request.
--
-- Example:
--
-- OD #OD000001
--     ├── Student A
--     ├── Student B
--     ├── Student C
--     └── Student D
--
-- ============================================================

CREATE TABLE public.od_request_students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    request_id UUID NOT NULL
        REFERENCES public.od_requests(id)
        ON DELETE CASCADE,

    student_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(request_id, student_id)
);


-- ============================================================
-- 8. OD ATTENDANCE
-- ============================================================
--
-- Faculty uses this after HOD approval.
--
-- ============================================================

CREATE TABLE public.od_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    request_id UUID NOT NULL
        REFERENCES public.od_requests(id)
        ON DELETE CASCADE,

    student_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    marked_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    status public.attendance_status NOT NULL DEFAULT 'NOT_MARKED',

    remarks TEXT,

    marked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(request_id, student_id)
);


-- ============================================================
-- 9. NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    title TEXT NOT NULL,

    message TEXT NOT NULL,

    type TEXT,

    reference_id UUID,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 10. ROLE REQUESTS
-- ============================================================
--
-- HOD can request Admin to add a Faculty member.
--
-- HOD DOES NOT directly grant Faculty role.
--
-- ============================================================

CREATE TABLE public.role_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    requested_by UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    requested_email TEXT NOT NULL,

    requested_role public.user_role NOT NULL,

    department_id UUID NOT NULL
        REFERENCES public.departments(id)
        ON DELETE RESTRICT,

    reason TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    reviewed_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,

    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT role_requests_allowed_role
        CHECK (
            requested_role = 'faculty'
        ),

    CONSTRAINT role_requests_status_check
        CHECK (
            status IN (
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        ),

    CONSTRAINT role_requests_email_check
        CHECK (
            LOWER(requested_email) LIKE '%@srmist.edu.in'
        )
);


-- ============================================================
-- 11. OD NUMBER SEQUENCE
-- ============================================================

CREATE SEQUENCE public.od_number_seq
    START WITH 1
    INCREMENT BY 1;


-- ============================================================
-- 12. GENERATE OD NUMBER
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_od_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    IF NEW.od_number IS NULL THEN

        NEW.od_number :=
            'OD' ||
            TO_CHAR(CURRENT_DATE, 'YYYY') ||
            LPAD(
                NEXTVAL('public.od_number_seq')::TEXT,
                6,
                '0'
            );

    END IF;

    RETURN NEW;

END;
$$;


CREATE TRIGGER trg_generate_od_number
BEFORE INSERT ON public.od_requests
FOR EACH ROW
EXECUTE FUNCTION public.generate_od_number();


-- ============================================================
-- 13. UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


-- ============================================================
-- 14. UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


CREATE TRIGGER trg_od_requests_updated_at
BEFORE UPDATE ON public.od_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


CREATE TRIGGER trg_od_attendance_updated_at
BEFORE UPDATE ON public.od_attendance
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 15. SECURITY HELPER FUNCTIONS
-- ============================================================
--
-- IMPORTANT:
-- We DO NOT use PostgreSQL current_role().
--
-- current_role is a PostgreSQL built-in identifier.
--
-- Our application role is stored in profiles.role.
--
-- ============================================================


CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT department_id
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.has_admin_access()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND is_active = TRUE
          AND (
              role = 'admin'
              OR is_admin_access = TRUE
          )
    );
$$;


CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_admin_access();
$$;


-- ============================================================
-- 16. ENABLE RLS
-- ============================================================

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.od_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.od_request_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.od_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 17. DEPARTMENT POLICIES
-- ============================================================

CREATE POLICY "departments_authenticated_read"
ON public.departments
FOR SELECT
TO authenticated
USING (
    is_active = TRUE
    OR public.has_admin_access()
);


CREATE POLICY "departments_admin_insert"
ON public.departments
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


CREATE POLICY "departments_admin_update"
ON public.departments
FOR UPDATE
TO authenticated
USING (
    public.has_admin_access()
)
WITH CHECK (
    public.has_admin_access()
);


CREATE POLICY "departments_admin_delete"
ON public.departments
FOR DELETE
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 18. PROFILE POLICIES
-- ============================================================

-- Users can see their own profile.

CREATE POLICY "profiles_read_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    auth_user_id = auth.uid()
);


-- Faculty/HOD can see profiles in their department.

CREATE POLICY "profiles_staff_read_department"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    public.current_user_role() IN ('faculty', 'hod')
    AND department_id = public.current_user_department()
);


-- Admin can see everything.

CREATE POLICY "profiles_admin_read"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    public.has_admin_access()
);


-- Student can create ONLY their own student profile.

CREATE POLICY "profiles_student_self_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    auth_user_id = auth.uid()
    AND role = 'student'
    AND is_admin_access = FALSE
);


-- Admin can create staff profiles.

CREATE POLICY "profiles_admin_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


-- Users can update limited self profile information.
--
-- Role/admin/status changes are intentionally NOT allowed
-- through this policy.

CREATE POLICY "profiles_self_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    auth_user_id = auth.uid()
)
WITH CHECK (
    auth_user_id = auth.uid()
    AND role = public.current_user_role()
    AND is_admin_access = (
        SELECT p.is_admin_access
        FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
        LIMIT 1
    )
    AND is_active = (
        SELECT p.is_active
        FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
        LIMIT 1
    )
);


-- Admin can update profiles.

CREATE POLICY "profiles_admin_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    public.has_admin_access()
)
WITH CHECK (
    public.has_admin_access()
);


-- Admin can delete profiles.

CREATE POLICY "profiles_admin_delete"
ON public.profiles
FOR DELETE
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 19. OD REQUEST SELECT POLICIES
-- ============================================================

-- Student:
-- requester OR student included in OD.

CREATE POLICY "od_requests_student_read"
ON public.od_requests
FOR SELECT
TO authenticated
USING (
    public.current_user_role() = 'student'
    AND (
        requester_id = public.current_profile_id()
        OR EXISTS (
            SELECT 1
            FROM public.od_request_students ors
            WHERE ors.request_id = od_requests.id
              AND ors.student_id = public.current_profile_id()
        )
    )
);


-- Faculty can see department ODs.

CREATE POLICY "od_requests_faculty_read"
ON public.od_requests
FOR SELECT
TO authenticated
USING (
    public.current_user_role() = 'faculty'
    AND department_id = public.current_user_department()
);


-- HOD can see department ODs.

CREATE POLICY "od_requests_hod_read"
ON public.od_requests
FOR SELECT
TO authenticated
USING (
    public.current_user_role() = 'hod'
    AND department_id = public.current_user_department()
);


-- Admin can see all ODs.

CREATE POLICY "od_requests_admin_read"
ON public.od_requests
FOR SELECT
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 20. STUDENT OD INSERT
-- ============================================================

CREATE POLICY "od_requests_student_insert"
ON public.od_requests
FOR INSERT
TO authenticated
WITH CHECK (
    public.current_user_role() = 'student'
    AND requester_id = public.current_profile_id()
    AND department_id = public.current_user_department()
    AND status = 'PENDING_FACULTY'
    AND faculty_decision_by IS NULL
    AND faculty_decision_at IS NULL
    AND hod_decision_by IS NULL
    AND hod_decision_at IS NULL
);


-- Admin may insert if required.

CREATE POLICY "od_requests_admin_insert"
ON public.od_requests
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 21. OD REQUEST UPDATE
-- ============================================================
--
-- IMPORTANT:
-- We intentionally do NOT give normal students direct UPDATE
-- access.
--
-- Workflow decision changes should be implemented through
-- secure server-side/RPC functions.
--
-- Admin can update if necessary.
-- ============================================================

CREATE POLICY "od_requests_admin_update"
ON public.od_requests
FOR UPDATE
TO authenticated
USING (
    public.has_admin_access()
)
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 22. OD REQUEST DELETE
-- ============================================================

CREATE POLICY "od_requests_admin_delete"
ON public.od_requests
FOR DELETE
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 23. OD REQUEST STUDENTS SELECT
-- ============================================================

CREATE POLICY "od_request_students_read"
ON public.od_request_students
FOR SELECT
TO authenticated
USING (

    public.has_admin_access()

    OR EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = od_request_students.request_id
          AND (
              r.requester_id = public.current_profile_id()
              OR public.current_user_role() IN ('faculty', 'hod')
              AND r.department_id = public.current_user_department()
          )
    )

    OR student_id = public.current_profile_id()
);


-- ============================================================
-- 24. OD REQUEST STUDENTS INSERT
-- ============================================================

CREATE POLICY "od_request_students_student_insert"
ON public.od_request_students
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_user_role() = 'student'

    AND EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = request_id
          AND r.requester_id = public.current_profile_id()
          AND r.status = 'PENDING_FACULTY'
    )

    AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = student_id
          AND p.role = 'student'
          AND p.is_active = TRUE
    )
);


CREATE POLICY "od_request_students_admin_insert"
ON public.od_request_students
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 25. OD REQUEST STUDENTS DELETE
-- ============================================================

CREATE POLICY "od_request_students_admin_delete"
ON public.od_request_students
FOR DELETE
TO authenticated
USING (
    public.has_admin_access()
);


-- Student requester can remove students only while pending.

CREATE POLICY "od_request_students_requester_delete"
ON public.od_request_students
FOR DELETE
TO authenticated
USING (
    public.current_user_role() = 'student'
    AND EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = od_request_students.request_id
          AND r.requester_id = public.current_profile_id()
          AND r.status = 'PENDING_FACULTY'
    )
);


-- ============================================================
-- 26. ATTENDANCE READ
-- ============================================================

CREATE POLICY "attendance_read"
ON public.od_attendance
FOR SELECT
TO authenticated
USING (

    public.has_admin_access()

    OR student_id = public.current_profile_id()

    OR EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = od_attendance.request_id
          AND (
              r.department_id = public.current_user_department()
              AND public.current_user_role() IN ('faculty', 'hod')
          )
    )
);


-- ============================================================
-- 27. FACULTY ATTENDANCE INSERT
-- ============================================================

CREATE POLICY "faculty_attendance_insert"
ON public.od_attendance
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_user_role() = 'faculty'

    AND marked_by = public.current_profile_id()

    AND EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = request_id
          AND r.department_id = public.current_user_department()
          AND r.status = 'APPROVED'
    )
);


-- ============================================================
-- 28. FACULTY ATTENDANCE UPDATE
-- ============================================================

CREATE POLICY "faculty_attendance_update"
ON public.od_attendance
FOR UPDATE
TO authenticated
USING (

    public.current_user_role() = 'faculty'

    AND EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = request_id
          AND r.department_id = public.current_user_department()
          AND r.status = 'APPROVED'
    )
)
WITH CHECK (

    public.current_user_role() = 'faculty'

    AND EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = request_id
          AND r.department_id = public.current_user_department()
          AND r.status = 'APPROVED'
    )
);


-- Admin attendance access.

CREATE POLICY "admin_attendance_all"
ON public.od_attendance
FOR ALL
TO authenticated
USING (
    public.has_admin_access()
)
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 29. NOTIFICATION POLICIES
-- ============================================================

CREATE POLICY "notifications_read_own"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    user_id = public.current_profile_id()
);


CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    user_id = public.current_profile_id()
)
WITH CHECK (
    user_id = public.current_profile_id()
);


CREATE POLICY "notifications_admin_insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


CREATE POLICY "notifications_admin_delete"
ON public.notifications
FOR DELETE
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 30. ROLE REQUEST POLICIES
-- ============================================================

-- HOD can create faculty request.

CREATE POLICY "role_requests_hod_insert"
ON public.role_requests
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_user_role() = 'hod'

    AND requested_by = public.current_profile_id()

    AND department_id = public.current_user_department()

    AND requested_role = 'faculty'

    AND status = 'PENDING'
);


-- HOD can see their own requests.

CREATE POLICY "role_requests_hod_read_own"
ON public.role_requests
FOR SELECT
TO authenticated
USING (
    requested_by = public.current_profile_id()
);


-- Admin can see all.

CREATE POLICY "role_requests_admin_read"
ON public.role_requests
FOR SELECT
TO authenticated
USING (
    public.has_admin_access()
);


-- Admin can update requests.

CREATE POLICY "role_requests_admin_update"
ON public.role_requests
FOR UPDATE
TO authenticated
USING (
    public.has_admin_access()
)
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 31. INDEXES
-- ============================================================

CREATE INDEX idx_profiles_auth_user_id
ON public.profiles(auth_user_id);

CREATE INDEX idx_profiles_email
ON public.profiles(email);

CREATE INDEX idx_profiles_register_number
ON public.profiles(register_number);

CREATE INDEX idx_profiles_department
ON public.profiles(department_id);

CREATE INDEX idx_profiles_role
ON public.profiles(role);

CREATE INDEX idx_od_requests_requester
ON public.od_requests(requester_id);

CREATE INDEX idx_od_requests_department
ON public.od_requests(department_id);

CREATE INDEX idx_od_requests_status
ON public.od_requests(status);

CREATE INDEX idx_od_requests_event_date
ON public.od_requests(event_date);

CREATE INDEX idx_od_requests_od_number
ON public.od_requests(od_number);

CREATE INDEX idx_od_request_students_request
ON public.od_request_students(request_id);

CREATE INDEX idx_od_request_students_student
ON public.od_request_students(student_id);

CREATE INDEX idx_od_attendance_request
ON public.od_attendance(request_id);

CREATE INDEX idx_od_attendance_student
ON public.od_attendance(student_id);

CREATE INDEX idx_notifications_user
ON public.notifications(user_id);

CREATE INDEX idx_notifications_unread
ON public.notifications(user_id, is_read);

CREATE INDEX idx_role_requests_status
ON public.role_requests(status);

CREATE INDEX idx_role_requests_department
ON public.role_requests(department_id);


-- ============================================================
-- 32. ONLY DEFAULT DEPARTMENT
-- ============================================================
--
-- This is not dummy student/faculty data.
-- It provides the department required by the application.
--
-- ============================================================

INSERT INTO public.departments (
    name,
    code
)
VALUES (
    'Electronics and Communication Engineering',
    'ECE'
)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 33. GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO authenticated;

GRANT USAGE, SELECT
ON SEQUENCE public.od_number_seq
TO authenticated;


-- ============================================================
-- 34. FINAL VERIFICATION
-- ============================================================

SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;