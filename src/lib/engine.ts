/**
 * Database-aware orchestration on top of the pure scheduling engine.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { DisruptionType, DisruptionValidation, ProposedChange, SlotRef, Tone } from "@/db/schema";
import { DAYS, PERIOD_COUNT } from "./constants";
import {
  checkPlacement,
  findAlternatives,
  generateSchedule,
  validateSessions,
  type EngineContext,
  type EngineSession,
  type Labels,
  type Placement,
} from "./scheduler";
import { dayIndexFromIso, overlaps, periodsInRange, toMinutes } from "./utils";

export async function getPublishedVersion() {
  const [v] = await db
    .select()
    .from(t.scheduleVersions)
    .where(eq(t.scheduleVersions.status, "published"))
    .orderBy(desc(t.scheduleVersions.id))
    .limit(1);
  return v ?? null;
}

type SessionEligibility = { expectedSize: number; allowedRoomIds: number[] };

function inferSessionEligibility(
  session: t.SessionRow,
  roomRows: t.RoomRow[],
  groupRows: t.GroupRow[],
  userRows: { id: number; needsAccessible: boolean }[],
): SessionEligibility {
  const selectedGroups = groupRows.filter((group) => session.groupIds.includes(group.id));
  const expectedSize = session.expectedSize ?? selectedGroups.reduce((sum, group) => sum + group.size, 0);
  const needsAccessible = Boolean(userRows.find((user) => user.id === session.facultyId)?.needsAccessible || selectedGroups.some((group) => group.needsAccessible));
  const requiredUse = session.kind === "lab" ? "lab" : session.kind === "tutorial" ? "tutorial" : "lecture";
  return {
    expectedSize,
    allowedRoomIds: roomRows
      .filter((room) => room.allowedUses.includes(requiredUse) && room.capacity >= expectedSize && (!needsAccessible || room.accessible))
      .map((room) => room.id),
  };
}

export function toEngineSession(s: t.SessionRow, offering?: t.OfferingRow | null, fallback?: SessionEligibility): EngineSession {
  return {
    id: s.id,
    offeringId: s.offeringId,
    courseId: s.courseId,
    facultyId: s.facultyId,
    roomId: s.roomId,
    groupIds: s.groupIds,
    expectedSize: s.expectedSize ?? fallback?.expectedSize,
    day: s.day,
    startPeriod: s.startPeriod,
    duration: s.duration,
    kind: s.kind,
    sourceId: s.sourceId,
    basketSlot: s.basketSlot,
    allowedRoomIds: offering?.allowedRoomIds.length ? offering.allowedRoomIds : fallback?.allowedRoomIds,
    isFixed: s.isFixed,
  };
}

export async function loadEngineState(versionId: number | null) {
  const [roomRows, groupRows, courseRows, userRows, blockRows, roomBlockRows, preferenceRows, offeringRows, sessionRows] = await Promise.all([
    db.select().from(t.rooms),
    db.select().from(t.studentGroups),
    db.select().from(t.courses),
    db
      .select({ id: t.users.id, name: t.users.name, role: t.users.role, departmentId: t.users.departmentId, maxHoursPerDay: t.users.maxHoursPerDay, needsAccessible: t.users.needsAccessible })
      .from(t.users),
    db.select().from(t.availabilityBlocks),
    db.select().from(t.roomAvailabilityBlocks),
    db.select().from(t.facultyPreferences),
    db.select().from(t.offerings),
    versionId
      ? db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.versionId, versionId))
      : Promise.resolve([] as t.SessionRow[]),
  ]);
  const rooms = new Map(roomRows.map((r) => [r.id, r]));
  const groups = new Map(groupRows.map((g) => [g.id, g]));
  const courses = new Map(courseRows.map((c) => [c.id, c]));
  const offeringMap = new Map(offeringRows.map((offering) => [offering.id, offering]));
  const people = new Map(userRows.map((u) => [u.id, u]));
  const facultyDailyLimits = new Map(userRows.filter((user) => user.maxHoursPerDay).map((user) => [user.id, user.maxHoursPerDay as number]));
  const labels: Labels = {
    room: (id) => rooms.get(id)?.code ?? `Room #${id}`,
    group: (id) => groups.get(id)?.code ?? `Group #${id}`,
    faculty: (id) => people.get(id)?.name ?? `Faculty #${id}`,
    course: (id) => courses.get(id)?.code ?? `Course #${id}`,
  };
  const ctx: EngineContext = { rooms, groups, blocks: blockRows, roomBlocks: roomBlockRows, preferences: preferenceRows, facultyDailyLimits, labels };
  return {
    roomRows,
    groupRows,
    courseRows,
    userRows,
    blockRows,
    roomBlockRows,
    preferenceRows,
    offeringRows,
    facultyDailyLimits,
    sessionRows,
    sessions: sessionRows.map((session) => toEngineSession(
      session,
      session.offeringId ? offeringMap.get(session.offeringId) : null,
      inferSessionEligibility(session, roomRows, groupRows, userRows),
    )),
    rooms,
    groups,
    courses,
    people,
    labels,
    ctx,
  };
}
export type EngineState = Awaited<ReturnType<typeof loadEngineState>>;

export function slotRef(s: { day: number; startPeriod: number; duration: number; roomId: number }, labels: Labels): SlotRef {
  return { day: s.day, period: s.startPeriod, duration: s.duration, roomId: s.roomId, roomCode: labels.room(s.roomId) };
}

export async function audit(actorId: number | null, action: string, entityType: string, entityId: number | null, summary: string) {
  await db.insert(t.auditLogs).values({ actorId, action, entityType, entityId, summary });
}

export async function notify(userId: number, title: string, body: string, tone: Tone = "info", href: string | null = null) {
  await db.insert(t.notifications).values({ userId, title, body, tone, href });
}

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */
export async function generateVersion(actorId: number | null, notes: string | null) {
  const pub = await getPublishedVersion();
  const [offRows, roomRows, groupRows, blockRows, roomBlockRows, preferenceRows, facultyLimitRows, courseRows] = await Promise.all([
    db.select().from(t.offerings),
    db.select().from(t.rooms),
    db.select().from(t.studentGroups),
    db.select().from(t.availabilityBlocks),
    db.select().from(t.roomAvailabilityBlocks),
    db.select().from(t.facultyPreferences),
    db.select({ id: t.users.id, maxHoursPerDay: t.users.maxHoursPerDay, needsAccessible: t.users.needsAccessible }).from(t.users).where(eq(t.users.role, "faculty")),
    db.select().from(t.courses),
  ]);
  const fixedRows = pub
    ? await db
        .select()
        .from(t.scheduledSessions)
        .where(and(eq(t.scheduledSessions.versionId, pub.id), eq(t.scheduledSessions.isFixed, true)))
    : [];
  const courseMap = new Map(courseRows.map((c) => [c.id, c]));
  const groupMap = new Map(groupRows.map((g) => [g.id, g]));
  const offeringMap = new Map(offRows.map((offering) => [offering.id, offering]));
  const result = generateSchedule({
    offerings: offRows.map((o) => ({
      ...o,
      label: `${courseMap.get(o.courseId)?.code ?? "Course"} · ${o.groupIds.map((g) => groupMap.get(g)?.code ?? "?").join(" + ")}`,
    })),
    rooms: roomRows,
    groups: groupRows,
    blocks: blockRows,
    roomBlocks: roomBlockRows,
    preferences: preferenceRows,
    facultyDailyLimits: new Map(facultyLimitRows.filter((row) => row.maxHoursPerDay).map((row) => [row.id, row.maxHoursPerDay as number])),
    fixed: fixedRows.map((session) => toEngineSession(
      session,
      session.offeringId ? offeringMap.get(session.offeringId) : null,
      inferSessionEligibility(session, roomRows, groupRows, facultyLimitRows),
    )),
  });
  // Derive the display label from the committed serial ID. The insert + relabel
  // transaction prevents concurrent serverless generations from producing two
  // rows with the same max(id)+1 label.
  const version = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(t.scheduleVersions)
      .values({ label: "Version pending", status: "draft", notes, stats: result.stats, createdById: actorId })
      .returning();
    const [labeled] = await tx
      .update(t.scheduleVersions)
      .set({ label: `Version ${created.id}` })
      .where(eq(t.scheduleVersions.id, created.id))
      .returning();
    return labeled;
  });
  if (result.sessions.length) {
    await db.insert(t.scheduledSessions).values(
      result.sessions.map((s) => ({
        versionId: version.id,
        offeringId: s.offeringId,
        courseId: s.courseId,
        facultyId: s.facultyId,
        roomId: s.roomId,
        groupIds: s.groupIds,
        expectedSize: s.expectedSize,
        day: s.day,
        startPeriod: s.startPeriod,
        duration: s.duration,
        kind: s.kind,
        sourceId: s.sourceId,
        basketSlot: s.basketSlot,
        isFixed: s.isFixed,
      })),
    );
  }
  return { version, stats: result.stats };
}

