# TESSRA Submission Audit

Audit date: 2026-11-01 (Asia/Kolkata)

This is an evidence-based audit against the supplied Crunch Week problem statement, starter pack, official validator and the separately supplied ZIP. It deliberately separates objective validator results from subjective or comparative marks that only judges can award.

## 1. Material inspected

- Original six-page `Problem-statement.pdf` supplied through Dropbox (SHA-256 `f4b5987026efd285b490b1d596ae94e5f75bed1f1c5cc71923a4fe030e03a5d3`)
- Extracted problem statement: `official/problem-statement.txt`
- Starter-pack guide: `official/starterpack/CrunchWeek_StarterPack/README.md`
- Full dataset: `data/cit_public.json`
- All nine CSV files
- Official `validator.py`
- `examples/sample_disruption.json`
- `examples/sample_requests.md`
- `examples/schedule.example.json`
- Current `exports/schedule.json` and `exports/schedule_after.json`
- Supplied archive: `tessra-premium-ui-redesign-4.zip`
- Current GitHub/live implementation and automated test suites

The original PDF was downloaded and checked directly. All six pages were also rasterised and visually inspected: there is **no sample timetable, timetable screenshot, mandated grid design or embedded image** to copy. The only visible tables cover role permissions, dataset counts and judging criteria. Its requirements, constraints, submission rules and 100-mark rubric agree with the repository's extracted text; no extra scoring rule was found in the PDF layout.

## 2. Starter-pack integrity and counts

The JSON and CSV copies agree on the organiser's headline counts:

| Input | Count |
|---|---:|
| Rooms | 27 |
| Room-unavailability records | 2 |
| Faculty | 40 |
| Student groups | 14 |
| Courses | 62 |
| Sessions | 189 |
| Booking requests | 25 |
| Cancellations | 1 |
| Exams | 41 |

The calendar has MON–FRI teaching periods P1–P9, event-only periods P10–P13, lunch after P5, and three-hour lab starts P2/P6. The priority order and role caps in the JSON match the statement. Both the official CIT workspace and the interactive role workspaces now use this teaching-day model; P10–P13 remain booking-only.

The deployed validator copy is byte-identical to the organiser file:

- SHA-256: `f02733b382fa111e89cd6bb261e185ae57da6e41795f094b96cab1575d6ee144`
- Size: 23,176 bytes

## 3. Supplied ZIP: actual result

The archive is structurally valid: `unzip -t` reports no compressed-data errors. However, it is an old snapshot and **must not be submitted as the final build**.

### Validator results from the ZIP itself

| ZIP export | Hard | Soft | Booking score | Repair movement |
|---|---:|---:|---:|---:|
| `schedule.json` | 0 | 3 | 63.5 / 70 | — |
| `schedule_after.json` | 0 | 3 | — | **180 moved**: 172 time changes + 8 room-only |

The ZIP README claims approximately ten moved sessions, but the official validator counts 180 against that ZIP's own baseline. This discrepancy is material. The archive also predates the governed minimum-move repair, robust booking parser, placement explanations, production evaluator flow and current evidence.

Notable files absent from the ZIP but present in the current repository include `THIRD_PARTY.md`, `package-lock.json`, the authenticated booking-parser API, parser/LLM/explanation tests, strict disruption-input validation, the deployed official-validator copy, reset workflow, additional evidence documents and current deployment configuration. It also contains `.pytest_cache`, which should not be in a clean submission archive.

### Estimated rubric result for the old ZIP

The old ZIP would likely land around **70–79/100 before any disqualification decision**:

- correctness remains strong because the baseline has zero hard violations;
- rescheduling loses most or all of the five minimum-movement marks and may lose approval-workflow marks;
- venue-request AI is largely absent from that snapshot;
- documentation/submission files are incomplete;
- the booking and soft scores remain good.

If judged as a standalone submission, its README has no usable production URL and no video link. Those are disqualification risks, not merely point deductions.

## 4. Current repository: objective official results

Commands rerun during the audit:

```bash
python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
  --schedule exports/schedule.json

python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json \
  --schedule exports/schedule_after.json \
  --disruption official/starterpack/CrunchWeek_StarterPack/examples/sample_disruption.json \
  --baseline exports/schedule.json
```

| Current export | Hard | Soft | Other result |
|---|---:|---:|---|
| `schedule.json` | **0** | **3** | bookings 65.5/70; 21 approved, 2 alternatives, 2 rejected; 0 priority inversions; exam soft 0 |
| `schedule_after.json` | **0** | **3** | **8 moved**: 2 time changes + 6 room-only |

The repair engine proves the lexicographic minimum for the committed baseline before refining soft quality. Movement count is baseline-dependent; tests therefore compare the proved minimum with the independent official-validator count instead of hard-coding eight.

## 5. Hard-constraint coverage

