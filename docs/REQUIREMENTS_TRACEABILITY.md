# TESSRA — Requirements Traceability

Sources inspected (downloaded from the links supplied by the team, saved under `official/`):

- **PS** — `Problem-statement.pdf` (6 pages, “Campus Scheduling and Venue Management”, Chilika Institute of Technology)
- **README** — `CrunchWeek_StarterPack/README.md`
- **DATA** — `data/cit_public.json` (+ CSV mirrors), verified counts: 27 rooms, 40 faculty, 14 groups, 62 courses, 189 sessions (243 h), 25 booking requests (1 cancelled), 41 exams
- **VAL** — `validator.py` (513 lines, run unmodified)

Status legend: ✅ done & tested · 🟡 partial (gap described) · ⬜ not built yet.
No official file has been modified. Nothing below claims validator compatibility without an executed run (`docs/TESTING.md` has the evidence).

## A. Core platform capabilities (PS §2)

| ID | Requirement (source) | Implementation | Test / evidence | Status |
|---|---|---|---|---|
| PS-1 | Weekly timetable for every session, no clashes (PS §2.1) | `engine/core.py::solve_timetable` (CP-SAT), deployed through private `/solve-validated`; 189/189 placed | Pytest end-to-end + production Admin reset/generate/download + independent revalidation: 0 hard | ✅ |
| PS-2 | Midsem exams for the following week (PS §2.2) | `engine/core.py::allocate_exams` — AM/PM, half capacity, multi-room | Committed and production-generated schedules: 41/41 exams, hard 0, exam soft 0 | ✅ |
| PS-3 | Plain-English/Hinglish requests → structured booking → user edits → submit (PS §2.3) | `src/lib/booking-parser.ts` + `/api/club/parse-booking` fill the real editable booking form, expose assumptions/follow-ups, understand Romanised-Hindi number words and flexible windows, detect conditions/recurrence/priority abuse/bypass attempts, preserve ordered venue fallbacks, select a compatible conflict-free venue, then reuse `createBookingAction` validation | `npm run test:parser` (17 adversarial cases, including UTC/IST boundary) + production browser flow | ✅ |
| PS-4 | Approve/reject/alternative per Spectra request with reason, official priority (PS §2.4, §4) | `engine/core.py::allocate_bookings` — role caps, priority order, tie by `submitted_at`, cancellations, reasons on every non-approval | VAL: score 65.5/70 (62–65.5 across optimal timetables), 0 priority inversions, reasons present | ✅ |
| PS-5 | Disruptions: minimal moves, show diff, Admin approval, explain infeasibility (PS §2.5) | `/admin/official` accepts and validates organiser-format change JSON; CP-SAT first proves the minimum baseline-move count, then optimizes S1–S6 at that fixed count; exact before/after/added/removed table; proposal → separate Admin approve/reject; export locked until approval; diagnostics from `infeasibility_reasons` | VAL `--disruption --baseline`: 0 hard, soft 3, **8 moved and minimum proven** (2 time, 6 room-only); 33 Python + 44 TypeScript unit tests | ✅ |
| PS-6 | Views by group / faculty / room + approvals, conflicts, utilisation (PS §2.6) | Official: `/admin/official` has group/faculty/room filters, a desktop 9-period grid and phone agenda. Demo workspaces: role dashboards, live room finder and unified Approval Centre | Navigation regression tests + responsive browser matrix | ✅ |
| PS-7 | Faculty AI assistant, strictly validated proposals (PS §2.7) | `/faculty/assistant`: optional OpenAI-compatible/Anthropic JSON intent proposal (`src/lib/llm.ts`), strict sanitisation, deterministic alternative search, placement explanations, submit-time revalidation and coordinator approval; deterministic fallback on provider failure | adversarial intent tests + typecheck/build + production assistant flow | ✅ |
| PS-8 | Explain decisions (why a slot, why rejected) (PS §2.8) | Booking decisions carry reasons; Official report exposes S1–S6; Admin session details and Faculty Assistant distinguish hard-validity facts, fixed constraints, alternative count and the global selection heuristic without claiming a false per-variable proof | explanation unit tests + browser checks + VAL reasons column | ✅ |
| PS-9 | Admin loads dataset/change files, exports schedule.json (PS §2.9) | `/admin/official` fixes the authoritative CIT base dataset, accepts arbitrary organiser-format change JSON, runs engine + validator, and downloads clean `schedule.json` / approved `schedule_after.json`; `exports/` written by the app | Sample plus all five change types, malformed/unknown/wrong-dataset tests; proposal export returns 409 | 🟡 (change upload complete; replacement base-dataset upload intentionally not exposed) |
| PS-10 | Manual scheduling by authorized roles, hard constraints enforced (PS §2.10) | Demo workspace: full admin editor (drag-drop moves, add class for any teacher, edit/pin/remove) + faculty extra-class requests in free slots approved by the admin — every change validated server-side (`validateDraftSession`, `checkSessionMove`, `findFreeRoom`). Official CIT grid is read-only | Live action tests: add/move/delete/clash-rejection/extra-class approval incl. admin-only guard; browser tests of editor + free-slot picker | ✅ (demo) / 🟡 (CIT grid) |

