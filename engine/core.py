"""
TESSRA scheduling engine — Google OR-Tools CP-SAT.

Solves the official Crunch Week / Chilika Institute of Technology problem:
  * weekly timetable  (hard rules H1–H12, H14; soft S1–S6 with official weights)
  * Spectra-week bookings (official priority order, role caps, cancellations,
    windows, alternatives, institute-event session overrides — H13, B1–B3)
  * midsem exams (AM/PM, half capacity, multi-room, group clashes — E1/E2/H3/H4/H5)
  * disruption repair that keeps as many baseline placements as possible

The official validator.py is the source of truth; this module never claims a
result is valid — callers run the validator on the exported schedule.
"""
from __future__ import annotations

import copy
import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from ortools.sat.python import cp_model

DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
LAST_TEACHING = 9
MAX_PERIOD = 13
CAT_WEIGHT = {"institute_event": 5, "guest_lecture": 4, "department_event": 3, "club_event": 2}


# --------------------------------------------------------------------------- helpers
def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def apply_disruption(data: dict, dis: dict) -> dict:
    """Same semantics as validator.apply_disruption (permanent changes)."""
    d = copy.deepcopy(data)
    fac = {f["id"]: f for f in d["faculty"]}
    for ch in dis.get("changes", []):
        t = ch["type"]
        if t == "faculty_unavailable":
            for day in ch["days"]:
                fac[ch["faculty_id"]]["unavailable"].append(
                    {"day": day, "periods": ch["periods"], "reason": ch.get("reason", "")})
        elif t == "room_unavailable":
            for day in ch["days"]:
                d["room_unavailability"].append(
                    {"room_id": ch["room_id"], "day": day, "periods": ch["periods"], "reason": ch.get("reason", "")})
        elif t == "add_faculty":
            d["faculty"].append(ch["faculty"])
            fac[ch["faculty"]["id"]] = ch["faculty"]
        elif t == "add_session":
            d["sessions"].append(ch["session"])
        elif t == "remove_session":
            d["sessions"] = [s for s in d["sessions"] if s["id"] != ch["session_id"]]
        else:
            raise ValueError(f"Unknown change type: {t}")
    return d


def effective_category(data: dict, req: dict) -> str:
    order = data["priority_order"]
    cap = data["role_category_cap"].get(req["role"], "club_event")
    a = order.index(req["requested_category"]) if req["requested_category"] in order else len(order) - 1
    return order[max(a, order.index(cap))]


def block(start: int, dur: int) -> list[int]:
    return list(range(start, start + dur))


@dataclass
class Context:
    data: dict
    rooms: dict = field(default_factory=dict)
    fac: dict = field(default_factory=dict)
    groups: dict = field(default_factory=dict)
    sessions: dict = field(default_factory=dict)
    fac_un: dict = field(default_factory=lambda: defaultdict(set))
    room_un: dict = field(default_factory=lambda: defaultdict(set))
    lunch: int = 5
    lab_starts: tuple = (2, 6)

    def __post_init__(self):
        d = self.data
        self.rooms = {r["id"]: r for r in d["rooms"]}
        self.fac = {f["id"]: f for f in d["faculty"]}
        self.groups = {g["id"]: g for g in d["student_groups"]}
        self.sessions = {s["id"]: s for s in d["sessions"]}
        self.lunch = d["calendar"]["lunch"]["after_period"]
        self.lab_starts = tuple(d["calendar"]["lab_start_periods"])
        for f in d["faculty"]:
            for u in f.get("unavailable", []):
                for p in u["periods"]:
                    self.fac_un[f["id"]].add((u["day"], p))
        for u in d.get("room_unavailability", []):
            for p in u["periods"]:
                self.room_un[u["room_id"]].add((u["day"], p))


def feasible_rooms(ctx: Context, s: dict) -> list[str]:
    out = []
    for r in ctx.rooms.values():
        if r["type"] not in s["room_types"]:
            continue
        if r["capacity"] < s["size"]:
            continue
        if s.get("needs_accessible") and not r["accessible"]:
            continue
        # The official H6 validator checks the declared room type for regular
        # sessions. `allowed_uses` is enforced separately for bookings/exams.
        out.append(r["id"])
    return sorted(out, key=lambda rid: ctx.rooms[rid]["capacity"])


