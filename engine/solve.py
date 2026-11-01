#!/usr/bin/env python3
"""CLI used by the Next.js app (subprocess) and by developers.

  python3 engine/solve.py --data official/.../cit_public.json --out exports/schedule.json
  python3 engine/solve.py --data ... --out exports/schedule_after.json \
      --disruption official/.../sample_disruption.json --baseline exports/schedule.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import apply_disruption, build_schedule, load_json  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="TESSRA CP-SAT scheduler")
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--disruption")
    ap.add_argument("--baseline")
    ap.add_argument("--time-limit", type=float, default=60.0)
    ap.add_argument("--team", default="TESSRA")
    a = ap.parse_args()

    data = load_json(a.data)
    if a.disruption:
        data = apply_disruption(data, load_json(a.disruption))
    baseline = load_json(a.baseline) if a.baseline else None
    sched = build_schedule(data, team=a.team, time_limit=a.time_limit, baseline=baseline)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(sched, f, indent=2)
    solver = sched.get("solver", {})
    print(json.dumps({"out": a.out, "sessions": len(sched.get("sessions", [])), "solver": solver}))
    return 0 if sched.get("sessions") else 2


if __name__ == "__main__":
    sys.exit(main())
