import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OfficialDataset } from "./official";
import { applyOfficialDisruptionForDisplay, getRepairWorkflow, stripRepairWorkflow, validateOfficialDisruption } from "./official-disruption";

const root = process.cwd();
const data = JSON.parse(
  readFileSync(path.join(root, "official/starterpack/CrunchWeek_StarterPack/data/cit_public.json"), "utf8"),
) as OfficialDataset;
const sample = JSON.parse(
  readFileSync(path.join(root, "official/starterpack/CrunchWeek_StarterPack/examples/sample_disruption.json"), "utf8"),
) as unknown;

test("official sample disruption passes strict validation", () => {
  const result = validateOfficialDisruption(sample, data);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.summary, {
    faculty_unavailable: 1,
    room_unavailable: 1,
    add_faculty: 0,
    add_session: 1,
    remove_session: 0,
  });
});

test("display application adds the sample session and keeps the input immutable", () => {
  const result = validateOfficialDisruption(sample, data);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const before = data.sessions.length;
  const changed = applyOfficialDisruptionForDisplay(data, result.disruption);
  assert.equal(data.sessions.length, before);
  assert.equal(changed.sessions.length, before + 1);
  assert(changed.sessions.some((session) => session.id === "CS202-T2"));
});

test("all five organiser change types and sequential new references are accepted", () => {
  const result = validateOfficialDisruption(
    {
      changes: [
        { type: "faculty_unavailable", faculty_id: data.faculty[0].id, days: ["MON"], periods: [1], reason: "judge" },
        { type: "room_unavailable", room_id: data.rooms[0].id, days: ["TUE"], periods: [2], reason: "judge" },
        { type: "add_faculty", faculty: { ...data.faculty[0], id: "F-JUDGE", name: "Judge Faculty", unavailable: [] } },
        { type: "add_session", session: { ...data.sessions[0], id: "JUDGE-S1", faculty_id: "F-JUDGE" } },
        { type: "remove_session", session_id: data.sessions[1].id },
      ],
    },
    data,
  );
  assert.equal(result.ok, true);
});

test("wrong dataset and unsupported extra fields are rejected", () => {
  const result = validateOfficialDisruption(
    { dataset: "other-v1", surprise: true, changes: [{ type: "remove_session", session_id: "HS201-H2-L2", extra: 1 }] },
    data,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /not cit-public-v1/);
    assert.match(result.errors.join(" "), /unsupported field/);
  }
});

test("unknown references and unsupported change types are rejected", () => {
  const result = validateOfficialDisruption(
    { changes: [{ type: "faculty_unavailable", faculty_id: "NOPE", days: ["MON"], periods: [1] }, { type: "magic" }] },
    data,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /faculty_id is unknown/);
    assert.match(result.errors.join(" "), /type is unsupported/);
  }
});

test("malformed added session is rejected before the engine call", () => {
  const result = validateOfficialDisruption(
    {
      changes: [
        {
          type: "add_session",
          session: {
            id: "NEW",
            course_id: "NO-COURSE",
            kind: "lab",
            groups: ["NO-GROUP"],
            faculty_id: "NO-FACULTY",
            size: -1,
            duration: 3,
            room_types: ["moon_base"],
            needs_accessible: false,
            basket_slot: null,
            fixed_slot: null,
          },
        },
      ],
    },
    data,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert(result.errors.length >= 5);
});

test("workflow metadata is readable internally and stripped from official reports", () => {
  const checked = validateOfficialDisruption(sample, data);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  const stored = {
    hard_violation_count: 0,
    hard_by_rule: {},
    hard_violations: [],
    soft_penalties: {},
    soft_total: 0,
    warnings: [],
    _workflow: {
      status: "proposed",
      baselineRunId: 7,
      disruption: checked.disruption,
      summary: checked.summary,
      sourceName: "judge.json",
      proposedAt: "2026-11-01T00:00:00.000Z",
    },
  };
  assert.equal(getRepairWorkflow(stored)?.status, "proposed");
  assert.equal("_workflow" in stripRepairWorkflow(stored), false);
});
