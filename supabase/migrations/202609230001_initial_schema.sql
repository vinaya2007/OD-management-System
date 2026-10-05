-- ============================================================
-- ECE OD MANAGEMENT SYSTEM
-- CLEAN DATABASE RESET + FINAL SCHEMA
-- ============================================================
--
-- IMPORTANT:
-- This removes the application's existing tables/data.
-- It does NOT delete Supabase Auth users from auth.users.
--
-- ============================================================


-- ============================================================
-- 1. CLEAN OLD APPLICATION TABLES
-- ============================================================

drop table if exists public.notifications cascade;
drop table if exists public.od_attendance cascade;
drop table if exists public.od_request_students cascade;
drop table if exists public.od_requests cascade;
drop table if exists public.od_periods cascade;
drop table if exists public.od_faculty_approvals cascade;
drop table if exists public.special_permissions cascade;
drop table if exists public.workflow_settings cascade;
drop table if exists public.od_limits cascade;
drop table if exists public.profiles cascade;
drop table if exists public.departments cascade;


-- ============================================================
-- 2. CLEAN OLD FUNCTIONS
-- ============================================================

drop function if exists public.current_profile() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_hod() cascade;
drop function if exists public.is_faculty() cascade;


-- ============================================================
-- 3. CLEAN OLD ENUMS
-- ============================================================

drop type if exists public.user_role cascade;
drop type if exists public.od_status cascade;
drop type if exists public.attendance_status cascade;


-- ============================================================
-- 4. EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- 5. ENUMS
-- ============================================================

create type public.user_role as enum (
    'student',
    'faculty',
    'hod',
    'admin'
);

create type public.od_status as enum (
    'PENDING_FACULTY',
    'REJECTED_BY_FACULTY',
    'PENDING_HOD',
    'REJECTED_BY_HOD',
    'APPROVED'
);

create type public.attendance_status as enum (
    'NOT_MARKED',
    'PRESENT',
    'ABSENT'
);


-- ============================================================
-- 6. DEPARTMENTS
-- ============================================================

create table public.departments (
    id uuid primary key default uuid_generate_v4(),

    name text not null,

    code text not null unique,

    is_active boolean not null default true,

    created_at timestamptz not null default now()
);


-- ============================================================
-- 7. PROFILES
-- ============================================================
--
-- One row represents one application user.
--
-- Students register themselves.
--
-- Faculty/HOD accounts are created/assigned by Admin.
--
-- is_admin_access is kept separately so an account can be
-- granted admin dashboard access securely.
--
-- ============================================================

create table public.profiles (
    id uuid primary key default uuid_generate_v4(),

    auth_user_id uuid unique references auth.users(id)
        on delete set null,

    full_name text not null,

    email text not null unique,

    register_number text unique,

    department_id uuid references public.departments(id),

    section text,

    year text,

    role public.user_role not null default 'student',

    is_admin_access boolean not null default false,

    is_active boolean not null default true,

    created_by uuid references public.profiles(id),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint profiles_email_domain_check
        check (lower(email) like '%@srmist.edu.in'),

    constraint profiles_section_check
        check (
            section is null
            or section in ('A', 'B')
        ),

    constraint profiles_year_check
        check (
            year is null
            or year in ('I', 'II', 'III', 'IV')
        ),

    constraint admin_role_consistency
        check (
            role <> 'admin'
            or is_admin_access = true
        )
);


-- ============================================================
-- 8. OD REQUESTS
-- ============================================================
--
-- requester_id = person who submits the OD request.
--
-- This is intentionally different from the students receiving
-- the OD.
--
-- Example:
--
-- Student A submits an OD for A + B + C.
--
-- requester_id = A
--
-- od_request_students:
-- A
-- B
-- C
--
-- ============================================================

create table public.od_requests (
    id uuid primary key default uuid_generate_v4(),

    od_number text not null unique,

    requester_id uuid not null
        references public.profiles(id),

    department_id uuid not null
        references public.departments(id),

    event_name text not null,

    od_category text not null,

    reason text not null,

    venue text,

    organization text,

    event_date date not null,

    start_period integer not null,

    end_period integer not null,

    start_time time,

    end_time time,

    status public.od_status not null
        default 'PENDING_FACULTY',

    faculty_id uuid
        references public.profiles(id),

    faculty_action_at timestamptz,

    faculty_remarks text,

    faculty_rejection_reason text,

    hod_id uuid
        references public.profiles(id),

    hod_action_at timestamptz,

    hod_remarks text,

    hod_rejection_reason text,

    supporting_document_url text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint od_period_check
        check (
            start_period between 1 and 9
            and end_period between 1 and 9
            and start_period <= end_period
        ),

    constraint od_time_check
        check (
            start_time is null
            or end_time is null
            or start_time <= end_time
        )
);