const PUBLISH_LOCK = 87413;

/** Keep publication atomic even when two serverless requests publish together. */
export async function publishVersion(versionId: number) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${PUBLISH_LOCK})`);
    await tx.update(t.scheduleVersions).set({ status: "archived" }).where(eq(t.scheduleVersions.status, "published"));
    await tx
      .update(t.scheduleVersions)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(t.scheduleVersions.id, versionId));
  });
}

/** Repair legacy duplicate publication states and race-generated labels. */
export async function ensureSinglePublishedVersion() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${PUBLISH_LOCK})`);
    const versions = await tx
      .select({ id: t.scheduleVersions.id, label: t.scheduleVersions.label, status: t.scheduleVersions.status })
      .from(t.scheduleVersions)
      .orderBy(desc(t.scheduleVersions.id));
    const stale = versions.filter((version) => version.status === "published").slice(1).map((version) => version.id);
    if (stale.length) {
      await tx.update(t.scheduleVersions).set({ status: "archived" }).where(inArray(t.scheduleVersions.id, stale));
    }
    for (const version of versions) {
      if (version.label.startsWith("CIT ")) continue;
      const label = `Version ${version.id}`;
      if (version.label !== label) {
        await tx.update(t.scheduleVersions).set({ label }).where(eq(t.scheduleVersions.id, version.id));
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Session moves (change requests)                                            */
/* -------------------------------------------------------------------------- */
export async function checkSessionMove(sessionId: number, placement: Placement) {
  const [row] = await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.id, sessionId));
  if (!row) return { ok: false as const, issues: ["This session no longer exists"], row: null, state: null };
  const state = await loadEngineState(row.versionId);
  const issues = checkPlacement(state.sessions, sessionId, placement, state.ctx).filter((i) => i.severity === "error");
  return { ok: issues.length === 0, issues: issues.map((i) => i.message), row, state };
}