## B. Hard constraints (PS §3, VAL rules)

All modelled in `engine/core.py::solve_timetable` and independently re-checked by `check_assignment` and the official validator.

| Rule | Constraint | Model | Unit test |
|---|---|---|---|
| H1 | every session exactly once, valid ids | `AddExactlyOne` per session | end-to-end (189 placed) |
| H2 | faculty no clash | `AddAtMostOne` per (fac,day,period) | `test_h2_faculty_no_clash` |
| H3 | group no clash; baskets exempt within slot | occupancy with basket representative | `test_h3…`, `test_h11…` |
| H4 | room no double booking | `AddAtMostOne` per (room,day,period) | `test_h4…` |
| H5 | capacity (halved for exams) | room filter; exam allocator uses `cap//2` | `test_h5…`, `test_exams_half_capacity…` |
| H6 | room type + allowed_uses | room filter | `test_h5_capacity_and_h6_type…` |
| H7 | faculty unavailability | slot filter | `test_h7…` |
| H8 | room unavailability | combo filter | `test_h8…` |
| H9 | no lunch span; labs P2–P4 / P6–P8 only | slot filter | `test_h9_lab_starts_and_lunch` |
| H10 | accessible rooms where needed | room filter | `test_h5…h10…` |
| H11 | basket slot same day+period, different rooms | shared time booleans | `test_h11_basket…` |
| H12 | faculty daily hour limit | per (fac,day) sum ≤ limit | `test_h12_daily_limit` |
| H13 | approved booking clashes nothing | allocator checks week timetable + bookings + mandatory groups | `test_booking_must_respect…`; VAL 0 |
| H14 | fixed slots stay | slot filter | `test_h14_fixed_slot_stays` |

## C. Soft constraints (official weights, objective = validator score)

| Rule | Penalty | Model |
|---|---|---|
| S1 | 2/h in avoided day+period | cost on assignment vars |
| S2 | 1 per group gap (lunch not a period) | before/after/gap booleans per group-day |
| S3 | 3 per hour beyond 6/day | overflow IntVar |
| S4 | 3 per repeat course/day (incl. baskets) | count−1 overflow |
| S5 | 1 if size/capacity < 40% | room-choice cost |
| S6 | 1 per P9 hour | assignment cost |

Latest official run: **S1 0 · S2 0 · S3 0 · S4 3 · S5 0 · S6 0 → total 3** (optimal).

## D. Roles & priority (PS §4)