-- ============================================================
-- 9. OD REQUEST STUDENTS
-- ============================================================
--
-- Connects ONE OD request to ANY NUMBER of students.
--
-- This is the key table for:
--
-- "OD is only for myself"
-- "OD is for other students"
-- "OD is for myself + other students"
--
-- ============================================================

create table public.od_request_students (
    id uuid primary key default uuid_generate_v4(),

    od_request_id uuid not null
        references public.od_requests(id)
        on delete cascade,

    student_id uuid not null
        references public.profiles(id)
        on delete cascade,

    created_at timestamptz not null default now(),

    unique(od_request_id, student_id)
);


-- ============================================================
-- 10. OD ATTENDANCE
-- ============================================================
--
-- Faculty uses this after HOD approval.
--
-- ============================================================

create table public.od_attendance (
    id uuid primary key default uuid_generate_v4(),

    od_request_id uuid not null
        references public.od_requests(id)
        on delete cascade,

    student_id uuid not null
        references public.profiles(id)
        on delete cascade,

    attendance_status public.attendance_status
        not null default 'NOT_MARKED',

    marked_by uuid
        references public.profiles(id),

    marked_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique(od_request_id, student_id)
);


-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================

create table public.notifications (
    id uuid primary key default uuid_generate_v4(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    od_request_id uuid
        references public.od_requests(id)
        on delete cascade,

    notification_type text not null,

    title text not null,

    message text not null,

    is_read boolean not null default false,

    created_at timestamptz not null default now()
);


-- ============================================================
-- 12. ROLE REQUESTS
-- ============================================================
--
-- HOD can request that Admin create/assign a Faculty account.
--
-- HOD does NOT directly grant Faculty access.
--
-- Admin approves the request.
--
-- ============================================================

create table public.role_requests (
    id uuid primary key default uuid_generate_v4(),

    requested_email text not null,

    requested_name text,

    requested_role public.user_role not null,

    department_id uuid not null
        references public.departments(id),

    requested_by uuid not null
        references public.profiles(id),

    status text not null default 'PENDING',

    admin_id uuid
        references public.profiles(id),

    admin_remarks text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint role_requests_role_check
        check (requested_role in ('faculty', 'hod')),

    constraint role_requests_status_check
        check (
            status in (
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        ),

    constraint role_requests_email_check
        check (
            lower(requested_email) like '%@srmist.edu.in'
        )
);


-- ============================================================
-- 13. OD NUMBER SEQUENCE
-- ============================================================

create sequence if not exists public.od_number_seq
    start 1001;


-- ============================================================
-- 14. AUTO OD NUMBER
-- ============================================================

create or replace function public.generate_od_number()
returns trigger
language plpgsql
as $$
begin

    if new.od_number is null
       or new.od_number = '' then

        new.od_number :=
            'OD-' ||
            to_char(current_date, 'YYYY') ||
            '-' ||
            lpad(
                nextval('public.od_number_seq')::text,
                5,
                '0'
            );

    end if;

    return new;

end;
$$;


create trigger trigger_generate_od_number
before insert on public.od_requests
for each row
execute function public.generate_od_number();


-- ============================================================
-- 15. UPDATED_AT FUNCTION
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin

    new.updated_at = now();

    return new;

end;
$$;


-- ============================================================
-- 16. UPDATED_AT TRIGGERS
-- ============================================================

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


create trigger od_requests_updated_at
before update on public.od_requests
for each row
execute function public.set_updated_at();


create trigger od_attendance_updated_at
before update on public.od_attendance
for each row
execute function public.set_updated_at();


create trigger role_requests_updated_at
before update on public.role_requests
for each row
execute function public.set_updated_at();


-- ============================================================
-- 17. SECURITY HELPER FUNCTIONS
-- ============================================================

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$

    select id
    from public.profiles
    where auth_user_id = auth.uid()
      and is_active = true
    limit 1;

$$;


create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$

    select role
    from public.profiles
    where auth_user_id = auth.uid()
      and is_active = true
    limit 1;

$$;


create or replace function public.current_user_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$

    select department_id
    from public.profiles
    where auth_user_id = auth.uid()
      and is_active = true
    limit 1;

$$;


create or replace function public.has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select exists (
        select 1
        from public.profiles
        where auth_user_id = auth.uid()
          and is_active = true
          and (
              role = 'admin'
              or is_admin_access = true
          )
    );

$$;


-- ============================================================
-- 18. ENABLE RLS
-- ============================================================

alter table public.departments enable row level security;

alter table public.profiles enable row level security;

alter table public.od_requests enable row level security;

alter table public.od_request_students enable row level security;

alter table public.od_attendance enable row level security;

alter table public.notifications enable row level security;

alter table public.role_requests enable row level security;


-- ============================================================
-- 19. DEPARTMENT POLICIES
-- ============================================================

create policy "authenticated users can view departments"
on public.departments
for select
to authenticated
using (is_active = true);


create policy "admin manages departments"
on public.departments
for all
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());


-- ============================================================
-- 20. PROFILE POLICIES
-- ============================================================

-- Users can view their own profile.

create policy "users can view own profile"
on public.profiles
for select
to authenticated
using (
    auth_user_id = auth.uid()
);


-- Admin can view all profiles.

create policy "admin can view all profiles"
on public.profiles
for select
to authenticated
using (
    public.has_admin_access()
);


-- HOD can view profiles in their department.

create policy "hod can view department profiles"
on public.profiles
for select
to authenticated
using (
    public.current_user_role() = 'hod'
    and department_id = public.current_user_department()
);


-- Faculty can view student profiles in their department.

create policy "faculty can view department students"
on public.profiles
for select
to authenticated
using (
    public.current_user_role() = 'faculty'
    and role = 'student'
    and department_id = public.current_user_department()
);


-- ============================================================
-- 21. OD REQUEST POLICIES
-- ============================================================

-- Student can see requests where they are the requester.

create policy "requester can view submitted requests"
on public.od_requests
for select
to authenticated
using (
    requester_id = public.current_profile_id()
);


-- Student can see requests where they are an OD student.

create policy "od students can view their ods"
on public.od_requests
for select
to authenticated
using (
    exists (
        select 1
        from public.od_request_students ors
        where ors.od_request_id = od_requests.id
          and ors.student_id = public.current_profile_id()
    )
);


-- Faculty can see department requests.

create policy "faculty can view department ods"
on public.od_requests
for select
to authenticated
using (
    public.current_user_role() = 'faculty'
    and department_id = public.current_user_department()
);


-- HOD can see department requests.

create policy "hod can view department ods"
on public.od_requests
for select
to authenticated
using (
    public.current_user_role() = 'hod'
    and department_id = public.current_user_department()
);


-- Admin can see everything.

create policy "admin can view all ods"
on public.od_requests
for select
to authenticated
using (
    public.has_admin_access()
);


-- Students create requests.

create policy "students can create od requests"
on public.od_requests
for insert
to authenticated
with check (
    public.current_user_role() = 'student'
    and requester_id = public.current_profile_id()
    and department_id = public.current_user_department()
);


-- Requester can update only while faculty review is pending.

create policy "requester can update own pending od"
on public.od_requests
for update
to authenticated
using (
    requester_id = public.current_profile_id()
    and status = 'PENDING_FACULTY'
)
with check (
    requester_id = public.current_profile_id()
);


-- Faculty can update faculty decision.

create policy "faculty can update faculty review"
on public.od_requests
for update
to authenticated
using (
    public.current_user_role() = 'faculty'
    and department_id = public.current_user_department()
    and status = 'PENDING_FACULTY'
)
with check (
    public.current_user_role() = 'faculty'
);


-- HOD can update HOD decision.

create policy "hod can update hod review"
on public.od_requests
for update
to authenticated
using (
    public.current_user_role() = 'hod'
    and department_id = public.current_user_department()
    and status = 'PENDING_HOD'
)
with check (
    public.current_user_role() = 'hod'
);


-- Admin can manage requests.

create policy "admin manages ods"
on public.od_requests
for all
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());