def feasible_slots(ctx: Context, s: dict) -> list[tuple[str, int]]:
    out = []
    fx = s.get("fixed_slot")
    fac_un = ctx.fac_un[s["faculty_id"]]
    for day in DAYS:
        for start in range(1, LAST_TEACHING - s["duration"] + 2):
            per = block(start, s["duration"])
            if per[0] <= ctx.lunch < per[-1]:
                continue
            if s["kind"] == "lab" and start not in ctx.lab_starts:
                continue
            if fx and (fx["day"] != day or fx["start_period"] != start):
                continue
            if any((day, p) in fac_un for p in per):
                continue
            out.append((day, start))
    return out


def infeasibility_reasons(ctx: Context) -> list[str]:
    """Explain, before solving, which sessions cannot possibly be placed."""
    reasons = []
    for s in ctx.sessions.values():
        rooms = feasible_rooms(ctx, s)
        slots = feasible_slots(ctx, s)
        if not rooms:
            reasons.append(f"{s['id']}: no room matches types {s['room_types']}, size {s['size']}"
                           + (", accessible" if s.get("needs_accessible") else ""))
        if not slots:
            reasons.append(f"{s['id']}: no day/period satisfies duration {s['duration']}, "
                           f"lab starts {ctx.lab_starts if s['kind'] == 'lab' else '-'}, "
                           "faculty unavailability and fixed slot")
        if rooms and slots:
            ok = any(all((day, p) not in ctx.room_un[rid] for p in block(st, s["duration"]))
                     for rid in rooms for day, st in slots)
            if not ok:
                reasons.append(f"{s['id']}: every candidate room is under maintenance in every candidate slot")
    return reasons


# --------------------------------------------------------------------------- CP-SAT timetable
@dataclass
class SolveResult:
    status: str                      # optimal | feasible | infeasible | unknown
    assignment: dict                 # sid -> (day, start, room)
    objective: float | None
    wall_time: float
    reasons: list[str]
    moved: list[str] = field(default_factory=list)
    minimum_moves_proven: bool | None = None
    minimum_moves: int | None = None


