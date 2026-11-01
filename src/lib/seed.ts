/**
 * CIT bootstrap and operational seed.
 *
 * Every academic/resource record below is derived from the committed
 * CrunchWeek starter pack and the validator-clean TESSRA schedule export.
 * Authentication addresses and calendar dates are deterministic operational
 * adapters for fields the source format does not contain; the original source
 * IDs, abstract weekdays, request windows and exam sessions are retained.
 */
import { eq } from "drizzle-orm";
import { db, getSupabaseAdmin, pool } from "@/db";
import { BOOTSTRAP_STATEMENTS } from "@/db/bootstrap-sql";
import * as t from "@/db/schema";
import citJson from "../../official/starterpack/CrunchWeek_StarterPack/data/cit_public.json";
import scheduleJson from "../../exports/schedule.json";
import reportJson from "../../exports/report.json";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./constants";
import { ensureSinglePublishedVersion } from "./engine";
import { effectiveCategory, type OfficialDataset, type OfficialSchedule, type ValidatorReport } from "./official";
import { hashPassword } from "./password";

const data = citJson as unknown as OfficialDataset;
const officialSchedule = scheduleJson as unknown as OfficialSchedule;
const officialReport = reportJson as unknown as ValidatorReport;

let seeding: Promise<void> | null = null;

