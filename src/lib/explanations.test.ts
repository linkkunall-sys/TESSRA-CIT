import assert from "node:assert/strict";
import test from "node:test";
import { explainPlacement } from "./explanations";

const base = {
  courseCode: "CS302",
  kind: "lecture" as const,
  isFixed: false,
  combined: false,
  roomCode: "A-202",
  roomType: "lecture" as const,
  roomCapacity: 60,
  students: 42,
  issueCount: 0,
  alternativeCount: 3,
};

test("placement explanation separates hard validity from global choice", () => {
  const value = explainPlacement(base);
  assert.match(value.headline, /3 other hard-valid placements/);
  assert(value.facts.some((fact) => fact.includes("clash-free")));
  assert(value.facts.some((fact) => fact.includes("evaluates the timetable globally")));
});

test("fixed session explanation identifies the hard preservation rule", () => {
  const value = explainPlacement({ ...base, isFixed: true, alternativeCount: 0 });
  assert.match(value.headline, /pinned/);
  assert(value.facts.some((fact) => fact.includes("hard constraints")));
});

test("validation issues are never described as conflict-free", () => {
  const value = explainPlacement({ ...base, issueCount: 2 });
  assert.match(value.headline, /2 validation issues/);
  assert.equal(value.facts.some((fact) => fact.includes("clash-free")), false);
});
