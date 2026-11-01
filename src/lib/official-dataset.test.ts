import assert from "node:assert/strict";
import test from "node:test";
import source from "../../official/starterpack/CrunchWeek_StarterPack/data/cit_public.json";
import { validateOfficialDataset } from "./official-dataset";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("official CIT dataset passes strict upload validation", () => {
  const result = validateOfficialDataset(source);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  if (result.ok) {
    assert.equal(result.data.dataset_id, "cit-public-v1");
    assert.equal(result.data.sessions.length, 189);
  }
});

test("dataset upload rejects duplicate IDs and broken references", () => {
  const value = clone(source) as unknown as Record<string, unknown>;
  const rooms = value.rooms as Array<Record<string, unknown>>;
  rooms[1].id = rooms[0].id;
  const sessions = value.sessions as Array<Record<string, unknown>>;
  sessions[0].faculty_id = "F-DOES-NOT-EXIST";
  const result = validateOfficialDataset(value);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /duplicate IDs/i);
    assert.match(result.errors.join(" "), /faculty_id is unknown/i);
  }
});

test("dataset upload rejects unknown root fields and malformed calendar data", () => {
  const value = clone(source) as unknown as Record<string, unknown>;
  value.untrusted = true;
  const calendar = value.calendar as Record<string, unknown>;
  calendar.days = ["MON", "MON"];
  const result = validateOfficialDataset(value);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /unsupported field/i);
    assert.match(result.errors.join(" "), /unique day IDs/i);
  }
});

test("dataset upload rejects unknown nested fields and undeclared booking policy values", () => {
  const value = clone(source) as unknown as Record<string, unknown>;
  const rooms = value.rooms as Array<Record<string, unknown>>;
  rooms[0].injected = "not allowed";
  const requests = value.booking_requests as Array<Record<string, unknown>>;
  requests[0].role = "unregistered_role";
  requests[0].requested_category = "unregistered_category";
  const result = validateOfficialDataset(value);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const errors = result.errors.join(" ");
    assert.match(errors, /rooms\[0\].*unsupported field/i);
    assert.match(errors, /role is not declared/i);
    assert.match(errors, /requested_category is not declared/i);
  }
});
