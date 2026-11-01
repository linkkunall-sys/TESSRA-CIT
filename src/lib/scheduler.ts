/**
 * TESSRA scheduling engine — pure functions, no database access.
 *  - generateSchedule: constraint-based greedy timetable generation
 *  - validateSessions: conflict detection for a timetable
 *  - findAlternatives / checkPlacement: safe re-slotting for changes & disruptions
 *  - validateExams: examination timetable checks
 */
import type { RoomStatus, RoomType, SessionKind, VersionStats } from "@/db/schema";
import { DAY_COUNT, DAY_SHORT, LUNCH, PERIOD_COUNT } from "./constants";
import { overlaps, toMinutes } from "./utils";

export type EngineRoom = { id: number; code: string; type: RoomType; capacity: number; status: RoomStatus; allowedUses?: string[]; accessible?: boolean };
export type EngineGroup = { id: number; code: string; size: number };
export type EngineBlock = { facultyId: number; day: number; period: number };
export type EngineRoomBlock = { roomId: number; day: number; period: number };
export type EnginePreference = { facultyId: number; day: number; period: number; type: string };
export type EngineOffering = {
  id: number;
  courseId: number;
  facultyId: number;
  groupIds: number[];
  expectedSize?: number | null;
  sessionsPerWeek: number;
  duration: number;
  kind: SessionKind;
  roomType: RoomType;
  allowedRoomIds?: number[];
  sourceId?: string | null;
  basketSlot?: string | null;
  label: string;
};
export type EngineSession = {
  id: number;
  offeringId: number | null;
  courseId: number;
  facultyId: number;
  roomId: number;
  groupIds: number[];
  expectedSize?: number | null;
  day: number;
  startPeriod: number;
  duration: number;
  kind: SessionKind;
  sourceId?: string | null;
  basketSlot?: string | null;
  allowedRoomIds?: number[];
  isFixed: boolean;
};
export type Placement = { day: number; startPeriod: number; roomId: number };

export type IssueCode =
  | "faculty_clash"
  | "group_clash"
  | "room_clash"
  | "capacity"
  | "room_type"
  | "faculty_unavailable"
  | "faculty_daily_limit"
  | "faculty_preference"
  | "room_unavailable"
  | "basket_sync"
  | "spans_break"
  | "lab_start"
  | "out_of_bounds";

export type Issue = { code: IssueCode; severity: "error" | "warning"; message: string; sessionIds: number[] };

export const ISSUE_LABEL: Record<IssueCode, string> = {
  faculty_clash: "Faculty double-booked",
  group_clash: "Group double-booked",
  room_clash: "Room double-booked",
  capacity: "Capacity exceeded",
  room_type: "Room type mismatch",
  faculty_unavailable: "Faculty unavailable",
  faculty_daily_limit: "Faculty daily limit exceeded",
  faculty_preference: "Faculty preference",
  room_unavailable: "Room unavailable",
  basket_sync: "Elective basket out of sync",
  spans_break: "Spans lunch break",
  lab_start: "Invalid lab block",
  out_of_bounds: "Outside teaching hours",
};

export type Labels = {
  room: (id: number) => string;
  group: (id: number) => string;
  faculty: (id: number) => string;
  course: (id: number) => string;
};

export type EngineContext = {
  rooms: Map<number, EngineRoom>;
  groups: Map<number, EngineGroup>;
  blocks: EngineBlock[];
  roomBlocks?: EngineRoomBlock[];
  preferences?: EnginePreference[];
  facultyDailyLimits?: Map<number, number>;
  labels: Labels;
};

const key = (id: number, day: number, period: number) => `${id}:${day}:${period}`;

export function spansBreak(start: number, duration: number) {
  const end = start + duration - 1;
  return start <= LUNCH.afterPeriod && end > LUNCH.afterPeriod;
}

export function compatibleRoomTypes(kind: SessionKind, preferred: RoomType): RoomType[] {
  if (kind === "lab") return ["lab"];
  if (preferred === "auditorium") return ["auditorium", "lecture"];
  return ["lecture", "seminar", "auditorium"];
}

