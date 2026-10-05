-- ============================================================
-- SRMIST ECE OD MANAGEMENT SYSTEM
-- FINAL WORKFLOW / SECURITY MIGRATION
-- Compatible with the FINAL schema
-- ============================================================

-- ============================================================
-- 1. ADDITIONAL OD STATUS
-- ============================================================
--
-- The main schema intentionally did not include WITHDRAWN.
-- Add it safely.
-- ============================================================

ALTER TYPE public.od_status
ADD VALUE IF NOT EXISTS 'WITHDRAWN';


-- ============================================================
-- 2. AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    actor_id UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    request_id UUID
        REFERENCES public.od_requests(id)
        ON DELETE SET NULL,

    action TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
ON public.audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request
ON public.audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. CURRENT PROFILE
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.profiles
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;
$$;


-- ============================================================
-- 4. CURRENT ROLE
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.role
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;
$$;


-- ============================================================
-- 5. ACTIVE PROFILE VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.active_profile_or_error()
RETURNS public.profiles
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_row public.profiles;
    auth_email TEXT;
BEGIN

    SELECT LOWER(email)
    INTO auth_email
    FROM auth.users
    WHERE id = auth.uid()
      AND email_confirmed_at IS NOT NULL;

    IF auth_email IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED'
            USING ERRCODE = 'P0001';
    END IF;

    IF split_part(auth_email, '@', 2) <> 'srmist.edu.in' THEN
        RAISE EXCEPTION 'UNAUTHORIZED'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO profile_row
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
      AND LOWER(email) = auth_email
    LIMIT 1;

    IF profile_row.id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN profile_row;

END;
$$;


-- ============================================================
-- 6. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL
ON FUNCTION public.current_profile()
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.current_role()
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.active_profile_or_error()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.current_profile()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_role()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.active_profile_or_error()
TO authenticated;


-- ============================================================
-- 7. PROFILE SEARCH
-- ============================================================
--
-- Used by the student OD form to search other students.
--
-- Search by:
--     Name
--     Register Number
--
-- Only students from the same department are returned.
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_ece_students(
    p_query TEXT
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    register_number TEXT,
    section TEXT,
    year TEXT,
    department TEXT
)
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor public.profiles;
    search_term TEXT;
BEGIN

    actor := public.active_profile_or_error();

    IF actor.role <> 'student' THEN
        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';
    END IF;

    IF LENGTH(TRIM(COALESCE(p_query, ''))) < 2 THEN
        RAISE EXCEPTION 'Enter at least two characters to search.'
            USING ERRCODE = 'P0001';
    END IF;

    IF LENGTH(p_query) > 80 THEN
        RAISE EXCEPTION 'Search query is too long.'
            USING ERRCODE = 'P0001';
    END IF;

    search_term :=
        REPLACE(
            REPLACE(
                REPLACE(
                    TRIM(p_query),
                    '\',
                    '\\'
                ),
                '%',
                '\%'
            ),
            '_',
            '\_'
        );

    RETURN QUERY

    SELECT
        p.id,
        p.full_name,
        p.register_number,
        p.section,
        p.year,
        d.name

    FROM public.profiles p

    JOIN public.departments d
        ON d.id = p.department_id

    WHERE p.role = 'student'
      AND p.is_active = TRUE
      AND p.department_id = actor.department_id
      AND p.id <> actor.id

      AND (
            p.full_name ILIKE '%' || search_term || '%' ESCAPE '\'
            OR
            p.register_number ILIKE '%' || search_term || '%' ESCAPE '\'
      )

    ORDER BY p.full_name

    LIMIT 30;

END;
$$;


