import assert from "node:assert/strict";
import test from "node:test";
import type { RoomType } from "@/db/schema";
import citJson from "../../official/starterpack/CrunchWeek_StarterPack/data/cit_public.json";
import scheduleJson from "../../exports/schedule.json";
import type { OfficialDataset, OfficialSchedule } from "./official";
import { generateSchedule, validateExams, validateSessions, type EngineContext, type EngineRoom } from "./scheduler";

const data = citJson as unknown as OfficialDataset;
const schedule = scheduleJson as unknown as OfficialSchedule;
const days = new Map(["MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day, index) => [day, index]));
const roomType = (source: string): RoomType => {
  if (["lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop"].includes(source)) return "lab";
  if (source === "seminar_hall") return "seminar";
  if (source === "auditorium") return "auditorium";
  if (source === "outdoor") return "outdoor";
  return "lecture";
};

const roomId = new Map(data.rooms.map((room, index) => [room.id, index + 1]));
const groupId = new Map(data.student_groups.map((group, index) => [group.id, index + 1]));
const facultyId = new Map(data.faculty.map((faculty, index) => [faculty.id, index + 1]));
const courseId = new Map(data.courses.map((course, index) => [course.id, index + 1]));
const sourceSession = new Map(data.sessions.map((session) => [session.id, session]));

const rooms = new Map<number, EngineRoom>(
  data.rooms.map((room) => [roomId.get(room.id) as number, { id: roomId.get(room.id) as number, code: room.id, type: roomType(room.type), capacity: room.capacity, status: "active" }]),
);
const groups = new Map(data.student_groups.map((group) => [groupId.get(group.id) as number, { id: groupId.get(group.id) as number, code: group.id, size: group.size }]));
const context: EngineContext = {
  rooms,
  groups,
  blocks: data.faculty.flatMap((faculty) => faculty.unavailable.flatMap((block) => block.periods.map((period) => ({ facultyId: facultyId.get(faculty.id) as number, day: days.get(block.day) as number, period })))),
  roomBlocks: data.room_unavailability.flatMap((block) => block.periods.map((period) => ({ roomId: roomId.get(block.room_id) as number, day: days.get(block.day) as number, period }))),
  preferences: data.faculty.flatMap((faculty) => (faculty.preferences as { type: string; days: string[]; periods: number[] }[]).flatMap((preference) => preference.days.flatMap((day) => preference.periods.map((period) => ({ facultyId: facultyId.get(faculty.id) as number, type: preference.type, day: days.get(day) as number, period }))))),
  facultyDailyLimits: new Map(data.faculty.map((faculty) => [facultyId.get(faculty.id) as number, faculty.max_hours_per_day])),
  labels: {
    room: (id) => data.rooms.find((room) => roomId.get(room.id) === id)?.id ?? "room",
    group: (id) => data.student_groups.find((group) => groupId.get(group.id) === id)?.id ?? "group",
    faculty: (id) => data.faculty.find((faculty) => facultyId.get(faculty.id) === id)?.name ?? "faculty",
    course: (id) => data.courses.find((course) => courseId.get(course.id) === id)?.id ?? "course",
  },
};

const sessions = schedule.sessions.map((placement, index) => {
  const source = sourceSession.get(placement.session_id);
  assert(source);
  return {
    id: index + 1,
    offeringId: index + 1,
    courseId: courseId.get(source.course_id) as number,
    facultyId: facultyId.get(source.faculty_id) as number,
    roomId: roomId.get(placement.room_id) as number,
    groupIds: source.groups.map((group) => groupId.get(group) as number),
    expectedSize: source.size,
    day: days.get(placement.day) as number,
    startPeriod: placement.start_period,
    duration: source.duration,
    kind: source.kind,
    sourceId: source.id,
    basketSlot: source.basket_slot,
    allowedRoomIds: data.rooms.filter((room) => source.room_types.includes(room.type) && room.capacity >= source.size && (!source.needs_accessible || room.accessible)).map((room) => roomId.get(room.id) as number),
    isFixed: false,
  };
});

test("CIT operational timetable accepts synchronized elective baskets and remains hard-valid", () => {
  const issues = validateSessions(sessions, context);
  assert.equal(issues.filter((issue) => issue.severity === "error").length, 0);
  assert.equal(issues.filter((issue) => issue.code === "faculty_preference").length, 0);
  assert.equal(issues.filter((issue) => issue.code === "group_clash").length, 0);
  const basket = sessions.find((session) => session.basketSlot);
  assert(basket);
  const desynchronized = sessions.map((session) => session.id === basket.id ? { ...session, day: (session.day + 1) % 5 } : session);
  assert(validateSessions(desynchronized, context).some((issue) => issue.code === "basket_sync"));

  const roomRestricted = sessions.find((session) => session.allowedRoomIds.length < rooms.size);
  assert(roomRestricted);
  const ineligibleRoomId = [...rooms.keys()].find((id) => !roomRestricted.allowedRoomIds.includes(id));
  assert(ineligibleRoomId);
  assert(validateSessions(sessions.map((session) => session.id === roomRestricted.id ? { ...session, roomId: ineligibleRoomId } : session), context)
    .some((issue) => issue.code === "room_type" && issue.sessionIds.includes(roomRestricted.id)));

  const dailyLoads = new Map<string, number>();
  for (const session of sessions) {
    const key = `${session.facultyId}:${session.day}`;
    dailyLoads.set(key, (dailyLoads.get(key) ?? 0) + session.duration);
  }
  const overloaded = [...dailyLoads.entries()].find(([, load]) => load > 1);
  assert(overloaded);
  const [faculty, day] = overloaded[0].split(":").map(Number);
  const strictContext = { ...context, facultyDailyLimits: new Map(context.facultyDailyLimits).set(faculty, overloaded[1] - 1) };
  assert(validateSessions(sessions, strictContext).some((issue) => issue.code === "faculty_daily_limit" && issue.sessionIds.some((id) => sessions.find((session) => session.id === id)?.day === day)));
});

test("operational generator preserves CIT room eligibility and synchronizes elective baskets", () => {
  const generated = generateSchedule({
    offerings: data.sessions.map((session, index) => ({
      id: index + 1,
      sourceId: session.id,
      courseId: courseId.get(session.course_id) as number,
      facultyId: facultyId.get(session.faculty_id) as number,
      groupIds: session.groups.map((group) => groupId.get(group) as number),
      expectedSize: session.size,
      sessionsPerWeek: 1,
      duration: session.duration,
      kind: session.kind,
      roomType: roomType(session.room_types[0]),
      allowedRoomIds: data.rooms.filter((room) => session.room_types.includes(room.type) && room.capacity >= session.size && (!session.needs_accessible || room.accessible)).map((room) => roomId.get(room.id) as number),
      basketSlot: session.basket_slot,
      label: session.id,
    })),
    rooms: [...rooms.values()],
    groups: [...groups.values()],
    blocks: context.blocks,
    roomBlocks: context.roomBlocks,
    preferences: context.preferences,
    facultyDailyLimits: context.facultyDailyLimits,
    fixed: [],
  });
  assert.equal(generated.stats.placedUnits, generated.stats.requiredUnits);
  const basketPlacements = new Map<string, Set<string>>();
  for (const session of generated.sessions) {
    if (!session.basketSlot) continue;
    const placements = basketPlacements.get(session.basketSlot) ?? new Set<string>();
    placements.add(`${session.day}:${session.startPeriod}:${session.duration}`);
    basketPlacements.set(session.basketSlot, placements);
  }
  assert([...basketPlacements.values()].every((placements) => placements.size === 1));
  assert.equal(validateSessions(generated.sessions, context).filter((issue) => issue.severity === "error").length, 0);
});

test("CIT multi-room examinations validate at official half-capacity seating", () => {
  const examSource = new Map(data.exams.map((exam) => [exam.id, exam]));
  const examSessions = new Map(data.calendar.exam_week.sessions.map((session) => [session.id, session]));
  const exams = (schedule.exams ?? []).map((placement, index) => {
    const source = examSource.get(placement.exam_id);
    const session = examSessions.get(placement.session);
    assert(source && session);
    const roomIds = placement.rooms.map((room) => roomId.get(room) as number);
    return {
      id: index + 1,
      courseId: courseId.get(source.course_ids[0]) as number,
      groupIds: source.groups.map((group) => groupId.get(group) as number),
      date: `exam-${placement.day}`,
      startTime: session.start as string,
      endTime: session.end as string,
      roomId: roomIds[0],
      roomIds,
      invigilatorId: null,
      candidates: source.size,
    };
  });
  const issues = validateExams(exams, { rooms, labels: context.labels });
  assert.equal([...issues.values()].flat().length, 0);
  assert(exams.some((exam) => exam.roomIds.length > 1));
});
