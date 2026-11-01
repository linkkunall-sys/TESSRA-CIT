import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingTimesOverlap,
  compareBookingPriority,
  departmentCanReviewLab,
  findHigherPriorityContender,
  normalizeBookingPolicy,
  validateBookingPolicy,
  type PolicyBooking,
} from "./booking-policy";

const categories = ["exam", "regular_session", "institute_event", "club_event"];
const policy = categories.map((category, index) => ({ category, priorityOrder: index + 1 }));
const base: PolicyBooking = {
  id: 1,
  category: "club_event",
  date: "2027-02-15",
  startTime: "10:00",
  endTime: "12:00",
  roomId: 7,
  requesterId: 4,
  createdAt: new Date("2027-01-01T10:00:00Z"),
};

test("priority policy is a complete unique permutation", () => {
  assert.equal(validateBookingPolicy(categories, { exam: 1, regular_session: 2, institute_event: 3, club_event: 4 }).ok, true);
  const duplicate = validateBookingPolicy(categories, { exam: 1, regular_session: 1, institute_event: 3, club_event: 4 });
  assert.equal(duplicate.ok, false);
  const normalized = normalizeBookingPolicy(categories, [{ category: "club_event", priorityOrder: 1 }]);
  assert.deepEqual(normalized.map((item) => item.priorityOrder).sort(), [1, 2, 3, 4]);
});

test("same-room overlap uses category rank then earlier submission", () => {
  const institute = { ...base, id: 2, category: "institute_event", requesterId: 5 };
  assert.equal(bookingTimesOverlap(base, institute), true);
  assert(compareBookingPriority(institute, base, policy) < 0);
  assert.equal(findHigherPriorityContender(base, [institute], policy)?.id, 2);

  const earlierClub = { ...base, id: 3, createdAt: new Date("2026-12-31T10:00:00Z") };
  assert(compareBookingPriority(earlierClub, base, policy) < 0);
});

test("non-overlapping or different-room requests do not compete", () => {
  const adjacent: PolicyBooking = { ...base, id: 2, startTime: "12:00", endTime: "13:00" };
  const otherRoom: PolicyBooking = { ...base, id: 3, roomId: 8 };
  assert.equal(bookingTimesOverlap(base, adjacent), false);
  assert.equal(bookingTimesOverlap(base, otherRoom), false);
});

test("a coordinator is scoped to labs owned by the same department", () => {
  assert.equal(departmentCanReviewLab(4, "lab", 4), true);
  assert.equal(departmentCanReviewLab(4, "lab", 5), false);
  assert.equal(departmentCanReviewLab(4, "lecture", 4), false);
  assert.equal(departmentCanReviewLab(null, "lab", null), false);
  assert.equal(departmentCanReviewLab("ECE", "lab", "ECE"), true);
});
