# ECE Online OD Management System

Next.js App Router application for managing ECE On-Duty applications. It has a demo mode and a Supabase-backed mode. Demo mode is development-only; production mode uses Google OAuth, profile records, PostgreSQL workflow functions, and RLS.

## Architecture

- `app/`: route pages, callback/signout handlers, protected server actions, and `/api/portal` data loading.
- `components/`: responsive client portal, OD workflows, and dashboards.
- `lib/`: auth helpers, input validation, business rules, Supabase clients, email abstraction, and PDF generation.
- `supabase/migrations/`: ordered schema and production workflow migrations.
- `supabase/seed/seed.sql`: development fixture data; do not run it against production.

Portal reads use the authenticated Supabase SSR client and RLS. OD writes use PostgreSQL RPC functions so the database checks verified identity, role, ownership, department, assignment, status, and valid workflow transitions. `profiles.role` is the authority; browser storage is only used for the explicitly enabled demo mode. Legacy period/limit/special-permission UI remains from the original application and is not enforced by the new multi-student request RPC.

## OD workflow

Requests are parent records in `od_requests`; their requester is independent from the one-or-more OD students in `od_request_students`. Students search existing ECE student profiles through `search_ece_students`; the submit RPC validates every recipient and faculty reviewer against active same-department profiles. Students see their own participation history and separately see requests they submitted. A faculty reviewer assigned to the request moves the whole request from `PENDING_FACULTY` to `PENDING_HOD` or rejects it. An authorized HOD makes the final `APPROVED`/`REJECTED_BY_HOD` decision. `od_attendance` stores one attendance row per request/student. Approval actions and notifications are written by database functions.

The former period-based special-permission flow belongs to the legacy OD schema; it is not part of the new parent/child workflow. Do not use it for production decisions until it is migrated to the new request model.

## Authentication and profile provisioning

Email/password student signup uses Supabase Auth and a database trigger to create the complete `profiles` row at account creation; the trigger verifies the college domain, department, register number, year, and section, and assigns only the `student` role. Login and OAuth callbacks look up the linked profile by `profiles.auth_user_id = auth.users.id` and route by its database role. Profile completion is not part of the authentication flow. The callback requires a confirmed email and the exact college domain.

Faculty/HOD roles must be granted through a trusted Supabase admin/database operation after verifying the person's institutional authorization. For example, a privileged operator may change `profiles.role` for the exact Auth-linked profile in the Supabase SQL editor; never expose this operation through student UI or client code. Confirm `department_id`, `is_active`, email, and `auth_user_id` at the same time. New students register through the student form; existing staff accounts are provisioned through the trusted admin process.

1. Create/verify the account using the student signup flow for students, or provision/invite through the approved identity process for staff.
2. For staff only, link the Auth UUID to the existing profile and grant the authorized role through the privileged admin channel.
3. Verify the account is active, the email matches, the department is active, and role assignment was approved.
4. Sign in and confirm the account reaches only its assigned role dashboard.

Do not allow self-service role changes. A CSV import/admin user-management interface is not implemented yet. The service-role key is not used by a web route and must never be exposed in a browser or committed file.

## Local development

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

For local UI exploration only, set `ENABLE_DEMO_AUTH=true` in `.env.local`. Demo identities and workflow mutations are in-memory/browser demo behavior and are not persisted. Keep `ENABLE_DEMO_AUTH=false` for production.

## Supabase setup