def solve_timetable(data: dict, baseline: dict | None = None, time_limit: float = 60.0,
                    workers: int = 2, move_penalty: int = 1000) -> SolveResult:
    """Solve the timetable with the official soft objective.

    Repairs are lexicographic: first prove the smallest possible number of
    baseline moves, then hold that count fixed while minimising S1–S6. The
    legacy ``move_penalty`` argument is retained for API compatibility but no
    longer approximates the priority between stability and soft quality.
    """
    del move_penalty
    import time
    t0 = time.time()
    ctx = Context(data)
    reasons = infeasibility_reasons(ctx)
    if reasons:
        return SolveResult("infeasible", {}, None, time.time() - t0, reasons)

    m = cp_model.CpModel()
    z: dict[str, dict[tuple[str, int, str], Any]] = {}
    slot_sum: dict[str, dict[tuple[str, int], list]] = defaultdict(lambda: defaultdict(list))
    room_occ: dict[tuple[str, str, int], list] = defaultdict(list)
    fac_occ: dict[tuple[str, str, int], list] = defaultdict(list)
    fac_day: dict[tuple[str, str], list] = defaultdict(list)
    obj_terms: list = []

    baskets: dict[str, list[dict]] = defaultdict(list)
    for s in ctx.sessions.values():
        if s.get("basket_slot"):
            baskets[s["basket_slot"]].append(s)

    for s in ctx.sessions.values():
        sid = s["id"]
        rooms = feasible_rooms(ctx, s)
        slots = feasible_slots(ctx, s)
        z[sid] = {}
        cap_avoid = []
        for f_pref in ctx.fac[s["faculty_id"]].get("preferences", []):
            if f_pref.get("type") == "avoid":
                cap_avoid.append((set(f_pref.get("days", DAYS)), set(f_pref["periods"])))
        for day, st in slots:
            per = block(st, s["duration"])
            for rid in rooms:
                if any((day, p) in ctx.room_un[rid] for p in per):
                    continue
                v = m.NewBoolVar(f"z|{sid}|{day}|{st}|{rid}")
                z[sid][(day, st, rid)] = v
                slot_sum[sid][(day, st)].append(v)
                for p in per:
                    room_occ[(rid, day, p)].append(v)
                    fac_occ[(s["faculty_id"], day, p)].append(v)
                fac_day[(s["faculty_id"], day)].append((s["duration"], v))
                # ---- official soft weights, applied per assignment ----
                cost = 0
                for days_set, periods_set in cap_avoid:
                    if day in days_set:
                        cost += 2 * sum(1 for p in per if p in periods_set)      # S1
                if ctx.rooms[rid]["capacity"] and s["size"] / ctx.rooms[rid]["capacity"] < 0.4:
                    cost += 1                                                   # S5
                if LAST_TEACHING in per:
                    cost += 1                                                   # S6
                if cost:
                    obj_terms.append(cost * v)
        if not z[sid]:
            return SolveResult("infeasible", {}, None, time.time() - t0,
                               [f"{sid}: no (day, period, room) combination survives the hard constraints"])
        m.AddExactlyOne(z[sid].values())

    # occupancy hard constraints
    for vs in room_occ.values():
        if len(vs) > 1:
            m.AddAtMostOne(vs)                                                  # H4
    for vs in fac_occ.values():
        if len(vs) > 1:
            m.AddAtMostOne(vs)                                                  # H2

    # basket sync: every session of a basket slot at the same day+start (H11)
    basket_time: dict[str, dict[tuple[str, int], Any]] = {}
    for bslot, members in baskets.items():
        durations = {s["duration"] for s in members}
        if len(durations) != 1:
            return SolveResult("infeasible", {}, None, time.time() - t0,
                               [f"Basket {bslot}: members have different durations; official semantics require equal timing"])
        basket_time[bslot] = {}
        cand = set()
        for s in members:
            cand |= set(slot_sum[s["id"]].keys())
        for ds in sorted(cand):
            t = m.NewBoolVar(f"basket|{bslot}|{ds[0]}|{ds[1]}")
            basket_time[bslot][ds] = t
            for s in members:
                m.Add(sum(slot_sum[s["id"]].get(ds, [])) == t)
        m.AddExactlyOne(basket_time[bslot].values())

    # Group occupancy (H3). A basket contributes once to every group appearing
    # in any member; the shared basket-time variable mirrors the validator's set
    # semantics even if member group lists are not identical.
    grp_occ_vars: dict[tuple[str, str, int], Any] = {}
    grp_occ_terms: dict[tuple[str, str, int], list] = defaultdict(list)
    grp_day_terms: dict[tuple[str, str], list] = defaultdict(list)
    day_of: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for s in ctx.sessions.values():
        sid = s["id"]
        if s.get("basket_slot"):
            continue
        for (day, st), vs in slot_sum[sid].items():
            day_of[sid][day].extend(vs)
            for p in block(st, s["duration"]):
                for g in s["groups"]:
                    grp_occ_terms[(g, day, p)].extend(vs)
            for g in s["groups"]:
                grp_day_terms[(g, day)].append((s["duration"], vs))

    for bslot, members in baskets.items():
        duration = members[0]["duration"]
        groups = sorted({g for s in members for g in s["groups"]})
        for (day, st), basket_var in basket_time[bslot].items():
            for p in block(st, duration):
                for g in groups:
                    grp_occ_terms[(g, day, p)].append(basket_var)
            for g in groups:
                grp_day_terms[(g, day)].append((duration, [basket_var]))

    for key, vs in grp_occ_terms.items():
        o = m.NewBoolVar(f"occ|{key[0]}|{key[1]}|{key[2]}")
        # Equality to a Boolean both defines occupancy and enforces H3.
        m.Add(sum(vs) == o)
        grp_occ_vars[key] = o

    # faculty daily limit (H12)
    for (fid, day), terms in fac_day.items():
        limit = ctx.fac[fid].get("max_hours_per_day", 4)
        m.Add(sum(d * v for d, v in terms) <= limit)

    # S3: group >6h/day → 3 per extra hour
    for (g, day), terms in grp_day_terms.items():
        hours = sum(d * sum(vs) for d, vs in terms)
        over = m.NewIntVar(0, LAST_TEACHING, f"over6|{g}|{day}")
        m.Add(over >= hours - 6)
        obj_terms.append(3 * over)

    # S2: one point for every unoccupied teaching period that has a class
    # before and after it on the same day. Lunch is between P5/P6 and therefore
    # is not represented as a period, exactly as in validator.py.
    for g in ctx.groups:
        for day in DAYS:
            occ = {p: grp_occ_vars[(g, day, p)] for p in range(1, LAST_TEACHING + 1)
                   if (g, day, p) in grp_occ_vars}
            if len(occ) < 2:
                continue
            for p in range(2, LAST_TEACHING):
                lows = [var for q, var in occ.items() if q < p]
                highs = [var for q, var in occ.items() if q > p]
                if not lows or not highs:
                    continue
                before = m.NewBoolVar(f"bef|{g}|{day}|{p}")
                after = m.NewBoolVar(f"aft|{g}|{day}|{p}")
                m.AddMaxEquality(before, lows)
                m.AddMaxEquality(after, highs)
                here = occ.get(p, 0)
                gap = m.NewBoolVar(f"gap|{g}|{day}|{p}")
                m.Add(gap <= before)
                m.Add(gap <= after)
                m.Add(gap + here <= 1)
                m.Add(gap >= before + after - here - 1)
                obj_terms.append(gap)

    # S4: same course twice in a day for a group (lectures); baskets per course/day
    course_day: dict[tuple[str, str, str], list] = defaultdict(list)
    for s in ctx.sessions.values():
        if s["kind"] != "lecture" or s.get("basket_slot"):
            continue
        for day, vs in day_of[s["id"]].items():
            for g in s["groups"]:
                course_day[(g, day, s["course_id"])].extend(vs)
    for key, vs in course_day.items():
        cnt = sum(vs)
        over = m.NewIntVar(0, 8, f"rep|{key[0]}|{key[1]}|{key[2]}")
        m.Add(over >= cnt - 1)
        obj_terms.append(3 * over)
    basket_course_day: dict[tuple[str, str], list] = defaultdict(list)
    for bslot, members in baskets.items():
        for s in members:
            for (day, _st), t in basket_time[bslot].items():
                basket_course_day[(s["course_id"], day)].append(t)
    for key, vs in basket_course_day.items():
        over = m.NewIntVar(0, 8, f"brep|{key[0]}|{key[1]}")
        m.Add(over >= sum(vs) - 1)
        obj_terms.append(3 * over)

    # Stability is a true lexicographic objective. Placements made illegal by
    # the disruption are forced moves; every still-legal baseline placement has
    # a Boolean that is minimised in phase one. Only after that count is proven
    # do we minimise the official S1–S6 objective.
    moved_vars: dict[str, tuple[Any, tuple[str, int, str]]] = {}
    forced_moves = 0
    if baseline:
        base = {e["session_id"]: (e["day"], e["start_period"], e["room_id"]) for e in baseline.get("sessions", [])}
        for sid, place in base.items():
            if sid not in z:
                continue
            if place in z[sid]:
                mv = m.NewBoolVar(f"moved|{sid}")
                m.Add(mv == 1 - z[sid][place])
                moved_vars[sid] = (mv, place)
                m.AddHint(z[sid][place], 1)
            else:
                forced_moves += 1

    status_names = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "unknown",
    }

    def new_solver(limit: float):
        configured = cp_model.CpSolver()
        configured.parameters.max_time_in_seconds = max(1.0, float(limit))
        configured.parameters.num_search_workers = workers
        configured.parameters.random_seed = 42
        return configured

    def read_solution(active_solver, status_name: str, objective: float | None,
                      minimum_proven: bool | None, minimum_count: int | None,
                      reasons: list[str] | None = None):
        assign = {}
        for sid, combos in z.items():
            for (day, st, rid), var in combos.items():
                if active_solver.Value(var):
                    assign[sid] = (day, st, rid)
                    break
        moved = [sid for sid, (var, _place) in moved_vars.items() if active_solver.Value(var)]
        moved += [f"(forced){i}" for i in range(forced_moves)]
        return SolveResult(status_name, assign, objective, time.time() - t0, reasons or [], moved,
                           minimum_proven, minimum_count)

    soft_objective = sum(obj_terms)
    minimum_proven: bool | None = True if baseline and not moved_vars else None
    minimum_count: int | None = forced_moves if baseline and not moved_vars else None

    move_solver = None
    if baseline and moved_vars:
        move_expression = sum(var for var, _place in moved_vars.values())
        m.Minimize(move_expression)
        move_limit = min(45.0, max(1.0, float(time_limit) * 0.35))
        move_solver = new_solver(move_limit)
        move_status = move_solver.Solve(m)
        move_name = status_names.get(move_status, "unknown")
        if move_name not in ("optimal", "feasible"):
            hint = ["CP-SAT proved no repair satisfies all hard constraints." if move_name == "infeasible"
                    else "Solver stopped before finding a repair; raise the time limit."]
            return SolveResult(move_name, {}, None, time.time() - t0, hint, [], False, None)
        optional_moves = sum(move_solver.Value(var) for var, _place in moved_vars.values())
        minimum_count = forced_moves + optional_moves
        minimum_proven = move_name == "optimal"
        if not minimum_proven:
            return read_solution(
                move_solver,
                "feasible",
                None,
                False,
                minimum_count,
                ["A hard-valid repair was found, but the minimum move count was not proven within the time limit."],
            )
        m.Add(move_expression == optional_moves)
        # Seed phase two with the proven phase-one repair. This guarantees a
        # feasible incumbent quickly even when soft optimisation is expensive.
        m.ClearHints()
        for combos in z.values():
            for var in combos.values():
                if move_solver.Value(var):
                    m.AddHint(var, 1)

    m.Minimize(soft_objective)
    remaining = max(5.0, float(time_limit) - (time.time() - t0))
    solver = new_solver(remaining)
    status = solver.Solve(m)
    name = status_names.get(status, "unknown")
    if name in ("optimal", "feasible"):
        if baseline and minimum_count is None:
            minimum_count = forced_moves + sum(solver.Value(var) for var, _place in moved_vars.values())
        return read_solution(solver, name, solver.ObjectiveValue(), minimum_proven, minimum_count)
    if move_solver is not None and minimum_proven:
        return read_solution(
            move_solver,
            "feasible",
            None,
            True,
            minimum_count,
            ["The minimum move count was proven; soft-objective refinement reached its time limit."],
        )
    hint = ["CP-SAT proved no assignment satisfies all hard constraints." if name == "infeasible"
            else "Solver stopped before proving feasibility; raise the time limit."]
    return SolveResult(name, {}, None, time.time() - t0, hint, [], minimum_proven, minimum_count)


