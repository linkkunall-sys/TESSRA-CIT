# TESSRA — Data Dictionary

## 1. Official dataset (`official/starterpack/CrunchWeek_StarterPack/data/cit_public.json`)

Verified counts: rooms 27 · faculty 40 · student_groups 14 · courses 62 · sessions 189 (243 weekly hours) · booking_requests 25 (BR-04 cancelled) · exams 41 · room_unavailability 2. `dataset_id: cit-public-v1`.

### calendar
| Field | Meaning |
|---|---|
| days | MON–FRI |
| periods | P1 08:00 … P9 17:00 (teaching, 1 h each); P10–P13 18:00–22:00 events only |
| lunch | after P5, 13:00–14:00; sessions may not span it |
| lab_start_periods | [2, 6] — 3-hour labs run P2–P4 or P6–P8 |
| exam_week | MON–SAT, sessions AM 09:30–11:30 and PM 14:00–16:00 |

### rooms
`id, name, building, type, capacity, features[], accessible, allowed_uses[]`
Types: classroom, lecture_hall, auditorium, seminar_hall, outdoor, lab_cs, lab_elec, lab_phy, workshop, lab_civil. `allowed_uses` gates lecture/tutorial/lab/exam/event. **Exam capacity = capacity // 2.**

### room_unavailability
`room_id, day, periods[], reason` — hard.

### faculty
`id, name, department, max_hours_per_day (hard, 4 in CIT), needs_accessible, unavailable[{day, periods[], reason}] (hard), preferences[{type:"avoid", days[], periods[], note}] (soft S1, 2 pts/hour)`.

### student_groups
`id, name, year, department, size, needs_accessible`.

### courses
Reference only: `lecture_hours, tutorial_hours, lab_blocks` per week. **Sessions are scheduled, not courses.**

### sessions (the schedulable unit)
`id, course_id, kind(lecture|tutorial|lab), groups[] (all must attend), faculty_id (pre-assigned), size, duration, room_types[], needs_accessible, basket_slot, fixed_slot{day,start_period}|null`.
Basket semantics: all sessions sharing `basket_slot` (OEB-1/2/3) run at the same day+period in different rooms; they don't clash with each other for groups, but clash with everything else those groups attend.

### booking_requests (Spectra, Week 7)
`id, submitted_at, requester, role, requested_category, title, attendance, duration_periods, windows[{day,from_period,to_period}], room_types[], needs[] ("accessible" = room must be accessible), requested_room (a wish, may not exist), mandatory_for_groups[], series_id, raw_text`.
`priority_order`: exam > regular_session > institute_event > guest_lecture > department_event > club_event.
`role_category_cap`: admin→institute_event, faculty→guest_lecture, department_coordinator→department_event, club→club_event. Effective category = the lower of request and cap. Ties → earlier `submitted_at`.

### cancellations
`request_id, cancelled_at, by, note` — never approve.

### exams
`id, course_ids[], groups[], size, duration_hours`. Several rooms allowed per exam; a group can't sit two exams in one AM/PM slot (soft: 5 pts per extra exam per group-day).

## 2. Export format (produced by the app into `exports/` and per-run in the DB)

`schedule.json`: `{team, dataset_id, sessions[{session_id, day, start_period, room_id}], fest_week{bookings[{request_id, status, day, start_period, end_period(inclusive), room_id, reason}], session_overrides[{session_id, day, start_period, room_id, displaced_by}]}, exams[{exam_id, day, session, rooms[]}]}` + a non-standard `solver` info block (validator ignores unknown keys).
`schedule_after.json`: same, exams/fest optional, produced with `--disruption --baseline`. Its ignored `solver` block also records `minimum_move_objective: "lexicographic"`, `minimum_moves`, and `minimum_moves_proven`.

## 3. Application database (PostgreSQL via Drizzle, `src/db/schema.ts`)

Operational tables: `settings, departments, clubs, users, auth_sessions, rooms, student_groups, courses, offerings, schedule_versions, scheduled_sessions, availability_blocks, faculty_preferences, room_availability_blocks, change_requests, bookings, exams, disruptions, notifications, audit_logs, assistant_messages, syllabus_units, assignments, course_resources, access_requests, booking_priorities, password_reset_tokens`.

CIT source fidelity is carried by `source_id` fields plus source-specific columns: room source type/allowed uses; user daily limits/accessibility; group accessibility; course year/contact structure; offering expected size/eligible rooms/basket/accessibility; booking source requester/role/windows/raw text; and exam course/room arrays plus abstract source day/session. Authentication email addresses and ISO operational dates are explicit adapters where the starter pack has no corresponding field.

Official pipeline: **`official_runs`**
| Column | Type | Meaning |
|---|---|---|
| id | serial PK | run number |
| kind | text | `schedule` (baseline) or `disruption` (repair) |
| label | text | human label |
| dataset_id | text | selected organiser dataset ID (`cit-public-v1` by default) |
| created_by_id | FK users | Admin who ran it |
| schedule | jsonb | the exact exported schedule.json content |
| report | jsonb | official validator JSON plus internal namespaced `_dataset` snapshot/provenance for uploaded bases and `_workflow` for repairs; both keys are stripped from downloads |
| created_at | timestamptz | |

`_workflow` is never emitted in downloads: the export route strips it from approved reports and blocks proposed/rejected repair exports. This avoids a production schema migration while keeping the organiser JSON clean.

Audit events: `official.generated`, `official.disruption_proposed`, `official.disruption_approved`, and `official.disruption_rejected`, each with the validator headline and source filename where relevant.
