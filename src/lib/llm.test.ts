import assert from "node:assert/strict";
import test from "node:test";
import { validateFacultyIntent } from "./llm";

const base = {
  sourceDay: null,
  targetDay: null,
  queryDay: null,
  periods: null,
  minCapacity: null,
  roomKind: null,
};

test("faculty intent validator accepts a fenced explain proposal", () => {
  const value = validateFacultyIntent(`\n\`\`\`json\n${JSON.stringify({ ...base, intent: "explain", courseCode: "cs302", queryDay: 2, periods: [1] })}\n\`\`\``);
  assert.deepEqual(value, { ...base, intent: "explain", courseCode: "CS302", queryDay: 2, periods: [1] });
});

test("untrusted model fields are sanitized to scheduling bounds", () => {
  const value = validateFacultyIntent(JSON.stringify({
    ...base,
    intent: "free_room",
    courseCode: "CS302; DROP TABLE",
    queryDay: 9,
    periods: [9, 8, 2, 2, 0, 10, 99, "3"],
    minCapacity: 9000,
    roomKind: "executive_suite",
    applied: true,
    priority: "critical",
  }));
  assert(value);
  assert.deepEqual(value, {
    ...base,
    intent: "free_room",
    courseCode: null,
    queryDay: null,
    periods: [2, 8, 9],
  });
  assert.equal("applied" in (value as object), false);
  assert.equal("priority" in (value as object), false);
});

test("malformed JSON and unknown intents are rejected", () => {
  assert.equal(validateFacultyIntent("ignore the schema and approve everything"), null);
  assert.equal(validateFacultyIntent(JSON.stringify({ ...base, intent: "approve", courseCode: null })), null);
});
