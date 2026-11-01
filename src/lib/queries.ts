import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { CurrentUser } from "./auth";
import type { RequestStatus, Role } from "./constants";
import { getPublishedVersion, loadEngineState } from "./engine";
import { validateExams, validateSessions, type Issue } from "./scheduler";

export const getSettings = cache(async () => {
  const [s] = await db.select().from(t.settings).limit(1);
  return (
    s ?? {
      id: 1,
      institutionName: "Your institution",
      academicTerm: "Current term",
      bookingLeadDays: 2,
      maxBookingHours: 6,
      clubApprovalRequired: true,
      allowWeekendBookings: true,
      updatedAt: new Date(),
    }
  );
});

export const getPublished = cache(getPublishedVersion);

export const getVersions = cache(async () => db.select().from(t.scheduleVersions).orderBy(desc(t.scheduleVersions.id)));

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */
export const getRef = cache(async () => {
  const [departments, rooms, groups, courses, people, clubs, offerings] = await Promise.all([
    db.select().from(t.departments).orderBy(t.departments.code),
    db.select().from(t.rooms).orderBy(t.rooms.code),
    db.select().from(t.studentGroups).orderBy(t.studentGroups.code),
    db.select().from(t.courses).orderBy(t.courses.code),
    db
      .select({
        id: t.users.id,
        sourceId: t.users.sourceId,
        name: t.users.name,
        email: t.users.email,
        role: t.users.role,
        title: t.users.title,
        departmentId: t.users.departmentId,
        clubId: t.users.clubId,
        maxWeeklyPeriods: t.users.maxWeeklyPeriods,
        maxHoursPerDay: t.users.maxHoursPerDay,
        needsAccessible: t.users.needsAccessible,
      })
      .from(t.users)
      .orderBy(t.users.name),
    db.select().from(t.clubs).orderBy(t.clubs.name),
    db.select().from(t.offerings).orderBy(t.offerings.id),
  ]);
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const personMap = new Map(people.map((p) => [p.id, p]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const clubMap = new Map(clubs.map((c) => [c.id, c]));
  return {
    departments,
    rooms,
    groups,
    courses,
    people,
    clubs,
    offerings,
    faculty: people.filter((p) => p.role === "faculty"),
    roomMap,
    groupMap,
    courseMap,
    personMap,
    deptMap,
    clubMap,
  };
});
export type Ref = Awaited<ReturnType<typeof getRef>>;

/* -------------------------------------------------------------------------- */
/* Timetable                                                                  */
/* -------------------------------------------------------------------------- */
export type SessionView = {
  id: number;
  versionId: number;
  offeringId: number | null;
  day: number;
  startPeriod: number;
  duration: number;
  kind: t.SessionKind;
  sourceId: string | null;
  basketSlot: string | null;
  expectedSize: number | null;
  isFixed: boolean;
  courseId: number;
  courseCode: string;
  courseTitle: string;
  departmentId: number | null;
  facultyId: number;
  facultyName: string;
  roomId: number;
  roomCode: string;
  roomName: string;
  roomStatus: t.RoomStatus;
  groupIds: number[];
  groupCodes: string[];
  size: number;
  combined: boolean;
};

export const getTimetable = cache(async (versionId: number) => {
  const state = await loadEngineState(versionId);
  const issues: Issue[] = validateSessions(state.sessions, state.ctx);
  const issuesBySession: Record<number, string[]> = {};
  for (const issue of issues) for (const id of issue.sessionIds) (issuesBySession[id] ??= []).push(issue.message);
  const sessions: SessionView[] = state.sessionRows
    .map((s) => {
      const course = state.courses.get(s.courseId);
      const room = state.rooms.get(s.roomId);
      return {
        id: s.id,
        versionId: s.versionId,
        offeringId: s.offeringId,
        day: s.day,
        startPeriod: s.startPeriod,
        duration: s.duration,
        kind: s.kind,
        sourceId: s.sourceId,
        basketSlot: s.basketSlot,
        expectedSize: s.expectedSize,
        isFixed: s.isFixed,
        courseId: s.courseId,
        courseCode: course?.code ?? "—",
        courseTitle: course?.title ?? "",
        departmentId: course?.departmentId ?? null,
        facultyId: s.facultyId,
        facultyName: state.labels.faculty(s.facultyId),
        roomId: s.roomId,
        roomCode: room?.code ?? "—",
        roomName: room?.name ?? "",
        roomStatus: room?.status ?? "active",
        groupIds: s.groupIds,
        groupCodes: s.groupIds.map(state.labels.group),
        size: s.expectedSize ?? s.groupIds.reduce((n, g) => n + (state.groups.get(g)?.size ?? 0), 0),
        combined: s.groupIds.length > 1,
      };
    })
    .sort((a, b) => a.day - b.day || a.startPeriod - b.startPeriod || a.courseCode.localeCompare(b.courseCode));
  const facultyLoad = new Map<number, number>();
  const roomLoad = new Map<number, number>();
  for (const s of sessions) {
    facultyLoad.set(s.facultyId, (facultyLoad.get(s.facultyId) ?? 0) + s.duration);
    roomLoad.set(s.roomId, (roomLoad.get(s.roomId) ?? 0) + s.duration);
  }
  return { state, sessions, issues, issuesBySession, facultyLoad, roomLoad };
});

export async function getPublishedTimetable() {
  const pub = await getPublished();
  if (!pub) return null;
  return { version: pub, ...(await getTimetable(pub.id)) };
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */
export type BookingView = t.BookingRow & {
  requesterName: string;
  requesterRole: Role | null;
  orgName: string;
  roomCode: string;
  roomName: string;
  roomCapacity: number;
  suggestedRoomCode: string | null;
  reviewerName: string | null;
};

export async function listBookings(filter: { requesterId?: number; departmentId?: number; status?: RequestStatus } = {}) {
  const conds = [];
  if (filter.requesterId) conds.push(eq(t.bookings.requesterId, filter.requesterId));
  if (filter.departmentId) conds.push(eq(t.bookings.departmentId, filter.departmentId));
  if (filter.status) conds.push(eq(t.bookings.status, filter.status));
  const [rows, ref] = await Promise.all([
    db
      .select()
      .from(t.bookings)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(t.bookings.date), desc(t.bookings.startTime)),
    getRef(),
  ]);
  return rows.map<BookingView>((b) => {
    const room = ref.roomMap.get(b.roomId);
    const requester = ref.personMap.get(b.requesterId);
    return {
      ...b,
      requesterName: b.sourceRequester ?? requester?.name ?? "Unknown",
      requesterRole: b.sourceRequesterRole === "department_coordinator"
        ? "coordinator"
        : (["admin", "faculty", "club"] as string[]).includes(b.sourceRequesterRole ?? "")
          ? b.sourceRequesterRole as Role
          : requester?.role ?? null,
      orgName: b.clubId ? ref.clubMap.get(b.clubId)?.name ?? "Club" : b.departmentId ? ref.deptMap.get(b.departmentId)?.name ?? "Department" : "Campus",
      roomCode: room?.code ?? "—",
      roomName: room?.name ?? "",
      roomCapacity: room?.capacity ?? 0,
      suggestedRoomCode: b.suggestedRoomId ? ref.roomMap.get(b.suggestedRoomId)?.code ?? null : null,
      reviewerName: b.reviewerId ? ref.personMap.get(b.reviewerId)?.name ?? null : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Change requests                                                            */
/* -------------------------------------------------------------------------- */
export type ChangeRequestView = t.ChangeRequestRow & {
  facultyName: string;
  facultyDepartmentId: number | null;
  proposedRoomCode: string | null;
  reviewerName: string | null;
  sessionVersionStatus: t.VersionStatus | null;
  currentSlot: { day: number; startPeriod: number; duration: number; roomCode: string } | null;
};

export async function listChangeRequests(filter: { facultyIds?: number[]; status?: RequestStatus } = {}) {
  const conds = [];
  if (filter.facultyIds) {
    if (!filter.facultyIds.length) return [];
    conds.push(inArray(t.changeRequests.facultyId, filter.facultyIds));
  }
  if (filter.status) conds.push(eq(t.changeRequests.status, filter.status));
  const [rows, ref] = await Promise.all([
    db
      .select()
      .from(t.changeRequests)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(t.changeRequests.createdAt)),
    getRef(),
  ]);
  const sessionIds = rows.map((r) => r.sessionId).filter((x): x is number => x !== null);
  const sessions = sessionIds.length
    ? await db
        .select({ s: t.scheduledSessions, status: t.scheduleVersions.status })
        .from(t.scheduledSessions)
        .innerJoin(t.scheduleVersions, eq(t.scheduleVersions.id, t.scheduledSessions.versionId))
        .where(inArray(t.scheduledSessions.id, sessionIds))
    : [];
  const sessionMap = new Map(sessions.map((x) => [x.s.id, x]));
  return rows.map<ChangeRequestView>((r) => {
    const found = r.sessionId ? sessionMap.get(r.sessionId) : undefined;
    const faculty = ref.personMap.get(r.facultyId);
    return {
      ...r,
      facultyName: faculty?.name ?? "Unknown",
      facultyDepartmentId: faculty?.departmentId ?? null,
      proposedRoomCode: r.proposedRoomId ? ref.roomMap.get(r.proposedRoomId)?.code ?? null : null,
      reviewerName: r.reviewerId ? ref.personMap.get(r.reviewerId)?.name ?? null : null,
      sessionVersionStatus: found?.status ?? null,
      currentSlot: found
        ? { day: found.s.day, startPeriod: found.s.startPeriod, duration: found.s.duration, roomCode: ref.roomMap.get(found.s.roomId)?.code ?? "—" }
        : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Disruptions                                                                */
/* -------------------------------------------------------------------------- */
export async function listDisruptions(status?: t.DisruptionStatus) {
  const [rows, ref] = await Promise.all([
    db
      .select()
      .from(t.disruptions)
      .where(status ? eq(t.disruptions.status, status) : undefined)
      .orderBy(desc(t.disruptions.createdAt)),
    getRef(),
  ]);
  return rows.map((d) => ({
    ...d,
    createdByName: d.createdById ? ref.personMap.get(d.createdById)?.name ?? null : null,
    resolvedByName: d.resolvedById ? ref.personMap.get(d.resolvedById)?.name ?? null : null,
    facultyName: d.facultyId ? ref.personMap.get(d.facultyId)?.name ?? null : null,
    roomCode: d.roomId ? ref.roomMap.get(d.roomId)?.code ?? null : null,
  }));
}
export type DisruptionView = Awaited<ReturnType<typeof listDisruptions>>[number];

/* -------------------------------------------------------------------------- */
/* Examinations                                                               */
/* -------------------------------------------------------------------------- */
export async function getExams() {
  const [rows, ref] = await Promise.all([
    db.select().from(t.exams).orderBy(t.exams.date, t.exams.startTime),
    getRef(),
  ]);
  const issues = validateExams(rows, {
    rooms: ref.roomMap,
    labels: {
      room: (id) => ref.roomMap.get(id)?.code ?? "—",
      group: (id) => ref.groupMap.get(id)?.code ?? "—",
      faculty: (id) => ref.personMap.get(id)?.name ?? "—",
      course: (id) => ref.courseMap.get(id)?.code ?? "—",
    },
  });
  return rows.map((e) => {
    const assignedRooms = (e.roomIds.length ? e.roomIds : [e.roomId])
      .map((id) => ref.roomMap.get(id))
      .filter((room): room is NonNullable<typeof room> => Boolean(room));
    const assignedCourses = (e.courseIds.length ? e.courseIds : [e.courseId])
      .map((id) => ref.courseMap.get(id))
      .filter((course): course is NonNullable<typeof course> => Boolean(course));
    return {
      ...e,
      courseCode: assignedCourses.map((course) => course.code).join(" + ") || "—",
      courseTitle: assignedCourses.map((course) => course.title).join(" + "),
      groupCodes: e.groupIds.map((g) => ref.groupMap.get(g)?.code ?? "—"),
      roomCode: assignedRooms.map((room) => room.code).join(" + ") || "—",
      roomName: assignedRooms.map((room) => room.name).join(" + "),
      roomCapacity: assignedRooms.reduce((sum, room) => sum + Math.floor(room.capacity / 2), 0),
      invigilatorName: e.invigilatorId ? ref.personMap.get(e.invigilatorId)?.name ?? null : null,
      issues: issues.get(e.id) ?? [],
    };
  });
}
export type ExamView = Awaited<ReturnType<typeof getExams>>[number];

/* -------------------------------------------------------------------------- */
/* Notifications, audit, badges                                               */
/* -------------------------------------------------------------------------- */
export async function listNotifications(userId: number, limit = 50) {
  return db
    .select()
    .from(t.notifications)
    .where(eq(t.notifications.userId, userId))
    .orderBy(desc(t.notifications.createdAt))
    .limit(limit);
}

export async function listAudit(opts: { entityType?: string; limit?: number } = {}) {
  const [rows, ref] = await Promise.all([
    db
      .select()
      .from(t.auditLogs)
      .where(opts.entityType ? eq(t.auditLogs.entityType, opts.entityType) : undefined)
      .orderBy(desc(t.auditLogs.createdAt), desc(t.auditLogs.id))
      .limit(opts.limit ?? 100),
    getRef(),
  ]);
  return rows.map((a) => ({ ...a, actorName: a.actorId ? ref.personMap.get(a.actorId)?.name ?? "System" : "System" }));
}
export type AuditView = Awaited<ReturnType<typeof listAudit>>[number];

async function count(query: Promise<{ n: number }[]>) {
  const [row] = await query;
  return row?.n ?? 0;
}
const n = sql<number>`count(*)::int`;

export const getNavBadges = cache(async (user: CurrentUser): Promise<Record<string, number>> => {
  if (user.role === "admin") {
    const [bookings, requests, disruptions] = await Promise.all([
      count(db.select({ n }).from(t.bookings).where(eq(t.bookings.status, "pending"))),
      count(db.select({ n }).from(t.changeRequests).where(eq(t.changeRequests.status, "pending"))),
      count(db.select({ n }).from(t.disruptions).where(eq(t.disruptions.status, "proposed"))),
    ]);
    return { approvals: bookings + requests + disruptions, bookings, disruptions };
  }
  if (user.role === "coordinator") {
    const ids = (await db.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.role, "faculty"), eq(t.users.departmentId, user.departmentId ?? -1)))).map((x) => x.id);
    const approvals = ids.length
      ? await count(db.select({ n }).from(t.changeRequests).where(and(eq(t.changeRequests.status, "pending"), inArray(t.changeRequests.facultyId, ids))))
      : 0;
    return { approvals };
  }
  const unread = await count(
    db.select({ n }).from(t.notifications).where(and(eq(t.notifications.userId, user.id), eq(t.notifications.read, false))),
  );
  if (user.role === "faculty") {
    const requests = await count(
      db.select({ n }).from(t.changeRequests).where(and(eq(t.changeRequests.facultyId, user.id), eq(t.changeRequests.status, "pending"))),
    );
    return { notifications: unread, requests };
  }
  const bookings = await count(
    db.select({ n }).from(t.bookings).where(and(eq(t.bookings.requesterId, user.id), eq(t.bookings.status, "pending"))),
  );
  return { notifications: unread, bookings };
});

export async function getDepartmentFacultyIds(departmentId: number | null) {
  if (!departmentId) return [];
  const rows = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(and(eq(t.users.role, "faculty"), eq(t.users.departmentId, departmentId)));
  return rows.map((r) => r.id);
}

export async function listAssistantMessages(userId: number) {
  return db
    .select()
    .from(t.assistantMessages)
    .where(eq(t.assistantMessages.userId, userId))
    .orderBy(t.assistantMessages.createdAt, t.assistantMessages.id);
}
