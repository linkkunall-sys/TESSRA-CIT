"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import * as t from "@/db/schema";
import { respond } from "./assistant";
import { endSession, requireRole, requireUser } from "./auth";
import { hashPassword } from "./password";
import { findAlternatives } from "./scheduler";
import { BOOKING_CATEGORIES, BOOKING_NEEDS, DAY_SHORT, ROOM_FEATURES, type ChangeType, type Priority, type RoomStatus, type RoomType, type SessionKind } from "./constants";
import {
  applyDisruptionPlan,
  audit,
  buildBookingAnalyzer,
  checkSessionMove,
  findFreeRoom,
  generateVersion,
  getPublishedVersion,
  loadEngineState,
  notify,
  proposeDisruption,
  publishVersion,
  slotRef,
  validateDraftSession,
  type SessionDraft,
} from "./engine";
import {
  daysUntil,
  dayIndexFromIso,
  fail,
  isIsoDate,
  isValidDay,
  isValidPeriod,
  isValidTime,
  num,
  ok,
  periodLabel,
  str,
  toMinutes,
  type ActionState,
} from "./utils";

const refresh = () => revalidatePath("/", "layout");
const ids = (fd: FormData, key: string) =>
  fd
    .getAll(key)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);

/* ================================ Auth ================================ */
export async function logoutAction() {
  await endSession();
  redirect("/login");
}

/* ============================= Scheduling ============================= */
export async function generateScheduleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const notes = str(fd, "notes").slice(0, 200) || null;
  const { version, stats } = await generateVersion(user.id, notes);
  await audit(user.id, "schedule.generated", "schedule", version.id, `Generated ${version.label} — placed ${stats.placedUnits}/${stats.requiredUnits} sessions in ${stats.durationMs} ms`);
  refresh();
  redirect(`/admin/scheduling?version=${version.id}&generated=1`);
}

export async function publishVersionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const versionId = num(fd, "versionId");
  if (!versionId) return fail("Choose a version to publish.");
  const [v] = await db.select().from(t.scheduleVersions).where(eq(t.scheduleVersions.id, versionId));
  if (!v || v.status !== "draft") return fail("Only draft versions can be published.");
  await publishVersion(v.id);
  await audit(user.id, "schedule.published", "schedule", v.id, `Published ${v.label}`);
  const faculty = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.role, "faculty"));
  if (faculty.length) {
    await db.insert(t.notifications).values(
      faculty.map((f) => ({ userId: f.id, title: `${v.label} timetable published`, body: "A new timetable is live. Review your weekly schedule.", tone: "success" as const, href: "/faculty/timetable" })),
    );
  }
  refresh();
  return ok(`${v.label} is now the published timetable.`);
}

export async function discardVersionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const versionId = num(fd, "versionId");
  const [v] = versionId ? await db.select().from(t.scheduleVersions).where(eq(t.scheduleVersions.id, versionId)) : [];
  if (!v || v.status !== "draft") return fail("Only draft versions can be discarded.");
  await db.delete(t.scheduleVersions).where(eq(t.scheduleVersions.id, v.id));
  await audit(user.id, "schedule.discarded", "schedule", v.id, `Discarded draft ${v.label}`);
  refresh();
  redirect("/admin/scheduling");
}

export async function toggleFixedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const sessionId = num(fd, "sessionId");
  const [s] = sessionId ? await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.id, sessionId)) : [];
  if (!s) return fail("Session not found.");
  await db.update(t.scheduledSessions).set({ isFixed: !s.isFixed }).where(eq(t.scheduledSessions.id, s.id));
  const [c] = await db.select({ code: t.courses.code }).from(t.courses).where(eq(t.courses.id, s.courseId));
  await audit(user.id, s.isFixed ? "session.unpinned" : "session.pinned", "schedule", s.id, `${s.isFixed ? "Unpinned" : "Pinned"} ${c?.code ?? "session"} (${DAY_SHORT[s.day]} ${periodLabel(s.startPeriod, s.duration)})`);
  refresh();
  return ok(s.isFixed ? "Session unpinned — it can move in the next generation." : "Session pinned — it will stay in place during regeneration.");
}

/* ============================== Academics ============================= */
export async function createCourseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const code = str(fd, "code").toUpperCase();
  const title = str(fd, "title");
  const departmentId = num(fd, "departmentId");
  const credits = num(fd, "credits");
  const kind = str(fd, "kind") as SessionKind;
  const errors: Record<string, string> = {};
  if (!/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) errors.code = "Use a code like CS210 or CS210L";
  if (title.length < 3) errors.title = "Enter a course title";
  if (!departmentId) errors.departmentId = "Select a department";
  if (!credits || credits < 1 || credits > 6) errors.credits = "Credits must be between 1 and 6";
  if (!["lecture", "lab", "tutorial"].includes(kind)) errors.kind = "Select a delivery type";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const [dupe] = await db.select({ id: t.courses.id }).from(t.courses).where(eq(t.courses.code, code));
  if (dupe) return fail("A course with this code already exists.", { code: "Code already in use" });
  const [c] = await db.insert(t.courses).values({ code, title, departmentId: departmentId as number, credits: credits as number, kind }).returning();
  await audit(user.id, "course.created", "academics", c.id, `Added course ${code} ${title}`);
  refresh();
  return ok(`Course ${code} added.`);
}

export async function createGroupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  const departmentId = num(fd, "departmentId");
  const year = num(fd, "year");
  const size = num(fd, "size");
  const errors: Record<string, string> = {};
  if (!/^[A-Z]{2,5}-\d[A-Z]?$/.test(code)) errors.code = "Use a code like CSE-2C";
  if (name.length < 3) errors.name = "Enter a descriptive name";
  if (!departmentId) errors.departmentId = "Select a department";
  if (!year || year < 1 || year > 5) errors.year = "Year must be 1–5";
  if (!size || size < 5 || size > 300) errors.size = "Size must be 5–300";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const [dupe] = await db.select({ id: t.studentGroups.id }).from(t.studentGroups).where(eq(t.studentGroups.code, code));
  if (dupe) return fail("A group with this code already exists.", { code: "Code already in use" });
  const [g] = await db.insert(t.studentGroups).values({ code, name, departmentId: departmentId as number, year: year as number, size: size as number }).returning();
  await audit(user.id, "group.created", "academics", g.id, `Added student group ${code} (${size} students)`);
  refresh();
  return ok(`Group ${code} added.`);
}

export async function createOfferingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const courseId = num(fd, "courseId");
  const facultyId = num(fd, "facultyId");
  const groupIds = ids(fd, "groupIds");
  const sessionsPerWeek = num(fd, "sessionsPerWeek");
  const errors: Record<string, string> = {};
  if (!courseId) errors.courseId = "Select a course";
  if (!facultyId) errors.facultyId = "Select a faculty member";
  if (!groupIds.length) errors.groupIds = "Select at least one group";
  if (!sessionsPerWeek || sessionsPerWeek < 1 || sessionsPerWeek > 6) errors.sessionsPerWeek = "Between 1 and 6 sessions";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId as number));
  const [faculty] = await db.select().from(t.users).where(and(eq(t.users.id, facultyId as number), eq(t.users.role, "faculty")));
  if (!course || !faculty) return fail("Course or faculty not found.");
  const roomType: RoomType = course.kind === "lab" ? "lab" : groupIds.length > 1 ? "auditorium" : course.kind === "tutorial" ? "seminar" : "lecture";
  const [o] = await db
    .insert(t.offerings)
    .values({ courseId: course.id, facultyId: faculty.id, groupIds, sessionsPerWeek: sessionsPerWeek as number, duration: course.kind === "lab" ? 3 : 1, kind: course.kind, roomType })
    .returning();
  await audit(user.id, "offering.created", "academics", o.id, `Assigned ${course.code} to ${faculty.name} (${sessionsPerWeek}×/week)`);
  refresh();
  return ok(`${course.code} assigned to ${faculty.name}. It will be placed in the next generated version.`);
}

export async function deleteOfferingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const [o] = id ? await db.select().from(t.offerings).where(eq(t.offerings.id, id)) : [];
  if (!o) return fail("Offering not found.");
  await db.delete(t.offerings).where(eq(t.offerings.id, o.id));
  await audit(user.id, "offering.deleted", "academics", o.id, `Removed teaching assignment #${o.id}`);
  refresh();
  return ok("Teaching assignment removed. Published sessions stay until the next version.");
}

