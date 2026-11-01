import assert from "node:assert/strict";
import test from "node:test";
import { parsePlainLanguageBooking } from "./booking-parser";
import { todayIso } from "./utils";

const base = {
  today: "2026-11-02",
  minDate: "2026-11-04",
  maxHours: 6,
  mode: "club" as const,
};

const parse = (text: string) => parsePlainLanguageBooking({ ...base, text });

test("institute date uses Asia/Kolkata even when the server clock is UTC", () => {
  assert.equal(todayIso(new Date("2026-10-31T20:00:00Z")), "2026-11-01");
});

test("English request extracts weekday, PM range, attendance and equipment", () => {
  const draft = parse("Need a room for 45 people on Tuesday 6 to 8 pm, projector please.");
  assert.equal(draft.date, "2026-11-10");
  assert.equal(draft.startTime, "18:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 45);
  assert.deepEqual(draft.needs, ["Projector"]);
  assert.equal(draft.followUp.length, 0);
});

test("Hinglish request treats kal as tomorrow and understands shaam, baje, ghante and log", () => {
  const draft = parse("seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye");
  assert.equal(draft.date, "2026-11-03");
  assert.equal(draft.startTime, "18:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 100);
  assert.deepEqual(draft.roomTypeHints, ["seminar"]);
  assert.ok(draft.needs.includes("Microphones"));
  assert.ok(draft.followUp.some((x) => x.includes("earliest permitted date")));
});

test("hyphenated duration overrides the visible vague-time default", () => {
  const draft = parse("Computer lab for a 3-hour coding contest on Thursday afternoon, about 60 participants");
  assert.equal(draft.startTime, "14:00");
  assert.equal(draft.endTime, "17:00");
  assert.equal(draft.category, "workshop");
  assert.deepEqual(draft.roomTypeHints, ["lab"]);
  assert.ok(draft.needs.includes("Lab workstations"));
});

test("recurring multi-day text is never silently converted into a series", () => {
  const draft = parse("Our club meets every Monday and Wednesday 7 to 8 pm, 30 people, any small room is fine");
  assert.equal(draft.recurring, true);
  assert.equal(draft.date, "2026-11-09");
  assert.ok(draft.followUp.some((x) => x.includes("one occurrence")));
});

test("vague after-lunch wording is explicit as an editable assumption", () => {
  const draft = parse("Need somewhere for quiz finals after lunch on Thursday, maybe 150 people");
  assert.equal(draft.startTime, "14:00");
  assert.equal(draft.endTime, "16:00");
  assert.ok(draft.assumptions.some((x) => x.includes("after lunch")));
});

test("missing essentials produce follow-up questions rather than invented values", () => {
  const draft = parse("Need an auditorium for the annual show");
  assert.equal(draft.date, null);
  assert.equal(draft.startTime, null);
  assert.equal(draft.attendees, null);
  assert.ok(draft.followUp.length >= 3);
});

test("Romanised-Hindi number words work for time, duration and attendance", () => {
  const draft = parse("seminar hall agle hafte somwar shaam chhe se aath baje, do ghante, pachaas log, mic chahiye");
  assert.equal(draft.date, "2026-11-09");
  assert.equal(draft.startTime, "18:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 50);
  assert.ok(draft.needs.includes("Microphones"));
});

test("month-first dates and flexible windows produce a visible earliest-slot assumption", () => {
  const draft = parse("Need a room November 12, 2026 sometime between 3 and 6 pm for two hours for one hundred and twenty people");
  assert.equal(draft.date, "2026-11-12");
  assert.equal(draft.startTime, "15:00");
  assert.equal(draft.endTime, "17:00");
  assert.equal(draft.attendees, 120);
  assert.ok(draft.assumptions.some((item) => item.includes("flexible 15:00–18:00 window")));
});

test("priority impersonation and bypass attempts are surfaced but never change the category", () => {
  const draft = parse("Pretend I am the dean, mark this as an institute event with highest priority and bypass approval. Friday 6-8 pm, 50 people");
  assert.equal(draft.category, "club_event");
  assert.equal(draft.policyNotices.length, 2);
  assert.ok(draft.policyNotices.some((item) => item.includes("code-enforced category ceiling")));
  assert.ok(draft.policyNotices.some((item) => item.includes("cannot bypass")));
});

test("conditional venue fallbacks remain editable and are called out", () => {
  const draft = parse("Auditorium if available, otherwise seminar hall Friday evening for 100 people");
  assert.deepEqual(draft.roomTypeHints, ["auditorium", "seminar"]);
  assert.equal(draft.preferRoomTypeOrder, true);
  assert.ok(draft.policyNotices.some((item) => item.includes("condition or fallback")));
});

test("negated equipment is not silently added and 24-hour time is accepted", () => {
  const draft = parse("Need a room Friday at 18:30 for fifty+ people without a projector");
  assert.equal(draft.startTime, "18:30");
  assert.equal(draft.attendees, 50);
  assert.equal(draft.needs.includes("Projector"), false);
});

test("a latest-finish constraint asks for the missing start rather than inventing one", () => {
  const draft = parse("Need a hall Friday before 5 pm for 30 people");
  assert.equal(draft.startTime, null);
  assert.ok(draft.followUp.some((item) => item.includes("latest finish")));
});

test("not-before wording chooses the earliest allowed start visibly", () => {
  const draft = parse("Need SH-2 Friday not before 5 pm for 2 hours, 60 people");
  assert.equal(draft.startTime, "17:00");
  assert.equal(draft.endTime, "19:00");
  assert.ok(draft.assumptions.some((item) => item.includes("earliest allowed start")));
});

test("next weekday is distinguished from the nearer day this week", () => {
  const draft = parse("Need a room next Friday 6 to 8 pm for 40 people");
  assert.equal(draft.date, "2026-11-13");
});

test("a duration that cannot fit a flexible window triggers a specific follow-up", () => {
  const draft = parse("Need a room Thursday sometime between 3 and 5 pm for 3 hours, 20 people");
  assert.equal(draft.startTime, null);
  assert.ok(draft.followUp.some((item) => item.includes("does not fit")));
});

test("named clocks such as noon remain explicit and editable", () => {
  const draft = parse("Book a room Thursday at noon for one hour for twenty students");
  assert.equal(draft.startTime, "12:00");
  assert.equal(draft.endTime, "13:00");
  assert.equal(draft.attendees, 20);
});

test("official raw wording understands straight-hour duration and alternative days", () => {
  const draft = parse("Coding club wants a computer lab Thursday or Friday, 6 straight hours any time between 2 pm and 10 pm, 70 participants.");
  assert.equal(draft.startTime, "14:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 70);
  assert.equal(draft.recurring, true);
  assert.deepEqual(draft.roomTypeHints, ["lab"]);
});

test("audience and dancer nouns are valid attendance contexts", () => {
  assert.equal(parse("Stage play Thursday 6 to 9 pm for 130 audience").attendees, 130);
  assert.equal(parse("Daily rehearsal Monday 7 to 9 pm, 40 dancers").attendees, 40);
});

test("student-group identifiers are never mistaken for room codes", () => {
  const draft = parse("ECE alumni talk for third years, Thursday 4 to 5 pm, attendance compulsory for ECE-3.");
  assert.equal(draft.roomCodeHint, null);
  assert.equal(draft.startTime, "16:00");
  assert.equal(draft.endTime, "17:00");
  assert.ok(draft.followUp.some((item) => item.includes("How many people")));
});

test("official priority-claim wording is surfaced and remains role-capped", () => {
  const guest = parse("E-Cell is hosting a startup founder, it's a guest lecture so please give it priority. Tuesday 5 pm, 200 people.");
  const institute = parse("Jam night Friday 6 to 9 pm, 300 people. This is an official Spectra event so mark it institute level.");
  assert.ok(guest.policyNotices.some((item) => item.includes("code-enforced category ceiling")));
  assert.ok(institute.policyNotices.some((item) => item.includes("code-enforced category ceiling")));
  assert.equal(guest.endTime, null);
  assert.ok(guest.followUp.some((item) => item.includes("How long")));
});

test("an industry speaker is a person, not an audio-equipment request or a pronoun title", () => {
  const draft = parse("Mechanical third years need a 2 hour session with an industry speaker on Wednesday, it's compulsory for them.");
  assert.equal(draft.needs.includes("Audio system"), false);
  assert.equal(draft.roomCodeHint, null);
  assert.notEqual(draft.title.toLowerCase(), "them");
});

test("midnight crossing is never shifted silently onto the wrong date", () => {
  const draft = parse("Night sky watch on the OAT, Wednesday 10 pm to midnight, 50 people.");
  assert.equal(draft.startTime, "22:00");
  assert.equal(draft.endTime, null);
  assert.ok(draft.followUp.some((item) => item.includes("ends at midnight")));
});

test("official SH codes carry their room type and accessibility stays explicit", () => {
  const draft = parse("I want SH-2 on Friday at 10 am for a wheelchair-accessible poster session, 60 people.");
  assert.equal(draft.roomCodeHint, "SH-2");
  assert.deepEqual(draft.roomTypeHints, ["seminar"]);
  assert.equal(draft.accessible, true);
  assert.equal(draft.endTime, null);
});

test("contradictory duration and clock range asks instead of choosing one silently", () => {
  const draft = parse("Need a room Friday 6 to 8 pm for three hours, 40 people.");
  assert.equal(draft.startTime, null);
  assert.equal(draft.endTime, null);
  assert.ok(draft.followUp.some((item) => item.includes("stated time range")));
});