REVOKE ALL
ON FUNCTION public.search_ece_students(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.search_ece_students(TEXT)
TO authenticated;


-- ============================================================
-- 8. PROFILE VISIBILITY
-- ============================================================

DROP POLICY IF EXISTS "profiles_read_own"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_read_department"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_admin_read"
ON public.profiles;

DROP POLICY IF EXISTS "students_read_department_students"
ON public.profiles;

DROP POLICY IF EXISTS "scoped_profile_visibility"
ON public.profiles;


CREATE POLICY "scoped_profile_visibility"
ON public.profiles
FOR SELECT
TO authenticated
USING (

    -- Own profile
    auth.uid() = auth_user_id

    -- Admin
    OR public.has_admin_access()

    -- Faculty / HOD can see department profiles
    OR (
        public.current_role() IN ('faculty', 'hod')
        AND department_id = public.current_user_department()
    )

    -- Students can see active faculty
    OR (
        public.current_role() = 'student'
        AND role = 'faculty'
        AND is_active = TRUE
        AND department_id = public.current_user_department()
    )

    -- Students can see other students in same department
    OR (
        public.current_role() = 'student'
        AND role = 'student'
        AND is_active = TRUE
        AND department_id = public.current_user_department()
    )
);


-- ============================================================
-- 9. OD REQUEST READ POLICY
-- ============================================================

DROP POLICY IF EXISTS "od_requests_student_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_faculty_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_hod_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_admin_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_scoped_read"
ON public.od_requests;


CREATE POLICY "od_requests_scoped_read"
ON public.od_requests
FOR SELECT
TO authenticated
USING (

    -- Admin
    public.has_admin_access()

    -- Faculty
    OR (
        public.current_role() = 'faculty'
        AND department_id = public.current_user_department()
    )

    -- HOD
    OR (
        public.current_role() = 'hod'
        AND department_id = public.current_user_department()
    )

    -- Requester
    OR requester_id = public.current_profile_id()

    -- Student included in request
    OR EXISTS (
        SELECT 1
        FROM public.od_request_students ors
        WHERE ors.request_id = od_requests.id
          AND ors.student_id = public.current_profile_id()
    )
);


-- ============================================================
-- 10. OD REQUEST INSERT
-- ============================================================

DROP POLICY IF EXISTS "od_requests_student_insert"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_admin_insert"
ON public.od_requests;


CREATE POLICY "od_requests_student_insert"
ON public.od_requests
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_role() = 'student'

    AND requester_id = public.current_profile_id()

    AND department_id = public.current_user_department()

    AND status = 'PENDING_FACULTY'

    AND faculty_decision_by IS NULL

    AND faculty_decision_at IS NULL

    AND hod_decision_by IS NULL

    AND hod_decision_at IS NULL
);


CREATE POLICY "od_requests_admin_insert"
ON public.od_requests
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 11. REMOVE DIRECT OD UPDATE
-- ============================================================
--
-- Normal users cannot directly modify status.
-- Workflow functions below handle approval/rejection.
-- ============================================================

DROP POLICY IF EXISTS "od_requests_admin_update"
ON public.od_requests;

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
-- 12. OD STUDENT VISIBILITY
-- ============================================================

DROP POLICY IF EXISTS "od_request_students_read"
ON public.od_request_students;


CREATE POLICY "od_request_students_read"
ON public.od_request_students
FOR SELECT
TO authenticated
USING (

    public.has_admin_access()

    OR student_id = public.current_profile_id()

    OR EXISTS (
        SELECT 1
        FROM public.od_requests r
        WHERE r.id = od_request_students.request_id
        AND (
            r.requester_id = public.current_profile_id()

            OR (
                public.current_role() IN ('faculty', 'hod')
                AND r.department_id = public.current_user_department()
            )
        )
    )
);


-- ============================================================
-- 13. STUDENT ADD OD STUDENTS
-- ============================================================

DROP POLICY IF EXISTS "od_request_students_student_insert"
ON public.od_request_students;


CREATE POLICY "od_request_students_student_insert"
ON public.od_request_students
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_role() = 'student'

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
          AND p.department_id = public.current_user_department()
    )
);


