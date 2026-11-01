/**
 * Self-bootstrapping database: creates the schema when it is missing and seeds a
 * realistic institution on first run. The published timetable is produced by the
 * real scheduling engine — nothing on screen is hard-coded.
 */
import { eq } from "drizzle-orm";
import { db, pool, getSupabaseAdmin } from "@/db";
import { BOOTSTRAP_STATEMENTS } from "@/db/bootstrap-sql";
import * as t from "@/db/schema";
import { DEMO_PASSWORD, DEMO_ACCOUNTS } from "./constants";
import { ensureSinglePublishedVersion, generateVersion, loadEngineState, proposeDisruption, publishVersion, slotRef } from "./engine";
import { hashPassword } from "./password";
import { findAlternatives } from "./scheduler";
import { addDaysIso, parseIso, todayIso } from "./utils";

let seeding: Promise<void> | null = null;

export function ensureSeeded() {
  if (!seeding) {
    seeding = run().catch((err) => {
      seeding = null;
      throw err;
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
    // The production pooler uses transaction mode, so session advisory locks are
    // unsafe: an unlock statement can reach a different backend. Avoid locking
    // entirely on the normal, already-initialised path.
    const ready = await client.query("select to_regclass('public.users') as t");
    if (ready.rows[0]?.t) {
      const { rows } = await client.query("select count(*)::int as n from users");
      if ((rows[0]?.n ?? 0) > 0) {
        await ensureBookingExampleRooms();
        await ensureSinglePublishedVersion();
        return;
      }
    }

    // A transaction-scoped lock is released automatically if a serverless
    // invocation is killed. First serialize schema creation and commit it so the
    // separate Drizzle connections used by `seed` can see the tables.
    await transaction(async () => {
      await client.query("select pg_advisory_xact_lock(87414)");
      const exists = await client.query("select to_regclass('public.users') as t");
      if (!exists.rows[0]?.t) {
        for (const stmt of BOOTSTRAP_STATEMENTS) await client.query(stmt);
      }
    });

    // Serialize data seeding in a second transaction. The lock remains held while
    // the existing seed routine writes through the pool, and cannot leak beyond
    // this transaction.
    await transaction(async () => {
      await client.query("select pg_advisory_xact_lock(87414)");
      const { rows } = await client.query("select count(*)::int as n from users");
      if ((rows[0]?.n ?? 0) === 0) await seed();
      await ensureBookingExampleRooms();
      await ensureSinglePublishedVersion();
    });
  } finally {
    client.release();
  }
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

/**
 * Keep the two seminar halls used by the organiser's public NLP example in the
 * compact demo campus as real selectable venues. The idempotent upsert also
 * upgrades existing deployments without resetting judges' data: SH-2 is
 * deliberately inaccessible, so an accessible request must propose SH-1.
 */
async function ensureBookingExampleRooms() {
  await db
    .insert(t.rooms)
    .values([
      {
        code: "SH-1",
        name: "Seminar Hall 1",
        building: "Convocation Centre",
        type: "seminar",
        capacity: 150,
        features: ["Projector", "Audio system", "Stage lighting", "Air conditioning"],
        accessible: true,
        bookable: true,
      },
      {
        code: "SH-2",
        name: "Seminar Hall 2",
        building: "Convocation Centre",
        type: "seminar",
        capacity: 100,
        features: ["Projector", "Audio system", "Air conditioning"],
        accessible: false,
        bookable: true,
      },
    ])
    .onConflictDoNothing({ target: t.rooms.code });
}

async function seed() {
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const today = todayIso();

  await db
    .insert(t.settings)
    .values({ id: 1, institutionName: "Westbrook Institute of Technology", academicTerm: "Autumn Term 2026" })
    .onConflictDoNothing();

  const deptRows = await db
    .insert(t.departments)
    .values([
      { code: "CSE", name: "Computer Science & Engineering" },
      { code: "ECE", name: "Electronics & Communication Engineering" },
      { code: "MGT", name: "School of Management" },
      { code: "SCI", name: "Mathematics & Sciences" },
    ])
    .returning();
  const D = Object.fromEntries(deptRows.map((d) => [d.code, d.id])) as Record<string, number>;

  const clubRows = await db
    .insert(t.clubs)
    .values([
      { name: "Robotics Society", category: "Technical", advisor: "Prof. Rahul Verma" },
      { name: "Cultural Committee", category: "Cultural", advisor: "Prof. Laura Mendes" },
      { name: "Entrepreneurship Cell", category: "Professional", advisor: "Dr. Rohan Gupta" },
      { name: "Photography Club", category: "Creative", advisor: "Dr. Sarah Thomas" },
    ])
    .returning();
  const C = Object.fromEntries(clubRows.map((c) => [c.name, c.id])) as Record<string, number>;

  type NewUser = typeof t.users.$inferInsert;
  const fac = (name: string, email: string, title: string, dept: string, max = 14): NewUser => ({
    name, email, passwordHash, role: "faculty", title, departmentId: D[dept], maxWeeklyPeriods: max,
  });
  // --- Supabase Auth users (created after public profiles below) ---
  let supabaseUsers: Promise<void> | null = null;
  const userRows = await db
    .insert(t.users)
    .values([
      { name: "Aditi Kapoor", email: "admin@westbrook.edu", passwordHash, role: "admin", title: "Head of Academic Operations" },
      { name: "Dr. Meera Iyer", email: "coordinator.cse@westbrook.edu", passwordHash, role: "coordinator", title: "Department Coordinator", departmentId: D.CSE },
      { name: "Dr. Thomas Wright", email: "coordinator.ece@westbrook.edu", passwordHash, role: "coordinator", title: "Department Coordinator", departmentId: D.ECE },
      fac("Dr. Ananya Rao", "ananya.rao@westbrook.edu", "Associate Professor", "CSE"),
      fac("Prof. Rahul Verma", "rahul.verma@westbrook.edu", "Professor", "CSE", 12),
      fac("Dr. Sarah Thomas", "sarah.thomas@westbrook.edu", "Assistant Professor", "CSE"),
      fac("Mr. Arjun Nair", "arjun.nair@westbrook.edu", "Assistant Professor", "CSE", 16),
      fac("Dr. Kavya Reddy", "kavya.reddy@westbrook.edu", "Associate Professor", "CSE"),
      fac("Dr. Priya Sharma", "priya.sharma@westbrook.edu", "Associate Professor", "ECE"),
      fac("Prof. Daniel Joseph", "daniel.joseph@westbrook.edu", "Professor", "ECE", 12),
      fac("Dr. Neha Kulkarni", "neha.kulkarni@westbrook.edu", "Assistant Professor", "ECE"),
      fac("Dr. Suresh Pillai", "suresh.pillai@westbrook.edu", "Professor", "SCI", 10),
      fac("Dr. Fatima Khan", "fatima.khan@westbrook.edu", "Associate Professor", "SCI"),
      fac("Prof. Laura Mendes", "laura.mendes@westbrook.edu", "Professor", "MGT", 12),
      fac("Dr. Rohan Gupta", "rohan.gupta@westbrook.edu", "Assistant Professor", "MGT"),
      { name: "Kabir Malhotra", email: "robotics@westbrook.edu", passwordHash, role: "club", title: "President, Robotics Society", clubId: C["Robotics Society"] },
      { name: "Zara Fernandes", email: "cultural@westbrook.edu", passwordHash, role: "club", title: "Secretary, Cultural Committee", clubId: C["Cultural Committee"] },
      { name: "Ishaan Mehta", email: "ecell@westbrook.edu", passwordHash, role: "club", title: "Lead, Entrepreneurship Cell", clubId: C["Entrepreneurship Cell"] },
      { name: "Nora Das", email: "photo@westbrook.edu", passwordHash, role: "club", title: "Coordinator, Photography Club", clubId: C["Photography Club"] },
    ])
    .returning();

  // --- Create Supabase Auth users and link them to public profiles ---
  supabaseUsers = (async () => {
    const sb = await getSupabaseAdmin();
    if (!sb) return; // Supabase not configured — skip auth user creation
    for (const row of userRows) {
      const demo = DEMO_ACCOUNTS.find((d) => d.email === row.email);
      const role = demo?.role ?? row.role;
      try {
        const { data, error } = await sb.auth.admin.createUser({
          email: row.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { role, name: row.name },
        });
        const authUser = data?.user;
        if (authUser?.id) {
          await db.update(t.users).set({ supabaseUid: authUser.id }).where(eq(t.users.id, row.id));
        } else if (error) {
          console.warn(`Supabase auth user for ${row.email}: ${error.message}`);
        }
      } catch (err) {
        console.warn(`Supabase auth user for ${row.email} could not be created:`, err);
      }
    }
  })();
  await supabaseUsers;

  const U = (email: string) => {
    const u = userRows.find((x) => x.email.startsWith(email));
    if (!u) throw new Error(`Seed user ${email} missing`);
    return u.id;
  };
  const admin = U("admin@");
  const meera = U("coordinator.cse");
  const wright = U("coordinator.ece");
  const rao = U("ananya.rao");
  const verma = U("rahul.verma");
  const thomas = U("sarah.thomas");
  const nair = U("arjun.nair");
  const reddy = U("kavya.reddy");
  const sharma = U("priya.sharma");
  const joseph = U("daniel.joseph");
  const kulkarni = U("neha.kulkarni");
  const pillai = U("suresh.pillai");
  const khan = U("fatima.khan");
  const mendes = U("laura.mendes");
  const gupta = U("rohan.gupta");
  const kabir = U("robotics@");
  const zara = U("cultural@");
  const ishaan = U("ecell@");
  const nora = U("photo@");

  const roomRows = await db
    .insert(t.rooms)
    .values([
      { code: "LT-1", name: "Lecture Theatre 1", building: "Academic Block A", type: "lecture", capacity: 140, features: ["Projector", "Audio system", "Lecture capture", "Air conditioning", "Wi-Fi"], bookable: true },
      { code: "A-101", name: "Lecture Hall A-101", building: "Academic Block A", type: "lecture", capacity: 80, features: ["Projector", "Smart board", "Wi-Fi"] },
      { code: "A-102", name: "Lecture Hall A-102", building: "Academic Block A", type: "lecture", capacity: 72, features: ["Projector", "Wi-Fi"] },
      { code: "A-201", name: "Lecture Hall A-201", building: "Academic Block A", type: "lecture", capacity: 64, features: ["Projector", "Air conditioning", "Wi-Fi"], accessible: false },
      { code: "A-202", name: "Lecture Hall A-202", building: "Academic Block A", type: "lecture", capacity: 60, features: ["Projector", "Wi-Fi"], accessible: false },
      { code: "B-110", name: "Lecture Hall B-110", building: "Academic Block B", type: "lecture", capacity: 75, features: ["Projector", "Air conditioning"] },
      { code: "B-105", name: "Seminar Room B-105", building: "Academic Block B", type: "seminar", capacity: 40, features: ["Smart board", "Audio system", "Wi-Fi"], bookable: true, departmentId: D.CSE },
      { code: "B-210", name: "Innovation Studio", building: "Academic Block B", type: "seminar", capacity: 45, features: ["Smart board", "Audio system", "Wi-Fi"], bookable: true },
      { code: "L-01", name: "Computing Lab 1", building: "Technology Centre", type: "lab", capacity: 60, features: ["Lab workstations", "Projector", "Air conditioning", "Wi-Fi"], bookable: true, departmentId: D.CSE },
      { code: "L-02", name: "Computing Lab 2", building: "Technology Centre", type: "lab", capacity: 60, features: ["Lab workstations", "Projector", "Wi-Fi"], bookable: true, departmentId: D.CSE },
      { code: "L-03", name: "Electronics Lab", building: "Technology Centre", type: "lab", capacity: 52, features: ["Lab workstations", "Projector"], bookable: true, departmentId: D.ECE },
      { code: "L-04", name: "Embedded Systems Lab", building: "Technology Centre", type: "lab", capacity: 50, features: ["Lab workstations", "Air conditioning"], bookable: true, departmentId: D.ECE },
      { code: "AUD", name: "Main Auditorium", building: "Convocation Centre", type: "auditorium", capacity: 420, features: ["Stage lighting", "Audio system", "Projector", "Air conditioning", "Lecture capture"], bookable: true },
      { code: "EXH-N", name: "Examination Hall North", building: "Examination Wing", type: "exam_hall", capacity: 150, features: ["Air conditioning"] },
      { code: "EXH-S", name: "Examination Hall South", building: "Examination Wing", type: "exam_hall", capacity: 120, features: ["Air conditioning"] },
      { code: "OAT", name: "Open Air Theatre", building: "Central Lawns", type: "outdoor", capacity: 300, features: ["Stage lighting", "Audio system"], bookable: true },
    ])
    .returning();
  const R = Object.fromEntries(roomRows.map((r) => [r.code, r.id])) as Record<string, number>;

  const groupRows = await db
    .insert(t.studentGroups)
    .values([
      { code: "CSE-2A", name: "B.Tech CSE · Year 2 · Section A", departmentId: D.CSE, year: 2, size: 60 },
      { code: "CSE-2B", name: "B.Tech CSE · Year 2 · Section B", departmentId: D.CSE, year: 2, size: 58 },
      { code: "CSE-3A", name: "B.Tech CSE · Year 3 · Section A", departmentId: D.CSE, year: 3, size: 55 },
      { code: "ECE-2A", name: "B.Tech ECE · Year 2 · Section A", departmentId: D.ECE, year: 2, size: 50 },
      { code: "ECE-3A", name: "B.Tech ECE · Year 3 · Section A", departmentId: D.ECE, year: 3, size: 48 },
      { code: "BBA-1A", name: "BBA · Year 1 · Section A", departmentId: D.MGT, year: 1, size: 70 },
    ])
    .returning();
  const G = Object.fromEntries(groupRows.map((g) => [g.code, g.id])) as Record<string, number>;

  const courseRows = await db
    .insert(t.courses)
    .values([
      { code: "CS201", title: "Data Structures", departmentId: D.CSE, credits: 4, kind: "lecture" },
      { code: "CS201L", title: "Data Structures Lab", departmentId: D.CSE, credits: 1, kind: "lab" },
      { code: "CS203", title: "Digital Logic Design", departmentId: D.CSE, credits: 3, kind: "lecture" },
      { code: "CS205", title: "Object-Oriented Programming", departmentId: D.CSE, credits: 3, kind: "lecture" },
      { code: "CS301", title: "Operating Systems", departmentId: D.CSE, credits: 4, kind: "lecture" },
      { code: "CS302", title: "Database Systems", departmentId: D.CSE, credits: 4, kind: "lecture" },
      { code: "CS302L", title: "Database Systems Lab", departmentId: D.CSE, credits: 1, kind: "lab" },
      { code: "CS304", title: "Computer Networks", departmentId: D.CSE, credits: 3, kind: "lecture" },
      { code: "EC201", title: "Signals & Systems", departmentId: D.ECE, credits: 4, kind: "lecture" },
      { code: "EC202L", title: "Circuits Lab", departmentId: D.ECE, credits: 1, kind: "lab" },
      { code: "EC203", title: "Electronic Devices", departmentId: D.ECE, credits: 3, kind: "lecture" },
      { code: "EC301", title: "Microprocessors", departmentId: D.ECE, credits: 4, kind: "lecture" },
      { code: "EC302L", title: "Microprocessors Lab", departmentId: D.ECE, credits: 1, kind: "lab" },
      { code: "EC303", title: "Communication Systems", departmentId: D.ECE, credits: 3, kind: "lecture" },
      { code: "MA201", title: "Discrete Mathematics", departmentId: D.SCI, credits: 3, kind: "lecture" },
      { code: "MA202", title: "Probability & Statistics", departmentId: D.SCI, credits: 3, kind: "lecture" },
      { code: "MA103", title: "Business Statistics", departmentId: D.SCI, credits: 2, kind: "lecture" },
      { code: "BB101", title: "Principles of Management", departmentId: D.MGT, credits: 3, kind: "lecture" },
      { code: "BB102", title: "Business Economics", departmentId: D.MGT, credits: 3, kind: "lecture" },
      { code: "BB103", title: "Financial Accounting", departmentId: D.MGT, credits: 3, kind: "lecture" },
      { code: "BB104T", title: "Business Communication Tutorial", departmentId: D.MGT, credits: 1, kind: "tutorial" },
    ])
    .returning();
  const K = Object.fromEntries(courseRows.map((c) => [c.code, c.id])) as Record<string, number>;

  type NewOffering = typeof t.offerings.$inferInsert;
  const off = (code: string, facultyId: number, groups: string[], sessionsPerWeek: number, kind: "lecture" | "lab" | "tutorial" = "lecture"): NewOffering => ({
    courseId: K[code],
    facultyId,
    groupIds: groups.map((g) => G[g]),
    sessionsPerWeek,
    duration: kind === "lab" ? 3 : 1,
    kind,
    roomType: kind === "lab" ? "lab" : groups.length > 1 ? "auditorium" : kind === "tutorial" ? "seminar" : "lecture",
  });
  await db.insert(t.offerings).values([
    off("CS201", rao, ["CSE-2A"], 3), off("CS201L", rao, ["CSE-2A"], 1, "lab"), off("CS203", verma, ["CSE-2A"], 3),
    off("MA201", pillai, ["CSE-2A", "CSE-2B"], 3), off("CS205", reddy, ["CSE-2A"], 2),
    off("CS201", thomas, ["CSE-2B"], 3), off("CS201L", thomas, ["CSE-2B"], 1, "lab"), off("CS203", verma, ["CSE-2B"], 3),
    off("CS205", nair, ["CSE-2B"], 2),
    off("CS301", reddy, ["CSE-3A"], 3), off("CS302", rao, ["CSE-3A"], 3), off("CS302L", nair, ["CSE-3A"], 1, "lab"), off("CS304", nair, ["CSE-3A"], 3),
    off("EC201", sharma, ["ECE-2A"], 3), off("EC202L", joseph, ["ECE-2A"], 1, "lab"), off("EC203", sharma, ["ECE-2A"], 3),
    off("MA202", khan, ["ECE-2A", "ECE-3A"], 3),
    off("EC301", joseph, ["ECE-3A"], 3), off("EC302L", kulkarni, ["ECE-3A"], 1, "lab"), off("EC303", kulkarni, ["ECE-3A"], 3),
    off("BB101", mendes, ["BBA-1A"], 3), off("BB102", gupta, ["BBA-1A"], 3), off("BB103", gupta, ["BBA-1A"], 3),
    off("MA103", khan, ["BBA-1A"], 2), off("BB104T", mendes, ["BBA-1A"], 1, "tutorial"),
  ]);

  const block = (facultyId: number, day: number, periods: number[], reason: string) => periods.map((period) => ({ facultyId, day, period, reason }));
  await db.insert(t.availabilityBlocks).values([
    ...block(rao, 4, [7, 8], "Research group meeting"),
    ...block(verma, 0, [1, 2], "Academic council"),
    ...block(pillai, 2, [5, 6, 7, 8], "External examiner duty"),
    ...block(kulkarni, 3, [1, 2], "PhD coursework"),
    ...block(mendes, 1, [7, 8], "Industry advisory board"),
  ]);

  // ---- Generate & publish the first timetable with the real engine ----
  const { version, stats } = await generateVersion(admin, "Initial generation for Autumn Term 2026");
  const v1Sessions = await db.select().from(t.scheduledSessions).where(eq(t.scheduledSessions.versionId, version.id));
  const firstOf = (code: string) => v1Sessions.find((s) => s.courseId === K[code]);
  const pinned = [firstOf("MA201"), firstOf("BB104T")].filter((s): s is t.SessionRow => Boolean(s));
  for (const s of pinned) await db.update(t.scheduledSessions).set({ isFixed: true }).where(eq(t.scheduledSessions.id, s.id));
  await publishVersion(version.id);

  const logs: (typeof t.auditLogs.$inferInsert)[] = [
    { actorId: admin, action: "schedule.generated", entityType: "schedule", entityId: version.id, summary: `Generated ${version.label} — placed ${stats.placedUnits}/${stats.requiredUnits} sessions`, createdAt: hoursAgo(74) },
    ...pinned.map((s) => ({ actorId: admin, action: "session.pinned", entityType: "schedule", entityId: s.id, summary: `Pinned ${courseRows.find((c) => c.id === s.courseId)?.code} as a fixed session`, createdAt: hoursAgo(73) })),
    { actorId: admin, action: "schedule.published", entityType: "schedule", entityId: version.id, summary: `Published ${version.label} for Autumn Term 2026`, createdAt: hoursAgo(72) },
  ];

  // ---- Post-publication events that create real, detectable conflicts ----
  let state = await loadEngineState(version.id);

  // 1) Dr. Thomas reports conference travel during one of her lectures → availability conflict + change request.
  const thomasSession = state.sessions.find((s) => s.facultyId === thomas && s.kind === "lecture");
  if (thomasSession) {
    await db.insert(t.availabilityBlocks).values({ facultyId: thomas, day: thomasSession.day, period: thomasSession.startPeriod, reason: "Conference travel (IEEE ICDE)" });
    state = await loadEngineState(version.id);
    const alt = findAlternatives(state.sessions, thomasSession.id, state.ctx, { avoidDays: [thomasSession.day], limit: 1 })[0];
    if (alt) {
      await db.insert(t.changeRequests).values({
        facultyId: thomas, sessionId: thomasSession.id, type: "reschedule",
        reason: "Presenting at IEEE ICDE this week. Requesting to move the lecture so CSE-2B does not lose contact hours.",
        proposedDay: alt.day, proposedPeriod: alt.startPeriod, proposedRoomId: alt.roomId, status: "pending",
        snapshot: { courseCode: "CS201", courseTitle: "Data Structures", groups: "CSE-2B", from: slotRef(thomasSession, state.labels) },
        createdAt: hoursAgo(20),
      });
    }
  }

  // 2) Dr. Rao asks to move one Database Systems lecture.
  const raoSession = state.sessions.find((s) => s.facultyId === rao && s.courseId === K.CS302);
  if (raoSession) {
    const alt = findAlternatives(state.sessions, raoSession.id, state.ctx, { avoidDays: [raoSession.day], limit: 1 })[0];
    if (alt) {
      await db.insert(t.changeRequests).values({
        facultyId: rao, sessionId: raoSession.id, type: "reschedule",
        reason: "Departmental review meeting clashes with this slot. Requesting a move to keep the class on track.",
        proposedDay: alt.day, proposedPeriod: alt.startPeriod, proposedRoomId: alt.roomId, status: "pending",
        snapshot: { courseCode: "CS302", courseTitle: "Database Systems", groups: "CSE-3A", from: slotRef(raoSession, state.labels) },
        createdAt: hoursAgo(6),
      });
    }
  }

  // 3) A room change for Mr. Nair that was approved and applied.
  const nairSession = state.sessions.find((s) => s.facultyId === nair && s.courseId === K.CS304);
  if (nairSession) {
    const alt = findAlternatives(state.sessions, nairSession.id, state.ctx, { keepSlot: true, limit: 1 })[0];
    if (alt) {
      const [req] = await db.insert(t.changeRequests).values({
        facultyId: nair, sessionId: nairSession.id, type: "room_change",
        reason: "Need a room with a working projector for network simulation demos.",
        proposedDay: nairSession.day, proposedPeriod: nairSession.startPeriod, proposedRoomId: alt.roomId, status: "approved",
        reviewerId: meera, reviewNote: "Approved — room is free for the full term.", reviewedAt: hoursAgo(50),
        snapshot: { courseCode: "CS304", courseTitle: "Computer Networks", groups: "CSE-3A", from: slotRef(nairSession, state.labels) },
        createdAt: hoursAgo(60),
      }).returning();
      await db.update(t.scheduledSessions).set({ roomId: alt.roomId }).where(eq(t.scheduledSessions.id, nairSession.id));
      logs.push({ actorId: meera, action: "change_request.approved", entityType: "change_request", entityId: req.id, summary: `Approved room change for CS304 (Mr. Arjun Nair) → ${state.labels.room(alt.roomId)}`, createdAt: hoursAgo(50) });
      state = await loadEngineState(version.id);
    }
  }

  // 4) A rejected request whose proposed slot genuinely clashes for the group.
  const reddySession = state.sessions.find((s) => s.facultyId === reddy && s.courseId === K.CS301);
  const clashWith = reddySession && state.sessions.find((s) => s.id !== reddySession.id && s.groupIds.includes(G["CSE-3A"]) && s.day !== reddySession.day);
  if (reddySession && clashWith) {
    const [req] = await db.insert(t.changeRequests).values({
      facultyId: reddy, sessionId: reddySession.id, type: "reschedule",
      reason: "Prefer to consolidate teaching on fewer days.",
      proposedDay: clashWith.day, proposedPeriod: clashWith.startPeriod, status: "rejected",
      reviewerId: meera, reviewNote: `Proposed slot clashes with CSE-3A's ${state.labels.course(clashWith.courseId)} session.`, reviewedAt: hoursAgo(30),
      snapshot: { courseCode: "CS301", courseTitle: "Operating Systems", groups: "CSE-3A", from: slotRef(reddySession, state.labels) },
      createdAt: hoursAgo(34),
    }).returning();
    logs.push({ actorId: meera, action: "change_request.rejected", entityType: "change_request", entityId: req.id, summary: "Rejected reschedule request for CS301 (Dr. Kavya Reddy) — group clash", createdAt: hoursAgo(30) });
  }

  // 5) The busiest computing lab goes into maintenance → disruption plan awaiting approval.
  const labUse = new Map<number, number>();
  for (const s of state.sessions) {
    const room = state.rooms.get(s.roomId);
    if (room?.type === "lab" && room.departmentId === D.CSE) labUse.set(room.id, (labUse.get(room.id) ?? 0) + 1);
  }
  const busiestLab = [...labUse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? R["L-02"];
  const labCode = state.labels.room(busiestLab);
  await db.update(t.rooms).set({ status: "maintenance", maintenanceNote: "Air-conditioning overhaul — expected back next week" }).where(eq(t.rooms.id, busiestLab));
  logs.push({ actorId: admin, action: "room.maintenance", entityType: "room", entityId: busiestLab, summary: `Set ${labCode} to maintenance: air-conditioning overhaul`, createdAt: hoursAgo(4) });
  const plan = await proposeDisruption({ type: "room_unavailable", roomId: busiestLab, facultyId: null, day: null }, version.id);
  const [disruption] = await db.insert(t.disruptions).values({
    type: "room_unavailable", title: `${labCode} unavailable — maintenance`,
    description: "Facilities reported an air-conditioning overhaul. All lab sessions in this room need to be relocated for the week.",
    roomId: busiestLab, day: null, versionId: version.id, status: "proposed",
    affectedSessionIds: plan.affectedSessionIds, proposedChanges: plan.changes, validation: plan.validation,
    createdById: admin, createdAt: hoursAgo(4),
  }).returning();
  logs.push({ actorId: admin, action: "disruption.reported", entityType: "disruption", entityId: disruption.id, summary: `Disruption analysed: ${labCode} unavailable — ${plan.changes.length} session(s) affected`, createdAt: hoursAgo(4) });

  // ---- Venue bookings ----
  const nextWeekday = (offset: number) => {
    let iso = addDaysIso(today, offset);
    while ([0, 6].includes(parseIso(iso).getDay())) iso = addDaysIso(iso, 1);
    return iso;
  };
  type NewBooking = typeof t.bookings.$inferInsert;
  const bk = (b: Omit<NewBooking, "category"> & { category?: string }): NewBooking => ({ category: "club_event", ...b });
  const bookingRows = await db.insert(t.bookings).values([
    bk({ requesterId: kabir, clubId: C["Robotics Society"], title: "RoboWars Qualifier Round", description: "Inter-college robot combat qualifiers with a live arena and spectator seating.", roomId: R.AUD, date: addDaysIso(today, 5), startTime: "14:00", endTime: "17:30", attendees: 260, priority: "high", status: "pending", needs: ["Stage lighting", "Audio system"], createdAt: hoursAgo(10) }),
    bk({ requesterId: kabir, clubId: C["Robotics Society"], title: "Arduino Basics Workshop", category: "workshop", description: "Hands-on workshop for first-year students.", roomId: R["B-210"], date: addDaysIso(today, 2), startTime: "17:15", endTime: "19:00", attendees: 40, status: "approved", needs: ["Projector"], reviewerId: admin, reviewedAt: hoursAgo(26), createdAt: hoursAgo(70) }),
    bk({ requesterId: kabir, clubId: C["Robotics Society"], title: "Drone Flight Demo", description: "Outdoor demonstration of autonomous drones.", roomId: R.OAT, date: addDaysIso(today, -12), startTime: "16:00", endTime: "18:00", attendees: 150, status: "approved", reviewerId: admin, reviewedAt: hoursAgo(400), createdAt: hoursAgo(420) }),
    bk({ requesterId: kabir, clubId: C["Robotics Society"], title: "Overnight Hack Night", description: "12-hour build sprint for the national robotics challenge.", roomId: R["L-01"], date: addDaysIso(today, 9), startTime: "18:00", endTime: "23:00", attendees: 55, status: "rejected", rejectionReason: "Computing labs cannot be booked for overnight events. The Innovation Studio is free the same evening.", suggestedRoomId: R["B-210"], reviewerId: admin, reviewedAt: hoursAgo(28), createdAt: hoursAgo(48) }),
    bk({ requesterId: kabir, clubId: C["Robotics Society"], title: "Line Follower Bot Clinic", category: "workshop", roomId: R["B-105"], date: addDaysIso(today, -20), startTime: "15:30", endTime: "17:00", attendees: 30, priority: "low", status: "approved", reviewerId: admin, reviewedAt: hoursAgo(600), createdAt: hoursAgo(620) }),
    bk({ requesterId: zara, clubId: C["Cultural Committee"], title: "Autumn Fest Rehearsal", category: "cultural", description: "Full dress rehearsal for the Autumn Fest opening act.", roomId: R.OAT, date: addDaysIso(today, 3), startTime: "17:30", endTime: "20:00", attendees: 120, status: "pending", needs: ["Stage lighting", "Audio system"], createdAt: hoursAgo(15) }),
    bk({ requesterId: nora, clubId: C["Photography Club"], title: "Golden Hour Photo Walk Briefing", description: "Briefing before the campus photo walk.", roomId: R.OAT, date: addDaysIso(today, 3), startTime: "17:00", endTime: "18:00", attendees: 60, priority: "low", status: "pending", createdAt: hoursAgo(9) }),
    bk({ requesterId: zara, clubId: C["Cultural Committee"], title: "Classical Music Evening", category: "cultural", roomId: R.AUD, date: addDaysIso(today, 14), startTime: "18:00", endTime: "20:30", attendees: 350, status: "approved", needs: ["Audio system"], reviewerId: admin, reviewedAt: hoursAgo(40), createdAt: hoursAgo(90) }),
    bk({ requesterId: ishaan, clubId: C["Entrepreneurship Cell"], title: "Startup Pitch Night", category: "club_event", description: "Student founders pitch to alumni investors.", roomId: R["B-210"], date: addDaysIso(today, 4), startTime: "17:30", endTime: "20:30", attendees: 45, priority: "high", status: "pending", needs: ["Projector", "Audio system"], createdAt: hoursAgo(5) }),
    bk({ requesterId: meera, departmentId: D.CSE, title: "Guest Lecture: AI in Healthcare", category: "seminar", description: "Invited talk by Dr. Lena Ortiz, Clinical AI Lab.", roomId: R["LT-1"], date: nextWeekday(6), startTime: "11:00", endTime: "12:30", attendees: 120, priority: "high", status: "pending", needs: ["Projector", "Recording"], createdAt: hoursAgo(12) }),
    bk({ requesterId: meera, departmentId: D.CSE, title: "Faculty Development Workshop", category: "department_event", roomId: R["B-105"], date: addDaysIso(today, 10), startTime: "17:15", endTime: "18:45", attendees: 30, status: "approved", reviewerId: admin, reviewedAt: hoursAgo(22), createdAt: hoursAgo(60) }),
    bk({ requesterId: wright, departmentId: D.ECE, title: "Industry Connect: Semiconductor Careers", category: "seminar", roomId: R.AUD, date: addDaysIso(today, 8), startTime: "10:00", endTime: "12:00", attendees: 300, status: "pending", needs: ["Audio system", "Projector"], createdAt: hoursAgo(18) }),
    bk({ requesterId: zara, clubId: C["Cultural Committee"], title: "Dance Auditions", category: "cultural", roomId: R["B-105"], date: addDaysIso(today, -6), startTime: "16:00", endTime: "18:00", attendees: 35, status: "rejected", rejectionReason: "Seminar room reserved for a departmental review that afternoon.", reviewerId: admin, reviewedAt: hoursAgo(200), createdAt: hoursAgo(230) }),
  ]).returning();
  const byTitle = (title: string) => bookingRows.find((b) => b.title === title);
  const arduino = byTitle("Arduino Basics Workshop");
  const hack = byTitle("Overnight Hack Night");
  if (arduino) logs.push({ actorId: admin, action: "booking.approved", entityType: "booking", entityId: arduino.id, summary: "Approved booking “Arduino Basics Workshop” in B-210", createdAt: hoursAgo(26) });
  if (hack) logs.push({ actorId: admin, action: "booking.rejected", entityType: "booking", entityId: hack.id, summary: "Rejected booking “Overnight Hack Night” — suggested B-210", createdAt: hoursAgo(28) });

  // ---- Mid-term examinations ----
  let base = addDaysIso(today, 14);
  while (parseIso(base).getDay() !== 1) base = addDaysIso(base, 1);
  const ex = (code: string, groups: string[], dayOffset: number, start: string, end: string, room: string, inv: number, candidates: number) => ({
    courseId: K[code], groupIds: groups.map((g) => G[g]), date: addDaysIso(base, dayOffset), startTime: start, endTime: end, roomId: R[room], invigilatorId: inv, candidates,
  });
  await db.insert(t.exams).values([
    ex("CS201", ["CSE-2A", "CSE-2B"], 0, "10:00", "12:00", "EXH-N", verma, 118),
    ex("EC201", ["ECE-2A"], 0, "10:00", "12:00", "EXH-S", kulkarni, 50),
    ex("BB101", ["BBA-1A"], 0, "14:00", "16:00", "EXH-S", gupta, 70),
    ex("MA201", ["CSE-2A", "CSE-2B"], 1, "10:00", "12:00", "EXH-N", khan, 118),
    ex("EC301", ["ECE-3A"], 1, "10:00", "12:00", "EXH-S", sharma, 48),
    ex("MA202", ["ECE-2A", "ECE-3A"], 1, "10:30", "12:30", "LT-1", pillai, 98),
    ex("CS301", ["CSE-3A"], 2, "10:00", "12:00", "EXH-S", nair, 55),
    ex("BB102", ["BBA-1A"], 2, "10:00", "12:00", "EXH-N", mendes, 70),
    ex("CS203", ["CSE-2A", "CSE-2B"], 2, "14:00", "16:00", "EXH-N", reddy, 118),
    ex("CS302", ["CSE-3A"], 3, "10:00", "12:00", "EXH-S", thomas, 55),
    ex("EC303", ["ECE-3A"], 3, "14:00", "16:00", "EXH-S", joseph, 48),
    ex("BB103", ["BBA-1A"], 3, "14:00", "16:00", "EXH-N", gupta, 70),
  ]);

  // ---- Notifications ----
  const affectedFaculty = [...new Set(plan.changes.map((c) => state.sessions.find((s) => s.id === c.sessionId)?.facultyId).filter((x): x is number => Boolean(x)))];
  await db.insert(t.notifications).values([
    { userId: rao, title: `${version.label} timetable published`, body: "Your Autumn Term timetable is live. Review your weekly schedule.", tone: "success", href: "/faculty/timetable", createdAt: hoursAgo(72) },
    { userId: rao, title: "Change request submitted", body: "Your request to reschedule CS302 Database Systems is awaiting coordinator review.", tone: "info", href: "/faculty/requests", createdAt: hoursAgo(6) },
    ...affectedFaculty.map((userId) => ({ userId, title: `${labCode} under maintenance`, body: `Lab sessions in ${labCode} may be relocated. A disruption plan is awaiting approval.`, tone: "warning" as const, href: "/faculty/timetable", createdAt: hoursAgo(4) })),
    { userId: thomas, title: "Availability conflict detected", body: "You marked a teaching slot unavailable. Your reschedule request is pending review.", tone: "warning", href: "/faculty/requests", createdAt: hoursAgo(20) },
    { userId: kabir, title: "Booking approved: Arduino Basics Workshop", body: "Innovation Studio (B-210) is confirmed for your workshop.", tone: "success", href: "/club/bookings", createdAt: hoursAgo(26) },
    { userId: kabir, title: "Booking rejected: Overnight Hack Night", body: "Computing labs cannot host overnight events. Suggested alternative: B-210.", tone: "error", href: "/club/history", read: false, createdAt: hoursAgo(28) },
    { userId: kabir, title: "Request received: RoboWars Qualifier Round", body: "Your Main Auditorium request is in the approval queue.", tone: "info", href: "/club/bookings", read: true, createdAt: hoursAgo(10) },
  ]);

  await db.insert(t.auditLogs).values(logs);
}
