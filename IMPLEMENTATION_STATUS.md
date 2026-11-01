# TESSRA CIT implementation status

## Source-delivery state

The full TESSRA product foundation has been converted to one CIT operational dataset in the separate `TESSRA-CIT` repository. The frozen original project remains untouched.

### Implemented

- Canonical CIT archive, extracted starter pack, engine, untouched validator, and clean exports preserved
- CIT-only branding, source-derived operational profiles, and four documented sign-in identities
- Relational import for 27 rooms, 40 faculty, 14 groups, 62 courses, 189 offerings/sessions, 25 booking requests, and 41 exams
- Source IDs, exact requester name/role, raw booking metadata, room uses/features, faculty/room constraints, expected attendance, accessibility, and elective baskets retained
- Source-aware generation, validation, manual edits, alternatives, and disruptions
- Faculty daily limits and synchronized basket validation
- Multi-course/multi-room exam editing and half-capacity validation
- Atomic CIT baseline restore preserving identities and auth sessions
- Fresh-install Drizzle migration chain and generated bootstrap SQL
- English/Hinglish booking assistance mapped to CIT feature codes and event-enabled rooms
- Accurate setup, testing, architecture, deployment, and audit documentation

### Latest verification

- TypeScript unit tests: 47 passed
- Python engine tests: 33 passed
- Typecheck: passed
- ESLint: passed
- Next.js production build: passed
- Production dependency audit: 0 vulnerabilities
- Official baseline: hard 0, soft 3, booking 65.5/70, exam penalty 0
- Official sample repair: hard 0, soft 3, 8 proved moves
- Fresh schema: 28 tables and 135 statements executed successfully
- Seed/restore smoke: 189 sessions, 25 bookings, 41 exams restored transactionally

## Baseline metrics

- Timetable placements: 189/189
- Teaching periods represented: 243
- Official hard violations: 0
- Official soft penalty: 3
- Booking score: 65.5/70
- Official examination soft penalty: 0

## Explicit date adapters

The challenge data uses abstract weekdays rather than ISO dates. Operational booking dates map source Week 7 to the week beginning `2027-02-15`; examination weekdays map to the week beginning `2027-02-22`. Canonical source weekdays, windows, and exam sessions remain stored alongside those dates.

## Infrastructure deliberately pending

No hosted CIT database or Vercel project is configured during source delivery. After the validated commit is pushed, the next phase is to create separate CIT-only infrastructure, configure newly rotated credentials, and run the authenticated browser/production smoke matrix.
