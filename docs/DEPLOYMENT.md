# TESSRA CIT — Deployment Guide

## Current status

The CIT application is live at **https://tessra-cit.vercel.app** using a separate Vercel project and Neon PostgreSQL database. `GET /api/health` returns `{"ok":true}`, and all four documented demo accounts have passed authenticated route smoke tests.

The frozen original TESSRA database and deployment remain separate and must never be reused by this project.

## Target architecture

`vercel.json` defines two services:

1. `web` — the public Next.js application.
2. `engine` — the private FastAPI/OR-Tools service.

The private service binding supplies `ENGINE_URL` to the web service. `src/lib/official.ts` calls `/solve-validated`, which returns both an official-format schedule and the organiser-validator report. `engine/official_validator.py` is byte-identical to the untouched starter-pack validator.

## Prerequisites

- Node.js 22+
- PostgreSQL (a separate empty CIT database)
- Supabase project if hosted Auth is enabled
- Vercel project with Services support, or equivalent web + private Python hosting

## Database initialization

Create an empty database dedicated to TESSRA CIT. Apply one of these equivalent schema paths:

```bash
psql "$DATABASE_URL" -f supabase_schema_migration.sql
```

or run the committed Drizzle migrations `0000` through `0003` in order.

The SQL chain contains 135 statements and creates 28 public tables. On the first application request, `ensureSeeded()` imports the operational CIT baseline if the `users` table is empty. It creates:

- 27 rooms;
- 40 source faculty plus source-derived requester profiles;
- 14 student groups and 62 courses;
- 189 offerings and 189 published timetable sessions;
- 25 booking requests;
- 41 examinations; and
- one stored official baseline run.

## Environment variables

Configure values from `.env.example`:

- `DATABASE_URL` (required; the live deployment uses Neon)
- `ENGINE_URL` (required for hosted official CP-SAT generation)
- optional `ENGINE_TOKEN`
- optional `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` only when Supabase Auth is intentionally enabled
- optional `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`

Keep database passwords, service-role keys, engine tokens, deploy keys, and Vercel tokens server-only. Never commit `.env.local`.

## Vercel deployment

1. Import `linkkunall-sys/TESSRA-CIT` as a **new** Vercel project.
2. Keep the repository root as the project root.
3. Allow `vercel.json` to create the web and engine services.
4. Attach only a new CIT database. Never reuse the frozen original project's database.
5. Add the environment variables above.
6. Deploy from `main`.
7. Confirm the private engine binding is available to the web service.

If Vercel Services are unavailable, deploy `engine/` separately, protect it with `ENGINE_TOKEN`, and set `ENGINE_URL` to that service.

### Manual GitHub Actions deployment

`.github/workflows/deploy-vercel.yml` is manual-only and does not deploy on push. Before it can run, configure these GitHub Actions secrets:

- `VERCEL_TOKEN` — a newly rotated Vercel token
- `VERCEL_ORG_ID` — the owner/team ID of the dedicated CIT project
- `VERCEL_PROJECT_ID` — the dedicated CIT project ID
- `DATABASE_URL` — a new CIT PostgreSQL database, **not the frozen original Supabase database**

Run **Deploy TESSRA CIT to Vercel** from the repository Actions tab and enter the exact confirmation `DEPLOY-CIT-SEPARATE`. The workflow refuses to continue if the confirmation or any required secret is missing. It runs unit tests, typecheck, lint, and a production build before deployment. It passes only `DATABASE_URL`; it does not read, configure, or modify Supabase credentials.

## Local development

```bash
npm ci
python3 -m pip install -r engine/requirements.txt pytest
cp .env.example .env.local
npm run dev
```

Without `ENGINE_URL`, the Next.js server uses the local Python subprocess fallback. The engine may also be run directly:

```bash
cd engine
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Post-deployment verification

1. `GET /api/health` returns `{"ok":true}`.
2. Confirm first-request seeding completes without a partial import.
3. Sign in with all four accounts documented in `README.md`.
4. Check Admin, Coordinator, Faculty, and Club role boundaries.
5. Use **Restore CIT baseline** and verify 189 sessions, 25 bookings, and 41 exams.
6. Generate an official schedule from `/admin/official` and confirm 0 hard violations.
7. Apply the supplied sample disruption, review the diff, approve it, and download both exports.
8. Independently run the untouched organiser validator on the downloaded files.
9. Exercise login/logout, access requests, password reset, export authorization, and mobile layouts.
10. Rotate any temporary deployment credential used during setup.

## Delivery checklist

- [x] Separate CIT repository
- [x] CIT-only operational seed and identities
- [x] Fresh-install SQL and Drizzle migrations
- [x] Validator-clean baseline and disruption exports
- [x] Automated tests, lint, typecheck, audit, and production build
- [x] Separate hosted CIT database (Neon)
- [x] Separate CIT Vercel project and public production URL
- [x] Database health plus authenticated production smoke for all four roles
- [ ] Live CP-SAT generation and repair interaction smoke test
- [ ] Final walkthrough video/link (submission-owner action)