-- ============================================================
-- 14. SUBMIT OD REQUEST
-- ============================================================
--
-- Supports:
--
-- Requester only
-- Requester + other students
-- Other students
--
-- No artificial low student limit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_od_request(
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE

    actor public.profiles;

    request_id UUID;

    student_id UUID;

    event_date_value DATE;

    start_time_value TIME;

    end_time_value TIME;

    duplicate_found BOOLEAN := FALSE;

    selected_student_count INTEGER;

    valid_student_count INTEGER;

BEGIN

    actor := public.active_profile_or_error();


    -- --------------------------------------------------------
    -- Only students submit ODs
    -- --------------------------------------------------------

    IF actor.role <> 'student' THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Required student profile information
    -- --------------------------------------------------------

    IF actor.department_id IS NULL
       OR actor.register_number IS NULL
       OR actor.section IS NULL
       OR actor.year IS NULL THEN

        RAISE EXCEPTION 'Complete your student profile before submitting an OD.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Required fields
    -- --------------------------------------------------------

    IF NULLIF(TRIM(p_payload->>'event_name'), '') IS NULL THEN

        RAISE EXCEPTION 'Event name is required.'
            USING ERRCODE = 'P0001';

    END IF;


    IF NULLIF(TRIM(p_payload->>'od_category'), '') IS NULL THEN

        RAISE EXCEPTION 'OD category is required.'
            USING ERRCODE = 'P0001';

    END IF;


    IF NULLIF(TRIM(p_payload->>'reason'), '') IS NULL THEN

        RAISE EXCEPTION 'Reason is required.'
            USING ERRCODE = 'P0001';

    END IF;


    IF p_payload->>'event_date' IS NULL THEN

        RAISE EXCEPTION 'Event date is required.'
            USING ERRCODE = 'P0001';

    END IF;


    IF p_payload->>'start_period' IS NULL
       OR p_payload->>'end_period' IS NULL THEN

        RAISE EXCEPTION 'OD period is required.'
            USING ERRCODE = 'P0001';

    END IF;


    event_date_value :=
        (p_payload->>'event_date')::DATE;


    start_time_value :=
        NULLIF(TRIM(p_payload->>'start_time'), '')::TIME;


    end_time_value :=
        NULLIF(TRIM(p_payload->>'end_time'), '')::TIME;


    -- --------------------------------------------------------
    -- Validate periods
    -- --------------------------------------------------------

    IF (p_payload->>'start_period')::INTEGER NOT BETWEEN 1 AND 9
       OR (p_payload->>'end_period')::INTEGER NOT BETWEEN 1 AND 9 THEN

        RAISE EXCEPTION 'Period must be between 1 and 9.'
            USING ERRCODE = 'P0001';

    END IF;


    IF (p_payload->>'end_period')::INTEGER
       <
       (p_payload->>'start_period')::INTEGER THEN

        RAISE EXCEPTION 'End period cannot be before start period.'
            USING ERRCODE = 'P0001';

    END IF;


    IF start_time_value IS NOT NULL
       AND end_time_value IS NOT NULL
       AND end_time_value <= start_time_value THEN

        RAISE EXCEPTION 'End time must be after start time.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Student IDs must be supplied as array
    -- --------------------------------------------------------

    IF COALESCE(
        JSONB_TYPEOF(p_payload->'student_ids'),
        ''
    ) <> 'array' THEN

        RAISE EXCEPTION 'Select at least one OD student.'
            USING ERRCODE = 'P0001';

    END IF;


    selected_student_count :=
        JSONB_ARRAY_LENGTH(
            p_payload->'student_ids'
        );


    IF selected_student_count < 1 THEN

        RAISE EXCEPTION 'Select at least one OD student.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Validate selected students
    -- --------------------------------------------------------

    SELECT COUNT(*)
    INTO valid_student_count
    FROM JSONB_ARRAY_ELEMENTS_TEXT(
        p_payload->'student_ids'
    ) AS x(value)
    JOIN public.profiles p
      ON p.id = x.value::UUID
     AND p.role = 'student'
     AND p.is_active = TRUE
     AND p.department_id = actor.department_id;


    IF valid_student_count <> selected_student_count THEN

        RAISE EXCEPTION 'One or more selected students are invalid.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Prevent duplicate student selection
    -- --------------------------------------------------------

    IF selected_student_count <>
       (
           SELECT COUNT(DISTINCT x.value::UUID)
           FROM JSONB_ARRAY_ELEMENTS_TEXT(
               p_payload->'student_ids'
           ) AS x(value)
       ) THEN

        RAISE EXCEPTION 'A student cannot be selected more than once.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Requester must be included in OD students
    -- --------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS_TEXT(
            p_payload->'student_ids'
        ) AS x(value)
        WHERE x.value::UUID = actor.id
    ) THEN

        RAISE EXCEPTION 'The requester must be included in the OD student list.'
            USING ERRCODE = 'P0001';

    END IF;


    -- --------------------------------------------------------
    -- Detect potential duplicate
    -- --------------------------------------------------------

    SELECT EXISTS (

        SELECT 1

        FROM public.od_requests r

        JOIN public.od_request_students ors
          ON ors.request_id = r.id

        WHERE r.department_id = actor.department_id

          AND r.event_date = event_date_value

          AND LOWER(r.event_name)
              =
              LOWER(TRIM(p_payload->>'event_name'))

          AND r.status NOT IN (
              'REJECTED_BY_FACULTY',
              'REJECTED_BY_HOD',
              'WITHDRAWN'
          )

          AND (
              r.start_time IS NULL
              OR start_time_value IS NULL
              OR start_time_value < COALESCE(
                    r.end_time,
                    '23:59:59'::TIME
                 )
          )

          AND (
              r.end_time IS NULL
              OR end_time_value IS NULL
              OR r.start_time < end_time_value
          )

          AND ors.student_id IN (
              SELECT x.value::UUID
              FROM JSONB_ARRAY_ELEMENTS_TEXT(
                  p_payload->'student_ids'
              ) AS x(value)
          )

    )

    INTO duplicate_found;


    -- --------------------------------------------------------
    -- Create request
    -- --------------------------------------------------------

    INSERT INTO public.od_requests (
        requester_id,
        department_id,
        event_name,
        od_category,
        reason,
        venue,
        organization,
        event_date,
        start_period,
        end_period,
        start_time,
        end_time,
        status
    )

    VALUES (
        actor.id,
        actor.department_id,
        TRIM(p_payload->>'event_name'),
        TRIM(p_payload->>'od_category'),
        TRIM(p_payload->>'reason'),
        NULLIF(TRIM(p_payload->>'venue'), ''),
        NULLIF(TRIM(p_payload->>'organization'), ''),
        event_date_value,
        (p_payload->>'start_period')::INTEGER,
        (p_payload->>'end_period')::INTEGER,
        start_time_value,
        end_time_value,
        'PENDING_FACULTY'
    )

    RETURNING id INTO request_id;


    -- --------------------------------------------------------
    -- Add students
    -- --------------------------------------------------------

    INSERT INTO public.od_request_students (
        request_id,
        student_id
    )

    SELECT
        request_id,
        x.value::UUID

    FROM JSONB_ARRAY_ELEMENTS_TEXT(
        p_payload->'student_ids'
    ) AS x(value);


    -- --------------------------------------------------------
    -- Audit
    -- --------------------------------------------------------

    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action,
        metadata
    )

    VALUES (
        actor.id,
        request_id,
        'OD_SUBMITTED',
        jsonb_build_object(
            'student_count',
            selected_student_count,
            'potential_duplicate',
            duplicate_found
        )
    );


    -- --------------------------------------------------------
    -- Notify requester + selected students
    -- --------------------------------------------------------

    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    SELECT DISTINCT
        x.value::UUID,
        'OD request submitted',
        'Your OD request has been submitted and is waiting for Faculty approval.',
        'OD_SUBMITTED',
        request_id

    FROM JSONB_ARRAY_ELEMENTS_TEXT(
        p_payload->'student_ids'
    ) AS x(value);


    -- --------------------------------------------------------
    -- Notify department faculty
    -- --------------------------------------------------------

    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    SELECT
        p.id,
        'New OD request',
        'A new OD request is waiting for Faculty approval.',
        'OD_PENDING_FACULTY',
        request_id

    FROM public.profiles p

    WHERE p.role = 'faculty'
      AND p.is_active = TRUE
      AND p.department_id = actor.department_id;


    RETURN JSONB_BUILD_OBJECT(
        'id',
        request_id,
        'potentialDuplicate',
        duplicate_found
    );