# --------------------------------------------------------------------------- independent hard check
def check_assignment(data: dict, assign: dict) -> list[str]:
    """Deterministic mirror of the validator's timetable rules (used before
    persisting manual moves / booking overrides). The official validator remains
    the final authority."""
    ctx = Context(data)
    V = []
    room_occ, fac_occ, fac_day = defaultdict(list), defaultdict(list), defaultdict(int)
    grp_occ = defaultdict(set)
    basket_time = defaultdict(set)
    for sid in ctx.sessions:
        if sid not in assign:
            V.append(f"H1 {sid} not scheduled")
    for sid, (day, st, rid) in assign.items():
        s = ctx.sessions.get(sid)
        r = ctx.rooms.get(rid)
        if not s or not r or day not in DAYS:
            V.append(f"H1 {sid} invalid placement")
            continue
        per = block(st, s["duration"])
        if st < 1 or per[-1] > LAST_TEACHING:
            V.append(f"H9 {sid} outside P1–P9")
        if per[0] <= ctx.lunch < per[-1]:
            V.append(f"H9 {sid} crosses lunch")
        if s["kind"] == "lab" and st not in ctx.lab_starts:
            V.append(f"H9 {sid} lab start")
        fx = s.get("fixed_slot")
        if fx and (fx["day"] != day or fx["start_period"] != st):
            V.append(f"H14 {sid} fixed slot moved")
        if r["capacity"] < s["size"]:
            V.append(f"H5 {sid} capacity")
        if r["type"] not in s["room_types"]:
            V.append(f"H6 {sid} room type")
        if s.get("needs_accessible") and not r["accessible"]:
            V.append(f"H10 {sid} accessibility")
        for p in per:
            room_occ[(rid, day, p)].append(sid)
            fac_occ[(s["faculty_id"], day, p)].append(sid)
            key = s.get("basket_slot") or sid
            for g in s["groups"]:
                grp_occ[(g, day, p)].add(key)
            if (day, p) in ctx.fac_un[s["faculty_id"]]:
                V.append(f"H7 {sid} faculty unavailable")
            if (day, p) in ctx.room_un[rid]:
                V.append(f"H8 {sid} room unavailable")
        fac_day[(s["faculty_id"], day)] += s["duration"]
        if s.get("basket_slot"):
            basket_time[s["basket_slot"]].add((day, st))
    for k, v in room_occ.items():
        if len(v) > 1:
            V.append(f"H4 room {k} double-booked {v}")
    for k, v in fac_occ.items():
        if len(v) > 1:
            V.append(f"H2 faculty {k} double-booked {v}")
    for k, v in grp_occ.items():
        if len(v) > 1:
            V.append(f"H3 group {k} double-booked {sorted(v)}")
    for b, times in basket_time.items():
        if len(times) > 1:
            V.append(f"H11 basket {b} split {sorted(times)}")
    for (f, day), h in fac_day.items():
        if h > ctx.fac[f].get("max_hours_per_day", 4):
            V.append(f"H12 {f} {day} {h}h over daily limit")
    return V


