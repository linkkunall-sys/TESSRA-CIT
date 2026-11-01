# Criterion 2 — Rescheduling evidence

This page maps the 15-mark rescheduling criterion to executable code and repeatable evidence.

## Judge flow

1. Sign in as Admin and open `/admin/official`.
2. Keep the generated hard-valid baseline selected.
3. Upload any JSON file using the organiser disruption schema, or choose **Use supplied sample**.
4. The server validates the complete schema, supported type, entity references, duplicate IDs, calendar days, periods, room types, and nested faculty/session shape **before** calling CP-SAT.
5. CP-SAT returns a proposal only after the byte-identical organiser validator reports zero hard violations.
6. Review the exact table of time changes, room-only changes, additions, and removals. The page also shows whether CP-SAT proved the minimum move count.
7. Choose **Approve and publish** or **Reject proposal**. Proposal and rejected exports are locked; only approval makes `schedule_after.json` and its clean validator report downloadable.

All proposal, approval, and rejection actions are audit logged. Approval is refused if the baseline changed, the official report is not hard-valid, or the minimum-move proof did not complete.

## Minimum-move proof

`engine/core.py::solve_timetable` performs two optimization phases:

1. Minimize the number of baseline sessions whose placement changes. A phase-one `OPTIMAL` result is the proof that no hard-valid repair moves fewer sessions.
2. Add an equality constraint fixing that count, then minimize the exact official S1–S6 objective.

This avoids the failure mode of a large but finite movement penalty, where enough soft improvement could otherwise buy an extra move.

## Supplied sample result

Executed against `exports/schedule.json` and checked with the untouched organiser `validator.py`:

| Measure | Result |
|---|---:|
| Sessions after change | 190 |
| Hard violations | 0 |
| Soft penalty | 3 |
| Existing sessions moved | 8 |
| Time changes | 2 |
| Room-only changes | 6 |
| Proven minimum | **8** |
| Minimum proof complete | **true** |
| Solve wall time in verification environment | 12.73 s |

Therefore all eight moves are unavoidable under the submitted permanent unavailability changes; no discretionary movement is used to improve the soft score.

## Deployed end-to-end result

Headless Chromium exercised the production deployment for commit `0c88b22` through the real forms, Server Actions, database, private Python service, and authenticated export route:

- An unsupported change type was rejected before solving.
- Browser-uploaded `judge-supplied-change.json` produced proposal run 2: 0 hard violations, exact diff visible, minimum 12 proven against production baseline run 1, export HTTP 409.
- Rejecting run 2 kept its export at HTTP 409 and produced an audit entry.
- A fresh sample proposal produced run 3; before approval its export returned HTTP 409.
- A separate Admin approval published run 3: schedule/report HTTP 200, 190 sessions, 0 hard violations, minimum 12 proven, internal `_workflow` absent from the downloaded report.
- The untouched organiser validator independently rechecked the downloaded production files: **0 hard · soft 12 · 12 moved (7 time, 5 room-only)**. Its report was data-identical to the app download.
- The browser recorded zero console or page errors; the audit page showed the workflow events.

The production baseline differs from the committed soft-optimal baseline, so its proven lower bound is 12 rather than 8. Both results are exact relative to their own exported baseline.

## Automated checks

- `python -m pytest engine/tests -q` → **33 passed**
- `npm run test:unit` → **14 passed**
- `npm run typecheck` → **0 errors**
- `npm run lint` → **0 problems**
- `npm run build` → **successful**
- Original validator on committed repair → **0 hard violations**
- Deployed validator copy remains byte-identical to the organiser file.

Relevant implementation:

- `src/lib/official-disruption.ts` — strict input validation and change application for rendering.
- `src/lib/official-actions.ts` — propose, approve, reject, audit, and publish lifecycle.
- `src/app/admin/official/page.tsx` — upload, proof status, exact diff, and approval UI.
- `src/app/api/export/official/route.ts` — approval gate and internal-metadata stripping.
- `engine/core.py` — lexicographic CP-SAT repair objective.