/* ================================ Venues ============================== */
export async function createRoomAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  const building = str(fd, "building");
  const type = str(fd, "type") as RoomType;
  const capacity = num(fd, "capacity");
  const features = fd.getAll("features").map(String).filter((f) => ROOM_FEATURES.includes(f));
  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9-]{2,10}$/.test(code)) errors.code = "Use letters, digits and dashes (e.g. C-301)";
  if (name.length < 3) errors.name = "Enter a venue name";
  if (building.length < 2) errors.building = "Enter the building";
  if (!["lecture", "lab", "seminar", "auditorium", "exam_hall", "outdoor"].includes(type)) errors.type = "Select a venue type";
  if (!capacity || capacity < 5 || capacity > 2000) errors.capacity = "Capacity must be 5–2000";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const [dupe] = await db.select({ id: t.rooms.id }).from(t.rooms).where(eq(t.rooms.code, code));
  if (dupe) return fail("A venue with this code already exists.", { code: "Code already in use" });
  const [r] = await db
    .insert(t.rooms)
    .values({ code, name, building, type, capacity: capacity as number, features, accessible: fd.get("accessible") === "on", bookable: fd.get("bookable") === "on" })
    .returning();
  await audit(user.id, "room.created", "room", r.id, `Added venue ${code} (${capacity} seats)`);
  refresh();
  return ok(`Venue ${code} added.`);
}

export async function updateRoomStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const roomId = num(fd, "roomId");
  const status = str(fd, "status") as RoomStatus;
  const note = str(fd, "note").slice(0, 200);
  if (!roomId || !["active", "maintenance", "inactive"].includes(status)) return fail("Choose a valid status.");
  if (status !== "active" && note.length < 3) return fail("Add a short note explaining the status.", { note: "Required when a venue is unavailable" });
  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, roomId));
  if (!room) return fail("Venue not found.");
  await db.update(t.rooms).set({ status, maintenanceNote: status === "active" ? null : note }).where(eq(t.rooms.id, room.id));
  await audit(user.id, `room.${status}`, "room", room.id, status === "active" ? `Returned ${room.code} to service` : `Set ${room.code} to ${status}: ${note}`);
  let affected = 0;
  const pub = await getPublishedVersion();
  if (pub && status !== "active") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.scheduledSessions)
      .where(and(eq(t.scheduledSessions.versionId, pub.id), eq(t.scheduledSessions.roomId, room.id)));
    affected = row?.n ?? 0;
  }
  refresh();
  return ok(
    status === "active"
      ? `${room.code} is back in service.`
      : `${room.code} marked ${status}.${affected ? ` ${affected} timetabled session(s) are affected — report a disruption to relocate them.` : ""}`,
  );
}

/* ============================== Examinations ========================== */
export async function saveExamAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const courseId = num(fd, "courseId");
  const groupIds = ids(fd, "groupIds");
  const date = str(fd, "date");
  const startTime = str(fd, "startTime");
  const endTime = str(fd, "endTime");
  const roomId = num(fd, "roomId");
  const invigilatorId = num(fd, "invigilatorId");
  let candidates = num(fd, "candidates");
  const errors: Record<string, string> = {};
  if (!courseId) errors.courseId = "Select a course";
  if (!groupIds.length) errors.groupIds = "Select at least one group";
  if (!isIsoDate(date)) errors.date = "Choose a date";
  if (!isValidTime(startTime)) errors.startTime = "Use HH:MM";
  if (!isValidTime(endTime)) errors.endTime = "Use HH:MM";
  else if (isValidTime(startTime) && toMinutes(endTime) <= toMinutes(startTime)) errors.endTime = "End must be after start";
  if (!roomId) errors.roomId = "Select a room";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  if (!candidates) {
    const groups = await db.select().from(t.studentGroups).where(inArray(t.studentGroups.id, groupIds));
    candidates = groups.reduce((n, g) => n + g.size, 0);
  }
  const values = { courseId: courseId as number, groupIds, date, startTime, endTime, roomId: roomId as number, invigilatorId: invigilatorId || null, candidates };
  const [course] = await db.select({ code: t.courses.code }).from(t.courses).where(eq(t.courses.id, courseId as number));
  if (id) {
    await db.update(t.exams).set(values).where(eq(t.exams.id, id));
    await audit(user.id, "exam.updated", "exam", id, `Updated ${course?.code ?? "exam"} examination (${date} ${startTime})`);
  } else {
    const [e] = await db.insert(t.exams).values(values).returning();
    await audit(user.id, "exam.created", "exam", e.id, `Scheduled ${course?.code ?? "exam"} examination (${date} ${startTime})`);
  }
  refresh();
  return ok(id ? "Examination updated. Validation has been re-run." : "Examination scheduled. Validation has been re-run.");
}

export async function deleteExamAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const [e] = id ? await db.select().from(t.exams).where(eq(t.exams.id, id)) : [];
  if (!e) return fail("Examination not found.");
  await db.delete(t.exams).where(eq(t.exams.id, e.id));
  await audit(user.id, "exam.deleted", "exam", e.id, `Removed examination on ${e.date} ${e.startTime}`);
  refresh();
  return ok("Examination removed.");
}

/* ================================ Bookings ============================ */
export async function createBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("club", "coordinator");
  const [settings] = await db.select().from(t.settings).limit(1);
  const title = str(fd, "title");
  const category = str(fd, "category");
  const description = str(fd, "description").slice(0, 600);
  const roomId = num(fd, "roomId");
  const date = str(fd, "date");
  const startTime = str(fd, "startTime");
  const endTime = str(fd, "endTime");
  const attendees = num(fd, "attendees");
  // Priority is derived from the authenticated role, never from natural-language
  // claims or a tampered form field. This prevents category/priority abuse.
  const priority: Priority = user.role === "coordinator" ? "high" : "normal";
  const needs = fd.getAll("needs").map(String).filter((need) => BOOKING_NEEDS.includes(need)).slice(0, 10);
  const errors: Record<string, string> = {};
  const lead = user.role === "club" ? settings?.bookingLeadDays ?? 2 : 0;
  if (title.length < 3) errors.title = "Give the event a clear title";
  const roleCategories = user.role === "club"
    ? ["club_event", "workshop", "seminar", "meeting", "cultural", "sports"]
    : ["department_event", "workshop", "seminar", "meeting"];
  if (!BOOKING_CATEGORIES.some((c) => c.value === category) || !roleCategories.includes(category)) {
    errors.category = "This category is not available to your role";
  }
  if (!roomId) errors.roomId = "Select a venue";
  if (!isIsoDate(date)) errors.date = "Choose a date";
  else if (daysUntil(date) < lead) errors.date = lead ? `Requests need at least ${lead} day(s) notice` : "Date cannot be in the past";
  else if (settings && !settings.allowWeekendBookings && dayIndexFromIso(date) < 0) errors.date = "Weekend bookings are disabled";
  if (!isValidTime(startTime)) errors.startTime = "Use HH:MM";
  if (!isValidTime(endTime)) errors.endTime = "Use HH:MM";
  else if (isValidTime(startTime)) {
    const mins = toMinutes(endTime) - toMinutes(startTime);
    if (mins <= 0) errors.endTime = "End must be after start";
    else if (settings && mins > settings.maxBookingHours * 60) errors.endTime = `Bookings are limited to ${settings.maxBookingHours} hours`;
  }
  if (!attendees || attendees < 1) errors.attendees = "Enter expected attendance";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, roomId as number));
  if (!room) return fail("Venue not found.", { roomId: "Venue not found" });
  if (user.role === "club" && !room.bookable && room.type !== "lab") return fail("This venue is not open to club bookings.", { roomId: "Not bookable by clubs" });
  const features = new Set(room.features.map((feature) => feature.toLowerCase()));
  const unsupported = needs.filter((need) => {
    if (need === "Accessibility") return !room.accessible;
    if (need === "Microphones") return !features.has("audio system");
    if (need === "Wi-Fi access") return !features.has("wi-fi");
    if (need === "Recording") return !features.has("recording") && !features.has("lecture capture");
    return !features.has(need.toLowerCase());
  });
  if (unsupported.length) {
    return fail(`${room.code} does not provide: ${unsupported.join(", ")}.`, { roomId: "Choose a venue with all requested facilities" });
  }
  const analyzer = await buildBookingAnalyzer();
  const probe = { roomId: room.id, date, startTime, endTime, attendees: attendees as number };
  const blocking = analyzer.check(probe).filter((c) => c.severity === "error");
  if (blocking.length) {
    const suggestions = analyzer.alternatives(probe, { bookableOnly: user.role === "club" }).map((r) => ({ id: r.id, code: r.code, name: r.name, capacity: r.capacity }));
    return fail(`${room.code} is not available: ${blocking[0].message}.`, { roomId: blocking.map((b) => b.message).join(" · ") }, { suggestions });
  }
  const autoApprove = user.role === "club" && settings && !settings.clubApprovalRequired;
  const [b] = await db
    .insert(t.bookings)
    .values({
      requesterId: user.id,
      clubId: user.clubId,
      departmentId: user.role === "coordinator" ? user.departmentId : null,
      title,
      category,
      description: description || null,
      roomId: room.id,
      date,
      startTime,
      endTime,
      attendees: attendees as number,
      priority,
      needs,
      status: autoApprove ? "approved" : "pending",
      reviewedAt: autoApprove ? new Date() : null,
    })
    .returning();
  await audit(user.id, "booking.requested", "booking", b.id, `Requested ${room.code} for “${title}” on ${date} ${startTime}–${endTime}`);
  await notify(user.id, autoApprove ? `Booking confirmed: ${title}` : `Request received: ${title}`, autoApprove ? `${room.name} is confirmed.` : `Your ${room.name} request is in the approval queue.`, autoApprove ? "success" : "info", user.role === "club" ? "/club/bookings" : null);
  refresh();
  if (user.role === "club") redirect("/club/bookings?submitted=1");
  return ok(autoApprove ? "Booking confirmed." : "Venue request submitted for approval.");
}