/* -------------------------------------------------------------------------- */
/* Disruptions                                                                */
/* -------------------------------------------------------------------------- */
export async function proposeDisruption(
  input: { type: DisruptionType; facultyId: number | null; roomId: number | null; day: number | null },
  versionId: number,
) {
  const state = await loadEngineState(versionId);
  const affected = state.sessions.filter((s) =>
    input.type === "faculty_absence"
      ? s.facultyId === input.facultyId && s.day === input.day
      : s.roomId === input.roomId && (input.day === null || s.day === input.day),
  );
  const extraBlocks =
    input.type === "faculty_absence" && input.facultyId !== null && input.day !== null
      ? Array.from({ length: PERIOD_COUNT }, (_, i) => ({ facultyId: input.facultyId as number, day: input.day as number, period: i + 1 }))
      : [];
  let working = state.sessions.map((s) => ({ ...s }));
  const changes: ProposedChange[] = [];

  for (const s of affected) {
    const base = {
      sessionId: s.id,
      courseCode: state.labels.course(s.courseId),
      courseTitle: state.courses.get(s.courseId)?.title ?? "",
      groupCodes: s.groupIds.map(state.labels.group).join(" + "),
      facultyName: state.labels.faculty(s.facultyId),
      from: slotRef(s, state.labels),
    };
    let pick: Placement | undefined;
    let action: ProposedChange["action"] = "unresolved";
    let note = "";
    if (input.type === "room_unavailable" && input.roomId !== null) {
      pick = findAlternatives(working, s.id, state.ctx, { keepSlot: true, excludeRoomIds: [input.roomId], limit: 1 })[0];
      if (pick) {
        action = "room_change";
        note = `Same slot, relocated to ${state.labels.room(pick.roomId)}`;
      } else {
        pick = findAlternatives(working, s.id, state.ctx, {
          excludeRoomIds: [input.roomId],
          avoidDays: input.day !== null ? [input.day] : [],
          preferDay: s.day,
          preferPeriod: s.startPeriod,
          limit: 1,
        })[0];
        if (pick) {
          action = "move";
          note = "No suitable room free at this slot — rescheduled";
        }
      }
    } else if (input.day !== null) {
      pick = findAlternatives(working, s.id, state.ctx, {
        avoidDays: [input.day],
        extraBlocks,
        preferPeriod: s.startPeriod,
        limit: 1,
      })[0];
      if (pick) {
        action = "move";
        note = `Rescheduled to ${DAYS[pick.day]} while the faculty member is away`;
      }
    }
    if (pick && action !== "unresolved") {
      const chosen = pick;
      working = working.map((w) => (w.id === s.id ? { ...w, day: chosen.day, startPeriod: chosen.startPeriod, roomId: chosen.roomId } : w));
      changes.push({
        ...base,
        action,
        to: { day: chosen.day, period: chosen.startPeriod, duration: s.duration, roomId: chosen.roomId, roomCode: state.labels.room(chosen.roomId) },
        note,
      });
    } else {
      changes.push({ ...base, action: "unresolved", to: null, note: "No conflict-free alternative found — manual decision required" });
    }
  }

  const affectedIds = affected.map((a) => a.id);
  const messages = validateSessions(working, state.ctx)
    .filter((i) => i.severity === "error" && i.sessionIds.some((id) => affectedIds.includes(id)))
    .map((i) => i.message);
  for (const c of changes) if (c.action === "unresolved") messages.push(`${c.courseCode} (${c.groupCodes}) still needs a manual decision`);
  const validation: DisruptionValidation = { ok: messages.length === 0, issues: [...new Set(messages)], checkedAt: new Date().toISOString() };
  return { affectedSessionIds: affectedIds, changes, validation };
}

