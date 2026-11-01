"""TESSRA scheduling service — FastAPI wrapper around the CP-SAT engine.

Run locally: ``uvicorn app:app --host 0.0.0.0 --port 8000`` from ``engine/``.
The service can run as a Vercel Python Service or on a container host.  Its
validated endpoint returns both the generated schedule and the report produced
by the byte-identical organiser validator bundled in this service directory.
"""
from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import apply_disruption, build_schedule, check_assignment  # noqa: E402
from official_validator import apply_disruption as validator_apply_disruption  # noqa: E402
from official_validator import run as run_official_validator  # noqa: E402

app = FastAPI(title="TESSRA Scheduling Engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ENGINE_ALLOWED_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
TOKEN = os.environ.get("ENGINE_TOKEN")


def auth(authorization: str | None):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid engine token")


class SolveRequest(BaseModel):
    data: dict
    disruption: dict | None = None
    baseline: dict | None = None
    team: str = "TESSRA"
    time_limit: float = Field(default=60.0, gt=0, le=600)
    workers: int = Field(default=2, ge=1, le=8)


class CheckRequest(BaseModel):
    data: dict
    assignment: dict[str, list]  # sid -> [day, start, room]


@app.get("/health")
def health():
    import ortools

    validator_path = Path(__file__).with_name("official_validator.py")
    validator_sha256 = hashlib.sha256(validator_path.read_bytes()).hexdigest()
    return {
        "ok": True,
        "engine": "cp-sat",
        "ortools": ortools.__version__,
        "validator_sha256": validator_sha256,
    }


@app.post("/solve")
def solve(req: SolveRequest, authorization: str | None = Header(default=None)):
    auth(authorization)
    data = apply_disruption(req.data, req.disruption) if req.disruption else req.data
    return build_schedule(data, team=req.team, time_limit=req.time_limit, baseline=req.baseline, workers=req.workers)


@app.post("/solve-validated")
def solve_validated(req: SolveRequest, authorization: str | None = Header(default=None)):
    """Generate a schedule and grade it with the untouched organiser validator.

    Keeping both operations in the Python service makes the live workflow work
    on a serverless Next.js frontend without pretending that a TypeScript check
    is the official validator.
    """
    auth(authorization)
    data = apply_disruption(req.data, req.disruption) if req.disruption else req.data
    schedule = build_schedule(data, team=req.team, time_limit=req.time_limit, baseline=req.baseline, workers=req.workers)
    validator_data = validator_apply_disruption(req.data, req.disruption) if req.disruption else req.data
    report = run_official_validator(validator_data, schedule, req.baseline)
    return {"schedule": schedule, "report": report}


@app.post("/check")
def check(req: CheckRequest, authorization: str | None = Header(default=None)):
    auth(authorization)
    assign = {sid: (v[0], int(v[1]), v[2]) for sid, v in req.assignment.items()}
    violations = check_assignment(req.data, assign)
    return {"ok": not violations, "violations": violations}