END;
$$;


-- ============================================================
-- 15. FACULTY DECISION
-- ============================================================
--
-- PENDING_FACULTY
--       ↓
-- APPROVED → PENDING_HOD
--
-- PENDING_FACULTY
--       ↓
-- REJECTED_BY_FACULTY
-- ============================================================

CREATE OR REPLACE FUNCTION public.decide_od_request_faculty(
    p_request_id UUID,
    p_approved BOOLEAN,
    p_remarks TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor public.profiles;
    request_row public.od_requests;
    next_status public.od_status;
BEGIN

    actor := public.active_profile_or_error();


    IF actor.role <> 'faculty' THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF NOT p_approved
       AND NULLIF(TRIM(p_remarks), '') IS NULL THEN

        RAISE EXCEPTION 'Rejection remarks are required.'
            USING ERRCODE = 'P0001';

    END IF;


    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR UPDATE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.department_id <> actor.department_id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.status <> 'PENDING_FACULTY' THEN

        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
            USING ERRCODE = 'P0001';

    END IF;


    IF p_approved THEN

        next_status := 'PENDING_HOD';

    ELSE

        next_status := 'REJECTED_BY_FACULTY';

    END IF;


    UPDATE public.od_requests

    SET
        status = next_status,
        faculty_decision_by = actor.id,
        faculty_decision_at = NOW(),
        faculty_remarks = NULLIF(TRIM(p_remarks), ''),
        updated_at = NOW()

    WHERE id = p_request_id;


    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action,
        metadata
    )

    VALUES (
        actor.id,
        p_request_id,
        CASE
            WHEN p_approved
            THEN 'FACULTY_APPROVED'
            ELSE 'FACULTY_REJECTED'
        END,
        jsonb_build_object(
            'remarks',
            p_remarks
        )
    );


    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    VALUES (
        request_row.requester_id,

        CASE
            WHEN p_approved
            THEN 'Faculty approved your OD'
            ELSE 'Faculty rejected your OD'
        END,

        COALESCE(
            NULLIF(TRIM(p_remarks), ''),
            CASE
                WHEN p_approved
                THEN 'Your OD request is now waiting for HOD approval.'
                ELSE 'Your OD request was rejected by Faculty.'
            END
        ),

        CASE
            WHEN p_approved
            THEN 'FACULTY_APPROVED'
            ELSE 'FACULTY_REJECTED'
        END,

        p_request_id
    );


    -- Notify all HODs in department after faculty approval.

    IF p_approved THEN

        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )

        SELECT
            p.id,
            'OD waiting for HOD approval',
            'A Faculty-approved OD request requires your review.',
            'OD_PENDING_HOD',
            p_request_id

        FROM public.profiles p

        WHERE p.role = 'hod'
          AND p.is_active = TRUE
          AND p.department_id = actor.department_id;

    END IF;