-- ============================================================
-- 22. OD REQUEST STUDENT POLICIES
-- ============================================================

-- Students can see their own participation.

create policy "students view own od participation"
on public.od_request_students
for select
to authenticated
using (
    student_id = public.current_profile_id()
);


-- Requester can view all students attached to requests they submitted.

create policy "requester views od participants"
on public.od_request_students
for select
to authenticated
using (
    exists (
        select 1
        from public.od_requests od
        where od.id = od_request_students.od_request_id
          and od.requester_id = public.current_profile_id()
    )
);


-- Faculty/HOD/Admin can view participants for their department.

create policy "staff view od participants"
on public.od_request_students
for select
to authenticated
using (
    exists (
        select 1
        from public.od_requests od
        where od.id = od_request_students.od_request_id
          and (
              public.has_admin_access()
              or (
                  public.current_user_role()
                  in ('faculty', 'hod')
                  and od.department_id =
                      public.current_user_department()
              )
          )
    )
);


-- Requester can add students to their request.

create policy "requester adds od students"
on public.od_request_students
for insert
to authenticated
with check (
    exists (
        select 1
        from public.od_requests od
        where od.id = od_request_students.od_request_id
          and od.requester_id = public.current_profile_id()
          and od.status = 'PENDING_FACULTY'
    )
);