| Rule | Constraint | Evidence |
|---|---|---|
| H1 | Every known session exactly once | CP-SAT exactly-one + missing/unknown regression + official validator |
| H2 | Faculty cannot clash | occupancy constraint + regression |
| H3 | Student groups cannot clash; basket semantics | group/basket occupancy + regressions |
| H4 | Room cannot double-book | room occupancy + regression |
| H5 | Capacity, including half capacity for exams | timetable/exam constraints + regressions |
| H6 | Correct room type/use | feasible-room filtering + regression |
| H7 | Faculty unavailability | slot filtering + regression |
| H8 | Room unavailability | assignment filtering + regression |
| H9 | Lunch and P2/P6 lab starts | slot construction + regression |
| H10 | Accessibility | room filtering + regression |
| H11 | Elective baskets synchronized | shared basket-time variables + regression |
| H12 | Faculty daily limit | weighted daily constraint + regression |
| H13 | Booking/session/group conflicts | deterministic booking allocator + official validator + regressions |
| H14 | Fixed slots | slot filtering + regression |

All five organiser disruption operations are accepted and schema-validated: faculty unavailable, room unavailable, add faculty, add session and remove session. Unknown references, malformed additions, wrong datasets and extra fields are rejected before the engine call.

## 6. Plain-language request audit

All eight public sample prompts and all 25 dataset `raw_text` values were reviewed. The parser now covers:

- English and Romanised-Hindi number words;
- ranges, 24-hour clocks, flexible windows and explicit durations;
- `6 straight hours`, audience/dancer attendance nouns and named CIT rooms;
- multi-day/recurring wording without silently creating a series;
- visible assumptions for vague periods;
- follow-ups for missing duration, attendance, date or time;
- named-room accessibility conflicts such as inaccessible SH-2 → compatible SH-1 search;
- group IDs such as ECE-3/CSE-3 without misclassifying them as rooms;
- guest/industry speakers without inventing audio-equipment requirements;
- midnight crossings and contradictory range/duration text without silently producing a wrong draft;
- role escalation, fake Dean/Admin claims, priority abuse and approval-bypass attempts without changing code-enforced policy.

Information absent from the original message is not guessed. For example, a compulsory group event with no attendance asks for attendance; a point start time with no duration keeps the start but asks how long it lasts.

## 7. Current test evidence

- TypeScript unit tests: **44/44 passed**
  - 25 booking parser
  - 3 calendar/lab-rule regression
  - 3 placement explanation
  - 3 LLM boundary/sanitisation
  - 3 navigation
  - 7 official disruption/workflow
- Python engine tests: **33/33 passed**
- TypeScript typecheck: passed
- ESLint: passed
- Next.js production build: passed
- `npm audit --omit=dev`: zero vulnerabilities
- Official baseline and repaired exports: zero hard violations
- Production official-prompt follow-up: **17/17 assertions passed**, with zero product console errors, page errors or HTTP 5xx responses
- Production role calendar: **60/60 sessions, 70/70 periods, 0 conflicts, 0 unplaced**; five labs all use P2–P4 or P6–P8; P1–P9 grid and lunch visually verified

## 8. Defensible rating

No one outside the judging panel can produce a truly final mark because optimisation is comparative and AI/usability/design are judge-scored. The objective and defensible estimate for the current repository is:

| Criterion | Maximum | Defensible current estimate | Basis / uncertainty |
|---|---:|---:|---|
| Scheduling correctness | 25 | **25** | Official validator: zero hard violations |
| Rescheduling | 15 | **14–15** | Zero hard violations, proved minimum on committed baseline, exact diff and separate Admin approval; hidden change-file runtime remains judge-dependent |
| Optimisation | 10 | **9–10** | Soft penalty 3; final mark depends on other teams |
| Use of AI | 15 | **13–15** | Robust tricky-request and explanation behavior; hidden wording remains judge-dependent |
| Booking decisions | 10 | **9–9.5** | 65.5/70, sensible reasons, zero inversions; BR-09 is impossible and BR-17 exceeds P13 |
| Usability/dashboard | 10 | **9–10** | Four evaluator paths and production browser checks |
| UI/design | 10 | **9–10** | Responsive, polished live app; subjective |
| Code/documentation | 5 | **4.5–5** | Setup, architecture, declarations, tests and traceability are present |
| **Estimated total** | **100** | **93–98** | Midpoint approximately **96/100** |

This estimate is conditional on submission eligibility. It is not a promise of a judge score.

## 9. Submission blockers and risks

1. **Video link is not in the repository.** The statement makes a working walkthrough video a disqualification gate. A valid unlisted YouTube or viewable Drive link must be submitted through the required channel and should also be added to the README.
2. **Deadline status is unknown.** The rules disqualify deployments or pushes after the deadline. Do not make further submission changes if the official deadline has passed.
3. **Optimisation marks are comparative.** Soft 3 is objectively excellent, but only organisers know the other teams' scores.
4. **Do not submit the old ZIP.** Generate the clean archive from current tracked files only.
