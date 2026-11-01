"""TESSRA engine tests: every official hard rule on tiny synthetic datasets,
booking priority semantics, exams, plus an end-to-end run of the OFFICIAL
validator on the OFFICIAL dataset (skipped only if the pack is absent)."""
import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from core import (Context, allocate_bookings, allocate_exams, apply_disruption,
                  build_schedule, check_assignment, solve_timetable)

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "official/starterpack/CrunchWeek_StarterPack"


def room(rid, rtype="classroom", cap=60, accessible=True, uses=("lecture", "tutorial", "exam", "event"), features=()):
    return {"id": rid, "name": rid, "building": "B", "type": rtype, "capacity": cap,
            "features": list(features), "accessible": accessible, "allowed_uses": list(uses)}


def fac(fid, max_h=4, unavailable=(), prefs=()):
    return {"id": fid, "name": fid, "department": "CSE", "max_hours_per_day": max_h,
            "needs_accessible": False,
            "unavailable": [{"day": d, "periods": list(ps), "reason": "test"} for d, ps in unavailable],
            "preferences": list(prefs)}


def sess(sid, fid="F1", groups=("G1",), size=30, dur=1, kind="lecture", types=("classroom",),
         accessible=False, basket=None, fixed=None, course=None):
    return {"id": sid, "course_id": course or sid.split("-")[0], "kind": kind, "groups": list(groups),
            "faculty_id": fid, "size": size, "duration": dur, "room_types": list(types),
            "needs_accessible": accessible, "basket_slot": basket, "fixed_slot": fixed}


def dataset(rooms=None, faculty=None, sessions=None, groups=None, bookings=(), cancellations=(), exams=(), room_un=()):
    return {
        "dataset_id": "test-v1", "institute": "Test",
        "calendar": {"days": ["MON", "TUE", "WED", "THU", "FRI"],
                     "lunch": {"after_period": 5, "start": "13:00", "end": "14:00"},
                     "lab_start_periods": [2, 6], "event_only_periods": [10, 11, 12, 13],
                     "exam_week": {"days": ["MON", "TUE"], "sessions": [{"id": "AM"}, {"id": "PM"}]}},
        "priority_order": ["exam", "regular_session", "institute_event", "guest_lecture", "department_event", "club_event"],
        "role_category_cap": {"admin": "institute_event", "faculty": "guest_lecture",
                              "department_coordinator": "department_event", "club": "club_event"},
        "rooms": rooms or [room("R1")], "faculty": faculty or [fac("F1")],
        "student_groups": groups or [{"id": "G1", "name": "G1", "year": 1, "department": "CSE", "size": 30, "needs_accessible": False}],
        "courses": [], "sessions": sessions or [sess("S1")],
        "booking_requests": list(bookings), "cancellations": list(cancellations),
        "exams": list(exams), "room_unavailability": list(room_un),
    }


def solve(data, **kw):
    r = solve_timetable(data, time_limit=kw.pop("time_limit", 10), workers=4, **kw)
    assert r.status in ("optimal", "feasible"), r.reasons
    assert not check_assignment(data, r.assignment), check_assignment(data, r.assignment)
    return r.assignment


# ------------------------------------------------------------------ hard rules
def test_h2_faculty_no_clash():
    a = solve(dataset(sessions=[sess("S1"), sess("S2")]))
    assert (a["S1"][0], a["S1"][1]) != (a["S2"][0], a["S2"][1])


def test_h3_group_no_clash_different_faculty():
    a = solve(dataset(faculty=[fac("F1"), fac("F2")], sessions=[sess("S1"), sess("S2", fid="F2")]))
    assert (a["S1"][0], a["S1"][1]) != (a["S2"][0], a["S2"][1])


def test_h4_room_no_double_booking():
    a = solve(dataset(faculty=[fac("F1"), fac("F2")],
                      groups=[{"id": "G1", "size": 30}, {"id": "G2", "size": 30}],
                      sessions=[sess("S1"), sess("S2", fid="F2", groups=("G2",))]))
    assert a["S1"] != a["S2"]