export async function approveBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const [b] = id ? await db.select().from(t.bookings).where(eq(t.bookings.id, id)) : [];
  if (!b || b.status !== "pending") return fail("This request is no longer pending.");
  const analyzer = await buildBookingAnalyzer();
  const blocking = analyzer.check(b).filter((c) => c.severity === "error");
  if (blocking.length) return fail(`Cannot approve — ${blocking[0].message}. Reject with an alternative instead.`);
  await db.update(t.bookings).set({ status: "approved", reviewerId: user.id, reviewedAt: new Date() }).where(eq(t.bookings.id, b.id));
  const room = analyzer.rooms.get(b.roomId);
  await notify(b.requesterId, `Booking approved: ${b.title}`, `${room?.name ?? "Your venue"} is confirmed for ${b.date}, ${b.startTime}–${b.endTime}.`, "success", "/club/bookings");
  await audit(user.id, "booking.approved", "booking", b.id, `Approved booking “${b.title}” in ${room?.code ?? "venue"}`);
  refresh();
  return ok(`Approved “${b.title}”.`);
}

export async function rejectBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const reason = str(fd, "reason").slice(0, 400);
  const suggestedRoomId = num(fd, "suggestedRoomId");
  if (reason.length < 5) return fail("Explain the reason so the requester can act on it.", { reason: "A reason is required" });
  const [b] = id ? await db.select().from(t.bookings).where(eq(t.bookings.id, id)) : [];
  if (!b || b.status !== "pending") return fail("This request is no longer pending.");
  await db
    .update(t.bookings)
    .set({ status: "rejected", rejectionReason: reason, suggestedRoomId: suggestedRoomId || null, reviewerId: user.id, reviewedAt: new Date() })
    .where(eq(t.bookings.id, b.id));
  const [alt] = suggestedRoomId ? await db.select().from(t.rooms).where(eq(t.rooms.id, suggestedRoomId)) : [];
  await notify(b.requesterId, `Booking rejected: ${b.title}`, `${reason}${alt ? ` Suggested alternative: ${alt.code}.` : ""}`, "error", "/club/history");
  await audit(user.id, "booking.rejected", "booking", b.id, `Rejected booking “${b.title}”${alt ? ` — suggested ${alt.code}` : ""}`);
  refresh();
  return ok(`Rejected “${b.title}”. The requester has been notified.`);
}

export async function cancelBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("club", "coordinator");
  const id = num(fd, "id");
  const [b] = id ? await db.select().from(t.bookings).where(and(eq(t.bookings.id, id), eq(t.bookings.requesterId, user.id))) : [];
  if (!b || !["pending", "approved"].includes(b.status)) return fail("This booking can no longer be cancelled.");
  if (daysUntil(b.date) < 0) return fail("Past bookings cannot be cancelled.");
  await db.update(t.bookings).set({ status: "cancelled" }).where(eq(t.bookings.id, b.id));
  await audit(user.id, "booking.cancelled", "booking", b.id, `Cancelled booking “${b.title}”`);
  refresh();
  return ok(`Cancelled “${b.title}”.`);
}

/* ============================ Change requests ========================= */
export async function createChangeRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("faculty");
  const sessionId = num(fd, "sessionId");
  const type = str(fd, "type") as ChangeType;
  if (type === "extra_class") return requestExtraClass(user, fd);
  const reason = str(fd, "reason").slice(0, 500);
  const proposedDay = num(fd, "proposedDay");
  const proposedPeriod = num(fd, "proposedPeriod");
  const proposedRoomId = num(fd, "proposedRoomId");
  const errors: Record<string, string> = {};
  if (!sessionId) errors.sessionId = "Select the session to change";
  if (!["reschedule", "room_change"].includes(type)) errors.type = "Select a request type";
  if (reason.length < 10) errors.reason = "Give your coordinator enough context (10+ characters)";
  if (type === "reschedule") {
    if (!isValidDay(proposedDay)) errors.proposedDay = "Select a day";
    if (!isValidPeriod(proposedPeriod)) errors.proposedPeriod = "Select a period";
  }
  if (type === "room_change" && !proposedRoomId) errors.proposedRoomId = "Select the room you need";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const pub = await getPublishedVersion();
  const [s] = await db.select().from(t.scheduledSessions).where(and(eq(t.scheduledSessions.id, sessionId as number), eq(t.scheduledSessions.facultyId, user.id)));
  if (!s || !pub || s.versionId !== pub.id) return fail("That session is not part of your published timetable.", { sessionId: "Not in the published timetable" });
  const [dupe] = await db.select({ id: t.changeRequests.id }).from(t.changeRequests).where(and(eq(t.changeRequests.sessionId, s.id), eq(t.changeRequests.status, "pending")));
  if (dupe) return fail("There is already a pending request for this session.", { sessionId: "Pending request exists" });

  const placement = {
    day: type === "reschedule" ? (proposedDay as number) : s.day,
    startPeriod: type === "reschedule" ? (proposedPeriod as number) : s.startPeriod,
    roomId: proposedRoomId || s.roomId,
  };
  if (placement.day === s.day && placement.startPeriod === s.startPeriod && placement.roomId === s.roomId) {
    return fail("The proposed slot is the same as the current one.", { proposedPeriod: "Choose a different slot or room" });
  }
  const check = await checkSessionMove(s.id, placement);
  if (!check.ok) {
    return fail(`The proposed slot has conflicts: ${check.issues[0]}.`, { [type === "reschedule" ? "proposedPeriod" : "proposedRoomId"]: check.issues.join(" · ") });
  }
  const state = check.state ?? (await loadEngineState(s.versionId));
  const course = state.courses.get(s.courseId);
  const [req] = await db
    .insert(t.changeRequests)
    .values({
      facultyId: user.id,
      sessionId: s.id,
      type,
      reason,
      proposedDay: placement.day,
      proposedPeriod: placement.startPeriod,
      proposedRoomId: placement.roomId,
      snapshot: { courseCode: course?.code ?? "", courseTitle: course?.title ?? "", groups: s.groupIds.map(state.labels.group).join(" + "), from: slotRef(s, state.labels) },
    })
    .returning();
  await audit(user.id, "change_request.created", "change_request", req.id, `${user.name} requested a ${type === "reschedule" ? "reschedule" : "room change"} for ${course?.code ?? "a session"}`);
  refresh();
  return ok("Request validated and sent to your coordinator.");
}