# --------------------------------------------------------------------------- bookings (Spectra week)
def allocate_bookings(data: dict, assign: dict) -> dict:
    """Spectra-week decisions in strict official priority order.

    `week` holds ONLY real session placements so check_assignment can validate
    it; placed bookings are tracked separately and overlaid on the occupancy
    maps. Only institute events may displace classes, every displaced class
    must pass the deterministic hard check in its new slot, and a booking can
    never displace another booking or be counted as a movable session.
    """
    ctx = Context(data)
    order = data["priority_order"]
    cancelled = {c["request_id"] for c in data.get("cancellations", [])}
    reqs = sorted((r for r in data["booking_requests"]),
                  key=lambda r: (order.index(effective_category(data, r)), r["submitted_at"]))
    week = dict(assign)
    placed: list[dict] = []  # approved/alternative bookings: request_id, room_id, day, a, b, mandatory
    overrides: list[dict] = []
    decisions: list[dict] = []

    def week_maps():
        room_busy = defaultdict(list)
        grp_busy = defaultdict(set)
        for sid, (day, st, rid) in week.items():
            s = ctx.sessions.get(sid)
            if not s:
                continue
            for p in block(st, s["duration"]):
                room_busy[(rid, day, p)].append(sid)
                for g in s["groups"]:
                    grp_busy[(g, day, p)].add(sid)
        for bk in placed:
            for p in range(bk["a"], bk["b"] + 1):
                room_busy[(bk["room_id"], bk["day"], p)].append(bk["request_id"])
                for g in bk["mandatory"]:
                    grp_busy[(g, bk["day"], p)].add(bk["request_id"])
        return room_busy, grp_busy

    def room_ok(req, rid):
        r = ctx.rooms.get(rid)
        if not r or "event" not in r.get("allowed_uses", []):
            return False
        if r["type"] not in req["room_types"] or r["capacity"] < req["attendance"]:
            return False
        feats = set(r["features"]) | ({"accessible"} if r["accessible"] else set())
        return not (set(req["needs"]) - feats)

    def slot_free(req, rid, day, a, b, room_busy, grp_busy):
        for p in range(a, b + 1):
            if (day, p) in ctx.room_un[rid]:
                return False
            if room_busy[(rid, day, p)]:
                return False
            for g in req["mandatory_for_groups"]:
                if grp_busy.get((g, day, p)):
                    return False
        return True

    def booking_clear(rid, day, a, b, groups):
        """A relocated class must not land on a placed booking's room or mandatory groups."""
        for bk in placed:
            if bk["day"] != day or not (a <= bk["b"] and bk["a"] <= b):
                continue
            if bk["room_id"] == rid or (set(groups) & set(bk["mandatory"])):
                return False
        return True

    def try_move_sessions(req, rid, day, a, b):
        """Institute events may displace regular sessions — every displaced class
        must land in a fully valid slot (timetable AND placed bookings), and the
        event's mandatory groups must actually be free afterwards."""
        idx = defaultdict(list)
        for sid, (d0, st, r0) in week.items():
            s = ctx.sessions.get(sid)
            if s:
                for p in block(st, s["duration"]):
                    idx[(r0, d0, p)].append(sid)
        conflicts = sorted({sid for p in range(a, b + 1) for sid in idx.get((rid, day, p), [])})
        if not conflicts or len(conflicts) > 2:
            return None
        for sid in conflicts:
            s = ctx.sessions[sid]
            if s.get("fixed_slot") or s.get("basket_slot"):
                return None  # fixed classes never move; baskets can't move alone
        trial = dict(week)
        proposed = []
        for sid in conflicts:
            s = ctx.sessions[sid]
            best = None
            for nd, ns in feasible_slots(ctx, s):
                nb = ns + s["duration"] - 1
                in_event_time = nd == day and ns <= b and a <= nb
                for nr in feasible_rooms(ctx, s):
                    # the destination must actually FREE the event: same room during
                    # the event, or a mandatory group's class at that time, is useless
                    if in_event_time and (nr == rid or set(s["groups"]) & set(req["mandatory_for_groups"])):
                        continue
                    if not booking_clear(nr, nd, ns, nb, s["groups"]):
                        continue
                    cand = dict(trial)
                    cand[sid] = (nd, ns, nr)
                    if check_assignment(data, cand):
                        continue
                    score = (0 if (nd, ns) == week[sid][:2] else 1, DAYS.index(nd), ns, ctx.rooms[nr]["capacity"])
                    if best is None or score < best[0]:
                        best = (score, (nd, ns, nr))
            if best is None:
                return None
            trial[sid] = best[1]
            proposed.append((sid, best[1]))
        # the event itself must now be clash-free: room empty AND mandatory groups free
        room_busy = defaultdict(list)
        grp_busy = defaultdict(set)
        for sid, (d0, st, r0) in trial.items():
            s = ctx.sessions.get(sid)
            if not s:
                continue
            for p in block(st, s["duration"]):
                room_busy[(r0, d0, p)].append(sid)
                for g in s["groups"]:
                    grp_busy[(g, d0, p)].add(sid)
        for bk in placed:
            for p in range(bk["a"], bk["b"] + 1):
                room_busy[(bk["room_id"], bk["day"], p)].append(bk["request_id"])
                for g in bk["mandatory"]:
                    grp_busy[(g, bk["day"], p)].add(bk["request_id"])
        if not slot_free(req, rid, day, a, b, room_busy, grp_busy):
            return None
        return trial, proposed

    for req in reqs:
        rid_ = req["id"]
        if rid_ in cancelled:
            decisions.append({"request_id": rid_, "status": "rejected",
                              "reason": "Cancelled by the requester; never approved (official cancellations list)."})
            continue
        cat = effective_category(data, req)
        dur = req["duration_periods"]
        rooms = [r for r in ctx.rooms if room_ok(req, r)]
        rooms.sort(key=lambda r: (r != req.get("requested_room"), ctx.rooms[r]["capacity"]))
        room_busy, grp_busy = week_maps()
        chosen = None
        # 1) inside the requested windows
        for w in req["windows"]:
            for a in range(w["from_period"], w["to_period"] - dur + 2):
                b = a + dur - 1
                if b > MAX_PERIOD:
                    continue
                for rid in rooms:
                    if slot_free(req, rid, w["day"], a, b, room_busy, grp_busy):
                        chosen = ("approved", w["day"], a, b, rid,
                                  f"{cat.replace('_', ' ').title()} within the requested window"
                                  + (" in the requested room" if rid == req.get("requested_room") else ""))
                        break
                if chosen:
                    break
            if chosen:
                break
        # 2) institute events may displace classes (session_overrides)
        if not chosen and cat == "institute_event":
            for w in req["windows"]:
                for a in range(w["from_period"], w["to_period"] - dur + 2):
                    b = a + dur - 1
                    if b > MAX_PERIOD:
                        continue
                    for rid in rooms:
                        moved = try_move_sessions(req, rid, w["day"], a, b)
                        if moved:
                            trial, proposed = moved
                            week.clear()
                            week.update(trial)
                            for sid, (nd, ns, nr) in proposed:
                                overrides.append({"session_id": sid, "day": nd, "start_period": ns,
                                                  "room_id": nr, "displaced_by": rid_})
                            chosen = ("approved", w["day"], a, b, rid,
                                      f"Institute event; {len(proposed)} class(es) relocated to validated slots")
                            break
                    if chosen:
                        break
                if chosen:
                    break
        # 3) alternative outside the window (half score, needs a reason)
        if not chosen and rooms:
            wanted_days = [w["day"] for w in req["windows"]] + [d for d in DAYS if d not in {w["day"] for w in req["windows"]}]
            periods_pref = list(range(10, MAX_PERIOD + 1)) + list(range(1, 10))
            room_busy, grp_busy = week_maps()
            for day in wanted_days:
                for a in periods_pref:
                    b = a + dur - 1
                    if b > MAX_PERIOD:
                        continue
                    for rid in rooms:
                        if slot_free(req, rid, day, a, b, room_busy, grp_busy):
                            chosen = ("alternative_offered", day, a, b, rid,
                                      "Requested window unavailable (higher-priority holds or room busy); "
                                      f"offering {day} P{a}\u2013P{b} in {rid}")
                            break
                    if chosen:
                        break
                if chosen:
                    break
        if chosen:
            st, day, a, b, rid, reason = chosen
            decisions.append({"request_id": rid_, "status": st, "day": day, "start_period": a,
                              "end_period": b, "room_id": rid, "reason": reason})
            placed.append({"request_id": rid_, "room_id": rid, "day": day, "a": a, "b": b,
                           "mandatory": list(req["mandatory_for_groups"])})
        else:
            if not rooms:
                biggest = max((r["capacity"] for r in ctx.rooms.values() if r["type"] in req["room_types"]), default=0)
                reason = (f"No suitable venue: needs {req['attendance']} seats in {req['room_types']}"
                          + (f" with {req['needs']}" if req["needs"] else "")
                          + f"; largest matching capacity is {biggest}.")
            else:
                reason = ("Every suitable room is occupied by higher-priority sessions or bookings "
                          "in all requested windows and no valid alternative slot remains.")
            decisions.append({"request_id": rid_, "status": "rejected", "reason": reason})
    return {"bookings": decisions, "session_overrides": overrides}


