-- ============================================================
-- SRMIST ECE OD MANAGEMENT SYSTEM
-- PRODUCTION SECURITY + WORKFLOW HARDENING
-- FOR THE NEW OD SCHEMA
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS
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


-- Only Admin can read audit logs.

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
-- 3. PROFILE VISIBILITY
-- ============================================================

DROP POLICY IF EXISTS "profiles_read_own"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_read_department"
ON public.profiles;

DROP POLICY IF EXISTS "profiles_admin_read"
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

    -- Faculty / HOD in same department
    OR (
        public.current_role() IN ('faculty', 'hod')
        AND department_id = public.current_user_department()
    )

    -- Students can search active faculty in their department
    OR (
        public.current_role() = 'student'
        AND role = 'faculty'
        AND is_active = TRUE
        AND department_id = public.current_user_department()
    )
);


-- ============================================================
-- 4. STUDENT PROFILE SEARCH
-- ============================================================
--
-- Students need to search other students when adding
-- multiple students to an OD request.
--
-- This policy allows students to read active student
-- profiles within their department.
--
-- ============================================================

DROP POLICY IF EXISTS "students_read_department_students"
ON public.profiles;

CREATE POLICY "students_read_department_students"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    public.current_role() = 'student'
    AND role = 'student'
    AND is_active = TRUE
    AND department_id = public.current_user_department()
);


-- ============================================================
-- 5. OD REQUEST VISIBILITY
-- ============================================================

DROP POLICY IF EXISTS "od_requests_student_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_faculty_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_hod_read"
ON public.od_requests;

DROP POLICY IF EXISTS "od_requests_admin_read"
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

    -- Student included in OD
    OR EXISTS (
        SELECT 1
        FROM public.od_request_students ors
        WHERE ors.request_id = od_requests.id
          AND ors.student_id = public.current_profile_id()
    )
);


-- ============================================================
-- 6. OD REQUEST INSERT SECURITY
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
-- 7. REMOVE DIRECT STUDENT/FACULTY/HOD OD UPDATES
-- ============================================================
--
-- Approval/rejection MUST happen through secure functions.
--
-- This prevents users from simply changing:
--
-- status = 'APPROVED'
--
-- from the browser.
--
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
-- 8. OD STUDENT LINK SECURITY
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
-- 9. STUDENT CAN ADD STUDENTS TO OWN PENDING OD
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
-- 10. FACULTY OD DECISION FUNCTION
-- ============================================================
--
-- Faculty:
--
-- APPROVE:
-- PENDING_FACULTY → PENDING_HOD
--
-- REJECT:
-- PENDING_FACULTY → REJECTED_BY_FACULTY
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.decide_faculty_od(
    p_request_id UUID,
    p_approved BOOLEAN,
    p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_row public.profiles;
    request_row public.od_requests;
BEGIN

    SELECT *
    INTO profile_row
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;

    IF profile_row.id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = 'P0001';
    END IF;


    -- Only Faculty/Admin can perform faculty decision.

    IF profile_row.role NOT IN ('faculty', 'admin') THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    -- Rejection requires a comment.

    IF NOT p_approved
       AND NULLIF(TRIM(p_comment), '') IS NULL THEN

        RAISE EXCEPTION 'REJECTION_COMMENT_REQUIRED'
            USING ERRCODE = 'P0001';

    END IF;


    -- Lock request.

    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR UPDATE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    -- Faculty must belong to same department.

    IF profile_row.role = 'faculty'
       AND request_row.department_id IS DISTINCT FROM profile_row.department_id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    -- Request must currently be waiting for Faculty.

    IF request_row.status <> 'PENDING_FACULTY' THEN

        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
            USING ERRCODE = 'P0001';

    END IF;


    -- APPROVE

    IF p_approved THEN

        UPDATE public.od_requests
        SET
            status = 'PENDING_HOD',
            faculty_decision_by = profile_row.id,
            faculty_decision_at = NOW(),
            faculty_remarks = NULLIF(TRIM(p_comment), ''),
            updated_at = NOW()
        WHERE id = p_request_id;


        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )
        VALUES (
            request_row.requester_id,
            'OD approved by Faculty',
            'Your OD request has been approved by Faculty and sent to the HOD.',
            'FACULTY_APPROVED',
            p_request_id
        );


        INSERT INTO public.audit_logs (
            actor_id,
            request_id,
            action,
            metadata
        )
        VALUES (
            profile_row.id,
            p_request_id,
            'FACULTY_APPROVED',
            jsonb_build_object(
                'comment',
                p_comment
            )
        );


    -- REJECT

    ELSE

        UPDATE public.od_requests
        SET
            status = 'REJECTED_BY_FACULTY',
            faculty_decision_by = profile_row.id,
            faculty_decision_at = NOW(),
            faculty_remarks = NULLIF(TRIM(p_comment), ''),
            updated_at = NOW()
        WHERE id = p_request_id;


        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )
        VALUES (
            request_row.requester_id,
            'OD rejected by Faculty',
            COALESCE(
                NULLIF(TRIM(p_comment), ''),
                'Your OD request has been rejected by Faculty.'
            ),
            'FACULTY_REJECTED',
            p_request_id
        );


        INSERT INTO public.audit_logs (
            actor_id,
            request_id,
            action,
            metadata
        )
        VALUES (
            profile_row.id,
            p_request_id,
            'FACULTY_REJECTED',
            jsonb_build_object(
                'comment',
                p_comment
            )
        );

    END IF;