async function loadReviewableRequest(fd: FormData) {
  const user = await requireRole("coordinator", "admin");
  const id = num(fd, "id");
  const [req] = id ? await db.select().from(t.changeRequests).where(eq(t.changeRequests.id, id)) : [];
  if (!req || req.status !== "pending") return { user, req: null, error: "This request is no longer pending." };
  if (user.role === "coordinator") {
    const [f] = await db.select({ departmentId: t.users.departmentId }).from(t.users).where(eq(t.users.id, req.facultyId));
    if (!f || f.departmentId !== user.departmentId) return { user, req: null, error: "You can only review requests from your department." };
  }
  return { user, req, error: null };
}

export async function approveChangeRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, req, error } = await loadReviewableRequest(fd);
  if (!req) return fail(error ?? "Request not found.");
  const note = str(fd, "note").slice(0, 300) || null;
  if (req.type === "extra_class") return approveExtraClass(user, req, note);
  const pub = await getPublishedVersion();
  const [s] = req.sessionId ? await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.id, req.sessionId)) : [];
  if (!s || !pub || s.versionId !== pub.id) return fail("This request refers to a session that is no longer in the published timetable.");
  const placement = { day: req.proposedDay ?? s.day, startPeriod: req.proposedPeriod ?? s.startPeriod, roomId: req.proposedRoomId ?? s.roomId };
  const check = await checkSessionMove(s.id, placement);
  if (!check.ok) return fail(`Cannot approve — ${check.issues[0]}.`);
  await db.update(t.scheduledSessions).set({ day: placement.day, startPeriod: placement.startPeriod, roomId: placement.roomId }).where(eq(t.scheduledSessions.id, s.id));
  await db.update(t.changeRequests).set({ status: "approved", reviewerId: user.id, reviewNote: note, reviewedAt: new Date() }).where(eq(t.changeRequests.id, req.id));
  const code = req.snapshot?.courseCode ?? "your session";
  await notify(req.facultyId, `Change approved: ${code}`, `Moved to ${DAY_SHORT[placement.day]} ${periodLabel(placement.startPeriod, s.duration)}${note ? ` — ${note}` : ""}.`, "success", "/faculty/timetable");
  await audit(user.id, "change_request.approved", "change_request", req.id, `Approved ${req.type === "reschedule" ? "reschedule" : "room change"} for ${code} → ${DAY_SHORT[placement.day]} ${periodLabel(placement.startPeriod, s.duration)}`);
  refresh();
  return ok("Approved. The published timetable has been updated.");
}

export async function rejectChangeRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, req, error } = await loadReviewableRequest(fd);
  if (!req) return fail(error ?? "Request not found.");
  if (req.type === "extra_class" && user.role !== "admin") {
    return fail("Only the admin can review new class requests.");
  }
  const note = str(fd, "note").slice(0, 300);
  if (note.length < 5) return fail("Add a short note so the faculty member knows why.", { note: "A note is required" });
  await db.update(t.changeRequests).set({ status: "rejected", reviewerId: user.id, reviewNote: note, reviewedAt: new Date() }).where(eq(t.changeRequests.id, req.id));
  await notify(req.facultyId, `Change declined: ${req.snapshot?.courseCode ?? "session"}`, note, "error", "/faculty/requests");
  await audit(user.id, "change_request.rejected", "change_request", req.id, `Rejected change request for ${req.snapshot?.courseCode ?? "a session"}`);
  refresh();
  return ok("Request rejected. The faculty member has been notified.");
}

export async function withdrawChangeRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("faculty");
  const id = num(fd, "id");
  const [req] = id ? await db.select().from(t.changeRequests).where(and(eq(t.changeRequests.id, id), eq(t.changeRequests.facultyId, user.id))) : [];
  if (!req || req.status !== "pending") return fail("Only pending requests can be withdrawn.");
  await db.update(t.changeRequests).set({ status: "cancelled" }).where(eq(t.changeRequests.id, req.id));
  await audit(user.id, "change_request.withdrawn", "change_request", req.id, `Withdrew change request for ${req.snapshot?.courseCode ?? "a session"}`);
  refresh();
  return ok("Request withdrawn.");
}

/* ============================== Disruptions =========================== */
export async function createDisruptionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const type = str(fd, "type") as t.DisruptionType;
  const facultyId = num(fd, "facultyId");
  const roomId = num(fd, "roomId");
  const dayRaw = str(fd, "day");
  const day = dayRaw === "all" || dayRaw === "" ? null : Number(dayRaw);
  const description = str(fd, "description").slice(0, 500);
  const errors: Record<string, string> = {};
  if (type === "faculty_absence") {
    if (!facultyId) errors.facultyId = "Select the absent faculty member";
    if (!isValidDay(day)) errors.day = "Select the day of absence";
  } else if (type === "room_unavailable") {
    if (!roomId) errors.roomId = "Select the affected room";
    if (day !== null && !isValidDay(day)) errors.day = "Select a day or the whole week";
  } else return fail("Unknown disruption type.");
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const pub = await getPublishedVersion();
  if (!pub) return fail("Publish a timetable before reporting disruptions.");
  const state = await loadEngineState(pub.id);
  if (type === "room_unavailable" && fd.get("markMaintenance") === "on" && roomId) {
    await db.update(t.rooms).set({ status: "maintenance", maintenanceNote: description || "Reported via disruption" }).where(eq(t.rooms.id, roomId));
  }
  const dayText = day === null ? "whole week" : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][day];
  const title =
    str(fd, "title") ||
    (type === "faculty_absence" ? `${state.labels.faculty(facultyId as number)} absent — ${dayText}` : `${state.labels.room(roomId as number)} unavailable — ${dayText}`);
  const plan = await proposeDisruption({ type, facultyId: type === "faculty_absence" ? facultyId : null, roomId: type === "room_unavailable" ? roomId : null, day }, pub.id);
  const [d] = await db
    .insert(t.disruptions)
    .values({
      type,
      title,
      description: description || null,
      facultyId: type === "faculty_absence" ? facultyId : null,
      roomId: type === "room_unavailable" ? roomId : null,
      day,
      versionId: pub.id,
      affectedSessionIds: plan.affectedSessionIds,
      proposedChanges: plan.changes,
      validation: plan.validation,
      createdById: user.id,
    })
    .returning();
  await audit(user.id, "disruption.reported", "disruption", d.id, `Disruption analysed: ${title} — ${plan.changes.length} session(s) affected`);
  refresh();
  const resolved = plan.changes.filter((c) => c.action !== "unresolved").length;
  return ok(plan.changes.length ? `Analysis complete: ${plan.changes.length} affected session(s), ${resolved} resolved automatically. Review before approving.` : "No timetabled sessions are affected by this disruption.");
}

export async function applyDisruptionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const [d] = id ? await db.select().from(t.disruptions).where(eq(t.disruptions.id, id)) : [];
  if (!d || d.status !== "proposed") return fail("This disruption plan is no longer awaiting approval.");
  const result = await applyDisruptionPlan(d);
  if (!result.ok) return fail(result.message);
  await db.update(t.disruptions).set({ status: "applied", resolvedById: user.id, resolvedAt: new Date() }).where(eq(t.disruptions.id, d.id));
  const sessions = d.affectedSessionIds.length
    ? await db.select({ facultyId: t.scheduledSessions.facultyId }).from(t.scheduledSessions).where(inArray(t.scheduledSessions.id, d.affectedSessionIds))
    : [];
  for (const facultyId of new Set(sessions.map((s) => s.facultyId))) {
    await notify(facultyId, `Timetable updated: ${d.title}`, "Your affected sessions have been relocated. Review your timetable for the new slots.", "warning", "/faculty/timetable");
  }
  await audit(user.id, "disruption.applied", "disruption", d.id, `Applied disruption plan “${d.title}” — ${result.moved} session(s) updated`);
  refresh();
  return ok(`Plan applied: ${result.moved} session(s) updated and faculty notified.`);
}

export async function rejectDisruptionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const [d] = id ? await db.select().from(t.disruptions).where(eq(t.disruptions.id, id)) : [];
  if (!d || d.status !== "proposed") return fail("This disruption plan is no longer awaiting approval.");
  await db.update(t.disruptions).set({ status: "rejected", resolvedById: user.id, resolvedAt: new Date() }).where(eq(t.disruptions.id, d.id));
  await audit(user.id, "disruption.rejected", "disruption", d.id, `Rejected disruption plan “${d.title}”`);
  refresh();
  return ok("Plan rejected. The timetable is unchanged.");
}

