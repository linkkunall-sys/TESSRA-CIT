# TESSRA CIT — Delivery Audit

Audit date: **2026-11-01 (Asia/Kolkata)**.

This audit covers the separate CIT repository and distinguishes completed source delivery from the intentionally pending hosted-infrastructure phase.

## Source provenance

- Canonical archive: `source/CrunchWeek_StarterPack-1.zip`
- Archive SHA-256: `7e68a8170c5ca0c0aaaa8c3096d90c02d2224d1d7b6688fbda7c6c0a12a45997`
- Canonical JSON: `official/starterpack/CrunchWeek_StarterPack/data/cit_public.json`
- Untouched organiser validator: `official/starterpack/CrunchWeek_StarterPack/validator.py`
- Validator SHA-256: `f02733b382fa111e89cd6bb261e185ae57da6e41795f094b96cab1575d6ee144`
- Engine copy comparison: byte-identical

Verified source counts:

| Entity | Count |
|---|---:|
| Rooms | 27 |
| Room-unavailability records | 2 |
| Faculty | 40 |
| Student groups | 14 |
| Courses | 62 |
| Sessions | 189 |
| Teaching periods | 243 |
| Booking requests | 25 |
| Cancellations | 1 |
| Examinations | 41 |

## Operational conversion audit

The source data powers the normal role workspaces rather than living only on the official benchmark page.

- Source IDs are stored on users, rooms, groups, courses, offerings, sessions, bookings, and exams.
- Faculty daily limits, accessibility, hard unavailability, and soft preferences are imported.
- Room source types, features, accessibility, allowed uses, and period blocks are imported.
- Each source session stores expected attendance, basket slot, and exact room eligibility.
- Booking windows, mandatory groups, requested room/types, raw wording, source requester name, and source role are retained.
- “Office of the Dean of Academics” has a distinct source-derived coordinator profile and is not conflated with faculty F37.
- Exams retain every course and room in their source allocation.
- Weekday-only source fields retain their original metadata while deterministic ISO adapters support role workflows.

A transaction-level seed/restore smoke test produced:

```text
27 rooms
56 operational users (40 faculty + source-derived requesters)
14 groups
62 courses
189 offerings
189 scheduled sessions
25 bookings
41 exams
1 official run
```

Atomic restore returned exactly 189 sessions, 25 bookings, and 41 exams while preserving identities and auth sessions.

## Constraint audit

The operational scheduler enforces:

- P1–P9 teaching bounds, lunch, and P2/P6 three-hour labs;
- faculty/group/room clashes;
- faculty and room hard blocks;
- faculty daily limits;
- capacity and accessibility;
- source room eligibility and allowed use;
- synchronized elective baskets; and
- multi-room half-capacity examinations.

Manual moves and alternatives use the same engine state. New manual assignments infer room eligibility from use, attendance, accessibility, faculty, and groups. Booking creation restricts users to event-enabled venues and maps human facility labels to CIT source feature codes.

## Official objective results

| Export | Hard | Soft | Other result |
|---|---:|---:|---|
| `exports/schedule.json` | **0** | **3** | bookings 65.5/70; 21 approved, 2 alternatives, 2 rejected; 0 inversions; exam soft 0 |
| `exports/schedule_after.json` | **0** | **3** | 8 moved: 2 time changes, 6 room-only |

Artifact fingerprints:

```text
ccb344cf1e8d1c3e992c07828e8649031e4c2357d5e9923fd469f7c7eb32268b  exports/schedule.json
eecb64b67d376ab0e78ce704feac0bbaf64cdef273060db50ac866da39701943  exports/schedule_after.json
b6ccc02574efb301e211d5a0cf15fabe58dab98a5df2352f36ebd64a59722a52  exports/report.json
1be2a0efec75e0ec7bdeb1228a39697977cde79c554bfa698d2545f06a127bb2  exports/report_after.json
```

## Automated verification

- Python engine: **33 passed**
- TypeScript: **47 passed**
- TypeScript compiler: passed
- ESLint: passed
- Next.js production build: passed
- Production dependency audit: 0 vulnerabilities
- Fresh schema: 28 tables, 135 statements, passed under `pg-mem`
- Drizzle migration snapshot check: passed
- Secret-pattern and legacy-institution scan: no product credential or legacy fixture found; only documented dummy `.env.example` values

See `docs/TESTING.md` for commands and exact outputs.

## Repository separation

- `/home/user/tessra` remained clean at frozen commit `2845849` during CIT work.
- This repository uses its own remote, deploy key, source archive, migrations, and future infrastructure.
- No credential posted in chat was copied into the workspace or Git history.

## Remaining delivery steps

1. Commit and push the validated application to `linkkunall-sys/TESSRA-CIT`.
2. Create a separate CIT database and Vercel project.
3. Configure newly rotated credentials only in hosted environment variables.
4. Run authenticated desktop/mobile browser smoke tests against that deployment.
5. Add the final live URL and walkthrough link if required.

No live-CIT or browser-production claim is made before those steps occur.
