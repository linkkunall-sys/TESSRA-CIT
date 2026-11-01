# TESSRA — Supabase Implementation Plan

## Phase 1: Audit ✅ COMPLETE
- Audited full codebase: Next.js 16 App Router, Drizzle ORM, PostgreSQL, CP-SAT engine
- Identified all pages, components, routes, auth flows
- Supabase packages installed but not configured (env vars empty)
- Custom session auth was the original mechanism

## Phase 2: Supabase Infrastructure ✅ COMPLETE
- Created `src/lib/supabase/server.ts` with graceful fallback when env vars missing
- Created `src/lib/supabase/client.ts` with graceful fallback
- Updated `src/middleware.ts` to skip Supabase when not configured
- Updated `src/db/index.ts` with `getSupabaseAdmin()`
- Schema: added `approval_status` to users, created `access_requests`, `booking_priorities` tables
- DB migrated via psql

## Phase 3: Supabase Authentication ✅ COMPLETE (dual-mode)
- `src/lib/auth.ts`: Supabase Auth when configured, custom sessions when not
- `src/app/api/auth/login/route.ts`: Supabase signInWithPassword + custom fallback
- `src/app/api/auth/session/route.ts`: Supabase getUser + custom fallback
- Approval status checked on login; pending/rejected accounts blocked

## Phase 4: Access Requests & Account Approval — IN PROGRESS
- Need: Public request access page + form
- Need: API route to create access requests
- Need: Admin dashboard to review/approve/reject access requests
- Need: Coordinator user requests linked to department
- Need: Approved users get Supabase Auth accounts created

## Phase 5: Four-Role Authorization & RLS — PENDING
- Need: Supabase RLS policy SQL migration files
- Need: Self-approval prevention enforced at backend level
- Need: Department-level data isolation

## Phase 6: Connect Existing Features — MOSTLY COMPLETE
- All server actions already use Drizzle + requireRole
- Bookings, change requests, disruptions, timetables all working

## Phase 7: Notifications & Audit Logs ✅ EXISTING
- Already implemented in actions.ts and schema

## Phase 8: Timetable & Booking Logic ✅ EXISTING
- CP-SAT engine, validator, booking analyzer all implemented

## Phase 9: Demo Accounts — PARTIAL
- Seed.ts creates Supabase Auth users when configured
- Demo accounts: admin@westbrook.edu, coordinator.cse@westbrook.edu, ananya.rao@westbrook.edu, robotics@westbrook.edu
- Password: tessra123

## Phase 10: Testing — PENDING
- Test all workflows end-to-end

## Phase 11: Documentation — PENDING
- Update .env.example, README, deployment docs