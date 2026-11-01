# TESSRA — Testing

All commands below were executed in the sandbox; headline results are recorded. Re-run them any time.

## 1. Scheduling engine (pytest)
```
python3 -m pytest engine/tests -q
→ 33 passed
```
Covers: H1 missing/unknown sessions; H2/H3/H4 clashes; H5 capacity; H6 room type; H7 faculty unavailability; H8 room unavailability; H9 lab starts + lunch; H10 accessibility; H11 baskets; H12 daily limits; H13 booking clashes/mandatory groups; H14 fixed slots; individual S1–S6 objective weights; infeasibility explanations; booking role caps, tiebreaks, cancellations and rejection reasons; exam half-capacity/multi-room/group clashes; disruption semantics; **lexicographic proof that optional moves cannot improve soft quality**; the validated FastAPI response boundary; byte equality of the deployed and organiser validator files; and the official end-to-end test (solve → official validator → 0 hard; repair → 0 hard and minimum moves).

## 2. Official validator (the organisers' file, unmodified)
```
python3 engine/solve.py --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
    --out exports/schedule.json --time-limit 90
python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
    --data official/.../cit_public.json --schedule exports/schedule.json --json exports/report.json
→ Hard violations: 0  {}
→ Soft penalty: 3  {S1:0, S2:0, S3:0, S4:3, S5:0, S6:0}   (solver status: optimal)
→ Bookings: score 65.5 / 70 | approved 21, alternatives 2, rejected 2, overrides 0, priority inversions 0
  (score varies 62–65.5 with the optimal timetable chosen; inversions always 0)
→ Exam soft penalty: 0

python3 engine/solve.py --data ... --out exports/schedule_after.json \
    --disruption official/.../examples/sample_disruption.json --baseline exports/schedule.json
python3 official/.../validator.py --data ... --schedule exports/schedule_after.json \
    --disruption ... --baseline exports/schedule.json --json exports/report_after.json
→ Hard violations: 0  {}
→ Soft penalty: 3 (optimal) · Stability: 8 sessions moved (2 changed time, 6 room only)
→ solver.minimum_moves = 8 · solver.minimum_moves_proven = true
  Phase 1 proves zero discretionary moves (all 8 are forced); phase 2 reaches S1–S6 optimum 3 at that fixed count
```
The eight-move figure belongs to the committed baseline. Fresh equally optimal baselines can have a different proven minimum (a verification run produced four); the regression invariant is that `minimum_moves_proven` is true and the engine's minimum exactly equals the organiser validator's independently measured movement count.

Rejections are legitimate: BR-04 is on the official cancellations list; BR-09 needs 1,200 seats and the largest matching venue holds 800.

## 3. Web application
```
npm run test:unit           → 44/44 tests passed (25 booking parser + 3 calendar/lab rules + 3 explanations + 3 LLM boundary + 3 navigation + 7 disruption/workflow tests)
npm run typecheck           → 0 errors
npm run lint                → 0 problems
npm run build               → all routes compiled (Next.js 16.4.3 App Router)
npm audit --omit=dev        → 0 production vulnerabilities
```

Parser tests cover English ranges; Hinglish `kal`/`shaam`/`baje`/`ghante`/`log`; English and Romanised-Hindi number words; month-first dates; 24-hour/named clocks; flexible, vague, earliest-start and latest-finish constraints; ordered venue fallbacks; negated equipment; recurrence; priority impersonation; policy-bypass wording; missing essentials; and the UTC-to-Asia/Kolkata boundary used on serverless hosts. Explanation tests ensure hard validity, fixed constraints and global heuristics are described without false causal claims. LLM-boundary tests reject malformed/unknown intents and strip injected fields. Navigation tests prove every role-menu destination maps to a real route and key judge tasks remain exposed. Disruption tests cover the supplied sample, all five supported change types, references to newly added entities, wrong-dataset files, unknown entities/types/fields, and malformed added sessions.