| ID | Requirement | Implementation | Status |
|---|---|---|---|
| R-1 | Exactly 4 roles | demo workspaces + `role_category_cap` in engine | ✅ |
| R-2 | Nobody approves their own request | demo: reviewer ≠ requester enforced server-side for bookings/changes. Official allocator is a batch Admin action | 🟡 (self-approval check not applicable to batch, documented) |
| R-3 | Priority: exams > classes > institute > guest > department > club; ties by submission | `allocate_bookings` sorts by effective category then `submitted_at`; classes occupy rooms before bookings; only institute events displace classes via `session_overrides` | ✅ (VAL inversions 0) |
| R-4 | Role category caps | `effective_category` mirrors validator | ✅ `test_booking_priority_cap_and_tiebreak` |
| R-5 | Cancelled never approved | allocator rejects with reason | ✅ `test_booking_cancelled_never_approved` |
| R-6 | Admin can change priority order | not built (order read from dataset) | ⬜ |
| R-7 | Coordinator approves own department's labs | demo workspace has department-scoped approvals; CIT-specific lab approval routing not built | 🟡 |

## E. Implementation rules & judging (PS §6–§8)

| ID | Requirement | Status |
|---|---|---|
| J-1 | AI_USAGE.md declaring all AI use | ✅ `AI_USAGE.md` |
| J-2 | LLM never decides validity; deterministic checks | ✅ validator + `check_assignment`; assistant proposals re-validated |
| J-3 | Manual booking form works without any LLM | ✅ no LLM dependency anywhere by default |
| J-4 | exports/schedule.json + schedule_after.json produced by the app | ✅ generated by `engine/solve.py`; validator reports: 0 hard / soft 3, repair 8 moves; repair metadata records a proven lexicographic lower bound of 8 |
| J-5 | Public repo, live link, demo accounts in README, video | 🟡 public repo, live Vercel link and all four accounts documented/verified; video link remains a submission-owner action |

## F. Usability, dashboards & interface quality (rubric §8)

| Judge-facing goal | Implementation | Regression evidence | Status |
|---|---|---|---|
| Find a suitable room quickly | Admin **Live room finder** combines capacity/type/status/text with date and time, checks the live timetable, exams and approved bookings, and sorts free rooms first with an explicit reason for busy rooms | Server-rendered through `buildBookingAnalyzer`; laptop + phone browser journey | ✅ |
| Locate and understand a timetable | Admin Quick start links to the always-present published week; group/faculty/room switchers remain available. Official CIT output uses the full grid on laptop and a readable day agenda on phone | Navigation route tests; responsive browser journey | ✅ |
| Find and approve a pending change | Approval Centre is linked in Admin and Coordinator navigation. A clean queue can prepare one real conflict-free request; the same validation and audited approve/reject path is used (no fake result) | Server action + authenticated browser journey | ✅ |
| Action-oriented dashboards | Admin opens with three numbered common workflows, pending counts, scheduling health, availability, utilisation and directly linked next actions rather than static charts | Authenticated role/browser audit | ✅ |
| Fast global navigation | Role-aware command palette on `Ctrl/⌘ K` or `/`, searchable by task intent; all destinations are generated from the same role navigation source | `src/lib/nav.test.ts` verifies every destination exists and key judge tasks remain exposed | ✅ |
| Responsive and accessible interaction | Mobile navigation, phone agenda, responsive cards/tables, focus-visible states, labelled controls, live status copy and modal confirmation for destructive decisions | 390×844 + 1440×1000 browser matrix; typecheck/lint/build | ✅ |
| Evaluator onboarding | README starts with live URL, one-click demo roles and a numbered three-minute path covering room, timetable and approval workflows | README review | ✅ |

## G. Known gaps (honest list)

1. **Separate datasets, one teaching calendar.** The four role workspaces use compact “Westbrook” entities for interactive CRUD demonstrations, while `/admin/official` + `engine/` use the full CIT pack. Both now present the prescribed Monday–Friday P1–P9 one-hour teaching day and 13:00–14:00 lunch; event-only P10–P13 remain confined to bookings.
2. **Replacement base-dataset upload** (PS-9) — arbitrary organiser-format disruption upload is complete; the grading base remains intentionally pinned to the untouched official CIT pack.
3. **Manual edits on the CIT grid** (PS-10) — the CIT grid is read-only; manual edits in the demo workspace are checked server-side.
4. **Bounded solve time** — production CP-SAT runs in the private Python service and are always hard-valid when returned, but a run that reaches its time limit may be feasible rather than soft-optimal.