END;
$$;


-- ============================================================
-- 16. HOD DECISION
-- ============================================================
--
-- PENDING_HOD
--       ↓
-- APPROVED
--
-- PENDING_HOD
--       ↓
-- REJECTED_BY_HOD
-- ============================================================

CREATE OR REPLACE FUNCTION public.decide_od_request_hod(
    p_request_id UUID,
    p_approved BOOLEAN,
    p_remarks TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor public.profiles;
    request_row public.od_requests;
    next_status public.od_status;
BEGIN

    actor := public.active_profile_or_error();


    IF actor.role <> 'hod' THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF NOT p_approved
       AND NULLIF(TRIM(p_remarks), '') IS NULL THEN

        RAISE EXCEPTION 'Rejection remarks are required.'
            USING ERRCODE = 'P0001';

    END IF;


    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR UPDATE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.department_id <> actor.department_id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.status <> 'PENDING_HOD' THEN

        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.faculty_decision_by IS NULL THEN

        RAISE EXCEPTION 'FACULTY_APPROVAL_REQUIRED'
            USING ERRCODE = 'P0001';

    END IF;


    IF p_approved THEN

        next_status := 'APPROVED';

    ELSE

        next_status := 'REJECTED_BY_HOD';

    END IF;


    UPDATE public.od_requests

    SET
        status = next_status,
        hod_decision_by = actor.id,
        hod_decision_at = NOW(),
        hod_remarks = NULLIF(TRIM(p_remarks), ''),
        updated_at = NOW()

    WHERE id = p_request_id;


    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action,
        metadata
    )

    VALUES (
        actor.id,
        p_request_id,

        CASE
            WHEN p_approved
            THEN 'HOD_APPROVED'
            ELSE 'HOD_REJECTED'
        END,

        jsonb_build_object(
            'remarks',
            p_remarks
        )
    );


    -- Notify requester.

    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    VALUES (
        request_row.requester_id,

        CASE
            WHEN p_approved
            THEN 'OD approved'
            ELSE 'OD rejected by HOD'
        END,

        COALESCE(
            NULLIF(TRIM(p_remarks), ''),
            CASE
                WHEN p_approved
                THEN 'Your OD request has been approved by the HOD.'
                ELSE 'Your OD request was rejected by the HOD.'
            END
        ),

        CASE
            WHEN p_approved
            THEN 'HOD_APPROVED'
            ELSE 'HOD_REJECTED'
        END,

        p_request_id
    );


    -- Notify every student included in approved/rejected OD.

    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    SELECT DISTINCT
        ors.student_id,

        CASE
            WHEN p_approved
            THEN 'OD approved'
            ELSE 'OD rejected by HOD'
        END,

        CASE
            WHEN p_approved
            THEN 'An OD request containing your name has been approved.'
            ELSE 'An OD request containing your name has been rejected.'
        END,

        CASE
            WHEN p_approved
            THEN 'HOD_APPROVED'
            ELSE 'HOD_REJECTED'
        END,

        p_request_id

    FROM public.od_request_students ors

    WHERE ors.request_id = p_request_id
      AND ors.student_id <> request_row.requester_id;


    -- If approved, notify faculty for attendance.

    IF p_approved THEN

        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )

        SELECT DISTINCT
            p.id,
            'Approved OD ready for attendance',
            'An approved OD is ready for attendance marking.',
            'OD_READY_FOR_ATTENDANCE',
            p_request_id

        FROM public.profiles p

        WHERE p.role = 'faculty'
          AND p.is_active = TRUE
          AND p.department_id = actor.department_id;

    END IF;

