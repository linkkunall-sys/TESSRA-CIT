import assert from "node:assert/strict";
import test from "node:test";
import { LUNCH, PERIOD_COUNT, PERIOD_MINUTES, PERIODS } from "./constants";
import { generateSchedule, spansBreak, validateSessions, type EngineContext, type EngineSession } from "./scheduler";

test("teaching calendar matches the official P1–P9 model", () => {
  assert.equal(PERIOD_COUNT, 9);
  assert.equal(PERIOD_MINUTES, 60);
  assert.deepEqual(PERIODS.map(({ n, start, end }) => [n, start, end]), [
    [1, "08:00", "09:00"],
    [2, "09:00", "10:00"],
    [3, "10:00", "11:00"],
    [4, "11:00", "12:00"],
    [5, "12:00", "13:00"],
    [6, "14:00", "15:00"],
    [7, "15:00", "16:00"],
    [8, "16:00", "17:00"],
    [9, "17:00", "18:00"],
  ]);
  assert.deepEqual(LUNCH, { afterPeriod: 5, start: "13:00", end: "14:00" });
  assert.equal(spansBreak(4, 3), true);
  assert.equal(spansBreak(2, 3), false);
  assert.equal(spansBreak(6, 3), false);
});

test("generator places three-hour labs only in P2–P4 or P6–P8", () => {
  const result = generateSchedule({
    offerings: [{
      id: 1,
      courseId: 1,
      facultyId: 1,
      groupIds: [1],
      sessionsPerWeek: 2,
      duration: 3,
      kind: "lab",
      roomType: "lab",
      label: "CSL101 · CSE-1A",
    }],
    rooms: [{ id: 1, code: "LAB-1", type: "lab", capacity: 40, status: "active" }],
    groups: [{ id: 1, code: "CSE-1A", size: 30 }],
    blocks: [],
    fixed: [],
  });

  assert.equal(result.stats.unplaced.length, 0);
  assert.equal(result.sessions.length, 2);
  for (const session of result.sessions) {
    assert.equal(session.duration, 3);
    assert.ok(session.startPeriod === 2 || session.startPeriod === 6);
  }
});

test("validator rejects legacy two-period and misaligned labs", () => {
  const ctx: EngineContext = {
    rooms: new Map([[1, { id: 1, code: "LAB-1", type: "lab", capacity: 40, status: "active" }]]),
    groups: new Map([[1, { id: 1, code: "CSE-1A", size: 30 }]]),
    blocks: [],
    labels: {
      room: () => "LAB-1",
      group: () => "CSE-1A",
      faculty: () => "Dr Test",
      course: () => "CSL101",
    },
  };
  const base: EngineSession = {
    id: 1,
    offeringId: 1,
    courseId: 1,
    facultyId: 1,
    roomId: 1,
    groupIds: [1],
    day: 0,
    startPeriod: 2,
    duration: 3,
    kind: "lab",
    isFixed: false,
  };

  assert.equal(validateSessions([base], ctx).some((issue) => issue.code === "lab_start"), false);
  assert.equal(validateSessions([{ ...base, duration: 2 }], ctx).some((issue) => issue.code === "lab_start"), true);
  assert.equal(validateSessions([{ ...base, startPeriod: 3 }], ctx).some((issue) => issue.code === "lab_start"), true);

  const lunchIssue = validateSessions([{ ...base, kind: "lecture", startPeriod: 5, duration: 2 }], ctx)
    .find((issue) => issue.code === "spans_break");
  assert.equal(lunchIssue?.severity, "error");

  const lectureRoomCtx: EngineContext = {
    ...ctx,
    rooms: new Map([[2, { id: 2, code: "LH-1", type: "lecture", capacity: 40, status: "active" }]]),
  };
  const roomTypeIssue = validateSessions([{ ...base, roomId: 2 }], lectureRoomCtx)
    .find((issue) => issue.code === "room_type");
  assert.equal(roomTypeIssue?.severity, "error");
});