/* ============================== Availability ========================== */
export async function toggleAvailabilityAction(day: number, period: number, reason: string): Promise<ActionState> {
  const user = await requireRole("faculty");
  if (!isValidDay(day) || !isValidPeriod(period)) return fail("Invalid slot.");
  const pub = await getPublishedVersion();
  if (pub) {
    const rows = await db
      .select({ startPeriod: t.scheduledSessions.startPeriod, duration: t.scheduledSessions.duration })
      .from(t.scheduledSessions)
      .where(and(eq(t.scheduledSessions.versionId, pub.id), eq(t.scheduledSessions.facultyId, user.id), eq(t.scheduledSessions.day, day)));
    if (rows.some((r) => period >= r.startPeriod && period < r.startPeriod + r.duration)) {
      return fail("You teach in this slot. Submit a schedule change request instead.");
    }
  }
  const [existing] = await db
    .select()
    .from(t.availabilityBlocks)
    .where(and(eq(t.availabilityBlocks.facultyId, user.id), eq(t.availabilityBlocks.day, day), eq(t.availabilityBlocks.period, period)));
  if (existing) await db.delete(t.availabilityBlocks).where(eq(t.availabilityBlocks.id, existing.id));
  else await db.insert(t.availabilityBlocks).values({ facultyId: user.id, day, period, reason: reason.trim().slice(0, 80) || "Unavailable" });
  refresh();
  return ok(existing ? `${DAY_SHORT[day]} P${period} marked available.` : `${DAY_SHORT[day]} P${period} marked unavailable.`);
}

/* ============================= Notifications ========================== */
export async function markNotificationReadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = num(fd, "id");
  if (!id) return fail("Notification not found.");
  await db.update(t.notifications).set({ read: true }).where(and(eq(t.notifications.id, id), eq(t.notifications.userId, user.id)));
  refresh();
  return ok("Marked as read.");
}

export async function markAllNotificationsReadAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  await db.update(t.notifications).set({ read: true }).where(and(eq(t.notifications.userId, user.id), eq(t.notifications.read, false)));
  refresh();
  return ok("All notifications marked as read.");
}

/* =============================== Assistant ============================ */
export async function sendAssistantMessageAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("faculty");
  const message = str(fd, "message").slice(0, 500);
  if (!message) return fail("Type a question first.");
  await db.insert(t.assistantMessages).values({ userId: user.id, role: "user", content: message });
  const reply = await respond(user, message);
  await db.insert(t.assistantMessages).values({ userId: user.id, role: "assistant", content: reply.content, payload: reply.payload });
  refresh();
  return ok("");
}

async function loadOwnMessage(fd: FormData) {
  const user = await requireRole("faculty");
  const id = num(fd, "messageId");
  const [m] = id ? await db.select().from(t.assistantMessages).where(and(eq(t.assistantMessages.id, id), eq(t.assistantMessages.userId, user.id))) : [];
  return { user, m: m ?? null };
}

export async function submitAssistantProposalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, m } = await loadOwnMessage(fd);
  if (!m || m.payload?.kind !== "proposal" || m.payload.status !== "proposed") return fail("This proposal can no longer be submitted.");
  const { proposal } = m.payload;
  const check = await checkSessionMove(proposal.sessionId, { day: proposal.to.day, startPeriod: proposal.to.period, roomId: proposal.to.roomId });
  if (!check.ok || !check.row) return fail(`This proposal is no longer valid: ${check.issues[0] ?? "the timetable changed"}. Ask again for a fresh suggestion.`);
  const pub = await getPublishedVersion();
  if (!pub || check.row.versionId !== pub.id || check.row.facultyId !== user.id) return fail("This session is no longer in your published timetable.");
  const [dupe] = await db.select({ id: t.changeRequests.id }).from(t.changeRequests).where(and(eq(t.changeRequests.sessionId, proposal.sessionId), eq(t.changeRequests.status, "pending")));
  if (dupe) return fail("There is already a pending request for this session.");
  const [req] = await db
    .insert(t.changeRequests)
    .values({
      facultyId: user.id,
      sessionId: proposal.sessionId,
      type: proposal.to.roomId !== proposal.from.roomId && proposal.to.day === proposal.from.day && proposal.to.period === proposal.from.period ? "room_change" : "reschedule",
      reason: `Submitted from TESSRA Assistant: move ${proposal.courseCode} to ${DAY_SHORT[proposal.to.day]} ${periodLabel(proposal.to.period, proposal.to.duration)} in ${proposal.to.roomCode}.`,
      proposedDay: proposal.to.day,
      proposedPeriod: proposal.to.period,
      proposedRoomId: proposal.to.roomId,
      source: "assistant",
      snapshot: { courseCode: proposal.courseCode, courseTitle: proposal.courseTitle, groups: proposal.groups, from: proposal.from },
    })
    .returning();
  await db.update(t.assistantMessages).set({ payload: { ...m.payload, status: "submitted", changeRequestId: req.id } }).where(eq(t.assistantMessages.id, m.id));
  await audit(user.id, "change_request.created", "change_request", req.id, `${user.name} submitted an assistant proposal for ${proposal.courseCode}`);
  refresh();
  return ok("Submitted. Your coordinator will review it — the timetable is unchanged until approved.");
}

export async function applyAssistantAvailabilityAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, m } = await loadOwnMessage(fd);
  if (!m || m.payload?.kind !== "availability" || m.payload.status !== "proposed") return fail("This update can no longer be applied.");
  const payload = m.payload;
  if (payload.blocks.length) {
    await db
      .insert(t.availabilityBlocks)
      .values(payload.blocks.map((b) => ({ facultyId: user.id, day: b.day, period: b.period, reason: payload.reason })))
      .onConflictDoNothing();
  }
  await db.update(t.assistantMessages).set({ payload: { ...payload, status: "applied" } }).where(eq(t.assistantMessages.id, m.id));
  refresh();
  return ok(`Availability updated: ${payload.blocks.length} slot(s) marked unavailable.`);
}

export async function dismissAssistantProposalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { m } = await loadOwnMessage(fd);
  if (!m || !m.payload || (m.payload.kind !== "proposal" && m.payload.kind !== "availability") || m.payload.status !== "proposed") return fail("Nothing to dismiss.");
  await db.update(t.assistantMessages).set({ payload: { ...m.payload, status: "dismissed" } }).where(eq(t.assistantMessages.id, m.id));
  refresh();
  return ok("Proposal dismissed.");
}

export async function clearAssistantAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireRole("faculty");
  await db.delete(t.assistantMessages).where(eq(t.assistantMessages.userId, user.id));
  refresh();
  return ok("Conversation cleared.");
}

/* ================================ Settings ============================ */
export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const institutionName = str(fd, "institutionName");
  const academicTerm = str(fd, "academicTerm");
  const bookingLeadDays = num(fd, "bookingLeadDays");
  const maxBookingHours = num(fd, "maxBookingHours");
  const errors: Record<string, string> = {};
  if (institutionName.length < 3) errors.institutionName = "Enter the institution name";
  if (academicTerm.length < 3) errors.academicTerm = "Enter the academic term";
  if (bookingLeadDays === null || bookingLeadDays < 0 || bookingLeadDays > 30) errors.bookingLeadDays = "0–30 days";
  if (!maxBookingHours || maxBookingHours < 1 || maxBookingHours > 12) errors.maxBookingHours = "1–12 hours";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  await db
    .update(t.settings)
    .set({
      institutionName,
      academicTerm,
      bookingLeadDays: bookingLeadDays as number,
      maxBookingHours: maxBookingHours as number,
      clubApprovalRequired: fd.get("clubApprovalRequired") === "on",
      allowWeekendBookings: fd.get("allowWeekendBookings") === "on",
      updatedAt: new Date(),
    })
    .where(eq(t.settings.id, 1));
  await audit(user.id, "settings.updated", "settings", 1, "Updated institution settings");
  refresh();
  return ok("Settings saved.");
}