## 4. Runtime & security checks (executed against production)
- Every route of all four roles → HTTP 200 with real data; anon → `/login`; wrong role → own workspace; exports 403 for unauthorized roles.
- All four README accounts signed in successfully after an Admin reset.
- Admin reset regenerated 60/60 demo sessions and preserved the active session/accounts.
- Production role-calendar follow-up: the published aligned version has **60/60 sessions, 70/70 teaching periods, 0 conflicts and 0 unplaced**. The live grid shows P1–P9 and lunch 13:00–14:00; its CSV has five lab rows, all exactly P2–P4 (09:00–12:00) or P6–P8 (14:00–17:00), with no conflict text. Browser console errors: 0; page errors: 0; HTTP 5xx responses: 0.
- Production `/admin/official` generated 189/189 sessions and 41/41 exams through the private Python service, stored the run and displayed **0 hard violations**.
- The generated schedule and report were downloaded from production. Running the organiser's original validator locally returned 0 hard violations, and its JSON report was data-identical to the report stored by the live app.
- Criterion-2 production flow on commit `0c88b22`: unsupported change type rejected before solve; a browser-uploaded `judge-supplied-change.json` became proposal run 2 with 0 hard violations and a proven 12-move minimum; proposal export returned 409; rejection was recorded and remained 409. A fresh sample proposal became run 3, again proved minimum 12, then a separate approval published both exports with HTTP 200. The downloaded report contained no `_workflow` metadata.
- Independent execution of the untouched organiser validator on production run 3 plus production baseline run 1 returned **0 hard · soft 12 · 12 moved (7 time, 5 room-only)**, and its JSON was data-identical to the approved app report. Headless Chromium recorded zero console/page errors; proposal/rejection/approval entries were visible in the Admin audit log.
- Sign-in browser matrix (headless Chromium, Firefox, WebKit): normal tab ✅, embedded preview ✅ (partitioned cookies), strict-privacy/blocked contexts → direct-link panel with copyable address ✅, sandboxed panel → explained ✅. Sign-out and session invalidation verified.
- Login route: cross-site POST → 403; wrong password → 401 with field error.

## 5. Not yet covered (honest)
- No frontend unit-test runner (components verified via typecheck + headless-browser flows instead).
- Supabase RLS policy tests — pending the Supabase project.
- Load testing of the engine service under concurrent jobs.

## 6. Constraint audit & fixes (this review round)

Bugs found in `engine/core.py` by code audit, fixed in place (no architecture change), each followed by an official-validator run:

| # | Bug | Effect | Fix | Regression test |
|---|---|---|---|---|
| 1 | Placed bookings were injected into the session map as synthetic `__booking__` entries | `check_assignment` flagged them as unknown sessions → institute-event displacement silently impossible after the first booking; placed bookings could even be selected as "classes to displace" | Bookings tracked in a separate `placed` list, overlaid on occupancy maps; session world stays pure | `test_institute_override_works_after_earlier_booking_placed` |
| 2 | Mandatory groups not re-checked after displacement | Moving the room conflict alone could still clash with the event's mandatory group (H13) | Final `slot_free` verification of room **and** mandatory groups on the post-move week | `test_override_refused_when_mandatory_group_still_busy` |
| 3 | Displacement destination search accepted slots that still overlapped the event being placed | Search picked a "valid timetable" slot that kept the event room busy → whole attempt rejected | Destinations that keep the event room (or its mandatory groups) busy during the event are excluded up front | same as #1 (escape-slot assertion) |
| 4 | Exam room picker filled ascending | Up to ~10 tiny rooms for a 360-seat exam; wasted capacity risked E1 on tighter inputs | `pick_exam_rooms`: exact single fit first, descending coverage, largest hall preserved when the rest suffice (now ≤5 rooms/exam, 63 total room-uses) | `test_exam_room_picker_fewest_rooms_and_preserves_big_hall` |
| 5 | No solver seed | Booking score varied run-to-run without reproducibility | `random_seed = 42`; the determinism test uses single-worker search while production uses a bounded two-worker portfolio | `test_solver_deterministic_with_seed` |
| 6 | S2 gap variables were created only for already-occupied periods | Real empty periods between classes could not add an S2 objective cost | Exact before/after/not-occupied Boolean formulation, including elective-basket group occupancy | `test_soft_s2_counts_an_actual_empty_period_between_classes` |
| 7 | Basket group occupancy used only one representative member's groups | A basket with non-identical member group lists could under-model H3/S2/S3 | Union all basket member groups and apply the shared basket-time variable exactly once per group | basket tests + official validator |
| 8 | Eight parallel CP-SAT portfolios exhausted memory on the exact S2 model | Official run could be killed despite a small optimal score | Default reduced to two workers; the exact model now proves optimal in ~22 seconds in the verification environment | official end-to-end test |

Also verified by design + tests: fixed-slot classes are never displaced (H14), basket sessions are never moved alone (H11), clubs capped to club_event can never displace classes (`test_club_cannot_displace_classes`), P10–P13 remain event-only (solver bound P1–P9), exam capacity halved.

Post-fix official validator on both committed scoring exports:
**0 hard violations · soft 3 (provably optimal) · bookings 65.5/70 · 0 priority inversions · repair 8 forced moves.**

The separate production smoke generation was deliberately accepted once it returned a complete hard-valid result; because its 90-second service limit ended at `feasible`, that particular live run had soft 12. Optimisation quality is handled independently from the 25-point hard-correctness gate and will be tuned next.

## 7. Manual scheduling & extra-class approval (runtime tests)

Executed against the live preview through the real Server Actions:

| Step | Result |
|---|---|
| Admin adds CS302 for Dr. Rao, auto room | ✅ added Mon P1 · A-202, teacher notified, audited |
| Admin adds at a slot where Rao already teaches | ✅ rejected: "Dr. Ananya Rao double-booked on Mon P3 (CS201L & CS302)" |
| Admin moves the new session | ✅ moved Tue P2 · B-110 (auto room switched), notified |
| Faculty requests extra class in a free slot | ✅ pending request created, all admins notified |
| Coordinator tries to approve the extra class | ✅ refused: "Only the admin can approve new class requests." |
| Admin approves | ✅ session inserted into the published timetable (61 → 62), faculty notified |
| Admin removes the manual session | ✅ deleted, notified, audited |

Browser (headless Chromium): edit modal → change day/period → "CS302 moved to Fri P6 · A-202" toast, modal closes; Add-class modal opens with the viewed teacher prefilled; faculty form shows 24 clickable free-slot chips for the selected course/groups. No console errors.

Also fixed: timetable version labels no longer duplicate after a draft is discarded.

## 8. Coursework & timetable layout (this round)

Runtime tests through the real Server Actions (faculty session, Dr. Rao):

| Step | Result |
|---|---|
| Add syllabus unit to own course (CS302) | ✅ saved, audited |
| Add syllabus unit / assignment to a course the teacher does not teach | ✅ blocked: "You can only manage coursework for courses you teach." |
| Create + publish assignment | ✅ published, coordinator notified ("New assignment: CS302"), audited |
| Add resource | ✅ saved |
| Add resource with invalid URL | ✅ rejected by validation |
| Toggle unit covered | ✅ coverage updated |

Browser (headless Chromium): `/faculty/coursework` renders with course switcher, tabs and empty states; the New-assignment dialog opens; zero console/page errors. Admin `/admin/coursework` renders the oversight table. Page snapshots checked for the timetable editor after the layout fix (row headers aligned at x=301, grid 730 px inside 754 px, all five days visible).

Fixed during this round: a Server Component was passing a `groups()` **function** to a Client Component (React forbids this) — replaced with a serializable `groupsByCourse` map.

## 9. Usability & dashboard production verification

Commit `9146131` deployed successfully through Vercel and was exercised on `https://tessra-five.vercel.app` with authenticated headless Chromium at **1440×1000** and **390×844**:

- Admin Quick start exposed the room, published-timetable and approval journeys on the first screen.
- `Ctrl+K` intent search returned the room workflow; the palette also opened and fit correctly on phone.
- Admin Live room finder checked a real date/time/capacity query, summarized free venues, sorted an available room first and retained the result on phone.
- Published timetable exposed the group/faculty/room switcher.
- A clean Approval Centre created a genuine validated faculty change, displayed its before/after placement, showed the revalidation confirmation, and approved it through the normal action successfully.
- Official CIT timetable displayed the desktop grid at laptop width and the day agenda at phone width.
- Coordinator navigation exposed its own Approval Centre and no longer contained a dead cross-role Admin link.
- Admin Access Requests rendered exactly one application shell (the obsolete nested shell was removed).
- Every checked page stayed within the document viewport; wide tables remain locally scrollable.

**Result: 38 browser assertions passed; 0 console errors, 0 page errors and 0 HTTP 5xx responses.**

## 10. Adversarial AI & explanation production verification

Commit `54fa047` deployed successfully and was tested through the real authenticated UI/API with Club, Faculty and Admin accounts:

- Club UI example chips populated a real editable draft; the flexible 15:00–18:00 window visibly selected 15:00–17:00 and filled attendance/venue fields.
- Romanised-Hindi word numbers (`chhe`, `aath`, `do`, `pachaas`) produced 18:00–20:00, two hours, 50 attendees and microphone/audio needs.
- English word numbers, month-first dates, 24-hour times, negated equipment and conditional venue fallbacks were parsed correctly.
- A prompt impersonating the Dean and demanding institute-event/highest priority remained `club_event` / `normal`; the UI explicitly reported the code-enforced ceiling and refused the bypass wording.
- Faculty timetable cards opened an exact prefilled “why this slot?” question. The normal Assistant Server Action returned a live-data explanation plus the selected session card.
- Admin Smart Scheduling displayed the same placement rationale, including fixed/hard-valid status, alternative count, room fit and global heuristic caveat.
- Laptop and phone journeys had no document overflow.

**Result: 29 browser assertions passed across the combined run; 0 product console errors, 0 page errors and 0 HTTP 5xx responses. No booking or timetable mutation was needed.**

### Official prompt corpus follow-up

After commit `14e668c` deployed, all eight public starter-pack requests plus six official/adversarial variants were sent through the authenticated production API. Checks covered straight-hour durations, audience attendance, SH-2 accessibility fallback to SH-1, recurrence, missing essentials, priority escalation, group IDs, midnight crossing and contradictory range/duration text.

**Result: 17 production assertions passed; 0 product console errors, 0 page errors and 0 HTTP 5xx responses.**