-- Admin can manage.

create policy "admin manages od participants"
on public.od_request_students
for all
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());


-- ============================================================
-- 23. ATTENDANCE POLICIES
-- ============================================================

-- Students can view their own attendance.

create policy "students view own attendance"
on public.od_attendance
for select
to authenticated
using (
    student_id = public.current_profile_id()
);


-- Faculty can view department attendance.

create policy "faculty view attendance"
on public.od_attendance
for select
to authenticated
using (
    public.current_user_role() = 'faculty'
    and exists (
        select 1
        from public.od_requests od
        where od.id = od_attendance.od_request_id
          and od.department_id =
              public.current_user_department()
          and od.status = 'APPROVED'
    )
);


-- Faculty can mark attendance.

create policy "faculty marks attendance"
on public.od_attendance
for insert
to authenticated
with check (
    public.current_user_role() = 'faculty'
    and exists (
        select 1
        from public.od_requests od
        where od.id = od_attendance.od_request_id
          and od.department_id =
              public.current_user_department()
          and od.status = 'APPROVED'
    )
);


create policy "faculty updates attendance"
on public.od_attendance
for update
to authenticated
using (
    public.current_user_role() = 'faculty'
)
with check (
    public.current_user_role() = 'faculty'
);


-- Admin can manage attendance.

create policy "admin manages attendance"
on public.od_attendance
for all
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());


-- ============================================================
-- 24. NOTIFICATION POLICIES
-- ============================================================

create policy "users view own notifications"
on public.notifications
for select
to authenticated
using (
    user_id = public.current_profile_id()
    or public.has_admin_access()
);


create policy "users update own notifications"
on public.notifications
for update
to authenticated
using (
    user_id = public.current_profile_id()
)
with check (
    user_id = public.current_profile_id()
);


create policy "admin manages notifications"
on public.notifications
for all
to authenticated
using (public.has_admin_access())
with check (public.has_admin_access());


-- ============================================================
-- 25. ROLE REQUEST POLICIES
-- ============================================================

-- HOD can request Faculty/HOD role.

create policy "hod can create role requests"
on public.role_requests
for insert
to authenticated
with check (
    public.current_user_role() = 'hod'
    and requested_by = public.current_profile_id()
);


-- HOD can see their own requests.

create policy "hod views own role requests"
on public.role_requests
for select
to authenticated
using (
    requested_by = public.current_profile_id()
);


-- Admin can view all role requests.

create policy "admin views role requests"
on public.role_requests
for select
to authenticated
using (
    public.has_admin_access()
);


-- Admin can approve/reject role requests.

create policy "admin manages role requests"
on public.role_requests
for update
to authenticated
using (
    public.has_admin_access()
)
with check (
    public.has_admin_access()
);


-- ============================================================
-- 26. INDEXES
-- ============================================================

create index profiles_email_idx
on public.profiles(email);


create index profiles_auth_user_idx
on public.profiles(auth_user_id);


create index profiles_department_idx
on public.profiles(department_id);


create index profiles_register_number_idx
on public.profiles(register_number);


create index od_requests_requester_idx
on public.od_requests(requester_id);


create index od_requests_department_status_idx
on public.od_requests(
    department_id,
    status
);


create index od_requests_created_at_idx
on public.od_requests(created_at desc);


create index od_request_students_request_idx
on public.od_request_students(od_request_id);


create index od_request_students_student_idx
on public.od_request_students(student_id);


create index od_attendance_student_idx
on public.od_attendance(student_id);


create index notifications_user_idx
on public.notifications(user_id);


create index role_requests_status_idx
on public.role_requests(status);


-- ============================================================
-- 27. DEFAULT ECE DEPARTMENT
-- ============================================================

insert into public.departments (
    name,
    code
)
values (
    'Electronics and Communication Engineering',
    'ECE'
)
on conflict (code) do nothing;


-- ============================================================
-- 28. VERIFICATION QUERIES
-- ============================================================

select
    id,
    name,
    code,
    is_active
from public.departments;


select
    table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;


-- ============================================================
-- END OF SCHEMA
-- ============================================================