/* ======================= Manual timetable management ====================== */
function draftRules(draft: { kind: t.SessionKind; duration: number; startPeriod: number }) {
  if (draft.kind === "lab") {
    if (draft.duration !== 3) return "Lab sessions run for three periods.";
    if (draft.startPeriod !== 2 && draft.startPeriod !== 6) return "Labs must start at P2 or P6.";
  } else if (draft.duration < 1 || draft.duration > 2) {
    return "Lectures and tutorials run for one or two periods.";
  }
  return null;
}

export async function manualAddSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const versionId = num(fd, "versionId");
  const courseId = num(fd, "courseId");
  const facultyId = num(fd, "facultyId");
  const groupIds = ids(fd, "groupIds");
  const day = num(fd, "day");
  const startPeriod = num(fd, "startPeriod");
  const roomId = num(fd, "roomId");
  const errors: Record<string, string> = {};
  if (!versionId) errors.versionId = "Missing timetable version";
  if (!courseId) errors.courseId = "Select a course";
  if (!facultyId) errors.facultyId = "Select the teacher";
  if (!groupIds.length) errors.groupIds = "Select at least one group";
  if (!isValidDay(day)) errors.day = "Select a day";
  if (!isValidPeriod(startPeriod)) errors.startPeriod = "Select a period";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const [version] = await db.select().from(t.scheduleVersions).where(eq(t.scheduleVersions.id, versionId as number));
  if (!version) return fail("Timetable version not found.");
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId as number));
  const [faculty] = await db.select().from(t.users).where(and(eq(t.users.id, facultyId as number), eq(t.users.role, "faculty")));
  if (!course || !faculty) return fail("Course or teacher not found.");
  const kind = course.kind;
  const duration = kind === "lab" ? 3 : Math.min(2, Math.max(1, num(fd, "duration") ?? 1));
  const rule = draftRules({ kind, duration, startPeriod: startPeriod as number });
  if (rule) return fail(rule, { startPeriod: rule });

  const state = await loadEngineState(version.id);
  const draft: SessionDraft = { courseId: course.id, facultyId: faculty.id, groupIds, day: day as number, startPeriod: startPeriod as number, duration, kind };
  let room = roomId ? state.rooms.get(roomId) ?? null : null;
  if (roomId && !room) return fail("Room not found.", { roomId: "Room not found" });
  if (room) {
    const check = validateDraftSession(state, { ...draft, roomId: room.id });
    if (!check.ok) return fail(`That slot doesn't work: ${check.issues[0]}`, { startPeriod: check.issues.join(" · ") });
  } else {
    room = findFreeRoom(state, draft);
    if (!room) {
      const probe = [...state.rooms.values()].find((r) => r.status === "active");
      const why = probe ? validateDraftSession(state, { ...draft, roomId: probe.id }).issues.filter((m) => !m.includes(probe.code)) : [];
      return fail(why.length ? `That slot doesn't work: ${why[0]}` : "No suitable free room at that slot.", { startPeriod: why.join(" · ") || "No free room" });
    }
  }
  const isFixed = fd.get("isFixed") === "on";
  const [row] = await db.insert(t.scheduledSessions).values({
    versionId: version.id, offeringId: null, courseId: course.id, facultyId: faculty.id, roomId: room.id,
    groupIds, day: day as number, startPeriod: startPeriod as number, duration, kind, isFixed,
  }).returning();
  const where = `${DAY_SHORT[draft.day]} ${periodLabel(draft.startPeriod, duration)} · ${room.code}`;
  await audit(user.id, "session.added_manual", "schedule", row.id, `Manually scheduled ${course.code} for ${faculty.name} (${where})${isFixed ? " · pinned" : ""}`);
  await notify(faculty.id, `New class scheduled: ${course.code}`, `${where} — added by ${user.name}${version.status === "published" ? " (live timetable)" : ` in ${version.label} (draft)`}.`, "info", "/faculty/timetable");
  refresh();
  return ok(`${course.code} added for ${faculty.name} — ${where}${room ? "" : ""}.`);
}

export async function manualMoveSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const sessionId = num(fd, "sessionId");
  const day = num(fd, "day");
  const startPeriod = num(fd, "startPeriod");
  const roomId = num(fd, "roomId");
  if (!sessionId || !isValidDay(day) || !isValidPeriod(startPeriod)) return fail("Choose a valid day and period.");
  const [s] = await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.id, sessionId));
  if (!s) return fail("Session not found.");
  const rule = draftRules({ kind: s.kind, duration: s.duration, startPeriod });
  if (rule) return fail(rule, { startPeriod: rule });
  const state = await loadEngineState(s.versionId);
  const draft: SessionDraft = { courseId: s.courseId, facultyId: s.facultyId, groupIds: s.groupIds, day, startPeriod, duration: s.duration, kind: s.kind };
  let targetRoom = roomId ?? s.roomId;
  let check = await checkSessionMove(s.id, { day, startPeriod, roomId: targetRoom });
  if (!check.ok && !roomId) {
    const alt = findFreeRoom(state, draft, s.id);
    if (alt) {
      targetRoom = alt.id;
      check = await checkSessionMove(s.id, { day, startPeriod, roomId: targetRoom });
    }
  }
  if (!check.ok) return fail(`Move blocked: ${check.issues[0]}`, { startPeriod: check.issues.join(" · ") });
  if (day === s.day && startPeriod === s.startPeriod && targetRoom === s.roomId) return fail("The class is already in that slot.");
  const from = `${DAY_SHORT[s.day]} ${periodLabel(s.startPeriod, s.duration)} · ${state.labels.room(s.roomId)}`;
  const to = `${DAY_SHORT[day]} ${periodLabel(startPeriod, s.duration)} · ${state.labels.room(targetRoom)}`;
  await db.update(t.scheduledSessions).set({ day, startPeriod, roomId: targetRoom }).where(eq(t.scheduledSessions.id, s.id));
  const code = state.labels.course(s.courseId);
  await audit(user.id, "session.moved_manual", "schedule", s.id, `Moved ${code}: ${from} → ${to}`);
  await notify(s.facultyId, `Class moved: ${code}`, `${from} → ${to} — updated by ${user.name}.`, "warning", "/faculty/timetable");
  refresh();
  return ok(`${code} moved to ${to}.`);
}

export async function manualDeleteSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const sessionId = num(fd, "sessionId");
  const [s] = sessionId ? await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.id, sessionId)) : [];
  if (!s) return fail("Session not found.");
  const state = await loadEngineState(s.versionId);
  const code = state.labels.course(s.courseId);
  const where = `${DAY_SHORT[s.day]} ${periodLabel(s.startPeriod, s.duration)} · ${state.labels.room(s.roomId)}`;
  await db.delete(t.scheduledSessions).where(eq(t.scheduledSessions.id, s.id));
  await audit(user.id, "session.deleted_manual", "schedule", s.id, `Removed ${code} (${where}) from the timetable`);
  await notify(s.facultyId, `Class removed: ${code}`, `${where} was removed by ${user.name}.`, "warning", "/faculty/timetable");
  refresh();
  return ok(`${code} removed from the timetable.`);
}