END;
$$;


-- ============================================================
-- 17. ATTENDANCE
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_od_attendance(
    p_request_id UUID,
    p_student_id UUID,
    p_status public.attendance_status
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor public.profiles;
    request_row public.od_requests;
    attendance_id UUID;
BEGIN

    actor := public.active_profile_or_error();


    IF actor.role <> 'faculty' THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR SHARE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.status <> 'APPROVED' THEN

        RAISE EXCEPTION 'OD_NOT_APPROVED'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.department_id <> actor.department_id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM public.od_request_students
        WHERE request_id = p_request_id
          AND student_id = p_student_id
    ) THEN

        RAISE EXCEPTION 'STUDENT_NOT_PART_OF_OD'
            USING ERRCODE = 'P0001';

    END IF;


    INSERT INTO public.od_attendance (
        request_id,
        student_id,
        marked_by,
        status,
        marked_at
    )

    VALUES (
        p_request_id,
        p_student_id,
        actor.id,
        p_status,
        NOW()
    )

    ON CONFLICT (request_id, student_id)

    DO UPDATE SET
        status = EXCLUDED.status,
        marked_by = EXCLUDED.marked_by,
        marked_at = NOW(),
        updated_at = NOW()

    RETURNING id
    INTO attendance_id;


    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action,
        metadata
    )

    VALUES (
        actor.id,
        p_request_id,
        'ATTENDANCE_MARKED',
        jsonb_build_object(
            'student_id',
            p_student_id,
            'status',
            p_status
        )
    );


    RETURN attendance_id;

END;
$$;


-- ============================================================
-- 18. WITHDRAW OD
-- ============================================================

CREATE OR REPLACE FUNCTION public.withdraw_od_request(
    p_request_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor public.profiles;
    request_row public.od_requests;
BEGIN

    actor := public.active_profile_or_error();


    IF actor.role <> 'student' THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR UPDATE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.requester_id <> actor.id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.status NOT IN (
        'PENDING_FACULTY',
        'PENDING_HOD'
    ) THEN

        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
            USING ERRCODE = 'P0001';

    END IF;


    UPDATE public.od_requests

    SET
        status = 'WITHDRAWN',
        updated_at = NOW()

    WHERE id = p_request_id;


    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action
    )

    VALUES (
        actor.id,
        p_request_id,
        'OD_WITHDRAWN'
    );


    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_id
    )

    SELECT DISTINCT
        targets.user_id,
        'OD request withdrawn',
        'The requester withdrew this OD request.',
        'OD_WITHDRAWN',
        p_request_id

    FROM (

        SELECT
            p.requester_id AS user_id

        UNION

        SELECT
            ors.student_id
        FROM public.od_request_students ors
        WHERE ors.request_id = p_request_id

    ) targets;