END;
$$;


-- ============================================================
-- 11. HOD DECISION FUNCTION
-- ============================================================
--
-- APPROVE:
-- PENDING_HOD → APPROVED
--
-- REJECT:
-- PENDING_HOD → REJECTED_BY_HOD
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.decide_hod_od(
    p_request_id UUID,
    p_approved BOOLEAN,
    p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_row public.profiles;
    request_row public.od_requests;
BEGIN

    SELECT *
    INTO profile_row
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;


    IF profile_row.id IS NULL THEN

        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    -- Only HOD/Admin.

    IF profile_row.role NOT IN ('hod', 'admin') THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    -- Rejection requires comment.

    IF NOT p_approved
       AND NULLIF(TRIM(p_comment), '') IS NULL THEN

        RAISE EXCEPTION 'REJECTION_COMMENT_REQUIRED'
            USING ERRCODE = 'P0001';

    END IF;


    -- Lock request.

    SELECT *
    INTO request_row
    FROM public.od_requests
    WHERE id = p_request_id
    FOR UPDATE;


    IF request_row.id IS NULL THEN

        RAISE EXCEPTION 'REQUEST_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    -- HOD can only handle own department.

    IF profile_row.role = 'hod'
       AND request_row.department_id IS DISTINCT FROM profile_row.department_id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    -- Must already be approved by Faculty.

    IF request_row.status <> 'PENDING_HOD' THEN

        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
            USING ERRCODE = 'P0001';

    END IF;


    -- APPROVE

    IF p_approved THEN

        UPDATE public.od_requests
        SET
            status = 'APPROVED',
            hod_decision_by = profile_row.id,
            hod_decision_at = NOW(),
            hod_remarks = NULLIF(TRIM(p_comment), ''),
            updated_at = NOW()
        WHERE id = p_request_id;


        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )
        VALUES (
            request_row.requester_id,
            'OD approved',
            'Your OD request has been approved by the HOD.',
            'HOD_APPROVED',
            p_request_id
        );


        -- Notify all students included in the OD.

        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )
        SELECT
            ors.student_id,
            'OD approved',
            'An OD request containing your name has been approved by the HOD.',
            'HOD_APPROVED',
            p_request_id
        FROM public.od_request_students ors
        WHERE ors.request_id = p_request_id
          AND ors.student_id <> request_row.requester_id;


        INSERT INTO public.audit_logs (
            actor_id,
            request_id,
            action,
            metadata
        )
        VALUES (
            profile_row.id,
            p_request_id,
            'HOD_APPROVED',
            jsonb_build_object(
                'comment',
                p_comment
            )
        );


    -- REJECT

    ELSE

        UPDATE public.od_requests
        SET
            status = 'REJECTED_BY_HOD',
            hod_decision_by = profile_row.id,
            hod_decision_at = NOW(),
            hod_remarks = NULLIF(TRIM(p_comment), ''),
            updated_at = NOW()
        WHERE id = p_request_id;


        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            reference_id
        )
        VALUES (
            request_row.requester_id,
            'OD rejected by HOD',
            COALESCE(
                NULLIF(TRIM(p_comment), ''),
                'Your OD request has been rejected by the HOD.'
            ),
            'HOD_REJECTED',
            p_request_id
        );


        INSERT INTO public.audit_logs (
            actor_id,
            request_id,
            action,
            metadata
        )
        VALUES (
            profile_row.id,
            p_request_id,
            'HOD_REJECTED',
            jsonb_build_object(
                'comment',
                p_comment
            )
        );

    END IF;

