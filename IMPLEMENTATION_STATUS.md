# TESSRA — Implementation Status

Last verified: production build and all automated checks pass; both official exports pass the unmodified organiser validator.

## Verified end-to-end

### Official Crunch Week pipeline

- OR-Tools CP-SAT model for H1–H14 and the exact S1–S6 weights.
- Elective baskets, fixed slots, faculty/day limits, P1–P9 teaching, lunch and lab-start rules.
- Priority-ordered Spectra booking allocation with role caps, submission-time tiebreak, cancellations, mandatory groups, alternatives and reasons.
- AM/PM exam allocation with half capacity, multiple rooms and group-clash prevention.
- Disruption repair that retains every legal baseline placement and penalizes discretionary moves.
- FastAPI service (`engine/app.py`) plus local CLI (`engine/solve.py`). Production deploys it as a private Vercel Python Service; the live Admin generation path has produced 189/189 sessions, 41/41 exams and an official-validator report with 0 hard violations.

Current official evidence:

| Artifact | Sessions | Hard | Soft | Other result |
|---|---:|---:|---:|---|
| `exports/schedule.json` | 189/189 | 0 | 3 | 41/41 exams; bookings 65.5/70; 0 priority inversions |
| `exports/schedule_after.json` | 190/190 | 0 | 3 | 8 moved: 2 time changes, 6 room-only |

See `docs/CONSTRAINT_VERIFICATION.md` and `exports/report*.json`.

### Plain-language venue booking

- English/Hinglish input is available in the real Club and Coordinator booking form.
- Extracts dates/weekdays, AM/PM ranges, `kal`, `shaam`, `baje`, `ghante`, attendance, room types/codes, equipment, accessibility and event category.
- Vague times become visible assumptions; missing essentials become follow-up prompts; recurring text is never silently converted into a series.
- The draft stays editable. Role/category ceilings cannot be raised by prompt text or a tampered field.
- Compatible and conflict-free venues are proposed; submission repeats all deterministic checks.
- Computer/electronics labs are available to clubs but still require approval.

### Faculty AI assistant

- Optional OpenAI-compatible or Anthropic JSON intent proposal.
- Strict schema/range sanitisation and deterministic fallback when no provider is configured or a call fails.
- Live timetable lookup and deterministic alternative search.
- Submit-time validation plus coordinator approval before any timetable change.
- The LLM has no database tool and never decides validity.

### Admin reset

- A visible **Reset demo data** action is on `/admin` and Settings.
- Clears mutable requests, bookings, runs, messages, notifications and coursework changes.
- Preserves all accounts, auth sessions, departments, clubs, rooms, courses, groups, offerings and exams.
- Restores policy, room and faculty-availability defaults.
- Generates a complete replacement timetable before deleting the old one; refuses replacement if any session is unplaced.

### Role workspaces

- Admin: dashboard, scheduling editor, approvals, bookings, exams, venues, disruptions, official CIT pipeline, audit, account management and reset.
- Coordinator: department schedule, faculty, approvals, resources and event requests.
- Faculty: timetable, availability, natural-language assistant, requests and coursework.
- Club: venue discovery, English/Hinglish request intake, bookings, history and notifications.
- Supabase Auth in production with a custom-session fallback for local PostgreSQL setups.
- Server-side role checks on protected pages, route handlers and server actions.

## Automated checks

```text
python -m pytest engine/tests -q   31 passed
npm run test:parser                7 passed
npm run typecheck                  0 errors
npm run lint                       0 problems
npm run build                      success
npm audit --omit=dev               0 production vulnerabilities
```

## Known limitations

1. The role workspaces use a compact Westbrook demo dataset; the complete official CIT world is the dedicated `/admin/official` pipeline.
2. The UI loads the committed official dataset and sample disruption rather than accepting arbitrary replacement JSON uploads.
3. The full CIT timetable grid is read-only; manual edits are supported and validated in the demo scheduling workspace.
4. Booking and conflict explanations exist, but there is no full CP-SAT proof explanation for every individual class placement.
5. CP-SAT solve quality can vary when a production run reaches its time limit; the committed optimal export remains the reproducible scoring artifact.

## Repository map

```text
engine/          CP-SAT engine, CLI, FastAPI wrapper and pytest suite
official/        untouched organiser starter pack and extracted problem statement
exports/         validated schedule, repair and reports
src/app/         Next.js App Router, four role workspaces, APIs and auth
src/lib/         parser, optional LLM layer, validation, actions and data access
src/db/          Drizzle schema and bootstrap SQL
docs/            architecture, deployment, constraints, traceability and testing
AI_USAGE.md      complete runtime/build-time AI declaration
THIRD_PARTY.md   third-party libraries, solvers and hosted services
```
