# TESSRA CIT — Testing

Validation date: **2026-11-01 (Asia/Kolkata)**.

This document records checks executed against this CIT repository. It does not reuse deployment claims from the frozen original TESSRA project.

## Automated application checks

```bash
npm run test:unit
# 47 passed, 0 failed

npm run typecheck
# passed

npm run lint
# passed

npm audit --omit=dev
# 0 vulnerabilities
```

The 47 TypeScript tests cover:

- 25 English/Hinglish booking-parser and adversarial-input cases;
- 3 calendar, lunch, and lab-block rules;
- 3 CIT operational tests covering the complete source timetable, targeted room eligibility, targeted faculty daily limits, elective-basket synchronization, regeneration, and multi-room half-capacity examinations;
- 3 placement-explanation tests;
- 3 LLM boundary/sanitization tests;
- 3 role-navigation tests; and
- 7 official disruption/workflow tests.

## Python scheduling engine

```bash
python3 -m pytest engine/tests -q
# 33 passed
```

The Python suite covers official H1–H14 hard constraints, S1–S6 soft penalties, booking priority/caps/cancellations, examinations, disruption semantics, minimum-move proof behavior, service boundaries, and official end-to-end solve/validate flows.

The private-service validator copy was also compared byte for byte:

```text
engine/official_validator.py == official/starterpack/CrunchWeek_StarterPack/validator.py
SHA-256 f02733b382fa111e89cd6bb261e185ae57da6e41795f094b96cab1575d6ee144
```

## Official organiser validator

Baseline command:

```bash
python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
  --schedule exports/schedule.json \
  --json exports/report.json
```

Result:

```text
Hard violations: 0
Soft penalty: 3 (S1 0, S2 0, S3 0, S4 3, S5 0, S6 0)
Bookings: 65.5/70 — 21 approved, 2 alternatives, 2 rejected
Priority inversions: 0
Exam soft penalty: 0
```

Sample disruption command:

```bash
python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
  --schedule exports/schedule_after.json \
  --disruption official/starterpack/CrunchWeek_StarterPack/examples/sample_disruption.json \
  --baseline exports/schedule.json \
  --json exports/report_after.json
```

Result:

```text
Hard violations: 0
Soft penalty: 3
Stability: 8 sessions moved (2 time changes, 6 room-only changes)
```

## Database checks

The complete migration chain (`0000`–`0003`) was executed from scratch under `pg-mem`:

```text
fresh-schema-ok
28 public tables
135 SQL statements
```

A temporary integration harness then ran `seedCit()` and `restoreCitOperationalData()` transactionally against that schema. It was removed after the check.

```json
{"rooms":27,"users":56,"student_groups":14,"courses":62,"offerings":189,"scheduled_sessions":189,"bookings":25,"exams":41,"official_runs":1}
{"sessions":189,"bookings":25,"exams":41}
```

This verifies that initial import and atomic restore both retain the complete CIT operational baseline. The 56 users comprise 40 source faculty plus source-derived requester/role profiles; only four are published sign-in accounts.

## Production build

```bash
npm run build
# Next.js 16.4.3 production build passed; all routes compiled
```

A syntactically valid dummy `DATABASE_URL` was supplied for compile-time configuration only. Node 20 emitted the upstream Supabase deprecation warning; the repository declares Node 22+ for deployment.

## Review status

- Source review, migration review, diff whitespace check, legacy-identity scan, and secret-pattern scan: passed.
- No real hosted database or CIT Vercel project was used during this phase, by design.
- Authenticated browser and production-route smoke tests remain part of the separate infrastructure phase after the application commit is pushed.
- Supabase RLS tests and concurrent load testing require that hosted environment.