END;
$$;


-- ============================================================
-- 12. WITHDRAW OD
-- ============================================================
--
-- Student can withdraw their own request only while it has
-- not yet been finally approved/rejected.
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.withdraw_od(
    p_request_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_row public.profiles;
    request_row public.od_requests;
BEGIN

    SELECT *
    INTO profile_row
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;


    IF profile_row.id IS NULL THEN

        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
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


    IF request_row.requester_id <> profile_row.id THEN

        RAISE EXCEPTION 'FORBIDDEN'
            USING ERRCODE = 'P0001';

    END IF;


    IF request_row.status NOT IN (
        'PENDING_FACULTY',
        'PENDING_HOD'
    ) THEN

        RAISE EXCEPTION 'CANNOT_WITHDRAW'
            USING ERRCODE = 'P0001';

    END IF;


    UPDATE public.od_requests
    SET
        status = 'REJECTED_BY_FACULTY',
        faculty_remarks = 'Withdrawn by requester.',
        updated_at = NOW()
    WHERE id = p_request_id;


    INSERT INTO public.audit_logs (
        actor_id,
        request_id,
        action,
        metadata
    )
    VALUES (
        profile_row.id,
        p_request_id,
        'OD_WITHDRAWN',
        '{}'::jsonb
    );

END;
$$;


-- ============================================================
-- 13. MARK NOTIFICATION READ
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
    profile_id UUID;
BEGIN

    SELECT public.current_profile_id()
    INTO profile_id;


    IF profile_id IS NULL THEN

        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = 'P0001';

    END IF;


    UPDATE public.notifications
    SET is_read = TRUE
    WHERE user_id = profile_id
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
-- 14. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL
ON FUNCTION public.current_profile()
FROM PUBLIC, anon;


REVOKE ALL
ON FUNCTION public.current_role()
FROM PUBLIC, anon;


REVOKE ALL
ON FUNCTION public.decide_faculty_od(UUID, BOOLEAN, TEXT)
FROM PUBLIC, anon;


REVOKE ALL
ON FUNCTION public.decide_hod_od(UUID, BOOLEAN, TEXT)
FROM PUBLIC, anon;


REVOKE ALL
ON FUNCTION public.withdraw_od(UUID)
FROM PUBLIC, anon;


REVOKE ALL
ON FUNCTION public.mark_notification_read(UUID)
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION public.current_profile()
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.current_role()
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.decide_faculty_od(UUID, BOOLEAN, TEXT)
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.decide_hod_od(UUID, BOOLEAN, TEXT)
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.withdraw_od(UUID)
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.mark_notification_read(UUID)
TO authenticated;


-- ============================================================
-- 15. AUDIT LOG PERMISSIONS
-- ============================================================

GRANT SELECT
ON public.audit_logs
TO authenticated;


-- ============================================================
-- 16. NOTIFICATION INSERTION
-- ============================================================
--
-- Users must NOT be able to create fake notifications
-- for themselves or other users.
--
-- Notifications are created by SECURITY DEFINER workflow
-- functions.
--
-- ============================================================

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
-- 17. NOTIFICATION READ
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


-- ============================================================
-- 18. ROLE REQUEST HARDENING
-- ============================================================

DROP POLICY IF EXISTS "role_requests_hod_insert"
ON public.role_requests;

CREATE POLICY "role_requests_hod_insert"
ON public.role_requests
FOR INSERT
TO authenticated
WITH CHECK (

    public.current_role() = 'hod'

    AND requested_by = public.current_profile_id()

    AND department_id = public.current_user_department()

    AND requested_role = 'faculty'

    AND status = 'PENDING'
);


-- ============================================================
-- 19. FINAL SECURITY CHECK
-- ============================================================

SELECT
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- ============================================================
-- 20. SHOW CREATED WORKFLOW FUNCTIONS
-- ============================================================

SELECT
    routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'current_profile',
    'current_role',
    'decide_faculty_od',
    'decide_hod_od',
    'withdraw_od',
    'mark_notification_read'
)
ORDER BY routine_name;