# --------------------------------------------------------------------------- exams
def pick_exam_rooms(free: list[dict], need: int) -> list[dict] | None:
    """Fewest rooms at HALF capacity, preserving the biggest halls: an exact
    single-room fit wins; otherwise cover descending, skipping the largest
    room while the rest suffice so parallel big exams stay feasible."""
    fits = [r for r in free if r["capacity"] // 2 >= need]
    if fits:
        return [min(fits, key=lambda r: (r["capacity"] // 2, r["id"]))]
    desc = sorted(free, key=lambda r: (-(r["capacity"] // 2), r["id"]))
    if sum(r["capacity"] // 2 for r in desc) < need:
        return None
    if len(desc) > 1 and sum(r["capacity"] // 2 for r in desc[1:]) >= need:
        desc = desc[1:]
    chosen: list[dict] = []
    got = 0
    for r in desc:
        chosen.append(r)
        got += r["capacity"] // 2
        if got >= need:
            break
    return chosen


def allocate_exams(data: dict) -> list[dict]:
    ctx = Context(data)
    cal = data["calendar"]["exam_week"]
    slots = [(d, s["id"]) for d in cal["days"] for s in cal["sessions"]]
    exam_rooms = sorted((r for r in data["rooms"] if "exam" in r.get("allowed_uses", [])),
                        key=lambda r: -(r["capacity"] // 2))
    exams = sorted(data.get("exams", []), key=lambda e: (-e["size"], -len(e["groups"]), e["id"]))
    grp_slot: dict[tuple[str, str, str], str] = {}
    grp_day: dict[tuple[str, str], set] = defaultdict(set)
    room_slot: dict[tuple[str, str, str], str] = {}
    out = []
    for e in exams:
        best = None
        for di, (day, sess) in enumerate(slots):
            if any(grp_slot.get((g, day, sess)) for g in e["groups"]):
                continue
            free = [r for r in exam_rooms if (r["id"], day, sess) not in room_slot]
            chosen = pick_exam_rooms(free, e["size"])
            if chosen is None:
                continue
            dup = sum(1 for g in e["groups"] if e["id"] not in grp_day[(g, day)] and grp_day[(g, day)])
            waste = sum(r["capacity"] // 2 for r in chosen) - e["size"]
            score = (dup, len(chosen), waste, di)
            if best is None or score < best[0]:
                best = (score, day, sess, chosen)
        if best is None:
            continue  # validator will report it as unscheduled — never fake a placement
        _, day, sess, chosen = best
        for r in chosen:
            room_slot[(r["id"], day, sess)] = e["id"]
        for g in e["groups"]:
            grp_slot[(g, day, sess)] = e["id"]
            grp_day[(g, day)].add(e["id"])
        out.append({"exam_id": e["id"], "day": day, "session": sess, "rooms": [r["id"] for r in chosen]})
    return out


# --------------------------------------------------------------------------- pipeline
def build_schedule(data: dict, team: str = "TESSRA", time_limit: float = 60.0,
                   baseline: dict | None = None, include_fest: bool | None = None,
                   include_exams: bool | None = None, workers: int = 2) -> dict:
    result = solve_timetable(data, baseline=baseline, time_limit=time_limit, workers=workers)
    if result.status not in ("optimal", "feasible"):
        return {"team": team, "dataset_id": data.get("dataset_id"),
                "solver": {"status": result.status, "reasons": result.reasons,
                           "wall_time": round(result.wall_time, 2),
                           "minimum_moves_proven": result.minimum_moves_proven,
                           "minimum_moves": result.minimum_moves},
                "sessions": []}
    if include_fest is None:
        include_fest = baseline is None
    if include_exams is None:
        include_exams = baseline is None
    sched: dict[str, Any] = {
        "team": team,
        "dataset_id": data.get("dataset_id"),
        "solver": {"status": result.status, "objective": result.objective,
                   "wall_time": round(result.wall_time, 2),
                   "sessions_moved_from_baseline": len(result.moved) if baseline else None,
                   "minimum_moves_proven": result.minimum_moves_proven,
                   "minimum_moves": result.minimum_moves,
                   "minimum_move_objective": "lexicographic" if baseline else None,
                   "reasons": result.reasons},
        "sessions": [{"session_id": sid, "day": d, "start_period": st, "room_id": rid}
                     for sid, (d, st, rid) in sorted(result.assignment.items())],
    }
    if include_fest:
        sched["fest_week"] = allocate_bookings(data, result.assignment)
    if include_exams:
        sched["exams"] = allocate_exams(data)
    return sched