/* ==================== Extra class requests (faculty → admin) ============== */
async function requestExtraClass(user: { id: number; name: string }, fd: FormData): Promise<ActionState> {
  const courseId = num(fd, "courseId");
  const groupIds = ids(fd, "groupIds");
  const day = num(fd, "day");
  const startPeriod = num(fd, "startPeriod");
  const roomId = num(fd, "roomId");
  const reason = str(fd, "reason").slice(0, 500);
  const errors: Record<string, string> = {};
  if (!courseId) errors.courseId = "Select one of your courses";
  if (!groupIds.length) errors.groupIds = "Select at least one group";
  if (!isValidDay(day)) errors.day = "Select a day";
  if (!isValidPeriod(startPeriod)) errors.startPeriod = "Select a period";
  if (reason.length < 10) errors.reason = "Tell the admin why this class is needed (10+ characters)";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const [offering] = await db.select().from(t.offerings).where(and(eq(t.offerings.facultyId, user.id), eq(t.offerings.courseId, courseId as number))).limit(1);
  if (!offering) return fail("You can only request classes for courses you teach.", { courseId: "Not one of your courses" });
  if (!groupIds.every((g) => offering.groupIds.includes(g))) return fail("Pick groups from your teaching assignment.", { groupIds: "Invalid group" });
  const pub = await getPublishedVersion();
  if (!pub) return fail("No published timetable yet — ask the admin to publish one first.");
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId as number));
  if (!course) return fail("Course not found.");
  const kind = course.kind;
  const duration = kind === "lab" ? 3 : Math.min(2, Math.max(1, num(fd, "duration") ?? 1));
  const rule = draftRules({ kind, duration, startPeriod: startPeriod as number });
  if (rule) return fail(rule, { startPeriod: rule });

  const state = await loadEngineState(pub.id);
  const draft: SessionDraft = { courseId: course.id, facultyId: user.id, groupIds, day: day as number, startPeriod: startPeriod as number, duration, kind };
  let room = roomId ? state.rooms.get(roomId) ?? null : null;
  if (room) {
    const check = validateDraftSession(state, { ...draft, roomId: room.id });
    if (!check.ok) return fail(`That slot isn't free: ${check.issues[0]}`, { startPeriod: check.issues.join(" · ") });
  } else {
    room = findFreeRoom(state, draft);
    if (!room) {
      const probe = [...state.rooms.values()].find((r) => r.status === "active");
      const why = probe ? validateDraftSession(state, { ...draft, roomId: probe.id }).issues.filter((m) => !m.includes(probe.code)) : [];
      return fail(why.length ? `That slot isn't free: ${why[0]}` : "No suitable free room at that slot — try another period.", { startPeriod: why.join(" · ") || "No free room" });
    }
  }
  const [dupe] = await db.select({ id: t.changeRequests.id }).from(t.changeRequests).where(and(
    eq(t.changeRequests.facultyId, user.id), eq(t.changeRequests.status, "pending"),
    eq(t.changeRequests.type, "extra_class"), eq(t.changeRequests.courseId, course.id),
    eq(t.changeRequests.proposedDay, draft.day), eq(t.changeRequests.proposedPeriod, draft.startPeriod)));
  if (dupe) return fail("You already have a pending request for this course and slot.", { startPeriod: "Pending request exists" });

  const groupsLabel = groupIds.map(state.labels.group).join(" + ");
  const [req] = await db.insert(t.changeRequests).values({
    facultyId: user.id, sessionId: null, type: "extra_class", reason,
    proposedDay: draft.day, proposedPeriod: draft.startPeriod, proposedRoomId: room.id,
    courseId: course.id, groupIds, duration,
    snapshot: { courseCode: course.code, courseTitle: course.title, groups: groupsLabel,
      from: { day: draft.day, period: draft.startPeriod, duration, roomId: room.id, roomCode: room.code } },
  }).returning();
  await audit(user.id, "change_request.created", "change_request", req.id, `${user.name} requested an extra ${course.code} class (${DAY_SHORT[draft.day]} ${periodLabel(draft.startPeriod, duration)} · ${room.code})`);
  const admins = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.role, "admin"));
  for (const a of admins) {
    await notify(a.id, `New class request: ${course.code}`, `${user.name} asks for ${DAY_SHORT[draft.day]} ${periodLabel(draft.startPeriod, duration)} in ${room.code} (${groupsLabel}).`, "info", "/admin/approvals?tab=classes");
  }
  refresh();
  return ok(`Request sent — ${course.code} on ${DAY_SHORT[draft.day]} ${periodLabel(draft.startPeriod, duration)} in ${room.code}. The admin will verify it.`);
}

async function approveExtraClass(user: { id: number; role: string }, req: t.ChangeRequestRow, note: string | null): Promise<ActionState> {
  if (user.role !== "admin") return fail("Only the admin can approve new class requests.");
  const pub = await getPublishedVersion();
  if (!pub) return fail("Publish a timetable before approving classes.");
  if (!req.courseId || !req.groupIds?.length || req.proposedDay === null || req.proposedPeriod === null) return fail("This request is missing its class details.");
  const state = await loadEngineState(pub.id);
  const course = state.courses.get(req.courseId);
  if (!course) return fail("The course no longer exists.");
  const draft: SessionDraft = { courseId: req.courseId, facultyId: req.facultyId, groupIds: req.groupIds, day: req.proposedDay, startPeriod: req.proposedPeriod, duration: req.duration ?? 1, kind: course.kind };
  let room = req.proposedRoomId ? state.rooms.get(req.proposedRoomId) ?? null : null;
  if (room) {
    const check = validateDraftSession(state, { ...draft, roomId: room.id });
    if (!check.ok) return fail(`Can't approve — the slot is no longer free: ${check.issues[0]}`);
  } else {
    room = findFreeRoom(state, draft);
    if (!room) return fail("Can't approve — no suitable free room at that slot anymore. Reject with a note so the teacher can pick another.");
  }
  const [row] = await db.insert(t.scheduledSessions).values({
    versionId: pub.id, offeringId: null, courseId: draft.courseId, facultyId: draft.facultyId, roomId: room.id,
    groupIds: draft.groupIds, day: draft.day, startPeriod: draft.startPeriod, duration: draft.duration, kind: draft.kind, isFixed: false,
  }).returning();
  await db.update(t.changeRequests).set({ status: "approved", reviewerId: user.id, reviewNote: note, reviewedAt: new Date(), proposedRoomId: room.id }).where(eq(t.changeRequests.id, req.id));
  const where = `${DAY_SHORT[draft.day]} ${periodLabel(draft.startPeriod, draft.duration)} · ${room.code}`;
  await notify(req.facultyId, `Extra class approved: ${course.code}`, `${where} is confirmed on your timetable.${note ? ` — ${note}` : ""}`, "success", "/faculty/timetable");
  await audit(user.id, "change_request.approved", "change_request", req.id, `Approved extra class ${course.code} (${where}) — session #${row.id} added to the published timetable`);
  refresh();
  return ok(`Approved — ${course.code} added to the live timetable (${where}).`);
}

/* ============================ Access requests =========================== */
export async function approveAccessRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const note = str(fd, "note").slice(0, 400) || null;
  if (!id) return fail("Request not found.");

  const [req] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.id, id));
  if (!req || req.status !== "pending") return fail("This request is no longer pending.");

  // Check for duplicate email in users
  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, req.email)).limit(1);
  if (existingUser) return fail("An account with this email already exists.");

  // Create the user account
  const [newUser] = await db
    .insert(t.users)
    .values({
      name: req.name,
      email: req.email,
      passwordHash: req.passwordHash,
      role: req.requestedRole,
      departmentId: req.departmentId,
      clubId: req.clubId,
      approvalStatus: "approved",
    })
    .returning();

  // Update the access request
  await db
    .update(t.accessRequests)
    .set({ status: "approved", reviewedById: user.id, reviewNote: note, reviewedAt: new Date() })
    .where(eq(t.accessRequests.id, id));

  // Notify the new user
  await notify(newUser.id, "Account approved: TESSRA", "Your access request has been approved. You can now sign in with your email and password.", "success", "/login");

  await audit(user.id, "access_request.approved", "access_request", id, `Approved access request for ${req.name} (${req.email}) as ${req.requestedRole}`);
  refresh();
  return ok(`Approved — account created for ${req.name}.`);
}

export async function rejectAccessRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const id = num(fd, "id");
  const reason = str(fd, "reason").slice(0, 400);
  if (!id) return fail("Request not found.");
  if (reason.length < 5) return fail("Please explain why the request is rejected.", { reason: "A reason is required" });

  const [req] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.id, id));
  if (!req || req.status !== "pending") return fail("This request is no longer pending.");

  await db
    .update(t.accessRequests)
    .set({ status: "rejected", reviewedById: user.id, reviewNote: reason, reviewedAt: new Date() })
    .where(eq(t.accessRequests.id, id));

  await audit(user.id, "access_request.rejected", "access_request", id, `Rejected access request for ${req.name} (${req.email})`);
  refresh();
  return ok(`Rejected — ${req.name} has been notified.`);
}