def test_h5_capacity_and_h6_type_and_h10_accessibility():
    rooms = [room("SMALL", cap=20), room("LAB", rtype="lab_cs", uses=("lab",)),
             room("STAIRS", cap=90, accessible=False), room("OK", cap=90)]
    a = solve(dataset(rooms=rooms, sessions=[sess("S1", size=60, accessible=True)]))
    assert a["S1"][2] == "OK"


def test_h7_faculty_unavailability():
    data = dataset(faculty=[fac("F1", unavailable=[("MON", range(1, 10))])],
                   sessions=[sess("S1", fixed={"day": "TUE", "start_period": 1})])
    a = solve(data)
    assert a["S1"][0] == "TUE"


def test_h8_room_unavailability():
    data = dataset(room_un=[{"room_id": "R1", "day": "MON", "periods": list(range(1, 14)), "reason": "x"}])
    a = solve(data)
    assert a["S1"][0] != "MON"


def test_h9_lab_starts_and_lunch():
    data = dataset(rooms=[room("LAB", rtype="lab_cs", cap=60, uses=("lab",))],
                   sessions=[sess("L1", kind="lab", dur=3, types=("lab_cs",))])
    a = solve(data)
    assert a["L1"][1] in (2, 6)
    # a 2-period lecture can never start at P5 (would cross lunch)
    a2 = solve(dataset(sessions=[sess("S2", dur=2)]))
    per = range(a2["S2"][1], a2["S2"][1] + 2)
    assert not (min(per) <= 5 < max(per))


def test_h11_basket_same_time_different_rooms():
    data = dataset(rooms=[room("R1"), room("R2")], faculty=[fac("F1"), fac("F2")],
                   sessions=[sess("OE1-L1", basket="OEB-1", course="OE1"),
                             sess("OE2-L1", fid="F2", basket="OEB-1", course="OE2")])
    a = solve(data)
    assert a["OE1-L1"][:2] == a["OE2-L1"][:2]
    assert a["OE1-L1"][2] != a["OE2-L1"][2]
    # a non-basket session for the same group must NOT sit at the basket time
    data["sessions"].append(sess("OTHER", fid="F1", course="XX"))
    a = solve(data)
    assert (a["OTHER"][0], a["OTHER"][1]) != (a["OE1-L1"][0], a["OE1-L1"][1])


def test_h12_daily_limit():
    data = dataset(faculty=[fac("F1", max_h=2)], sessions=[sess(f"S{i}") for i in range(6)])
    a = solve(data)
    per_day = {}
    for day, st, rid in a.values():
        per_day[day] = per_day.get(day, 0) + 1
    assert max(per_day.values()) <= 2


def test_h14_fixed_slot_stays():
    data = dataset(sessions=[sess("S1", fixed={"day": "THU", "start_period": 6})])
    assert solve(data)["S1"][:2] == ("THU", 6)


def test_h1_checker_rejects_missing_and_unknown_sessions():
    data = dataset(sessions=[sess("S1")])
    assert any(v.startswith("H1 S1 not scheduled") for v in check_assignment(data, {}))
    violations = check_assignment(data, {"S1": ("MON", 1, "R1"), "BOGUS": ("MON", 2, "R1")})
    assert any(v.startswith("H1 BOGUS invalid placement") for v in violations)


def objective(data):
    result = solve_timetable(data, time_limit=10, workers=1)
    assert result.status == "optimal", result.reasons
    assert not check_assignment(data, result.assignment)
    return int(result.objective)


def test_soft_s1_faculty_avoid_weight_is_two_per_period():
    data = dataset(
        faculty=[fac("F1", prefs=[{"type": "avoid", "days": ["MON"], "periods": [1]}])],
        sessions=[sess("S1", fixed={"day": "MON", "start_period": 1})],
    )
    assert objective(data) == 2