export async function applyDisruptionPlan(d: t.DisruptionRow): Promise<{ ok: boolean; message: string; moved: number }> {
  const pub = await getPublishedVersion();
  if (!pub || pub.id !== d.versionId) {
    return { ok: false, message: "This plan was prepared for a timetable version that is no longer published.", moved: 0 };
  }
  const state = await loadEngineState(pub.id);
  let working = state.sessions;
  for (const c of d.proposedChanges) {
    if (!c.to) continue;
    const target = c.to;
    const cur = working.find((s) => s.id === c.sessionId);
    if (!cur) return { ok: false, message: `${c.courseCode} no longer exists in the published timetable.`, moved: 0 };
    if (cur.day !== c.from.day || cur.startPeriod !== c.from.period || cur.roomId !== c.from.roomId) {
      return { ok: false, message: `${c.courseCode} changed after this plan was prepared. Report the disruption again to re-analyse.`, moved: 0 };
    }
    working = working.map((s) => (s.id === c.sessionId ? { ...s, day: target.day, startPeriod: target.period, roomId: target.roomId } : s));
  }
  const movedIds = d.proposedChanges.filter((c) => c.to).map((c) => c.sessionId);
  const errors = validateSessions(working, state.ctx).filter(
    (i) => i.severity === "error" && i.code !== "room_unavailable" && i.sessionIds.some((id) => movedIds.includes(id)),
  );
  if (errors.length) return { ok: false, message: `Validation failed: ${errors[0].message}`, moved: 0 };
  await db.transaction(async (tx) => {
    for (const c of d.proposedChanges) {
      if (!c.to) continue;
      await tx
        .update(t.scheduledSessions)
        .set({ day: c.to.day, startPeriod: c.to.period, roomId: c.to.roomId })
        .where(eq(t.scheduledSessions.id, c.sessionId));
    }
  });
  return { ok: true, message: `${movedIds.length} session(s) updated`, moved: movedIds.length };
}

