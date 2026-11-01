# Official Constraint Verification

Verified against the organiser-provided `official/starterpack/CrunchWeek_StarterPack/validator.py` without modifying that file.

## Hard constraints

| Rule | Official requirement | CP-SAT / allocation implementation | Independent verification |
|---|---|---|---|
| H1 | Every session exactly once with valid day, start and room | `AddExactlyOne` over each session's legal assignment variables | `check_assignment`; validator session completeness/duplicate/ID checks; `test_h1_checker_rejects_missing_and_unknown_sessions` |
| H2 | Faculty cannot overlap | `AddAtMostOne` per faculty/day/period | validator `fac_occ`; `test_h2_faculty_no_clash` |
| H3 | Student groups cannot overlap; a basket counts once | Boolean occupancy per group/day/period; basket uses one shared time over the union of member groups | validator set occupancy; group and basket tests |
| H4 | Room cannot hold two things at once | `AddAtMostOne` per room/day/period; separate booking and exam occupancy maps | validator timetable/fest/exam room maps; `test_h4_room_no_double_booking` |
| H5 | Room capacity ≥ class size; exam capacity is halved | Legal-room filter; exam allocator sums `capacity // 2` | validator capacity checks; class and multi-room exam tests |
| H6 | Room type must match | Legal-room filter checks `room.type in session.room_types` | validator room-type check; room compatibility test |
| H7 | Faculty unavailability respected | Candidate periods intersecting faculty blocks are removed | validator faculty blocks; `test_h7_faculty_unavailability` |
| H8 | Room unavailability respected | Room/day/period combinations under maintenance are removed | validator room blocks; `test_h8_room_unavailability` |
| H9 | P1–P9 only, no lunch crossing, labs start P2 or P6 | Candidate-domain bounds, lunch filter and official lab starts | validator timing check; `test_h9_lab_starts_and_lunch` |
| H10 | Accessible room where required | Legal-room accessibility filter | validator accessibility check; compatibility test |
| H11 | All sessions in one elective basket share day/start | One shared basket-time Boolean linked to every member; rooms remain independently assigned | validator basket-time set; `test_h11_basket_same_time_different_rooms` |
| H12 | Faculty daily hours ≤ their limit | Weighted daily assignment sum ≤ `max_hours_per_day` | validator faculty/day count; `test_h12_daily_limit` |
| H13 | Approved booking clashes with no class/booking/mandatory group | Priority-ordered allocator overlays class, booking and group occupancy; displaced classes are rechecked | validator fest-week view; booking/override/mandatory-group tests |
| H14 | Fixed session remains fixed | Non-fixed day/start combinations are absent from its variable domain | validator fixed-slot check; `test_h14_fixed_slot_stays` |

`check_assignment` is intentionally independent of the CP-SAT model. The official validator remains the final authority.

## Soft constraints and exact weights

| Rule | Official penalty | Model term | Unit regression |
|---|---:|---|---|
| S1 | 2 per avoided faculty period | assignment cost for every avoided covered period | `test_soft_s1_faculty_avoid_weight_is_two_per_period` |
| S2 | 1 per empty group period between classes | `before AND after AND NOT occupied` per group/day/period | `test_soft_s2_counts_an_actual_empty_period_between_classes` |
| S3 | 3 per group hour above 6/day | `3 × max(0, hours − 6)` | `test_soft_s3_group_over_six_hours_weight_is_three_per_extra_hour` |
| S4 | 3 per repeated lecture of the same course/day | `3 × max(0, count − 1)`, including official basket semantics | `test_soft_s4_same_course_twice_weight_is_three` |
| S5 | 1 when room use is below 40% | assignment cost when `size / capacity < 0.4` | combined S5/S6 test |
| S6 | 1 for a session occupying P9 | assignment cost when its period block contains P9 | combined S5/S6 test |

## Repair objective proof

Repair solving is lexicographic rather than a tunable weighted sum:

1. Keep forced moves as a lower bound and minimize the Boolean count of every other changed baseline placement.
2. Require CP-SAT `OPTIMAL` status for that phase; this proves no hard-valid repair has fewer moves.
3. Add equality fixing that optimum, then minimize the exact S1–S6 expression.
4. Persist `minimum_moves` and `minimum_moves_proven` in the ignored solver metadata; Admin approval is blocked unless the proof flag is true.

## Executed evidence

```text
python -m pytest engine/tests -q
33 passed

schedule.json
  189/189 sessions · 41/41 exams
  hard violations 0
  S1 0 · S2 0 · S3 0 · S4 3 · S5 0 · S6 0 = soft 3
  bookings 65.5/70 · 21 approved · 2 alternatives · 2 rejected
  priority inversions 0 · exam soft penalty 0

schedule_after.json + sample_disruption.json + schedule.json baseline
  190/190 sessions
  hard violations 0 · soft 3
  lexicographic minimum proven: 8 sessions moved (2 time changes, 6 room-only changes)
  no hard-valid repair can move fewer than 8 baseline sessions
```

SHA-256 fingerprints of the validated artifacts:

```text
ccb344cf1e8d1c3e992c07828e8649031e4c2357d5e9923fd469f7c7eb32268b  exports/schedule.json
eecb64b67d376ab0e78ce704feac0bbaf64cdef273060db50ac866da39701943  exports/schedule_after.json
b6ccc02574efb301e211d5a0cf15fabe58dab98a5df2352f36ebd64a59722a52  exports/report.json
1be2a0efec75e0ec7bdeb1228a39697977cde79c554bfa698d2545f06a127bb2  exports/report_after.json
```