export function groupSize(groupIds: number[], groups: Map<number, EngineGroup>) {
  return groupIds.reduce((sum, id) => sum + (groups.get(id)?.size ?? 0), 0);
}

const PERIOD_PENALTY = [0, 0, 0, 0, 0, 0, 0, 0, 1, 5];

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */
export function generateSchedule(input: {
  offerings: EngineOffering[];
  rooms: EngineRoom[];
  groups: EngineGroup[];
  blocks: EngineBlock[];
  roomBlocks?: EngineRoomBlock[];
  preferences?: EnginePreference[];
  facultyDailyLimits?: Map<number, number>;
  fixed: EngineSession[];
}): { sessions: EngineSession[]; stats: VersionStats } {
  const started = Date.now();
  const groupMap = new Map(input.groups.map((g) => [g.id, g]));
  const blocked = new Set(input.blocks.map((b) => key(b.facultyId, b.day, b.period)));
  const blockedRooms = new Set((input.roomBlocks ?? []).map((b) => key(b.roomId, b.day, b.period)));
  const avoided = new Set((input.preferences ?? []).filter((p) => p.type === "avoid").map((p) => key(p.facultyId, p.day, p.period)));
  const busyF = new Set<string>();
  const busyG = new Set<string>();
  const busyR = new Set<string>();
  const groupBasket = new Map<string, string>();
  const basketPlacement = new Map<string, { day: number; start: number; duration: number }>();
  const dayLoadG = new Map<string, number>();
  const dayLoadF = new Map<string, number>();
  const courseDay = new Set<string>();
  const sessions: EngineSession[] = [];
  let tempId = -1;

  const occupy = (s: EngineSession) => {
    for (let p = s.startPeriod; p < s.startPeriod + s.duration; p++) {
      busyF.add(key(s.facultyId, s.day, p));
      busyR.add(key(s.roomId, s.day, p));
      for (const g of s.groupIds) {
        const groupKey = key(g, s.day, p);
        busyG.add(groupKey);
        if (s.basketSlot) groupBasket.set(groupKey, s.basketSlot);
      }
    }
    if (s.basketSlot && !basketPlacement.has(s.basketSlot)) {
      basketPlacement.set(s.basketSlot, { day: s.day, start: s.startPeriod, duration: s.duration });
    }
    for (const g of s.groupIds) {
      dayLoadG.set(`${g}:${s.day}`, (dayLoadG.get(`${g}:${s.day}`) ?? 0) + s.duration);
      courseDay.add(`${s.courseId}:${g}:${s.day}`);
    }
    dayLoadF.set(`${s.facultyId}:${s.day}`, (dayLoadF.get(`${s.facultyId}:${s.day}`) ?? 0) + s.duration);
  };

  let requiredPeriods = 0;
  let placedPeriods = 0;
  let placedUnits = 0;
  const fixedCount = new Map<number, number>();
  for (const f of input.fixed) {
    occupy(f);
    sessions.push(f);
    requiredPeriods += f.duration;
    placedPeriods += f.duration;
    placedUnits++;
    if (f.offeringId) fixedCount.set(f.offeringId, (fixedCount.get(f.offeringId) ?? 0) + 1);
  }

  const facultyBlocks = new Map<number, number>();
  for (const b of input.blocks) facultyBlocks.set(b.facultyId, (facultyBlocks.get(b.facultyId) ?? 0) + 1);

  type Unit = { off: EngineOffering; size: number };
  const units: Unit[] = [];
  for (const off of input.offerings) {
    const remaining = off.sessionsPerWeek - (fixedCount.get(off.id) ?? 0);
    const size = off.expectedSize ?? groupSize(off.groupIds, groupMap);
    for (let i = 0; i < remaining; i++) units.push({ off, size });
  }
  units.sort(
    (a, b) =>
      b.off.duration - a.off.duration ||
      b.off.groupIds.length - a.off.groupIds.length ||
      b.size - a.size ||
      (facultyBlocks.get(b.off.facultyId) ?? 0) - (facultyBlocks.get(a.off.facultyId) ?? 0) ||
      a.off.id - b.off.id,
  );

  const activeRooms = input.rooms.filter((r) => r.status === "active").sort((a, b) => a.capacity - b.capacity);
  const unplaced: VersionStats["unplaced"] = [];

  for (const u of units) {
    const { off } = u;
    requiredPeriods += off.duration;
    const types = compatibleRoomTypes(off.kind, off.roomType);
    const candidateRooms = activeRooms.filter(
      (r) => types.includes(r.type) && r.capacity >= u.size && (!off.allowedRoomIds?.length || off.allowedRoomIds.includes(r.id)),
    );
    type Best = { score: number; day: number; start: number; roomId: number };
    const holder: { best: Best | null } = { best: null };

    for (const strict of [true, false]) {
      for (let day = 0; day < DAY_COUNT; day++) {
        const synchronized = off.basketSlot ? basketPlacement.get(off.basketSlot) : undefined;
        if (synchronized && (day !== synchronized.day || off.duration !== synchronized.duration)) continue;
        const facultyLimit = input.facultyDailyLimits?.get(off.facultyId);
        if (facultyLimit && (dayLoadF.get(`${off.facultyId}:${day}`) ?? 0) + off.duration > facultyLimit) continue;
        if (strict && off.groupIds.some((g) => courseDay.has(`${off.courseId}:${g}:${day}`))) continue;
        for (let start = 1; start + off.duration - 1 <= PERIOD_COUNT; start++) {
          if (synchronized && start !== synchronized.start) continue;
          // Three-hour labs use the official P2–P4 or P6–P8 blocks.
          if (off.kind === "lab" && start !== 2 && start !== 6) continue;
          if (spansBreak(start, off.duration)) continue;
          let free = true;
          for (let p = start; p < start + off.duration && free; p++) {
            if (busyF.has(key(off.facultyId, day, p)) || blocked.has(key(off.facultyId, day, p))) free = false;
            for (const g of off.groupIds) {
              const groupKey = key(g, day, p);
              if (busyG.has(groupKey) && (!off.basketSlot || groupBasket.get(groupKey) !== off.basketSlot)) free = false;
            }
          }
          if (!free) continue;
          const room = candidateRooms.find((r) => {
            for (let p = start; p < start + off.duration; p++) {
              if (busyR.has(key(r.id, day, p)) || blockedRooms.has(key(r.id, day, p))) return false;
            }
            return true;
          });
          if (!room) continue;
          const gLoad = Math.max(0, ...off.groupIds.map((g) => dayLoadG.get(`${g}:${day}`) ?? 0));
          const fLoad = dayLoadF.get(`${off.facultyId}:${day}`) ?? 0;
          const preferencePenalty = Array.from({ length: off.duration }, (_, i) => start + i)
            .filter((period) => avoided.has(key(off.facultyId, day, period))).length * 20;
          const score = gLoad * 10 + fLoad * 4 + preferencePenalty + (PERIOD_PENALTY[start] ?? 0) + (room.capacity - u.size) / 60;
          if (!holder.best || score < holder.best.score) holder.best = { score, day, start, roomId: room.id };
        }
      }
      if (holder.best) break;
    }

    const best = holder.best;
    if (best) {
      const s: EngineSession = {
        id: tempId--,
        offeringId: off.id,
        courseId: off.courseId,
        facultyId: off.facultyId,
        roomId: best.roomId,
        groupIds: off.groupIds,
        expectedSize: off.expectedSize,
        day: best.day,
        startPeriod: best.start,
        duration: off.duration,
        kind: off.kind,
        sourceId: off.sourceId,
        basketSlot: off.basketSlot,
        allowedRoomIds: off.allowedRoomIds,
        isFixed: false,
      };
      occupy(s);
      sessions.push(s);
      placedUnits++;
      placedPeriods += off.duration;
    } else {
      const reason =
        candidateRooms.length === 0
          ? `No active ${types.join(" / ")} room seats ${u.size} students`
          : "No slot satisfies faculty availability, group and room constraints";
      unplaced.push({ offeringId: off.id, label: off.label, reason });
    }
  }

  return {
    sessions,
    stats: {
      requiredUnits: units.length + input.fixed.length,
      placedUnits,
      requiredPeriods,
      placedPeriods,
      fixedUnits: input.fixed.length,
      unplaced,
      durationMs: Date.now() - started,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */
export function validateSessions(sessions: EngineSession[], ctx: EngineContext): Issue[] {
  const issues: Issue[] = [];
  const fMap = new Map<string, number[]>();
  const gMap = new Map<string, number[]>();
  const rMap = new Map<string, number[]>();
  const blocked = new Set(ctx.blocks.map((b) => key(b.facultyId, b.day, b.period)));
  const blockedRooms = new Set((ctx.roomBlocks ?? []).map((b) => key(b.roomId, b.day, b.period)));
  const avoided = new Set((ctx.preferences ?? []).filter((p) => p.type === "avoid").map((p) => key(p.facultyId, p.day, p.period)));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const push = (map: Map<string, number[]>, k: string, id: number) => {
    const list = map.get(k);
    if (list) list.push(id);
    else map.set(k, [id]);
  };

  for (const s of sessions) {
    const course = ctx.labels.course(s.courseId);
    const where = `${DAY_SHORT[s.day] ?? "?"} P${s.startPeriod}`;
    if (s.day < 0 || s.day >= DAY_COUNT || s.startPeriod < 1 || s.startPeriod + s.duration - 1 > PERIOD_COUNT) {
      issues.push({ code: "out_of_bounds", severity: "error", message: `${course} is placed outside teaching hours`, sessionIds: [s.id] });
    }
    if (s.duration > 1 && spansBreak(s.startPeriod, s.duration)) {
      issues.push({ code: "spans_break", severity: "error", message: `${course} (${where}) runs through the lunch break`, sessionIds: [s.id] });
    }
    if (s.kind === "lab" && (s.duration !== 3 || (s.startPeriod !== 2 && s.startPeriod !== 6))) {
      issues.push({ code: "lab_start", severity: "error", message: `${course} (${where}) must use a three-hour P2–P4 or P6–P8 lab block`, sessionIds: [s.id] });
    }
    const room = ctx.rooms.get(s.roomId);
    if (room) {
      const size = s.expectedSize ?? groupSize(s.groupIds, ctx.groups);
      if (room.capacity < size) {
        issues.push({ code: "capacity", severity: "error", message: `${course} needs ${size} seats but ${room.code} holds ${room.capacity}`, sessionIds: [s.id] });
      }
      const requiredUse = s.kind === "lab" ? "lab" : s.kind === "tutorial" ? "tutorial" : "lecture";
      if (s.allowedRoomIds?.length && !s.allowedRoomIds.includes(room.id)) {
        issues.push({ code: "room_type", severity: "error", message: `${room.code} is not eligible for ${course} under its CIT room-type, capacity, or accessibility requirements`, sessionIds: [s.id] });
      } else if (room.allowedUses?.length && !room.allowedUses.includes(requiredUse)) {
        issues.push({ code: "room_type", severity: "error", message: `${room.code} is not approved for ${requiredUse} use`, sessionIds: [s.id] });
      } else if (s.kind === "lab" && room.type !== "lab") {
        issues.push({ code: "room_type", severity: "error", message: `${course} is a lab but ${room.code} is not a laboratory`, sessionIds: [s.id] });
      }
      if (room.status !== "active") {
        issues.push({
          code: "room_unavailable",
          severity: "error",
          message: `${course} (${where}) is in ${room.code}, which is ${room.status === "maintenance" ? "under maintenance" : "inactive"}`,
          sessionIds: [s.id],
        });
      }
    }
    let unavailable = false;
    let roomUnavailable = false;
    let preferenceMiss = false;
    for (let p = s.startPeriod; p < s.startPeriod + s.duration; p++) {
      push(fMap, key(s.facultyId, s.day, p), s.id);
      push(rMap, key(s.roomId, s.day, p), s.id);
      for (const g of s.groupIds) push(gMap, key(g, s.day, p), s.id);
      if (blocked.has(key(s.facultyId, s.day, p))) unavailable = true;
      if (blockedRooms.has(key(s.roomId, s.day, p))) roomUnavailable = true;
      if (avoided.has(key(s.facultyId, s.day, p))) preferenceMiss = true;
    }
    if (unavailable) {
      issues.push({
        code: "faculty_unavailable",
        severity: "error",
        message: `${ctx.labels.faculty(s.facultyId)} is marked unavailable during ${course} (${where})`,
        sessionIds: [s.id],
      });
    }
    if (preferenceMiss) {
      issues.push({
        code: "faculty_preference",
        severity: "warning",
        message: `${ctx.labels.faculty(s.facultyId)} prefers to avoid ${course} (${where})`,
        sessionIds: [s.id],
      });
    }
    if (roomUnavailable) {
      issues.push({
        code: "room_unavailable",
        severity: "error",
        message: `${ctx.labels.room(s.roomId)} is marked unavailable during ${course} (${where})`,
        sessionIds: [s.id],
      });
    }
  }

  for (const [facultyId, limit] of ctx.facultyDailyLimits ?? []) {
    for (let day = 0; day < DAY_COUNT; day++) {
      const assigned = sessions.filter((session) => session.facultyId === facultyId && session.day === day);
      const load = assigned.reduce((sum, session) => sum + session.duration, 0);
      if (load > limit) {
        issues.push({
          code: "faculty_daily_limit",
          severity: "error",
          message: `${ctx.labels.faculty(facultyId)} has ${load} periods on ${DAY_SHORT[day]}, above the daily limit of ${limit}`,
          sessionIds: assigned.map((session) => session.id),
        });
      }
    }
  }

  const baskets = new Map<string, EngineSession[]>();
  for (const session of sessions) {
    if (!session.basketSlot) continue;
    baskets.set(session.basketSlot, [...(baskets.get(session.basketSlot) ?? []), session]);
  }
  for (const [basket, members] of baskets) {
    const placements = new Set(members.map((session) => `${session.day}:${session.startPeriod}:${session.duration}`));
    if (placements.size > 1) {
      issues.push({
        code: "basket_sync",
        severity: "error",
        message: `Elective basket ${basket} must keep all choices in one synchronized slot`,
        sessionIds: members.map((session) => session.id),
      });
    }
  }

  const seen = new Set<string>();
  const clashes = (map: Map<string, number[]>, code: IssueCode, describe: (id: number) => string, allowed?: (ids: number[]) => boolean) => {
    for (const [k, ids] of map) {
      if (ids.length < 2 || allowed?.(ids)) continue;
      const sig = `${code}:${[...ids].sort((a, b) => a - b).join(",")}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const [id, day, period] = k.split(":").map(Number);
      const courses = ids.map((sid) => ctx.labels.course(byId.get(sid)?.courseId ?? 0)).join(" & ");
      issues.push({ code, severity: "error", message: `${describe(id)} double-booked on ${DAY_SHORT[day]} P${period} (${courses})`, sessionIds: ids });
    }
  };
  clashes(fMap, "faculty_clash", (id) => ctx.labels.faculty(id));
  clashes(
    gMap,
    "group_clash",
    (id) => ctx.labels.group(id),
    (ids) => {
      const basketSlots = ids.map((id) => byId.get(id)?.basketSlot ?? null);
      return Boolean(basketSlots[0] && basketSlots.every((slot) => slot === basketSlots[0]));
    },
  );
  clashes(rMap, "room_clash", (id) => ctx.labels.room(id));
  return issues;
}

export function checkPlacement(sessions: EngineSession[], sessionId: number, placement: Placement, ctx: EngineContext) {
  const moved = sessions.map((s) => (s.id === sessionId ? { ...s, ...placement } : s));
  return validateSessions(moved, ctx).filter((i) => i.sessionIds.includes(sessionId));
}

export function findAlternatives(
  sessions: EngineSession[],
  sessionId: number,
  ctx: EngineContext,
  opts: {
    avoidDays?: number[];
    onlyDay?: number;
    preferDay?: number;
    preferPeriod?: number;
    keepSlot?: boolean;
    excludeRoomIds?: number[];
    extraBlocks?: EngineBlock[];
    limit?: number;
  } = {},
): (Placement & { score: number })[] {
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return [];
  const others = sessions.filter((s) => s.id !== sessionId);
  const busyF = new Set<string>();
  const busyG = new Set<string>();
  const busyR = new Set<string>();
  const groupBasket = new Map<string, string>();
  for (const s of others) {
    for (let p = s.startPeriod; p < s.startPeriod + s.duration; p++) {
      busyF.add(key(s.facultyId, s.day, p));
      busyR.add(key(s.roomId, s.day, p));
      for (const g of s.groupIds) {
        const groupKey = key(g, s.day, p);
        busyG.add(groupKey);
        if (s.basketSlot) groupBasket.set(groupKey, s.basketSlot);
      }
    }
  }
  const blocked = new Set([...ctx.blocks, ...(opts.extraBlocks ?? [])].map((b) => key(b.facultyId, b.day, b.period)));
  const blockedRooms = new Set((ctx.roomBlocks ?? []).map((block) => key(block.roomId, block.day, block.period)));
  const size = target.expectedSize ?? groupSize(target.groupIds, ctx.groups);
  const types: RoomType[] = target.kind === "lab" ? ["lab"] : ["lecture", "seminar", "auditorium"];
  const rooms = [...ctx.rooms.values()]
    .filter((r) => r.status === "active" && types.includes(r.type) && r.capacity >= size && (!target.allowedRoomIds?.length || target.allowedRoomIds.includes(r.id)) && !(opts.excludeRoomIds ?? []).includes(r.id))
    .sort((a, b) => a.capacity - b.capacity);

  const dailyFacultyLoad = new Map<number, number>();
  for (const session of others.filter((session) => session.facultyId === target.facultyId)) {
    dailyFacultyLoad.set(session.day, (dailyFacultyLoad.get(session.day) ?? 0) + session.duration);
  }
  const synchronizedPeer = target.basketSlot ? others.find((session) => session.basketSlot === target.basketSlot) : undefined;
  const results: (Placement & { score: number })[] = [];
  for (let day = 0; day < DAY_COUNT; day++) {
    if (opts.onlyDay !== undefined && day !== opts.onlyDay) continue;
    if (opts.avoidDays?.includes(day)) continue;
    if (synchronizedPeer && day !== synchronizedPeer.day) continue;
    const dailyLimit = ctx.facultyDailyLimits?.get(target.facultyId);
    if (dailyLimit && (dailyFacultyLoad.get(day) ?? 0) + target.duration > dailyLimit) continue;
    for (let start = 1; start + target.duration - 1 <= PERIOD_COUNT; start++) {
      if (opts.keepSlot && (day !== target.day || start !== target.startPeriod)) continue;
      if (synchronizedPeer && (start !== synchronizedPeer.startPeriod || target.duration !== synchronizedPeer.duration)) continue;
      if (target.kind === "lab" && start !== 2 && start !== 6) continue;
      if (spansBreak(start, target.duration)) continue;
      let free = true;
      for (let p = start; p < start + target.duration && free; p++) {
        if (busyF.has(key(target.facultyId, day, p)) || blocked.has(key(target.facultyId, day, p))) free = false;
        for (const g of target.groupIds) {
          const groupKey = key(g, day, p);
          if (busyG.has(groupKey) && (!target.basketSlot || groupBasket.get(groupKey) !== target.basketSlot)) free = false;
        }
      }
      if (!free) continue;
      const fits = rooms.filter((r) => {
        for (let p = start; p < start + target.duration; p++) {
          if (busyR.has(key(r.id, day, p)) || blockedRooms.has(key(r.id, day, p))) return false;
        }
        return true;
      });
      if (!fits.length) continue;
      const room = opts.keepSlot
        ? fits.find((r) => r.id !== target.roomId)
        : (fits.find((r) => r.id === target.roomId) ?? fits[0]);
      if (!room) continue;
      if (day === target.day && start === target.startPeriod && room.id === target.roomId) continue;
      const score =
        (opts.preferDay !== undefined && day !== opts.preferDay ? 20 : 0) +
        (opts.preferPeriod !== undefined ? Math.abs(start - opts.preferPeriod) * 2 : 0) +
        (room.id === target.roomId ? 0 : 3) +
        (PERIOD_PENALTY[start] ?? 0) +
        Math.abs(day - target.day) * 0.5;
      results.push({ day, startPeriod: start, roomId: room.id, score });
    }
  }
  return results.sort((a, b) => a.score - b.score).slice(0, opts.limit ?? 5);
}

/* -------------------------------------------------------------------------- */
/* Examinations                                                               */
/* -------------------------------------------------------------------------- */
export type ExamLike = {
  id: number;
  courseId: number;
  groupIds: number[];
  date: string;
  startTime: string;
  endTime: string;
  roomId: number;
  roomIds?: number[];
  invigilatorId: number | null;
  candidates: number;
};

export function validateExams(examList: ExamLike[], ctx: { rooms: Map<number, EngineRoom>; labels: Labels }) {
  const result = new Map<number, string[]>();
  const add = (id: number, msg: string) => result.set(id, [...(result.get(id) ?? []), msg]);
  const roomIds = (exam: ExamLike) => exam.roomIds?.length ? exam.roomIds : [exam.roomId];
  for (const e of examList) {
    const assigned = roomIds(e).map((id) => ctx.rooms.get(id)).filter((room): room is EngineRoom => Boolean(room));
    const effectiveCapacity = assigned.reduce((sum, room) => sum + Math.floor(room.capacity / 2), 0);
    if (assigned.length && e.candidates > effectiveCapacity) {
      add(e.id, `${e.candidates} candidates exceed half-capacity seating across ${assigned.map((room) => room.code).join(" + ")} (${effectiveCapacity})`);
    }
    for (const room of assigned) {
      if (room.status !== "active") add(e.id, `${room.code} is ${room.status === "maintenance" ? "under maintenance" : "inactive"}`);
    }
    if (toMinutes(e.endTime) <= toMinutes(e.startTime)) add(e.id, "End time must be after start time");
  }
  for (let i = 0; i < examList.length; i++) {
    for (let j = i + 1; j < examList.length; j++) {
      const a = examList[i];
      const b = examList[j];
      if (a.date !== b.date) continue;
      if (!overlaps(toMinutes(a.startTime), toMinutes(a.endTime), toMinutes(b.startTime), toMinutes(b.endTime))) continue;
      const ca = ctx.labels.course(a.courseId);
      const cb = ctx.labels.course(b.courseId);
      const sharedRooms = roomIds(a).filter((id) => roomIds(b).includes(id));
      if (sharedRooms.length) {
        const names = sharedRooms.map(ctx.labels.room).join(", ");
        add(a.id, `Room clash with ${cb} in ${names}`);
        add(b.id, `Room clash with ${ca} in ${names}`);
      }
      const shared = a.groupIds.filter((g) => b.groupIds.includes(g));
      if (shared.length) {
        const names = shared.map(ctx.labels.group).join(", ");
        add(a.id, `${names} also sits ${cb} at the same time`);
        add(b.id, `${names} also sits ${ca} at the same time`);
      }
      if (a.invigilatorId && a.invigilatorId === b.invigilatorId) {
        add(a.id, `Invigilator also assigned to ${cb}`);
        add(b.id, `Invigilator also assigned to ${ca}`);
      }
    }
  }
  return result;
}