END;
$$;


-- ============================================================
-- 19. MARK NOTIFICATION READ
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(
    p_notification_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor_id UUID;
BEGIN

    actor_id := public.current_profile_id();


    IF actor_id IS NULL THEN

        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    UPDATE public.notifications

    SET is_read = TRUE

    WHERE user_id = actor_id
      AND (
          p_notification_id IS NULL
          OR id = p_notification_id
      );


    IF p_notification_id IS NOT NULL
       AND NOT FOUND THEN

        RAISE EXCEPTION 'NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;

END;
$$;


-- ============================================================
-- 20. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL
ON FUNCTION public.submit_od_request(JSONB)
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.decide_od_request_faculty(UUID, BOOLEAN, TEXT)
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.decide_od_request_hod(UUID, BOOLEAN, TEXT)
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.mark_od_attendance(
    UUID,
    UUID,
    public.attendance_status
)
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.withdraw_od_request(UUID)
FROM PUBLIC, anon;

REVOKE ALL
ON FUNCTION public.mark_notification_read(UUID)
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION public.submit_od_request(JSONB)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.decide_od_request_faculty(UUID, BOOLEAN, TEXT)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.decide_od_request_hod(UUID, BOOLEAN, TEXT)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.mark_od_attendance(
    UUID,
    UUID,
    public.attendance_status
)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.withdraw_od_request(UUID)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.mark_notification_read(UUID)
TO authenticated;


-- ============================================================
-- 21. AUDIT LOG POLICY
-- ============================================================

DROP POLICY IF EXISTS "audit_logs_admin_read"
ON public.audit_logs;

CREATE POLICY "audit_logs_admin_read"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    public.has_admin_access()
);


-- ============================================================
-- 22. NOTIFICATION SECURITY
-- ============================================================

DROP POLICY IF EXISTS "notifications_read_own"
ON public.notifications;

CREATE POLICY "notifications_read_own"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    user_id = public.current_profile_id()
);


-- Users cannot create arbitrary notifications.

DROP POLICY IF EXISTS "notifications_admin_insert"
ON public.notifications;

CREATE POLICY "notifications_admin_insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_admin_access()
);


-- ============================================================
-- 23. ATTENDANCE READ
-- ============================================================

DROP POLICY IF EXISTS "attendance_read"
ON public.od_attendance;


CREATE POLICY "attendance_read"
ON public.od_attendance
FOR SELECT
TO authenticated
USING (

    public.has_admin_access()

    OR student_id = public.current_profile_id()

    OR (
        public.current_role() IN ('faculty', 'hod')
        AND EXISTS (
            SELECT 1
            FROM public.od_requests r
            WHERE r.id = od_attendance.request_id
              AND r.department_id = public.current_user_department()
        )
    )
);


-- ============================================================
-- 24. ATTENDANCE WRITE
-- ============================================================

DROP POLICY IF EXISTS "faculty_attendance_insert"
ON public.od_attendance;

DROP POLICY IF EXISTS "faculty_attendance_update"
ON public.od_attendance;


-- Attendance is written through mark_od_attendance().
-- Direct INSERT/UPDATE is intentionally unavailable.


-- ============================================================
-- 25. FINAL FUNCTION LIST
-- ============================================================

SELECT
    routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'current_profile',
    'current_role',
    'active_profile_or_error',
    'search_ece_students',
    'submit_od_request',
    'decide_od_request_faculty',
    'decide_od_request_hod',
    'mark_od_attendance',
    'withdraw_od_request',
    'mark_notification_read'
)
ORDER BY routine_name;


-- ============================================================
-- 26. FINAL TABLE CHECK
-- ============================================================

SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;