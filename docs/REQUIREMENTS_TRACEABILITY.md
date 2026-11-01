# TESSRA CIT — Requirements Traceability

Sources:

- `official/problem-statement.txt`
- `official/starterpack/CrunchWeek_StarterPack/README.md`
- `official/starterpack/CrunchWeek_StarterPack/data/cit_public.json`
- untouched `official/starterpack/CrunchWeek_StarterPack/validator.py`

Status legend: ✅ implemented and locally verified · 🟡 partial or requires hosted verification · ⬜ not implemented.

## Core capabilities

| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Weekly timetable for every session, no hard clashes | CP-SAT official engine plus relational operational generator; 189/189 CIT sessions | Organiser validator hard 0; operational generation test places all units | ✅ |
| Midsem examination plan | Multi-course/multi-room storage and editing; AM/PM official allocator; half-capacity validation | 41/41 exams; exam soft 0; unit regression | ✅ |
| English/Hinglish request to editable booking draft | Deterministic parser fills the real booking form; assumptions/follow-ups and policy notices remain visible | 25 parser tests | ✅ |
| Booking decisions by priority/cap/time | Official allocator reads priority order, role caps, submission time, cancellation, windows, needs, and groups from JSON | 65.5/70; 0 inversions; reasons retained operationally | ✅ |
| Minimal disruption repair with review | Strict change-file validation; lexicographic minimum-move proof; exact diff; separate approve/reject; export gate | Sample repair hard 0, soft 3, minimum 8 moves | ✅ |
| Group/faculty/room views, utilisation, conflicts | Role dashboards, switchers, room finder, approvals, timetable and official views | Navigation tests, typecheck, build | ✅ |
| Faculty scheduling assistant | Optional LLM intent boundary plus deterministic alternatives and submit-time validation | LLM sanitisation and explanation tests | ✅ |
| Explain placements/rejections | Hard-validity facts, room fit, alternatives, booking reasons, and validator S1–S6 are surfaced | Explanation tests and persisted source reasons | ✅ |
| Load changes and export organiser JSON | Canonical base is pinned; all five disruption operations accepted; schedule/report downloads gated by workflow state | 7 disruption/workflow tests | 🟡 base replacement upload intentionally omitted |
| Authorized manual scheduling | Admin can add/move/pin/remove CIT operational sessions; faculty extra-class requests require Admin approval; daily limits, room eligibility, accessibility, blocks, baskets, capacity, and clashes are rechecked | Operational tests, server-side action paths, production role-route smoke | ✅; live write-path walkthrough still recommended |

## Official hard constraints

| Rule | Coverage |
|---|---|
| H1 every source session exactly once | CP-SAT exactly-one; completeness validation |
| H2 faculty clash | period occupancy |
| H3 group clash with basket exemption | group occupancy plus same-basket synchronization |
| H4 room clash | room occupancy |
| H5 capacity | expected session size; half-capacity sum for exams |
| H6 room type/use | source `room_types`, `allowed_uses`, and persisted eligible room IDs |
| H7 faculty unavailability | `availability_blocks` |
| H8 room unavailability | `room_availability_blocks` |
| H9 P1–P9, lunch, P2/P6 labs | generator and validator bounds |
| H10 accessibility | source eligibility and manual-session inference |
| H11 synchronized elective baskets | shared placement in CP-SAT and operational generator; validator error when split |
| H12 faculty daily limit | generation, alternatives, and validation |
| H13 approved booking conflicts | timetable/booking/exam/room-block analyzer and official allocator |
| H14 fixed slots | CP-SAT domain and operational pinning |

The official validator remains the scoring authority. The operational validator adds user-facing diagnostics without weakening any source constraint.

## Soft constraints

The CP-SAT engine implements official S1–S6 weights. Latest committed baseline:

```text
S1 0 · S2 0 · S3 0 · S4 3 · S5 0 · S6 0 = total 3
```

Operational generation also scores faculty avoid preferences, daily load, group load, period quality, and room fit; only hard-valid placements may be committed.

## Roles and policy

| Requirement | Status |
|---|---|
| Four roles: Admin, Coordinator, Faculty, Club | ✅ |
| Server-side role guards | ✅ |
| Requester cannot self-review normal approval workflows | ✅ |
| Official category caps and cancellation behavior | ✅ |
| Priority ties by submitted time | ✅ |
| Coordinator scope by department | ✅ |
| Admin-editable official priority order | ⬜ source order remains canonical |

## Submission and engineering rules

| Requirement | Status |
|---|---|
| `AI_USAGE.md` | ✅ |
| Deterministic validity independent of LLM | ✅ |
| Manual booking path without LLM | ✅ |
| Committed `schedule.json` and `schedule_after.json` | ✅ hard 0 on both |
| CIT-only operational seed | ✅ |
| Four documented sign-in accounts | ✅ |
| Separate public repository | ✅ |
| Separate live CIT deployment | ✅ `https://tessra-cit.vercel.app`; database health and all four role logins verified |
| Walkthrough video/link | ⬜ submission-owner action |

## Current honest gaps

1. A replacement base-dataset upload is not exposed; the untouched CIT pack is deliberately canonical. Organiser-format change-file upload is complete.
2. The Admin UI does not currently expose editing the official priority order, although the source-defined order, role caps, timestamps and cancellations are enforced by the official allocator.
3. Coordinator scheduling scope is implemented, but a dedicated coordinator action for approving bookings in department-owned labs is not exposed.
4. The live deployment has passed database health and all four authenticated route checks; live CP-SAT generation/repair and mobile interaction should still be exercised in the walkthrough.
5. The official workbench grid is a reproducible output/review surface; direct edits occur in the relational Admin timetable workspace.
6. Soft optimization may return a hard-valid feasible result if a hosted solver reaches its configured time limit before proving optimality.
7. The required walkthrough video remains a submission-owner deliverable.