def test_soft_s2_counts_an_actual_empty_period_between_classes():
    data = dataset(
        faculty=[fac("F1"), fac("F2")],
        sessions=[sess("C1-L1", fixed={"day": "MON", "start_period": 1}),
                  sess("C2-L1", fid="F2", fixed={"day": "MON", "start_period": 3})],
    )
    assert objective(data) == 1


def test_soft_s3_group_over_six_hours_weight_is_three_per_extra_hour():
    faculty = [fac(f"F{i}") for i in range(1, 8)]
    sessions = [sess(f"C{i}-L1", fid=f"F{i}", fixed={"day": "MON", "start_period": i})
                for i in range(1, 8)]
    assert objective(dataset(faculty=faculty, sessions=sessions)) == 3


def test_soft_s4_same_course_twice_weight_is_three():
    data = dataset(
        faculty=[fac("F1"), fac("F2")],
        sessions=[sess("X-L1", course="X", fixed={"day": "MON", "start_period": 1}),
                  sess("X-L2", fid="F2", course="X", fixed={"day": "MON", "start_period": 2})],
    )
    assert objective(data) == 3


def test_soft_s5_under_40_percent_and_s6_p9_each_weight_one():
    data = dataset(
        rooms=[room("R1", cap=100)],
        sessions=[sess("S1", size=30, fixed={"day": "MON", "start_period": 9})],
    )
    assert objective(data) == 2


def test_infeasible_is_explained_not_faked():
    r = solve_timetable(dataset(sessions=[sess("S1", size=500)]), time_limit=5)
    assert r.status == "infeasible" and r.assignment == {}
    assert any("no room" in x for x in r.reasons)


# ------------------------------------------------------------------ bookings
def booking(bid, role="club", cat="club_event", submitted="2027-01-20T09:00:00+05:30", room_types=("classroom",),
            attendance=30, dur=2, windows=(("MON", 10, 12),), needs=(), requested=None, mandatory=()):
    return {"id": bid, "submitted_at": submitted, "requester": bid, "role": role, "requested_category": cat,
            "title": bid, "attendance": attendance, "duration_periods": dur,
            "windows": [{"day": d, "from_period": a, "to_period": b} for d, a, b in windows],
            "room_types": list(room_types), "needs": list(needs), "requested_room": requested,
            "mandatory_for_groups": list(mandatory), "series_id": None, "raw_text": ""}


def test_booking_priority_cap_and_tiebreak():
    # club asking institute_event is capped to club_event; the earlier club wins the room
    data = dataset(bookings=[
        booking("B1", cat="club_event", submitted="2027-01-20T09:00:00+05:30"),
        booking("B2", cat="institute_event", submitted="2027-01-21T09:00:00+05:30"),  # role club → capped
    ])
    fest = allocate_bookings(data, {})
    by = {b["request_id"]: b for b in fest["bookings"]}
    assert by["B1"]["status"] == "approved" and by["B1"]["room_id"] == "R1"
    assert by["B2"]["status"] in ("alternative_offered", "rejected")
    assert by["B2"].get("reason")


def test_booking_cancelled_never_approved():
    data = dataset(bookings=[booking("B1")], cancellations=[{"request_id": "B1"}])
    by = {b["request_id"]: b for b in allocate_bookings(data, {})["bookings"]}
    assert by["B1"]["status"] == "rejected"


def test_booking_rejects_impossible_capacity_with_reason():
    data = dataset(bookings=[booking("B1", attendance=5000)])
    by = {b["request_id"]: b for b in allocate_bookings(data, {})["bookings"]}
    assert by["B1"]["status"] == "rejected" and "5000" in by["B1"]["reason"]


def test_booking_must_respect_timetable_and_mandatory_groups():
    data = dataset(bookings=[booking("B1", windows=(("MON", 1, 3),), dur=2, mandatory=("G1",))],
                   sessions=[sess("S1", fixed={"day": "MON", "start_period": 1})])
    a = solve(data)
    fest = allocate_bookings(data, a)
    by = {b["request_id"]: b for b in fest["bookings"]}
    assert by["B1"]["status"] != "approved" or not (
        by["B1"]["day"] == "MON" and by["B1"]["start_period"] <= 1 <= by["B1"]["end_period"])