1. Create a Supabase project and note its project URL and anon/public key.
2. In **Authentication → URL Configuration**, set the Site URL to the local app URL during development and the production Vercel URL after deployment. Add `http://localhost:3000/auth/callback` and `https://YOUR_DOMAIN/auth/callback` as redirect URLs.
3. In **Authentication → Providers → Google**, enable Google and copy the Supabase callback URL shown there.
4. In Google Cloud Console, create an OAuth 2.0 Web application credential. Add the Supabase callback URL as an authorized redirect URI. Add `http://localhost:3000` and the production site origin as authorized JavaScript origins. Configure the consent screen and publish/allow the college user group as required by the institution.
5. Enter Google client ID and secret in Supabase's Google provider settings. Do not put them in this repository.
6. Apply migrations in filename order using the Supabase CLI (`supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`) or the SQL editor. In particular, `202609270001_multi_student_od.sql` adds parent/child requests, scoped RLS, RPC workflow, notifications, attendance, and student profile provisioning. Do not manually recreate tables.
7. For development only, run `supabase/seed/seed.sql` after migrations. Review the seed before running it; never seed production.
8. Existing ECE department is upserted by the migration. Provision and role-assign faculty/HOD profiles through the trusted workflow above. Existing academic-year/limit settings are legacy features; they are not enforced by the new parent request RPC.
9. Confirm RLS is enabled and test with separate student, assigned/unassigned faculty, and HOD accounts. Verify requester-versus-recipient visibility, cross-student reads, invalid transitions, attendance authorization, and direct API attempts.
10. Configure email only after selecting a provider. In-app notifications are written by database workflow functions; production email sending is not yet wired into those functions/actions.

The migrations do not provision the first admin, create identity profiles from OAuth, or automatically create the ECE department/academic-year configuration. These require an institution-approved bootstrap procedure before login and submissions can work.

## Environment variables

Copy `.env.example` to `.env.local` and fill deployment-specific values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for live mode | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for live mode | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for trusted provisioning jobs | Server-only privileged key; no current web route uses it |
| `NEXT_PUBLIC_APP_URL` | Yes for callback setup | Canonical app URL |
| `ALLOWED_EMAIL_DOMAIN` | Yes for live auth | Exact permitted domain, without `@` |
| `ENABLE_DEMO_AUTH` | Yes | `false` for production; `true` only for local demo |
| `EMAIL_PROVIDER` | Optional | No delivery integration is active yet; unset/console is development only |
| `EMAIL_API_KEY` | Optional | Reserved for a server-side email provider integration |
| `EMAIL_FROM` | Optional | Reserved sender address |
| `COLLEGE_NAME` | Recommended | College name shown in PDF output |
| `COLLEGE_DEPARTMENT` | Recommended | Department name shown in PDF output |

The `.env`, `.env.*`, and `.env*.local` patterns are ignored, with `.env.example` explicitly retained. Do not commit secrets.

## Google OAuth and Supabase configuration

