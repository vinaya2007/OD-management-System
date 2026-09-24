# ECE Online OD Management System

Next.js App Router application for managing ECE On-Duty applications. It has a demo mode and a Supabase-backed mode. Demo mode is development-only; production mode uses Google OAuth, profile records, PostgreSQL workflow functions, and RLS.

## Architecture

- `app/`: route pages, callback/signout handlers, protected server actions, and `/api/portal` data loading.
- `components/`: responsive client portal, OD workflows, and dashboards.
- `lib/`: auth helpers, input validation, business rules, Supabase clients, email abstraction, and PDF generation.
- `supabase/migrations/`: ordered schema and production workflow migrations.
- `supabase/seed/seed.sql`: development fixture data; do not run it against production.

Portal reads use the authenticated Supabase SSR client and RLS. OD writes use PostgreSQL RPC functions so the database checks role, ownership, assignment, status, limits, and periods. `profiles.role` is the authority; browser storage is only used for the explicitly enabled demo mode.

## OD workflow

Students submit an OD with 1–3 active faculty approvers and date/period selections. The database checks the date range, periods 1–7, faculty assignment eligibility, approved-OD limits, idempotency, and overlapping requests. Assigned faculty approve, request correction, or reject. Once all assigned faculty approve, the application enters HOD review. HOD approval checks faculty completion and blocks special ODs until special permission is approved. Students can withdraw eligible in-review requests and replace a pending faculty assignment.

Special permission is an exception to the approved-OD limit; it does not replace faculty or HOD review. The SQL workflow requires an authorized same-department HOD/admin decision. Configure a narrower named approver policy before production if college governance requires one.

## Authentication and profile provisioning

Production authentication uses Supabase Auth Google OAuth. The callback checks the exact configured email domain and then looks for an active `profiles.auth_user_id` link. Missing/inactive profiles receive an account setup message and are never assigned a default role.

Provision users through the Supabase Dashboard or an approved identity import process:

1. Invite/create the user in Supabase Auth with the college email address.
2. Create a profile through the trusted admin provisioning process, using that Auth user's UUID as `auth_user_id` and the approved role/department/class details.
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
6. Apply migrations in filename order using the Supabase CLI (`supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`) or the SQL editor. Do not manually recreate the tables. The schema includes RLS policies and workflow RPC functions.
7. For development only, run `supabase/seed/seed.sql` after migrations. Review the seed before running it; never seed production.
8. Create/link authorized Auth users and profiles using the trusted provisioning workflow above. Create the ECE department, active academic year, category limits, and workflow settings.
9. Confirm RLS is enabled on every application table and test with separate student, faculty, HOD, and admin accounts. Verify cross-student reads, unassigned faculty decisions, cross-department access, special permission decisions, and withdrawal.
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

## Notifications, email, and PDF

Database workflow functions persist in-app notifications for submitted ODs, faculty assignment/decision, special permission decisions, and HOD decisions. The portal can read a user's notifications. Unread counts and mark-read actions are not complete. Email is an abstraction only and is not called by workflow actions; setting email variables alone does not enable delivery.

Consolidation currently filters the portal's loaded (up to 100) RLS-visible applications in the browser. It is not paginated or a server-side filtered query and does not yet expose all requested filters. The PDF uses those real loaded records and configured college/department names, but the logo remains a placeholder and PDF filtering inherits the current page filters. Do not treat this consolidation as a complete official register until server-side pagination/filtering and department/year scoping are implemented and verified.

## Commands and verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Unit tests cover period validation, overlap behavior, approved-only limit counts, and pending-only faculty replacement. Integration/security tests against a real Supabase instance and full end-to-end workflow tests are not included. A passing local build does not verify project credentials, OAuth, deployed RLS, database migrations, or email delivery.

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

This repository is not yet production-ready. Admin management is a dashboard summary only; profile provisioning, department/academic-year/limit settings, and special-approver configuration have no complete admin UI. Email delivery is not wired. Notification read state is not manageable in the UI. Consolidation is client-filtered, limited to 100 loaded rows, and lacks server pagination/full filters. Correction editing/resubmission and special-approver governance need a complete end-to-end audit. No live Supabase credentials were available, so migrations, RLS, OAuth, and database workflow functions were not executed against PostgreSQL. Full security and E2E test suites are still required.
