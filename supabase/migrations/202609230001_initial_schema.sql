create extension if not exists "uuid-ossp";

create type user_role as enum ('student', 'faculty', 'hod', 'admin');
create type od_status as enum ('DRAFT', 'SUBMITTED', 'FACULTY_REVIEW', 'CORRECTION_REQUESTED', 'FACULTY_APPROVED', 'HOD_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');
create type faculty_approval_status as enum ('PENDING', 'APPROVED', 'CORRECTION_REQUESTED', 'REJECTED');
create type special_permission_status as enum ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

create table departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true
);

create table profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique check (email ilike '%@srms.edu.in'),
  role user_role not null,
  department_id uuid references departments(id),
  register_number text,
  year text check (year in ('I', 'II', 'III', 'IV')),
  section text,
  designation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table od_limits (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  limit_count integer not null check (limit_count >= 0),
  academic_year text not null,
  is_active boolean not null default true,
  unique(category, academic_year)
);

create table workflow_settings (
  id uuid primary key default uuid_generate_v4(),
  department_id uuid not null references departments(id),
  key text not null,
  value jsonb not null,
  unique(department_id, key)
);

create sequence if not exists od_number_seq start 1049;

create table od_applications (
  id uuid primary key default uuid_generate_v4(),
  od_number text not null unique default ('OD-' || nextval('od_number_seq'::regclass)),
  student_id uuid not null references profiles(id),
  department_id uuid not null references departments(id),
  category text not null,
  purpose text,
  start_date date not null,
  end_date date not null,
  event_name text not null,
  venue_type text not null check (venue_type in ('Our College', 'Other College')),
  college_name text,
  additional_notes text,
  is_special boolean not null default false,
  special_permission_status special_permission_status not null default 'NOT_REQUIRED',
  status od_status not null default 'SUBMITTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table od_periods (
  id uuid primary key default uuid_generate_v4(),
  od_id uuid not null references od_applications(id) on delete cascade,
  date date not null,
  from_period integer not null check (from_period between 1 and 7),
  to_period integer not null check (to_period between 1 and 7),
  check (from_period <= to_period)
);

create table od_faculty_approvals (
  id uuid primary key default uuid_generate_v4(),
  od_id uuid not null references od_applications(id) on delete cascade,
  faculty_id uuid not null references profiles(id),
  status faculty_approval_status not null default 'PENDING',
  comment text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(od_id, faculty_id)
);

create table special_permissions (
  id uuid primary key default uuid_generate_v4(),
  od_id uuid not null unique references od_applications(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  reason text not null,
  additional_information text,
  status special_permission_status not null default 'PENDING',
  approver_id uuid references profiles(id),
  approver_comment text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  od_id uuid references od_applications(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index od_applications_student_idx on od_applications(student_id);
create index od_applications_department_status_idx on od_applications(department_id, status);
create index od_periods_od_date_idx on od_periods(od_id, date);
create index od_faculty_approvals_faculty_status_idx on od_faculty_approvals(faculty_id, status);

alter table departments enable row level security;
alter table profiles enable row level security;
alter table od_limits enable row level security;
alter table workflow_settings enable row level security;
alter table od_applications enable row level security;
alter table od_periods enable row level security;
alter table od_faculty_approvals enable row level security;
alter table special_permissions enable row level security;
alter table notifications enable row level security;

create or replace function current_profile()
returns profiles
language sql stable
as $$
  select * from profiles where auth_user_id = auth.uid() and is_active = true limit 1
$$;

create or replace function current_role()
returns user_role
language sql stable
as $$
  select role from profiles where auth_user_id = auth.uid() and is_active = true limit 1
$$;

create policy "active users can read departments" on departments for select using (true);
create policy "active users can read active profiles in department" on profiles for select using (
  auth.uid() = auth_user_id
  or current_role() in ('admin', 'hod')
  or (current_role() = 'faculty' and department_id = (current_profile()).department_id)
);
create policy "admin manages profiles" on profiles for all using (current_role() = 'admin') with check (current_role() = 'admin');
create policy "users read limits" on od_limits for select using (true);
create policy "admin manages limits" on od_limits for all using (current_role() = 'admin') with check (current_role() = 'admin');
create policy "users read workflow settings" on workflow_settings for select using (true);
create policy "admin manages workflow settings" on workflow_settings for all using (current_role() = 'admin') with check (current_role() = 'admin');

create policy "students read own ods" on od_applications for select using (
  student_id = (current_profile()).id
  or current_role() in ('admin', 'hod')
  or exists (select 1 from od_faculty_approvals a where a.od_id = od_applications.id and a.faculty_id = (current_profile()).id)
);
create policy "students create own ods" on od_applications for insert with check (
  current_role() = 'student' and student_id = (current_profile()).id
);
create policy "students update editable own ods" on od_applications for update using (
  current_role() = 'student'
  and student_id = (current_profile()).id
  and status in ('SUBMITTED', 'FACULTY_REVIEW', 'CORRECTION_REQUESTED')
) with check (
  student_id = (current_profile()).id
);
create policy "hod admin update ods" on od_applications for update using (current_role() in ('hod', 'admin')) with check (current_role() in ('hod', 'admin'));

create policy "periods follow od visibility" on od_periods for select using (
  exists (select 1 from od_applications od where od.id = od_periods.od_id)
);
create policy "students manage periods for own editable ods" on od_periods for all using (
  exists (select 1 from od_applications od where od.id = od_periods.od_id and od.student_id = (current_profile()).id and od.status in ('SUBMITTED','FACULTY_REVIEW','CORRECTION_REQUESTED'))
) with check (
  exists (select 1 from od_applications od where od.id = od_periods.od_id and od.student_id = (current_profile()).id)
);

create policy "approval visibility" on od_faculty_approvals for select using (
  faculty_id = (current_profile()).id
  or current_role() in ('admin', 'hod')
  or exists (select 1 from od_applications od where od.id = od_faculty_approvals.od_id and od.student_id = (current_profile()).id)
);
create policy "assigned faculty update own approval" on od_faculty_approvals for update using (
  current_role() = 'faculty' and faculty_id = (current_profile()).id
) with check (
  faculty_id = (current_profile()).id
);
create policy "students insert faculty approvals for own od" on od_faculty_approvals for insert with check (
  exists (select 1 from od_applications od where od.id = od_faculty_approvals.od_id and od.student_id = (current_profile()).id)
);

create policy "special permissions visibility" on special_permissions for select using (
  requested_by = (current_profile()).id or approver_id = (current_profile()).id or current_role() in ('admin','hod')
);
create policy "student creates own special permission" on special_permissions for insert with check (
  current_role() = 'student' and requested_by = (current_profile()).id
);
create policy "hod admin decide special permission" on special_permissions for update using (current_role() in ('hod','admin')) with check (current_role() in ('hod','admin'));

create policy "users read own notifications" on notifications for select using (user_id = (current_profile()).id or current_role() = 'admin');
create policy "users update own notifications" on notifications for update using (user_id = (current_profile()).id) with check (user_id = (current_profile()).id);
