# ECE Online OD Management System

Production-shaped Next.js App Router application for an ECE department On-Duty workflow.

## Implemented

- Role-based demo login for Student, Faculty, HOD and Admin.
- Student dashboard, OD limit usage, application form, duplicate period overlap detection, special permission request path, timeline, withdrawal, and pending faculty replacement.
- Faculty dashboard and review flow with approve, request correction, and reject actions.
- HOD dashboard and final approval flow requiring all selected faculty approvals.
- Consolidated OD page with filters and downloadable PDF.
- Typed OD state model and business-rule helpers.
- Supabase schema, constraints, indexes, RLS policies, workflow setting, and seed data.
- Email notification abstraction using a console provider until Resend/SMTP is configured.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000/login`.

Demo mode is controlled by:

```env
NEXT_PUBLIC_ENABLE_DEMO_AUTH=true
```

## Supabase Setup

1. Create a Supabase project.
2. Enable Google OAuth in Supabase Auth.
3. Restrict college access operationally to `@srms.edu.in`; profile lookup also enforces the domain.
4. Run `supabase/migrations/202609230001_initial_schema.sql`.
5. Run `supabase/seed/seed.sql`.
6. Add environment variables from `.env.example`.

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_ENABLE_DEMO_AUTH=false
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=srms.edu.in
EMAIL_PROVIDER=console
EMAIL_FROM=no-reply@srms.edu.in
```

## Demo Users

Use the Demo Login buttons:

- Student: Aarav Narayanan
- Faculty: Dr. Arun Kumar
- HOD: Dr. Revathi Raman
- Admin: System Admin

## Production Deployment

Deploy to Vercel after setting Supabase and email environment variables. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Disable demo auth in production.

## College Configuration Still Needed

- Official college name and logo.
- Final academic-year calendar.
- Approved special-permission approvers.
- Email provider details.
- Real Supabase Auth users linked to `profiles.auth_user_id`.
- Whether HOD review always requires all faculty approvals.
