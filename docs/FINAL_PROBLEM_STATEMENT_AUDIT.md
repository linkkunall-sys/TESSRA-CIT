# Final Problem-Statement Audit

Audit date: **2026-11-01 (Asia/Kolkata)**

- Audited source: `/home/user/uploads/Problem-statement.pdf`
- PDF SHA-256: `f4b5987026efd285b490b1d596ae94e5f75bed1f1c5cc71923a4fe030e03a5d3`
- Length: **6 pages**

The uploaded PDF and `official/problem-statement.txt` contain the same substantive problem statement; extraction differences are whitespace, bullets and page markers.

Status legend: ✅ implemented/verified · 🟡 partial or final live interaction pending · ❌ missing

## Product requirements (§2)

| # | Requirement | Evidence | Status |
|---:|---|---|:---:|
| 1 | Generate every lecture, tutorial and lab without clashes | 189/189 sessions and 243/243 periods; organiser validator hard 0 | ✅ |
| 2 | Schedule following-week midsems | 41/41 exams; multi-course/multi-room storage; half-capacity checks; exam penalty 0 | ✅ |
| 3 | English/Hinglish request → structured editable booking | Deterministic parser, visible assumptions/follow-ups, editable booking form, manual fallback | ✅ |
| 4 | Approve/reject/alternative for Spectra requests by priority, with reasons | 25 decisions; 21 approved, 2 alternatives, 2 rejected; 0 priority inversions; reasons retained | ✅ |
| 5 | Handle leave, room closure and new sessions; minimize moves; diff; Admin approval; explain infeasibility | All five organiser change types validated; lexicographic minimum 8 moves; exact before/after; proposal/approve/reject states; conflict reasons | ✅ |
| 6 | Views by group/faculty/room plus approvals, conflicts and utilisation | Role dashboards, timetable switchers, queues, conflict panels and room-utilisation reports | ✅ |
| 7 | Faculty natural-language assistant with validated alternatives/unavailability explanation | Optional LLM intent layer plus deterministic fallback/search; no model can write or decide validity | ✅ |
| 8 | Explain decisions | Placement rationale, verified facts/alternatives, booking reasons and S1–S6 report | ✅ |
| 9 | Admin loads dataset/change files and exports organiser JSON | Strict base-dataset upload validates nested schema/IDs/references, stores an immutable hashed version, passes that snapshot to CP-SAT and the untouched validator, reuses it for repair, and exports clean organiser JSON | ✅ |
| 10 | Authorized manual event scheduling with hard constraints | Role guards, event-enabled-room checks, feature/capacity/time/conflict checks and approval workflow | ✅ |

## Scheduling constraints (§3)

Every stated hard rule is represented in the CP-SAT domain and independently checked by the untouched organiser validator:

- H1 exactly-once placement;
- H2 faculty clash;
- H3 group clash with elective-basket exemption;
- H4 room clash;
- H5 capacity and half-capacity exams;
- H6 room type/use;
- H7 faculty unavailability;
- H8 room unavailability;
- H9 teaching bounds, lunch and P2/P6 three-hour labs;
- H10 accessibility;
- H11 synchronized elective baskets;
- H12 faculty daily limit;
- H13 approved-booking class/room/group conflicts; and
- H14 fixed slots.

Latest independent organiser-validator results:

```text
schedule.json       hard 0 · soft 3 · booking 65.5/70 · priority inversions 0 · exam penalty 0
schedule_after.json hard 0 · soft 3 · 8 moves (2 time, 6 room-only)
```

All six soft constraints S1–S6 use the organiser weights. No hard-constraint implementation gap was found.

## Roles and priority (§4)

| Requirement | Status | Note |
|---|:---:|---|
| Four roles and protected workspaces | ✅ | Admin, coordinator, faculty and club accounts all passed live authentication checks |
| Admin generation and timetable-change approval | ✅ | Draft/publish and proposal/approval boundaries are server-side |
| Admin review of bookings that can affect classes | ✅ | Official allocator/validator handles Week 7 decisions and overrides |
| Admin can change priority order | ✅ | Settings exposes complete unique operational category ranks; competing approval and auto-approval paths enforce category rank then submission time. Official exports retain the selected dataset’s canonical order. |
| Coordinator requests department changes and books events | ✅ | Department-scoped change queue and event request flow |
| Coordinator approves bookings of department labs | ✅ | Coordinator queue and server actions are restricted to labs owned by that department, with conflict/priority checks, alternatives, notifications and audit entries |
| Faculty timetable, availability, moved/extra-session requests | ✅ | All present with deterministic validation |
| Club submit/cancel/status/reason | ✅ | All present |
| Nobody approves their own request | 🟡 | Existing requester/reviewer role separation is unchanged; the product owner explicitly declined an additional reviewer-ID inequality rule so login and current flows remain as-is |
| Fixed priority, role caps and timestamp tie-break in official run | ✅ | 0 organiser-reported priority inversions |

## Implementation rules (§6)

| Rule | Status |
|---|:---:|
| Any stack allowed | ✅ |
| `AI_USAGE.md` declares runtime and build AI use | ✅ |
| LLM never decides validity or writes directly | ✅ |
| Manual booking survives LLM failure/no credits | ✅ |
| `THIRD_PARTY.md` declares libraries, solvers and services | ✅ |
| Separate repository with visible history | ✅ |
| Repository created after hackathon start | Organiser must compare GitHub creation time (`2026-10-31T23:55:47Z`) with the official start time |

## Submission requirements (§7)

| Artifact | Status |
|---|:---:|
| Public GitHub repository | ✅ |
| README description | ✅ |
| README architecture diagram | ✅ |
| README tech stack and setup | ✅ |
| README demo accounts | ✅ |
| README known limitations | ✅ |
| `.env.example` without real secrets | ✅ |
| `AI_USAGE.md` and `THIRD_PARTY.md` | ✅ |
| `exports/schedule.json` and `schedule_after.json` | ✅ |
| Live deployed link | ✅ `https://tessra-cit.vercel.app` |
| Four working deployed demo accounts | ✅ production-authenticated route smoke passed |
| Admin reset-demo-data button | ✅ dashboard and settings |
| Maximum-five-minute walkthrough video | 🟡 recorded; public URL will be linked later |

## Live verification completed

- `GET https://tessra-cit.vercel.app/api/health` returned HTTP 200.
- Administrator, coordinator, faculty and club credentials each signed in and reached the correct protected route.
- The GitHub repository is public and `main` is active.
- The live database is separate Neon PostgreSQL; no Supabase project was accessed or modified.

## Highest-value remaining work

### Required before final handoff

1. Insert the already-recorded walkthrough’s public URL in the README/submission record.
2. After deployment, exercise one strict base-dataset upload, one snapshot-backed repair, one priority-policy update, and one coordinator lab decision without changing the database outside normal application actions.
3. Check the new settings/upload/lab-review controls once at a phone viewport.
4. Revoke every deployment token exposed in chat; none may be reused.

### Deliberate scope boundary

The original self-review hardening suggestion is not part of this implementation round. Existing requester/reviewer role separation and login behavior remain unchanged at the product owner’s explicit request.

The three implemented compliance gaps do not alter the committed scoring exports: both remain at **0 hard violations**.