# ------------------------------------------------------------------ exams
def test_exams_half_capacity_multiroom_and_group_clash():
    rooms = [room("A", cap=100), room("B", cap=60)]
    exams = [{"id": "E1", "course_ids": ["C1"], "groups": ["G1"], "size": 70, "duration_hours": 2},
             {"id": "E2", "course_ids": ["C2"], "groups": ["G1"], "size": 20, "duration_hours": 2}]
    out = allocate_exams(dataset(rooms=rooms, exams=exams))
    by = {e["exam_id"]: e for e in out}
    assert len(out) == 2
    seats = sum(next(r for r in rooms if r["id"] == rid)["capacity"] // 2 for rid in by["E1"]["rooms"])
    assert seats >= 70 and len(by["E1"]["rooms"]) >= 2          # half capacity forces 2 rooms
    assert (by["E1"]["day"], by["E1"]["session"]) != (by["E2"]["day"], by["E2"]["session"])  # same group


# ------------------------------------------------------------------ disruption semantics
def test_apply_disruption_matches_official_semantics():
    data = dataset()
    dis = {"changes": [{"type": "faculty_unavailable", "faculty_id": "F1", "days": ["MON"], "periods": [1, 2]},
                       {"type": "remove_session", "session_id": "S1"},
                       {"type": "add_session", "session": sess("NEW")}]}
    d2 = apply_disruption(data, dis)
    assert {s["id"] for s in d2["sessions"]} == {"NEW"}
    assert d2["faculty"][0]["unavailable"][0]["day"] == "MON"
    assert data["faculty"][0]["unavailable"] == []  # original untouched


def test_repair_lexicographically_proves_zero_optional_moves():
    """An added session can use another slot, so moving the baseline is never
    allowed merely to improve soft quality. CP-SAT must prove that lower bound."""
    original = dataset(sessions=[sess("S1")])
    baseline = {"sessions": [{"session_id": "S1", "day": "MON", "start_period": 1, "room_id": "R1"}]}
    changed = apply_disruption(original, {"changes": [{"type": "add_session", "session": sess("S2")}]})
    result = build_schedule(changed, baseline=baseline, time_limit=8, workers=2)
    assert result["solver"]["status"] in ("optimal", "feasible")
    assert result["solver"]["minimum_move_objective"] == "lexicographic"
    assert result["solver"]["minimum_moves_proven"] is True
    assert result["solver"]["minimum_moves"] == 0
    placements = {item["session_id"]: item for item in result["sessions"]}
    assert (placements["S1"]["day"], placements["S1"]["start_period"], placements["S1"]["room_id"]) == ("MON", 1, "R1")


def test_repair_lexicographically_proves_a_required_optional_move():
    """The new fixed session takes the old slot. The old placement is still
    individually legal, so phase one must reason about the clash and prove one move."""
    original = dataset(sessions=[sess("S1")])
    baseline = {"sessions": [{"session_id": "S1", "day": "MON", "start_period": 1, "room_id": "R1"}]}
    added = sess("S2", fixed={"day": "MON", "start_period": 1})
    changed = apply_disruption(original, {"changes": [{"type": "add_session", "session": added}]})
    result = build_schedule(changed, baseline=baseline, time_limit=8, workers=2)
    assert result["solver"]["minimum_moves_proven"] is True
    assert result["solver"]["minimum_moves"] == 1
    placements = {item["session_id"]: item for item in result["sessions"]}
    assert (placements["S1"]["day"], placements["S1"]["start_period"], placements["S1"]["room_id"]) != ("MON", 1, "R1")

# ------------------------------------------------------------------ official end-to-end
def test_service_validator_copy_is_byte_identical_to_official_file():
    """The deployed Python service must grade with the organiser file, not a rewrite."""
    assert (ROOT / "engine/official_validator.py").read_bytes() == (PACK / "validator.py").read_bytes()


def test_validated_service_boundary_returns_schedule_and_official_report():
    from app import SolveRequest, solve_validated

    result = solve_validated(SolveRequest(data=dataset(), time_limit=5), None)
    assert result["schedule"]["solver"]["status"] in ("optimal", "feasible")
    assert result["report"]["hard_violation_count"] == 0
    assert result["report"]["dataset_id"] == "test-v1"


@pytest.mark.skipif(not PACK.exists(), reason="official starter pack not present")
def test_official_dataset_passes_official_validator(tmp_path):
    data_path = PACK / "data/cit_public.json"
    out = tmp_path / "schedule.json"
    subprocess.run([sys.executable, str(ROOT / "engine/solve.py"), "--data", str(data_path),
                    "--out", str(out), "--time-limit", "60"], check=True, capture_output=True)
    rep_path = tmp_path / "report.json"
    subprocess.run([sys.executable, str(PACK / "validator.py"), "--data", str(data_path),
                    "--schedule", str(out), "--json", str(rep_path), "--quiet"], check=True, capture_output=True)
    rep = json.loads(rep_path.read_text())
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:10]
    sched = json.loads(out.read_text())
    assert len(sched["sessions"]) == 189
    assert len(sched["exams"]) == 41
    assert rep["bookings"]["booking_score"] > 0
    assert not rep["bookings"]["priority_inversions"]

    # disruption repair keeps the schedule valid and moves few sessions
    after = tmp_path / "after.json"
    subprocess.run([sys.executable, str(ROOT / "engine/solve.py"), "--data", str(data_path),
                    "--out", str(after), "--disruption", str(PACK / "examples/sample_disruption.json"),
                    "--baseline", str(out), "--time-limit", "60"], check=True, capture_output=True)
    rep2_path = tmp_path / "report2.json"
    subprocess.run([sys.executable, str(PACK / "validator.py"), "--data", str(data_path),
                    "--schedule", str(after), "--disruption", str(PACK / "examples/sample_disruption.json"),
                    "--baseline", str(out), "--json", str(rep2_path), "--quiet"], check=True, capture_output=True)
    rep2 = json.loads(rep2_path.read_text())
    repaired = json.loads(after.read_text())
    assert rep2["hard_violation_count"] == 0, rep2["hard_violations"][:10]
    assert repaired["solver"]["minimum_move_objective"] == "lexicographic"
    assert repaired["solver"]["minimum_moves_proven"] is True
    # Equally optimal baseline timetables can require different repair counts.
    # The invariant is that the proved minimum exactly matches the organiser's
    # independently measured movement count — never a hard-coded sample number.
    assert repaired["solver"]["minimum_moves"] == rep2["stability"]["sessions_moved"]
    assert repaired["solver"]["minimum_moves"] > 0