- Configure Google as an OAuth provider in Supabase Authentication and add the Supabase callback URL to the Google OAuth client.
- Set the Supabase Site URL and redirect allow-list to include `/auth/callback`; use the deployed app origin in production.
- Set `ALLOWED_EMAIL_DOMAIN=srmist.edu.in`. The app and database both enforce the exact suffix; changing this value does not widen the database trigger's SRMIST restriction.
- Enable email confirmation and configure Supabase SMTP for production signup/reset-password messages. Google OAuth must return a verified email. The callback rejects unconfirmed identities.
- Use `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `ALLOWED_EMAIL_DOMAIN`, and `ENABLE_DEMO_AUTH=false`. No service-role key is needed by the web app.
- This migration adds no Storage bucket because the current request form has no document-upload control. If upload support is added, use a private bucket and request-authorized Storage policies before enabling it.

## Notifications, email, and PDF

Database workflow functions persist in-app notifications for submitted ODs and faculty/HOD decisions; existing notification read actions remain available. Email delivery is not wired. Realtime subscriptions are not enabled; the UI refreshes from the server-backed portal API.

Consolidation currently filters the portal's loaded (up to 200) RLS-visible applications in the browser. It is not paginated or a server-side filtered query and does not yet expose all requested filters. The PDF uses those real loaded records and configured college/department names, but the logo remains a placeholder and PDF filtering inherits the current page filters. Do not treat this consolidation as a complete official register until server-side pagination/filtering and department/year scoping are implemented and verified.

## Commands and verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Unit tests currently cover legacy period validation, overlap behavior, approved-only limit counts, and pending-only faculty replacement. A real Supabase integration project is required to exercise RLS, trigger behavior, RPC transitions, OAuth, and the scenarios below; no project credentials are present in this workspace, so those remote checks have not been run.

### Required manual acceptance scenarios

Create at least two verified student Auth accounts, one authorized ECE faculty account, and one authorized ECE HOD account in a non-production Supabase project. Use distinct Auth UUIDs and student register numbers. Then verify:

1. Student A submits for A alone; A sees the request in My ODs.
2. A submits for B and C; A sees it under Requests Submitted By Me, B/C see it under My ODs, and unrelated D cannot query it.
3. Assigned faculty approval moves the whole request to `PENDING_HOD`; faculty rejection requires a reason and retains the request.
4. HOD approval sets `APPROVED`, visible in authorized approved lists; HOD rejection requires a reason and retains the request.
5. Manipulated student status writes fail; an unassigned faculty action and faculty HOD decision fail; a student cannot read unrelated OD/attendance records.
6. A non-SRMIST Google account and an unconfirmed college email cannot enter the protected portal.
7. Authorized faculty records Present/Absent once per request/student; the student sees only their own attendance.

There are no production test credentials in the repository. Do not share or commit test passwords; create disposable Auth users in a staging project and assign staff roles only through the trusted admin process.

## Vercel deployment

1. Import the repository into Vercel and select the Next.js framework preset.
2. Add the live Supabase URL and anon key, `NEXT_PUBLIC_APP_URL`, `ALLOWED_EMAIL_DOMAIN`, `ENABLE_DEMO_AUTH=false`, `COLLEGE_NAME`, and `COLLEGE_DEPARTMENT` to the Production environment. Add `SUPABASE_SERVICE_ROLE_KEY` only if a separately reviewed server-side provisioning job requires it. Do not add it to any `NEXT_PUBLIC_*` variable.
3. Deploy a Preview build first. Configure Supabase Site URL/redirect URLs and Google OAuth origins/redirect URI for the Preview domain if testing OAuth there.
4. Verify the production build, then set Supabase Site URL, OAuth authorized origin, and `/auth/callback` redirect URL to the final production domain.
5. Deploy to Production and test each role with dedicated authorized test accounts. Check unauthorized direct URLs and data boundaries before inviting students.

## Production readiness checklist

- [ ] Supabase project created and all migrations applied in order
- [ ] Google provider, client credentials, production origin, and callback configured
- [ ] `ENABLE_DEMO_AUTH=false`; exact college email domain configured
- [ ] First admin bootstrap and approved profile provisioning completed
- [ ] ECE department, active academic year, limits, and workflow settings configured
- [ ] RLS and direct unauthorized workflow attempts tested using separate real accounts
- [ ] Special-permission approver policy agreed and configured
- [ ] Email provider integration and templates implemented and tested, if required
- [ ] Notification unread/mark-read UI implemented
- [ ] Server-side consolidation filters, pagination, and PDF authorization verified
- [ ] Admin user/department/academic-year/limits configuration implemented
- [ ] Official college logo added and PDF print layout reviewed
- [ ] Integration and end-to-end tests run against a non-production Supabase project
- [ ] Vercel environment variables and OAuth callbacks verified on production domain

## Known limitations

This implementation still needs a staged Supabase deployment and security acceptance before production. Admin management is a dashboard summary only; staff profile provisioning, department/academic-year/limit settings, and admin UI have not been built. Email delivery is not wired. Realtime updates are not enabled. Consolidation is client-filtered, limited to 200 loaded rows, and lacks server pagination/full filters. Legacy special permission/period flows are not integrated with parent requests. No live Supabase credentials or local PostgreSQL/Supabase CLI were available, so migrations, RLS, OAuth, and database workflow functions were not executed against PostgreSQL. Full security and E2E test suites remain required.


