insert into departments (id, name, code, is_active) values
('00000000-0000-0000-0000-000000000ece', 'Electronics and Communication Engineering', 'ECE', true)
on conflict (code) do nothing;

insert into academic_years (name, start_date, end_date, is_active) values
('2026-27', '2026-06-01', '2027-05-31', true)
on conflict (name) do update set is_active = excluded.is_active;

insert into od_limits (category, limit_count, academic_year, academic_year_id, is_active) values
('Technical Event', 5, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Non-Technical Event', 2, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Hackathon', 5, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Sports', 5, '2026-27', (select id from academic_years where name = '2026-27'), true),
('College Event', 6, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Internship', 10, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Club Organizer / Coordinator', 8, '2026-27', (select id from academic_years where name = '2026-27'), true),
('Other', 2, '2026-27', (select id from academic_years where name = '2026-27'), true)
on conflict (category, academic_year) do update set limit_count = excluded.limit_count;

insert into workflow_settings (department_id, key, value) values
('00000000-0000-0000-0000-000000000ece', 'hod_requires_all_faculty_approvals', '{"enabled": true}'::jsonb)
on conflict (department_id, key) do update set value = excluded.value;

insert into profiles (name, email, role, department_id, register_number, year, section, designation, is_active) values
('Aarav Narayanan', 'aarav.n@srms.edu.in', 'student', '00000000-0000-0000-0000-000000000ece', 'ECE23001', 'III', 'A', null, true),
('Meera Srinivasan', 'meera.s@srms.edu.in', 'student', '00000000-0000-0000-0000-000000000ece', 'ECE23002', 'III', 'A', null, true),
('Rahul Venkatesh', 'rahul.v@srms.edu.in', 'student', '00000000-0000-0000-0000-000000000ece', 'ECE23003', 'III', 'A', null, true),
('Nisha Iyer', 'nisha.i@srms.edu.in', 'student', '00000000-0000-0000-0000-000000000ece', 'ECE24011', 'II', 'B', null, true),
('Kavin Kumar', 'kavin.k@srms.edu.in', 'student', '00000000-0000-0000-0000-000000000ece', 'ECE22018', 'IV', 'A', null, true),
('Dr. Arun Kumar', 'arun.k@srms.edu.in', 'faculty', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Class Faculty', true),
('Ms. Priya S', 'priya.s@srms.edu.in', 'faculty', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Faculty', true),
('Mr. Karthik R', 'karthik.r@srms.edu.in', 'faculty', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Club Coordinator', true),
('Dr. Lakshmi Menon', 'lakshmi.m@srms.edu.in', 'faculty', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Event Coordinator', true),
('Mr. Naveen Raj', 'naveen.r@srms.edu.in', 'faculty', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Sports Coordinator', true),
('Dr. Revathi Raman', 'hod.ece@srms.edu.in', 'hod', '00000000-0000-0000-0000-000000000ece', null, null, null, 'HOD', true),
('System Admin', 'admin@srms.edu.in', 'admin', '00000000-0000-0000-0000-000000000ece', null, null, null, 'Admin', true)
on conflict (email) do nothing;
