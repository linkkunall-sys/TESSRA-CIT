# TESSRA CIT — Architecture

## System shape

```text
Next.js App Router (TypeScript strict)
├─ Admin / Coordinator / Faculty / Club role workspaces
├─ Server Components + typed query layer
├─ Server Actions and route handlers with server-side role guards
├─ Local HttpOnly sessions, with optional linked Supabase Auth
├─ PostgreSQL via Drizzle ORM
│  ├─ CIT operational reference data
│  ├─ versioned timetable and constraints
│  ├─ bookings, examinations, approvals, coursework, and audit
│  └─ official_runs JSON exports/reports
└─ Official pipeline
   ├─ local Python subprocess, or private ENGINE_URL service
   ├─ OR-Tools CP-SAT solver (engine/core.py)
   └─ byte-identical organiser validator
```

## Application layers

- **UI:** `src/app` and `src/components`; responsive role shells, timetable views, forms, and dialogs.
- **Application:** Server Actions and route handlers. Mutations start with `requireRole(...)` or `requireUser()` and revalidate affected views.
- **Operational domain:** `src/lib/engine.ts`, `scheduler.ts`, `queries.ts`, and `actions.ts` operate directly on the imported CIT relational data.
- **Source import:** `src/lib/seed.ts` imports the canonical starter pack and committed exports, and provides an atomic operational-baseline restore.
- **Official domain:** `src/lib/official.ts`, `official-dataset.ts`, `official-actions.ts`, and `official-disruption.ts` validate, version, solve, and repair organiser datasets without replacing the relational role product.
- **Scheduling service:** `engine/` is a standalone CLI/FastAPI service. It receives only dataset/baseline/change payloads and never connects to the application database.

## One CIT data world

The former compact demonstration fixtures are not seeded. The role workspaces use the supplied CIT source records:

- source IDs are retained on users, rooms, groups, courses, offerings, bookings, exams, and scheduled sessions;
- each source offering stores expected attendance, basket metadata, accessibility, and its exact eligible room IDs;
- faculty daily limits, hard blocks, soft preferences, and room blocks flow into generation, validation, manual moves, and disruption alternatives;
- source booking requester name and role are retained independently of the authentication profile used to operate the request;
- multi-course and multi-room examinations remain intact.

The official workbench defaults to the same canonical JSON but also accepts strict organiser-format uploads. Uploaded data remains isolated from operational tables and is stored as immutable per-run JSONB metadata with file name, SHA-256, loader and timestamp provenance.

## Database lifecycle

`ensureSeeded()` uses transaction-scoped PostgreSQL advisory locking for concurrent first requests. A missing schema is bootstrapped from the committed migration chain; an empty `users` table is populated transactionally. Existing populated databases are never silently overwritten.

The Admin baseline restore is also transactional. It preserves user identities, hosted-auth links, and active auth sessions while replacing mutable workflows, timetable versions, source constraints, bookings, examinations, and official runs. Any missing source reference rolls back the whole restore.

## Security model

- Random session tokens are stored in `auth_sessions`; cookies are HttpOnly and use secure cross-site attributes on HTTPS.
- Every protected page, mutation, and export performs a server-side role check.
- Login rejects cross-site POSTs; inputs are parsed and validated at the server boundary.
- LLM output can propose intent only. Deterministic scheduling and booking checks remain authoritative.
- Secrets are read only from environment variables; no database, Supabase, engine, GitHub, or deployment credential belongs in the repository.
- Supabase service-role access is server-only. When hosted Auth is configured, only the four published sign-in identities are created automatically; the remaining source faculty stay operational profiles.

## Official dataset and repair lifecycle

1. Validate an optional base-dataset upload before solver execution: strict root/nested fields, bounds, unique IDs and cross-references.
2. Pass that exact parsed snapshot to both CP-SAT and the untouched organiser validator, then store the run, snapshot and SHA-256 provenance in `official_runs`.
3. Validate uploaded disruption JSON against the baseline run’s snapshot, including nested shapes and source references.
4. Run CP-SAT phase one to minimize and prove the baseline movement count.
5. Fix that minimum and optimize official S1–S6 penalties.
6. Run the untouched organiser validator against the same snapshot.
7. Store the proposal and exact diff; require a separate Admin approval or rejection.
8. Block proposal/rejected exports and strip `_dataset`/`_workflow` metadata from organiser report downloads.

## Operational booking governance

- Admin settings expose one complete unique rank for every operational booking category. `booking_priorities` stores the policy; missing rows normalize deterministically to the documented default.
- Pending approvals are ordered by category rank then submission timestamp. A request cannot be approved while a higher-ranked overlapping request for the same venue remains pending; the same rule gates optional auto-approval.
- Coordinators receive a separate queue for pending bookings of labs owned by their department. Ownership, pending status, conflicts, priority, and any suggested alternative are checked again in the server action before write, notification, and audit.

## Deployment boundary

The intended hosted topology is a new CIT-only PostgreSQL/Supabase project plus a new Vercel web/engine project. No hosted CIT infrastructure is configured in the source-delivery phase; see `docs/DEPLOYMENT.md`.