# ------------------------------------------------------------------ regression: booking/override bugs
def test_institute_override_works_after_earlier_booking_placed():
    """Bug: synthetic __booking__ entries polluted the session world, so
    check_assignment rejected every displacement once any booking existed."""
    rooms = [room("R1", cap=60, uses=("lecture", "tutorial", "event")),
             room("LAB", rtype="lab_cs", cap=60, uses=("lab",))]
    # S1 is NOT fixed (fixed classes must never move) but can only teach MON P1–P5,
    # so the 4-period event window P1–P4 always covers it; P5 is its escape slot.
    unavail = [("MON", [6, 7, 8, 9])] + [(d, list(range(1, 10))) for d in ("TUE", "WED", "THU", "FRI")]
    data = dataset(
        rooms=rooms, faculty=[fac("F1", unavailable=unavail)],
        sessions=[sess("S1")],
        bookings=[
            booking("B1", role="admin", cat="institute_event",
                    submitted="2027-01-20T08:00:00+05:30", windows=(("MON", 10, 11),)),
            booking("B2", role="admin", cat="institute_event", dur=4,
                    submitted="2027-01-20T09:00:00+05:30", windows=(("MON", 1, 4),)),
        ])
    a = solve(data)
    assert a["S1"][0] == "MON" and 1 <= a["S1"][1] <= 4 and a["S1"][2] == "R1"
    fest = allocate_bookings(data, a)
    by = {b["request_id"]: b for b in fest["bookings"]}
    assert by["B1"]["status"] == "approved"
    assert by["B2"]["status"] == "approved", by["B2"]           # displacement must now succeed
    assert len(fest["session_overrides"]) == 1
    ov = fest["session_overrides"][0]
    assert ov["session_id"] == "S1" and ov["displaced_by"] == "B2"
    week = dict(a); week[ov["session_id"]] = (ov["day"], ov["start_period"], ov["room_id"])
    assert not check_assignment(data, week)                     # moved class fully valid, not dropped
    assert (ov["day"], ov["start_period"]) == ("MON", 5)        # the only legal escape slot


