# Criterion 2 — Rescheduling Evidence

## Workflow

1. Admin opens `/admin/official`.
2. Uploads organiser-format disruption JSON or chooses the supplied sample.
3. The server validates the dataset ID, complete shape, supported operation, nested values, and sequential entity references before invoking the engine.
4. CP-SAT produces a proposal only if the untouched organiser validator reports zero hard violations.
5. The UI displays time changes, room-only changes, additions, removals, and minimum-move proof status.
6. A separate Admin action approves or rejects the proposal.
7. Proposed and rejected exports return HTTP 409; only approval unlocks `schedule_after.json` and its clean report.

Proposal, approval, and rejection actions are audit logged. Approval is refused if the baseline changed, the report is not hard-valid, or the movement proof is incomplete.

## Minimum-move proof

`engine/core.py::solve_timetable` uses two optimization phases:

1. Minimize the number of baseline sessions whose placement changes and require an `OPTIMAL` result.
2. Fix that proved minimum with an equality constraint, then minimize the exact official S1–S6 expression.

This is lexicographic optimization, not a finite movement penalty that soft quality could outweigh.

## Supplied sample result

Executed against the committed exports and independently checked with the untouched organiser validator:

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

All eight moves are therefore forced relative to the committed baseline.

## Automated checks

- `python3 -m pytest engine/tests -q` → **33 passed**
- `npm run test:unit` → **55 passed**
- `npm run typecheck` → passed
- `npm run lint` → passed
- `npm run build` → passed
- organiser validator on baseline and repair → **0 hard violations**
- deployed validator copy → byte-identical to organiser file

Relevant implementation:

- `src/lib/official-disruption.ts` — strict input and reference validation
- `src/lib/official-actions.ts` — propose/approve/reject/audit lifecycle
- `src/app/admin/official/page.tsx` — upload, proof state, exact diff, approval UI
- `src/app/api/export/official/route.ts` — approval gate and metadata stripping
- `engine/core.py` — lexicographic repair objective

## Hosted verification status

The separate CIT hosted infrastructure is intentionally pending until after source delivery. Authenticated production browser checks will be recorded after deployment; no result from the frozen original TESSRA deployment is presented as evidence for this CIT edition.