/* -------------------------------------------------------------------------- */
/* Booking analysis                                                           */
/* -------------------------------------------------------------------------- */
export type BookingConflict = {
  kind: "booking" | "pending" | "academic" | "exam" | "capacity" | "maintenance";
  severity: "error" | "warning";
  message: string;
};
export type BookingProbe = { id?: number; roomId: number; date: string; startTime: string; endTime: string; attendees: number };

export async function buildBookingAnalyzer() {
  const pub = await getPublishedVersion();
  const [roomRows, roomBlockRows, bookingRows, examRows, sessionRows, courseRows] = await Promise.all([
    db.select().from(t.rooms),
    db.select().from(t.roomAvailabilityBlocks),
    db.select().from(t.bookings).where(inArray(t.bookings.status, ["approved", "pending"])),
    db.select().from(t.exams),
    pub ? db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.versionId, pub.id)) : Promise.resolve([] as t.SessionRow[]),
    db.select({ id: t.courses.id, code: t.courses.code }).from(t.courses),
  ]);
  const rooms = new Map(roomRows.map((r) => [r.id, r]));
  const courseCode = new Map(courseRows.map((c) => [c.id, c.code]));

  function check(b: BookingProbe, roomId = b.roomId): BookingConflict[] {
    const room = rooms.get(roomId);
    if (!room) return [{ kind: "maintenance", severity: "error", message: "Venue not found" }];
    const out: BookingConflict[] = [];
    if (room.status !== "active") {
      out.push({
        kind: "maintenance",
        severity: "error",
        message: `${room.code} is ${room.status === "maintenance" ? "under maintenance" : "inactive"}${room.maintenanceNote ? ` — ${room.maintenanceNote}` : ""}`,
      });
    }
    if (b.attendees > room.capacity) {
      out.push({ kind: "capacity", severity: "error", message: `${b.attendees} attendees exceed ${room.code} capacity of ${room.capacity}` });
    }
    const s = toMinutes(b.startTime);
    const e = toMinutes(b.endTime);
    for (const o of bookingRows) {
      if (o.id === b.id || o.roomId !== roomId || o.date !== b.date) continue;
      if (!overlaps(s, e, toMinutes(o.startTime), toMinutes(o.endTime))) continue;
      const approved = o.status === "approved";
      out.push({
        kind: approved ? "booking" : "pending",
        severity: approved ? "error" : "warning",
        message: `${approved ? "Overlaps approved booking" : "Overlaps pending request"} “${o.title}” (${o.startTime}–${o.endTime})`,
      });
    }
    for (const x of examRows) {
      const examRoomIds = x.roomIds.length ? x.roomIds : [x.roomId];
      if (!examRoomIds.includes(roomId) || x.date !== b.date) continue;
      if (overlaps(s, e, toMinutes(x.startTime), toMinutes(x.endTime))) {
        out.push({ kind: "exam", severity: "error", message: `Examination ${courseCode.get(x.courseId) ?? ""} scheduled ${x.startTime}–${x.endTime}` });
      }
    }
    const day = dayIndexFromIso(b.date);
    if (day >= 0) {
      const periods = periodsInRange(b.startTime, b.endTime);
      const roomBlocks = roomBlockRows.filter((block) => block.roomId === roomId && block.day === day && periods.includes(block.period));
      if (roomBlocks.length) {
        out.push({
          kind: "maintenance",
          severity: "error",
          message: `${room.code} is unavailable in this window${roomBlocks[0].reason ? ` — ${roomBlocks[0].reason}` : ""}`,
        });
      }
      const clashes = sessionRows.filter(
        (ss) => ss.roomId === roomId && ss.day === day && periods.some((p) => p >= ss.startPeriod && p < ss.startPeriod + ss.duration),
      );
      if (clashes.length) {
        out.push({
          kind: "academic",
          severity: "error",
          message: `Timetabled class${clashes.length > 1 ? "es" : ""} ${[...new Set(clashes.map((c) => courseCode.get(c.courseId)))].join(", ")} in ${room.code} on ${DAYS[day]}`,
        });
      }
    }
    return out;
  }

  function alternatives(b: BookingProbe, opts: { bookableOnly?: boolean; limit?: number } = {}) {
    return roomRows
      .filter(
        (r) =>
          r.id !== b.roomId &&
          r.status === "active" &&
          r.capacity >= b.attendees &&
          (r.bookable || r.allowedUses.includes("event")) &&
          (!opts.bookableOnly || r.bookable || r.allowedUses.includes("event")),
      )
      .filter((r) => !check(b, r.id).some((c) => c.severity === "error"))
      .sort((a, c) => a.capacity - c.capacity)
      .slice(0, opts.limit ?? 3);
  }

  return { check, alternatives, rooms };
}