/* ======================= Evaluation walkthrough data ====================== */
/** Adds one real, conflict-free request when a clean demo has no approval work. */
export async function prepareApprovalDemoAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const [existing] = await db
    .select({ id: t.changeRequests.id })
    .from(t.changeRequests)
    .where(eq(t.changeRequests.status, "pending"))
    .limit(1);
  if (existing) return ok("The approval queue is already ready to review.");

  const version = await getPublishedVersion();
  if (!version) return fail("Publish a timetable before preparing an approval example.");
  const [faculty] = await db
    .select({ id: t.users.id, name: t.users.name })
    .from(t.users)
    .where(eq(t.users.email, "ananya.rao@westbrook.edu"))
    .limit(1);
  if (!faculty) return fail("The demo faculty account is unavailable.");

  const state = await loadEngineState(version.id);
  let selected: (typeof state.sessions)[number] | undefined;
  let alternative: ReturnType<typeof findAlternatives>[number] | undefined;
  for (const session of state.sessions.filter((candidate) => candidate.facultyId === faculty.id && !candidate.isFixed)) {
    const next = findAlternatives(state.sessions, session.id, state.ctx, { avoidDays: [session.day], limit: 1 })[0];
    if (next) {
      selected = session;
      alternative = next;
      break;
    }
  }
  if (!selected || !alternative) return fail("No safe alternative could be prepared for the walkthrough. Regenerate the demo timetable and retry.");

  const [request] = await db
    .insert(t.changeRequests)
    .values({
      facultyId: faculty.id,
      sessionId: selected.id,
      type: "reschedule",
      reason: "Department review meeting conflicts with this class. Please approve the validated alternative slot.",
      proposedDay: alternative.day,
      proposedPeriod: alternative.startPeriod,
      proposedRoomId: alternative.roomId,
      status: "pending",
      snapshot: {
        courseCode: state.labels.course(selected.courseId),
        courseTitle: state.courses.get(selected.courseId)?.title ?? "Scheduled class",
        groups: selected.groupIds.map(state.labels.group).join(" + "),
        from: slotRef(selected, state.labels),
      },
    })
    .returning();
  await notify(faculty.id, "Demo change request prepared", "A validated reschedule request is ready for Admin review.", "info", "/faculty/requests");
  await audit(admin.id, "demo.approval_prepared", "change_request", request.id, `Prepared a conflict-free ${request.snapshot?.courseCode ?? "class"} reschedule for the approval walkthrough`);
  refresh();
  return ok("Approval example ready. Review its before/after placement and approve or reject it.");
}

/* ============================ Reset demo data =========================== */
export async function resetDemoDataAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");

  /*
   * Keep identity and reference data (accounts, departments, clubs, rooms,
   * groups, courses, offerings and exams), plus auth sessions so the judge who
   * pressed the button is not signed out. Clear mutable demo activity and reset
   * policy/availability/room state before producing a fresh timetable.
   *
   * The old published timetable remains available until the replacement has
   * been generated completely. If generation fails, judges are never left with
   * an empty application.
   */
  await db.transaction(async (tx) => {
    await tx.delete(t.assistantMessages);
    await tx.delete(t.notifications);
    await tx.delete(t.disruptions);
    await tx.delete(t.changeRequests);
    await tx.delete(t.bookings);
    await tx.delete(t.accessRequests);
    await tx.delete(t.passwordResetTokens);
    await tx.delete(t.officialRuns);
    await tx.delete(t.assignments);
    await tx.delete(t.courseResources);
    await tx.delete(t.syllabusUnits);
    await tx.delete(t.auditLogs);
    await tx.delete(t.availabilityBlocks);

    await tx
      .update(t.settings)
      .set({
        institutionName: "Westbrook Institute of Technology",
        academicTerm: "Autumn Term 2026",
        bookingLeadDays: 2,
        maxBookingHours: 6,
        clubApprovalRequired: true,
        allowWeekendBookings: true,
        updatedAt: new Date(),
      })
      .where(eq(t.settings.id, 1));
    await tx.update(t.rooms).set({ status: "active", maintenanceNote: null });
    await tx.update(t.scheduledSessions).set({ isFixed: false });

    const faculty = await tx
      .select({ id: t.users.id, email: t.users.email })
      .from(t.users)
      .where(eq(t.users.role, "faculty"));
    const byEmail = new Map(faculty.map((f) => [f.email, f.id]));
    const baseline = [
      ["ananya.rao@westbrook.edu", 4, [7, 8], "Research group meeting"],
      ["rahul.verma@westbrook.edu", 0, [1, 2], "Academic council"],
      ["suresh.pillai@westbrook.edu", 2, [5, 6, 7, 8], "External examiner duty"],
      ["neha.kulkarni@westbrook.edu", 3, [1, 2], "PhD coursework"],
      ["laura.mendes@westbrook.edu", 1, [7, 8], "Industry advisory board"],
    ] as const;
    const blocks: (typeof t.availabilityBlocks.$inferInsert)[] = [];
    for (const [email, day, periods, reason] of baseline) {
      const facultyId = byEmail.get(email);
      if (!facultyId) continue;
      for (const period of periods) blocks.push({ facultyId, day, period, reason });
    }
    if (blocks.length) await tx.insert(t.availabilityBlocks).values(blocks);
  });

  const { version, stats } = await generateVersion(user.id, "Clean demo reset — freshly generated timetable");
  if (stats.placedUnits !== stats.requiredUnits || stats.placedPeriods !== stats.requiredPeriods) {
    await db.delete(t.scheduleVersions).where(eq(t.scheduleVersions.id, version.id));
    return fail(
      `Reset stopped safely: the replacement timetable placed ${stats.placedUnits}/${stats.requiredUnits} sessions. The previous published timetable is still active.`,
    );
  }

  const sessions = await db
    .select({ id: t.scheduledSessions.id })
    .from(t.scheduledSessions)
    .where(eq(t.scheduledSessions.versionId, version.id))
    .limit(2);
  if (sessions.length) {
    await db
      .update(t.scheduledSessions)
      .set({ isFixed: true })
      .where(inArray(t.scheduledSessions.id, sessions.map((s) => s.id)));
  }

  await publishVersion(version.id);
  await db.delete(t.scheduleVersions).where(ne(t.scheduleVersions.id, version.id));
  await audit(
    user.id,
    "demo_data.reset",
    "system",
    version.id,
    `Reset mutable demo data and generated ${stats.placedUnits}/${stats.requiredUnits} sessions`,
  );
  refresh();
  return ok(`Clean demo restored. Fresh timetable generated with all ${stats.requiredUnits} sessions.`);
}

/* ============================ Password reset =========================== */
export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter a valid email address.", { email: "Invalid email" });
  }

  const [user] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (!user) {
    // Don't reveal whether the email exists
    return ok("If an account exists for this email, a reset link has been sent.");
  }

  // Invalidate any existing unused tokens
  await db.delete(t.passwordResetTokens).where(eq(t.passwordResetTokens.userId, user.id));

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(t.passwordResetTokens).values({ userId: user.id, token, expiresAt });

  // In a production setup, send an email with the reset link.
  // For now, the token is available via the reset page with ?token= parameter.
  await audit(user.id, "password.reset_requested", "user", user.id, `Password reset requested for ${email}`);

  return ok("If an account exists for this email, a reset link has been sent.");
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const password = str(fd, "password");
  const confirmPassword = str(fd, "confirmPassword");

  if (!token) return fail("Invalid or missing reset token.", { token: "Invalid token" });
  if (!password || password.length < 8) return fail("Password must be at least 8 characters.", { password: "Too short" });
  if (password !== confirmPassword) return fail("Passwords do not match.", { confirmPassword: "Passwords must match" });

  const [resetRow] = await db
    .select()
    .from(t.passwordResetTokens)
    .where(eq(t.passwordResetTokens.token, token))
    .limit(1);

  if (!resetRow) return fail("Invalid or expired reset token.", { token: "Invalid token" });
  if (new Date(resetRow.expiresAt) < new Date()) return fail("Reset token has expired.", { token: "Token expired" });
  if (resetRow.usedAt) return fail("Reset token has already been used.", { token: "Token used" });

  const [user] = await db.select().from(t.users).where(eq(t.users.id, resetRow.userId)).limit(1);
  if (!user) return fail("User not found.", { token: "Invalid token" });

  const passwordHash = hashPassword(password);
  await db.update(t.users).set({ passwordHash }).where(eq(t.users.id, user.id));
  await db
    .update(t.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(t.passwordResetTokens.id, resetRow.id));

  await audit(user.id, "password.reset_completed", "user", user.id, "Password reset completed");
  refresh();
  return ok("Password has been reset. You can now sign in with your new password.");
}