export function ensureSeeded() {
  if (!seeding) {
    seeding = run().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}

async function run() {
  const client = await pool.connect();
  const transaction = async (work: () => Promise<void>) => {
    await client.query("begin");
    try {
      await work();
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  };

  try {
    const ready = await client.query("select to_regclass('public.users') as t");
    if (ready.rows[0]?.t) {
      const { rows } = await client.query("select count(*)::int as n from users");
      if ((rows[0]?.n ?? 0) > 0) {
        await ensureSinglePublishedVersion();
        return;
      }
    }

    // Transaction-scoped locks are safe with Supabase's transaction pooler.
    await transaction(async () => {
      await client.query("select pg_advisory_xact_lock(87414)");
      const exists = await client.query("select to_regclass('public.users') as t");
      if (!exists.rows[0]?.t) {
        for (const statement of BOOTSTRAP_STATEMENTS) await client.query(statement);
      }
    });

    await transaction(async () => {
      await client.query("select pg_advisory_xact_lock(87414)");
      const { rows } = await client.query("select count(*)::int as n from users");
      if ((rows[0]?.n ?? 0) === 0) await seedCit();
      await ensureSinglePublishedVersion();
    });
  } finally {
    client.release();
  }
}

const DAY_INDEX = new Map(["MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day, index) => [day, index]));

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizedRoomType(sourceType: string): t.RoomType {
  if (["lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop"].includes(sourceType)) return "lab";
  if (sourceType === "seminar_hall") return "seminar";
  if (sourceType === "auditorium") return "auditorium";
  if (sourceType === "outdoor") return "outdoor";
  return "lecture";
}

/** ISO Week 7 is the deterministic date adapter for the source label “Week 7”. */
const FEST_WEEK_MONDAY = "2027-02-15";
/** The source gives abstract exam weekdays only; expose them operationally in the following week. */
const EXAM_WEEK_MONDAY = "2027-02-22";

export async function seedCit() {
  const passwordHash = hashPassword(DEMO_PASSWORD);

  const seededUsers = await db.transaction(async (tx) => {
    await tx.insert(t.settings).values({
      id: 1,
      institutionName: data.institute,
      academicTerm: data.calendar.fest_week ?? "Spectra '27 scheduling cycle",
      bookingLeadDays: 0,
      maxBookingHours: Math.max(...data.booking_requests.map((request) => request.duration_periods)),
      clubApprovalRequired: true,
      allowWeekendBookings: false,
    });

    const departmentCodes = [...new Set([
      ...data.faculty.map((item) => item.department),
      ...data.student_groups.map((item) => item.department),
      ...data.courses.map((item) => item.department),
      ...data.booking_requests.map((item) => item.department).filter((value): value is string => Boolean(value)),
    ])].sort();
    const departmentRows = await tx
      .insert(t.departments)
      .values(departmentCodes.map((code) => ({ code, name: code })))
      .returning();
    const departmentId = new Map(departmentRows.map((row) => [row.code, row.id]));

    const clubNames = [...new Set(data.booking_requests.filter((request) => request.role === "club").map((request) => request.requester))];
    const clubRows = clubNames.length
      ? await tx.insert(t.clubs).values(clubNames.map((name) => ({ name, category: "club", advisor: null }))).returning()
      : [];
    const clubId = new Map(clubRows.map((row) => [row.name, row.id]));

    type NewUser = typeof t.users.$inferInsert;
    const userValues: NewUser[] = data.faculty.map((faculty) => ({
      sourceId: faculty.id,
      name: faculty.name,
      email: `${faculty.id.toLowerCase()}@cit.ac.in`,
      passwordHash,
      role: "faculty",
      title: `Faculty · ${faculty.department}`,
      departmentId: departmentId.get(faculty.department),
      maxWeeklyPeriods: faculty.max_hours_per_day * data.calendar.days.length,
      maxHoursPerDay: faculty.max_hours_per_day,
      needsAccessible: faculty.needs_accessible,
    }));

    const requesterUsers = new Map<string, NewUser>();
    for (const request of data.booking_requests) {
      if (request.requester.includes("(F12)")) continue;
      if (request.role === "faculty" && request.requester !== "Office of the Dean of Academics") continue;
      if (requesterUsers.has(request.requester)) continue;
      const role: t.Role = request.role === "department_coordinator" || request.requester === "Office of the Dean of Academics" ? "coordinator" : request.role === "club" ? "club" : request.role === "faculty" ? "faculty" : "admin";
      requesterUsers.set(request.requester, {
        sourceId: `REQUESTER:${request.requester}`,
        name: request.requester,
        email: `${slug(request.requester)}@cit.ac.in`,
        passwordHash,
        role,
        title: role === "coordinator" ? "Department Coordinator" : role === "club" ? "Club Representative" : role === "admin" ? "Institute Event Team" : "Dean's Office",
        departmentId: request.department ? departmentId.get(request.department) : role === "faculty" ? departmentId.get("ADMIN") : null,
        clubId: role === "club" ? clubId.get(request.requester) : null,
        maxWeeklyPeriods: 20,
        maxHoursPerDay: 4,
        needsAccessible: false,
      });
    }

    const userRows = await tx.insert(t.users).values([...userValues, ...requesterUsers.values()]).returning();
    const userBySource = new Map(userRows.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const userByName = new Map(userRows.map((row) => [row.name, row]));
    const admin = userByName.get("Spectra Core Team");
    if (!admin) throw new Error("CIT seed is missing the Spectra Core Team administrator");

    const roomRows = await tx
      .insert(t.rooms)
      .values(data.rooms.map((room) => ({
        sourceId: room.id,
        code: room.id,
        name: room.name,
        building: room.building,
        type: normalizedRoomType(room.type),
        sourceType: room.type,
        capacity: room.capacity,
        features: room.features,
        allowedUses: room.allowed_uses,
        accessible: room.accessible,
        status: "active" as const,
        bookable: room.allowed_uses.includes("event"),
      })))
      .returning();
    const roomBySource = new Map(roomRows.map((row) => [row.sourceId as string, row]));

    const groupRows = await tx
      .insert(t.studentGroups)
      .values(data.student_groups.map((group) => ({
        sourceId: group.id,
        code: group.id,
        name: group.name,
        departmentId: departmentId.get(group.department) as number,
        year: group.year,
        size: group.size,
        needsAccessible: group.needs_accessible,
      })))
      .returning();
    const groupBySource = new Map(groupRows.map((row) => [row.sourceId as string, row]));

    const courseRows = await tx
      .insert(t.courses)
      .values(data.courses.map((course) => ({
        sourceId: course.id,
        code: course.id,
        title: course.title ?? course.name ?? course.id,
        departmentId: departmentId.get(course.department) as number,
        credits: Math.max(1, course.lecture_hours + course.tutorial_hours + course.lab_blocks),
        kind: course.lab_blocks > 0 && course.lecture_hours === 0 && course.tutorial_hours === 0 ? "lab" as const : course.lecture_hours === 0 && course.tutorial_hours > 0 ? "tutorial" as const : "lecture" as const,
        year: course.year,
        lectureHours: course.lecture_hours,
        tutorialHours: course.tutorial_hours,
        labBlocks: course.lab_blocks,
      })))
      .returning();
    const courseBySource = new Map(courseRows.map((row) => [row.sourceId as string, row]));

    const offeringRows = await tx
      .insert(t.offerings)
      .values(data.sessions.map((session) => {
        const eligibleRooms = data.rooms
          .filter((room) => session.room_types.includes(room.type) && room.capacity >= session.size && (!session.needs_accessible || room.accessible))
          .map((room) => roomBySource.get(room.id)?.id)
          .filter((id): id is number => Boolean(id));
        const preferredType = normalizedRoomType(session.room_types[0] ?? (session.kind === "lab" ? "lab_cs" : "classroom"));
        return {
          sourceId: session.id,
          courseId: courseBySource.get(session.course_id)?.id as number,
          facultyId: userBySource.get(session.faculty_id)?.id as number,
          groupIds: session.groups.map((id) => groupBySource.get(id)?.id as number),
          expectedSize: session.size,
          sessionsPerWeek: 1,
          duration: session.duration,
          kind: session.kind,
          roomType: preferredType,
          allowedRoomIds: eligibleRooms,
          basketSlot: session.basket_slot,
          needsAccessible: session.needs_accessible,
        };
      }))
      .returning();
    const offeringBySource = new Map(offeringRows.map((row) => [row.sourceId as string, row]));

    const availabilityValues: (typeof t.availabilityBlocks.$inferInsert)[] = [];
    const preferenceValues: (typeof t.facultyPreferences.$inferInsert)[] = [];
    for (const faculty of data.faculty) {
      const facultyId = userBySource.get(faculty.id)?.id;
      if (!facultyId) continue;
      for (const unavailable of faculty.unavailable) {
        const day = DAY_INDEX.get(unavailable.day);
        if (day === undefined) continue;
        for (const period of unavailable.periods) availabilityValues.push({ facultyId, day, period, reason: unavailable.reason ?? null });
      }
      for (const preference of faculty.preferences as { type: string; days: string[]; periods: number[]; note?: string }[]) {
        for (const dayCode of preference.days) {
          const day = DAY_INDEX.get(dayCode);
          if (day === undefined || day > 4) continue;
          for (const period of preference.periods) preferenceValues.push({ facultyId, type: preference.type, day, period, note: preference.note ?? null });
        }
      }
    }
    if (availabilityValues.length) await tx.insert(t.availabilityBlocks).values(availabilityValues);
    if (preferenceValues.length) await tx.insert(t.facultyPreferences).values(preferenceValues);

    const roomBlockValues: (typeof t.roomAvailabilityBlocks.$inferInsert)[] = [];
    for (const block of data.room_unavailability) {
      const roomId = roomBySource.get(block.room_id)?.id;
      const day = DAY_INDEX.get(block.day);
      if (!roomId || day === undefined) continue;
      for (const period of block.periods) roomBlockValues.push({ roomId, day, period, reason: block.reason ?? null });
    }
    if (roomBlockValues.length) await tx.insert(t.roomAvailabilityBlocks).values(roomBlockValues);

    const [version] = await tx
      .insert(t.scheduleVersions)
      .values({
        label: "CIT official baseline",
        status: "published",
        notes: `${data.dataset_id} · validator-clean TESSRA baseline`,
        stats: {
          requiredUnits: data.sessions.length,
          placedUnits: officialSchedule.sessions.length,
          requiredPeriods: data.sessions.reduce((sum, session) => sum + session.duration, 0),
          placedPeriods: officialSchedule.sessions.reduce((sum, placement) => sum + (data.sessions.find((session) => session.id === placement.session_id)?.duration ?? 0), 0),
          fixedUnits: data.sessions.filter((session) => Boolean(session.fixed_slot)).length,
          unplaced: [],
          durationMs: Math.round((officialSchedule.solver?.wall_time ?? 0) * 1000),
        },
        createdById: admin.id,
        publishedAt: new Date(),
      })
      .returning();

    const sessionBySource = new Map(data.sessions.map((session) => [session.id, session]));
    await tx.insert(t.scheduledSessions).values(officialSchedule.sessions.map((placement) => {
      const source = sessionBySource.get(placement.session_id);
      const offering = offeringBySource.get(placement.session_id);
      const day = DAY_INDEX.get(placement.day);
      const room = roomBySource.get(placement.room_id);
      if (!source || !offering || day === undefined || !room) throw new Error(`Incomplete CIT placement ${placement.session_id}`);
      return {
        versionId: version.id,
        offeringId: offering.id,
        courseId: offering.courseId,
        facultyId: offering.facultyId,
        roomId: room.id,
        groupIds: offering.groupIds,
        expectedSize: source.size,
        day,
        startPeriod: placement.start_period,
        duration: source.duration,
        kind: source.kind,
        sourceId: source.id,
        basketSlot: source.basket_slot,
        isFixed: Boolean(source.fixed_slot),
      };
    }));

    const scheduleBookings = new Map((officialSchedule.fest_week?.bookings ?? []).map((booking) => [booking.request_id, booking]));
    const cancellationByRequest = new Map(data.cancellations.map((cancellation) => [cancellation.request_id, cancellation]));
    const periodById = new Map(data.calendar.periods.map((period) => [period.id, period]));
    const dateForDay = (dayCode: string) => addDays(FEST_WEEK_MONDAY, DAY_INDEX.get(dayCode) ?? 0);
    const endForPeriod = (period: number) => periodById.get(period)?.end ?? `${String(8 + period).padStart(2, "0")}:00`;
    const requesterFor = (requester: string) => requester.includes("(F12)")
      ? userBySource.get("F12")
      : userBySource.get(`REQUESTER:${requester}`) ?? userByName.get(requester);
    const priorityFor = (category: string): t.Priority => category === "institute_event" ? "critical" : category === "guest_lecture" ? "high" : category === "department_event" ? "normal" : "low";

    const bookingValues: (typeof t.bookings.$inferInsert)[] = data.booking_requests.map((request) => {
      const outcome = scheduleBookings.get(request.id);
      const cancellation = cancellationByRequest.get(request.id);
      const placementWindow = outcome?.day && outcome.start_period && outcome.end_period
        ? { day: outcome.day, from_period: outcome.start_period, to_period: outcome.end_period }
        : request.windows[0];
      const requestedRoom = request.requested_room ? roomBySource.get(request.requested_room) : undefined;
      const placedRoom = outcome?.room_id ? roomBySource.get(outcome.room_id) : undefined;
      const fallbackRoom = data.rooms
        .filter((room) => request.room_types.includes(room.type))
        .sort((a, b) => b.capacity - a.capacity)
        .map((room) => roomBySource.get(room.id))
        .find(Boolean);
      const operationalRoom = placedRoom ?? requestedRoom ?? fallbackRoom ?? roomRows[0];
      const requester = requesterFor(request.requester);
      if (!requester || !operationalRoom || !placementWindow) throw new Error(`Incomplete CIT booking ${request.id}`);
      const status: t.RequestStatus = cancellation ? "cancelled" : outcome?.status === "approved" ? "approved" : outcome?.status === "rejected" ? "rejected" : "pending";
      return {
        sourceId: request.id,
        requesterId: requester.id,
        clubId: requester.clubId,
        departmentId: request.department ? departmentId.get(request.department) : null,
        title: request.title,
        description: request.raw_text,
        sourceRequester: request.requester,
        sourceRequesterRole: request.role,
        category: request.requested_category,
        roomId: operationalRoom.id,
        date: dateForDay(placementWindow.day),
        startTime: periodById.get(placementWindow.from_period)?.start ?? "08:00",
        endTime: endForPeriod(placementWindow.to_period),
        attendees: request.attendance,
        priority: priorityFor(effectiveCategory(data, request)),
        status,
        needs: request.needs,
        requestWindows: request.windows,
        requestedRoomId: requestedRoom?.id ?? null,
        requestedRoomTypes: request.room_types,
        mandatoryGroupIds: request.mandatory_for_groups.map((id) => groupBySource.get(id)?.id).filter((id): id is number => Boolean(id)),
        durationPeriods: request.duration_periods,
        seriesId: request.series_id,
        rawText: request.raw_text,
        officialReason: outcome?.reason ?? null,
        rejectionReason: status === "rejected" || status === "cancelled" ? [outcome?.reason, cancellation?.note].filter(Boolean).join(" ") : null,
        suggestedRoomId: outcome?.status === "alternative_offered" ? placedRoom?.id ?? null : null,
        reviewerId: status === "pending" ? null : admin.id,
        reviewedAt: status === "pending" ? null : new Date(request.submitted_at),
        createdAt: new Date(request.submitted_at),
      };
    });
    await tx.insert(t.bookings).values(bookingValues);

    const examSourceById = new Map(data.exams.map((exam) => [exam.id, exam]));
    const examSessionById = new Map(data.calendar.exam_week.sessions.map((session) => [session.id, session]));
    const examValues: (typeof t.exams.$inferInsert)[] = (officialSchedule.exams ?? []).map((placement) => {
      const source = examSourceById.get(placement.exam_id);
      const session = examSessionById.get(placement.session);
      const courseIds = source?.course_ids.map((id) => courseBySource.get(id)?.id).filter((id): id is number => Boolean(id)) ?? [];
      const roomIds = placement.rooms.map((id) => roomBySource.get(id)?.id).filter((id): id is number => Boolean(id));
      const day = DAY_INDEX.get(placement.day);
      if (!source || !session || !courseIds.length || !roomIds.length || day === undefined) throw new Error(`Incomplete CIT exam ${placement.exam_id}`);
      return {
        sourceId: source.id,
        courseId: courseIds[0],
        courseIds,
        groupIds: source.groups.map((id) => groupBySource.get(id)?.id as number),
        sourceDay: placement.day,
        sourceSession: placement.session,
        date: addDays(EXAM_WEEK_MONDAY, day),
        startTime: session.start ?? "09:30",
        endTime: session.end ?? "11:30",
        roomId: roomIds[0],
        roomIds,
        invigilatorId: null,
        candidates: source.size,
      };
    });
    if (examValues.length) await tx.insert(t.exams).values(examValues);

    await tx.insert(t.officialRuns).values({
      kind: "schedule",
      label: "CIT validator-clean baseline",
      datasetId: data.dataset_id,
      createdById: admin.id,
      schedule: officialSchedule,
      report: officialReport,
    });

    await tx.insert(t.auditLogs).values([
      {
        actorId: admin.id,
        action: "cit.dataset_imported",
        entityType: "dataset",
        entityId: null,
        summary: `Imported ${data.dataset_id}: ${data.rooms.length} rooms, ${data.faculty.length} faculty, ${data.student_groups.length} groups and ${data.courses.length} courses`,
      },
      {
        actorId: admin.id,
        action: "schedule.published",
        entityType: "schedule_version",
        entityId: version.id,
        summary: `Published validator-clean CIT baseline with ${officialSchedule.sessions.length} placements`,
      },
    ]);

    const demoUsers = userRows.filter((user) => DEMO_ACCOUNTS.some((account) => account.email === user.email));
    if (demoUsers.length) {
      await tx.insert(t.notifications).values(demoUsers.map((user) => ({
        userId: user.id,
        title: "CIT workspace ready",
        body: `${data.dataset_id} is loaded as the directly editable operational dataset.`,
        tone: "success" as const,
        href: user.role === "admin" ? "/admin" : user.role === "coordinator" ? "/coordinator" : user.role === "faculty" ? "/faculty" : "/club",
      })));
    }

    return userRows;
  });

  // Link only the four published demo identities; all faculty/resource profiles
  // remain available operationally without creating dozens of hosted auth users.
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;
  for (const account of DEMO_ACCOUNTS) {
    const profile = seededUsers.find((user) => user.email === account.email);
    if (!profile) continue;
    try {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: profile.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { role: profile.role, name: profile.name },
      });
      let uid = created.user?.id ?? null;
      if (!uid && error) {
        const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        uid = existing.users.find((user) => user.email?.toLowerCase() === profile.email.toLowerCase())?.id ?? null;
      }
      if (uid) await db.update(t.users).set({ supabaseUid: uid }).where(eq(t.users.id, profile.id));
      else if (error) console.warn(`Supabase auth user for ${profile.email}: ${error.message}`);
    } catch (error) {
      console.warn(`Supabase auth user for ${profile.email} could not be created:`, error);
    }
  }
}


/** Restore the mutable workspace to the committed CIT baseline without touching identities. */
export async function restoreCitOperationalData(actorId: number) {
  return db.transaction(async (tx) => {
    // Preserve accounts, auth sessions and editable reference catalogues; reset
    // workflows, constraints and published operational outputs to the source pack.
    await tx.delete(t.assistantMessages);
    await tx.delete(t.notifications);
    await tx.delete(t.disruptions);
    await tx.delete(t.changeRequests);
    await tx.delete(t.bookings);
    await tx.delete(t.exams);
    await tx.delete(t.officialRuns);
    await tx.delete(t.assignments);
    await tx.delete(t.courseResources);
    await tx.delete(t.syllabusUnits);
    await tx.delete(t.accessRequests);
    await tx.delete(t.passwordResetTokens);
    await tx.delete(t.auditLogs);
    await tx.delete(t.availabilityBlocks);
    await tx.delete(t.facultyPreferences);
    await tx.delete(t.roomAvailabilityBlocks);
    await tx.delete(t.scheduledSessions);
    await tx.delete(t.scheduleVersions);

    await tx.update(t.settings).set({
      institutionName: data.institute,
      academicTerm: data.calendar.fest_week ?? "Spectra '27 scheduling cycle",
      bookingLeadDays: 0,
      maxBookingHours: Math.max(...data.booking_requests.map((request) => request.duration_periods)),
      clubApprovalRequired: true,
      allowWeekendBookings: false,
      updatedAt: new Date(),
    }).where(eq(t.settings.id, 1));
    await tx.update(t.rooms).set({ status: "active", maintenanceNote: null });

    const [users, rooms, groups, courses, offerings, departments] = await Promise.all([
      tx.select().from(t.users),
      tx.select().from(t.rooms),
      tx.select().from(t.studentGroups),
      tx.select().from(t.courses),
      tx.select().from(t.offerings),
      tx.select().from(t.departments),
    ]);
    const userBySource = new Map(users.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const userByName = new Map(users.map((row) => [row.name, row]));
    const roomBySource = new Map(rooms.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const groupBySource = new Map(groups.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const courseBySource = new Map(courses.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const offeringBySource = new Map(offerings.filter((row) => row.sourceId).map((row) => [row.sourceId as string, row]));
    const missingOfferingValues: (typeof t.offerings.$inferInsert)[] = [];
    for (const session of data.sessions) {
      if (offeringBySource.has(session.id)) continue;
      const eligibleRooms = data.rooms
        .filter((room) => session.room_types.includes(room.type) && room.capacity >= session.size && (!session.needs_accessible || room.accessible))
        .map((room) => roomBySource.get(room.id)?.id)
        .filter((id): id is number => Boolean(id));
      missingOfferingValues.push({
        sourceId: session.id,
        courseId: courseBySource.get(session.course_id)?.id as number,
        facultyId: userBySource.get(session.faculty_id)?.id as number,
        groupIds: session.groups.map((id) => groupBySource.get(id)?.id as number),
        expectedSize: session.size,
        sessionsPerWeek: 1,
        duration: session.duration,
        kind: session.kind,
        roomType: normalizedRoomType(session.room_types[0] ?? (session.kind === "lab" ? "lab_cs" : "classroom")),
        allowedRoomIds: eligibleRooms,
        basketSlot: session.basket_slot,
        needsAccessible: session.needs_accessible,
      });
    }
    if (missingOfferingValues.length) {
      const restoredOfferings = await tx.insert(t.offerings).values(missingOfferingValues).returning();
      for (const offering of restoredOfferings) if (offering.sourceId) offeringBySource.set(offering.sourceId, offering);
    }
    const departmentId = new Map(departments.map((row) => [row.code, row.id]));
    const admin = users.find((row) => row.id === actorId) ?? userByName.get("Spectra Core Team");
    if (!admin) throw new Error("CIT administrator is unavailable");

    const availabilityValues: (typeof t.availabilityBlocks.$inferInsert)[] = [];
    const preferenceValues: (typeof t.facultyPreferences.$inferInsert)[] = [];
    for (const faculty of data.faculty) {
      const facultyId = userBySource.get(faculty.id)?.id;
      if (!facultyId) throw new Error(`Missing source faculty ${faculty.id}`);
      for (const unavailable of faculty.unavailable) {
        const day = DAY_INDEX.get(unavailable.day);
        if (day === undefined) continue;
        for (const period of unavailable.periods) availabilityValues.push({ facultyId, day, period, reason: unavailable.reason ?? null });
      }
      for (const preference of faculty.preferences as { type: string; days: string[]; periods: number[]; note?: string }[]) {
        for (const dayCode of preference.days) {
          const day = DAY_INDEX.get(dayCode);
          if (day === undefined || day > 4) continue;
          for (const period of preference.periods) preferenceValues.push({ facultyId, type: preference.type, day, period, note: preference.note ?? null });
        }
      }
    }
    if (availabilityValues.length) await tx.insert(t.availabilityBlocks).values(availabilityValues);
    if (preferenceValues.length) await tx.insert(t.facultyPreferences).values(preferenceValues);

    const roomBlockValues: (typeof t.roomAvailabilityBlocks.$inferInsert)[] = [];
    for (const block of data.room_unavailability) {
      const roomId = roomBySource.get(block.room_id)?.id;
      const day = DAY_INDEX.get(block.day);
      if (!roomId || day === undefined) throw new Error(`Missing room constraint reference ${block.room_id}`);
      for (const period of block.periods) roomBlockValues.push({ roomId, day, period, reason: block.reason ?? null });
    }
    if (roomBlockValues.length) await tx.insert(t.roomAvailabilityBlocks).values(roomBlockValues);

    const [version] = await tx.insert(t.scheduleVersions).values({
      label: "CIT official baseline",
      status: "published",
      notes: `${data.dataset_id} · restored validator-clean TESSRA baseline`,
      stats: {
        requiredUnits: data.sessions.length,
        placedUnits: officialSchedule.sessions.length,
        requiredPeriods: data.sessions.reduce((sum, session) => sum + session.duration, 0),
        placedPeriods: officialSchedule.sessions.reduce((sum, placement) => sum + (data.sessions.find((session) => session.id === placement.session_id)?.duration ?? 0), 0),
        fixedUnits: 0,
        unplaced: [],
        durationMs: Math.round((officialSchedule.solver?.wall_time ?? 0) * 1000),
      },
      createdById: admin.id,
      publishedAt: new Date(),
    }).returning();

    const sourceSession = new Map(data.sessions.map((session) => [session.id, session]));
    await tx.insert(t.scheduledSessions).values(officialSchedule.sessions.map((placement) => {
      const source = sourceSession.get(placement.session_id);
      const offering = offeringBySource.get(placement.session_id);
      const room = roomBySource.get(placement.room_id);
      const day = DAY_INDEX.get(placement.day);
      if (!source || !offering || !room || day === undefined) throw new Error(`Missing operational session reference ${placement.session_id}`);
      return {
        versionId: version.id,
        offeringId: offering.id,
        courseId: offering.courseId,
        facultyId: offering.facultyId,
        roomId: room.id,
        groupIds: offering.groupIds,
        expectedSize: source.size,
        day,
        startPeriod: placement.start_period,
        duration: source.duration,
        kind: source.kind,
        sourceId: source.id,
        basketSlot: source.basket_slot,
        isFixed: false,
      };
    }));

    const outcomes = new Map((officialSchedule.fest_week?.bookings ?? []).map((booking) => [booking.request_id, booking]));
    const cancellations = new Map(data.cancellations.map((cancellation) => [cancellation.request_id, cancellation]));
    const periodById = new Map(data.calendar.periods.map((period) => [period.id, period]));
    const endForPeriod = (period: number) => periodById.get(period)?.end ?? `${String(8 + period).padStart(2, "0")}:00`;
    const priorityFor = (category: string): t.Priority => category === "institute_event" ? "critical" : category === "guest_lecture" ? "high" : category === "department_event" ? "normal" : "low";
    const bookingValues: (typeof t.bookings.$inferInsert)[] = data.booking_requests.map((request) => {
      const outcome = outcomes.get(request.id);
      const cancellation = cancellations.get(request.id);
      const window = outcome?.day && outcome.start_period && outcome.end_period
        ? { day: outcome.day, from_period: outcome.start_period, to_period: outcome.end_period }
        : request.windows[0];
      const requestedRoom = request.requested_room ? roomBySource.get(request.requested_room) : undefined;
      const placedRoom = outcome?.room_id ? roomBySource.get(outcome.room_id) : undefined;
      const fallbackRoom = data.rooms.filter((room) => request.room_types.includes(room.type)).sort((a, b) => b.capacity - a.capacity)
        .map((room) => roomBySource.get(room.id)).find(Boolean);
      const room = placedRoom ?? requestedRoom ?? fallbackRoom ?? rooms[0];
      const requester = request.requester.includes("(F12)")
        ? userBySource.get("F12")
        : userBySource.get(`REQUESTER:${request.requester}`) ?? userByName.get(request.requester);
      if (!room || !requester || !window) throw new Error(`Missing operational booking reference ${request.id}`);
      const status: t.RequestStatus = cancellation ? "cancelled" : outcome?.status === "approved" ? "approved" : outcome?.status === "rejected" ? "rejected" : "pending";
      return {
        sourceId: request.id,
        requesterId: requester.id,
        clubId: requester.clubId,
        departmentId: request.department ? departmentId.get(request.department) : null,
        title: request.title,
        description: request.raw_text,
        sourceRequester: request.requester,
        sourceRequesterRole: request.role,
        category: request.requested_category,
        roomId: room.id,
        date: addDays(FEST_WEEK_MONDAY, DAY_INDEX.get(window.day) ?? 0),
        startTime: periodById.get(window.from_period)?.start ?? "08:00",
        endTime: endForPeriod(window.to_period),
        attendees: request.attendance,
        priority: priorityFor(effectiveCategory(data, request)),
        status,
        needs: request.needs,
        requestWindows: request.windows,
        requestedRoomId: requestedRoom?.id ?? null,
        requestedRoomTypes: request.room_types,
        mandatoryGroupIds: request.mandatory_for_groups.map((id) => groupBySource.get(id)?.id).filter((id): id is number => Boolean(id)),
        durationPeriods: request.duration_periods,
        seriesId: request.series_id,
        rawText: request.raw_text,
        officialReason: outcome?.reason ?? null,
        rejectionReason: status === "rejected" || status === "cancelled" ? [outcome?.reason, cancellation?.note].filter(Boolean).join(" ") : null,
        suggestedRoomId: outcome?.status === "alternative_offered" ? placedRoom?.id ?? null : null,
        reviewerId: status === "pending" ? null : admin.id,
        reviewedAt: status === "pending" ? null : new Date(request.submitted_at),
        createdAt: new Date(request.submitted_at),
      };
    });
    await tx.insert(t.bookings).values(bookingValues);

    const examSource = new Map(data.exams.map((exam) => [exam.id, exam]));
    const examSessions = new Map(data.calendar.exam_week.sessions.map((session) => [session.id, session]));
    const examValues: (typeof t.exams.$inferInsert)[] = (officialSchedule.exams ?? []).map((placement) => {
      const source = examSource.get(placement.exam_id);
      const session = examSessions.get(placement.session);
      const courseIds = source?.course_ids.map((id) => courseBySource.get(id)?.id).filter((id): id is number => Boolean(id)) ?? [];
      const roomIds = placement.rooms.map((id) => roomBySource.get(id)?.id).filter((id): id is number => Boolean(id));
      const day = DAY_INDEX.get(placement.day);
      if (!source || !session || !courseIds.length || !roomIds.length || day === undefined) throw new Error(`Missing operational exam reference ${placement.exam_id}`);
      return {
        sourceId: source.id,
        courseId: courseIds[0],
        courseIds,
        groupIds: source.groups.map((id) => groupBySource.get(id)?.id as number),
        sourceDay: placement.day,
        sourceSession: placement.session,
        date: addDays(EXAM_WEEK_MONDAY, day),
        startTime: session.start ?? "09:30",
        endTime: session.end ?? "11:30",
        roomId: roomIds[0],
        roomIds,
        invigilatorId: null,
        candidates: source.size,
      };
    });
    await tx.insert(t.exams).values(examValues);

    await tx.insert(t.officialRuns).values({
      kind: "schedule",
      label: "CIT validator-clean baseline",
      datasetId: data.dataset_id,
      createdById: admin.id,
      schedule: officialSchedule,
      report: officialReport,
    });
    await tx.insert(t.auditLogs).values({
      actorId: admin.id,
      action: "cit.workspace_restored",
      entityType: "dataset",
      entityId: null,
      summary: `Restored ${data.dataset_id} operational baseline: ${officialSchedule.sessions.length} sessions, ${bookingValues.length} requests and ${examValues.length} exams`,
    });
    await tx.insert(t.notifications).values({
      userId: admin.id,
      title: "CIT baseline restored",
      body: "The committed operational timetable, booking decisions, constraints, and examinations are active again.",
      tone: "success",
      href: "/admin",
    });

    return { versionId: version.id, sessions: officialSchedule.sessions.length, bookings: bookingValues.length, exams: examValues.length };
  });
}