/* -------------------------------------------------------------------------- */
/* Manual scheduling helpers (admin edits & extra-class requests)              */
/* -------------------------------------------------------------------------- */
export type SessionDraft = {
  courseId: number;
  facultyId: number;
  groupIds: number[];
  day: number;
  startPeriod: number;
  duration: number;
  kind: t.SessionKind;
};

const DRAFT_ID = -987654321;

function draftRoomEligibility(state: EngineState, draft: SessionDraft) {
  const expectedSize = draft.groupIds.reduce((sum, groupId) => sum + (state.groups.get(groupId)?.size ?? 0), 0);
  const needsAccessible = Boolean(
    state.userRows.find((user) => user.id === draft.facultyId)?.needsAccessible ||
    draft.groupIds.some((groupId) => state.groups.get(groupId)?.needsAccessible),
  );
  const requiredUse = draft.kind === "lab" ? "lab" : draft.kind === "tutorial" ? "tutorial" : "lecture";
  const allowedRoomIds = state.roomRows
    .filter((room) => room.allowedUses.includes(requiredUse) && room.capacity >= expectedSize && (!needsAccessible || room.accessible))
    .map((room) => room.id);
  return { expectedSize, allowedRoomIds };
}

/** Validates a brand-new session against a version's full timetable. */
export function validateDraftSession(state: EngineState, draft: SessionDraft & { roomId: number }) {
  const eligibility = draftRoomEligibility(state, draft);
  if (!eligibility.allowedRoomIds.length) {
    return { ok: false, issues: ["No CIT venue satisfies this session's use, capacity, and accessibility requirements"] };
  }
  const temp = { id: DRAFT_ID, offeringId: null, isFixed: false, ...draft, ...eligibility };
  const issues = validateSessions([...state.sessions, temp], state.ctx).filter(
    (i) => i.sessionIds.includes(DRAFT_ID) && (i.severity === "error" || i.code === "spans_break"),
  );
  return { ok: issues.length === 0, issues: [...new Set(issues.map((i) => i.message))] };
}

/** Smallest compatible free room for a draft at its slot (ignores one session being moved). */
export function findFreeRoom(state: EngineState, draft: SessionDraft, ignoreSessionId?: number) {
  const eligibility = draftRoomEligibility(state, draft);
  const base: EngineState = ignoreSessionId
    ? { ...state, sessions: state.sessions.filter((s) => s.id !== ignoreSessionId) }
    : state;
  const candidates = [...state.rooms.values()]
    .filter((room) => room.status === "active" && eligibility.allowedRoomIds.includes(room.id))
    .sort((a, b) => a.capacity - b.capacity);
  for (const room of candidates) {
    if (validateDraftSession(base, { ...draft, roomId: room.id }).ok) return room;
  }
  return null;
}