def test_override_refused_when_mandatory_group_still_busy():
    """Bug: mandatory groups weren't re-checked after displacement — moving the
    room conflict alone could still clash with the event's mandatory group."""
    rooms = [room("R1", cap=60, uses=("lecture", "tutorial", "event")),
             room("LH", rtype="lecture_hall", cap=60, uses=("lecture", "tutorial"))]
    data = dataset(
        rooms=rooms, faculty=[fac("F1"), fac("F2")],
        groups=[{"id": "G1", "size": 30}, {"id": "G2", "size": 30}],
        sessions=[sess("S1", groups=("G2",), fixed={"day": "MON", "start_period": 1}),
                  sess("S2", fid="F2", groups=("G1",), types=("lecture_hall",),
                       fixed={"day": "MON", "start_period": 1})],
        bookings=[booking("B1", role="admin", cat="institute_event",
                          windows=(("MON", 1, 2),), mandatory=("G1",))])
    a = solve(data)
    fest = allocate_bookings(data, a)
    by = {b["request_id"]: b for b in fest["bookings"]}
    d = by["B1"]
    assert d["status"] != "approved", d                          # G1 has class in another room at P1
    assert fest["session_overrides"] == []                       # nothing displaced for a doomed slot


def test_club_cannot_displace_classes():
    rooms = [room("R1", cap=60, uses=("lecture", "tutorial", "event"))]
    data = dataset(rooms=rooms,
                   sessions=[sess("S1", fixed={"day": "MON", "start_period": 1})],
                   bookings=[booking("B1", role="club", cat="institute_event",  # capped to club
                                     windows=(("MON", 1, 2),))])
    a = solve(data)
    fest = allocate_bookings(data, a)
    assert fest["session_overrides"] == []
    assert fest["bookings"][0]["status"] != "approved"


def test_exam_room_picker_fewest_rooms_and_preserves_big_hall():
    from core import pick_exam_rooms
    aud = room("AUD", rtype="auditorium", cap=500)
    lh1, lh2 = room("LH-1", rtype="lecture_hall", cap=200), room("LH-2", rtype="lecture_hall", cap=200)
    sh = room("SH-1", rtype="seminar_hall", cap=150)
    small = room("CR", cap=120)
    free = [aud, lh1, lh2, sh, small]
    assert [r["id"] for r in pick_exam_rooms(free, 60)] == ["CR"]          # exact single fit, AUD untouched
    got = pick_exam_rooms(free, 90)
    assert [r["id"] for r in got] == ["LH-1"]                               # smallest sufficient single
    got = pick_exam_rooms(free, 360)
    assert sum(r["capacity"] // 2 for r in got) >= 360 and len(got) <= 3    # 250+100+100, not 10 tiny rooms
    assert pick_exam_rooms([small], 500) is None                            # honest infeasibility


def test_solver_deterministic_with_seed():
    data = dataset(faculty=[fac("F1"), fac("F2")],
                   sessions=[sess(f"S{i}", fid="F1" if i % 2 else "F2") for i in range(8)])
    # CP-SAT's parallel portfolio can legitimately return different equal-cost
    # optima; single-worker search is deterministic with the fixed seed.
    a1 = solve_timetable(data, time_limit=5, workers=1).assignment
    a2 = solve_timetable(data, time_limit=5, workers=1).assignment
    assert a1 == a2
