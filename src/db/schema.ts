import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Domain unions (stored as text for painless schema evolution)        */
/* ------------------------------------------------------------------ */
export type Role = "admin" | "coordinator" | "faculty" | "club";
export type RoomType = "lecture" | "lab" | "seminar" | "auditorium" | "exam_hall" | "outdoor";
export type RoomStatus = "active" | "maintenance" | "inactive";
export type SessionKind = "lecture" | "lab" | "tutorial";
export type VersionStatus = "draft" | "published" | "archived";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type Priority = "low" | "normal" | "high" | "critical";
export type ChangeType = "reschedule" | "room_change" | "extra_class";
export type DisruptionType = "faculty_absence" | "room_unavailable";
export type DisruptionStatus = "proposed" | "applied" | "rejected";
export type Tone = "info" | "success" | "warning" | "error";

export type VersionStats = {
  requiredUnits: number;
  placedUnits: number;
  requiredPeriods: number;
  placedPeriods: number;
  fixedUnits: number;
  unplaced: { offeringId: number; label: string; reason: string }[];
  durationMs: number;
};

export type SlotRef = { day: number; period: number; duration: number; roomId: number; roomCode: string };

export type ProposedChange = {
  sessionId: number;
  courseCode: string;
  courseTitle: string;
  groupCodes: string;
  facultyName: string;
  action: "move" | "room_change" | "unresolved";
  from: SlotRef;
  to: SlotRef | null;
  note: string;
};

export type DisruptionValidation = { ok: boolean; issues: string[]; checkedAt: string };

export type AssistantPayload =
  | {
      kind: "sessions";
      title: string;
      items: {
        day: number;
        startPeriod: number;
        duration: number;
        courseCode: string;
        courseTitle: string;
        roomCode: string;
        groups: string;
        kind: SessionKind;
      }[];
    }
  | {
      kind: "rooms";
      title: string;
      items: { id: number; code: string; name: string; capacity: number; type: RoomType }[];
    }
  | {
      kind: "proposal";
      status: "proposed" | "submitted" | "dismissed";
      changeRequestId?: number;
      proposal: {
        sessionId: number;
        courseCode: string;
        courseTitle: string;
        groups: string;
        from: SlotRef;
        to: SlotRef;
        checks: string[];
      };
    }
  | {
      kind: "availability";
      status: "proposed" | "applied" | "dismissed";
      blocks: { day: number; period: number }[];
      skipped: { day: number; period: number; courseCode: string }[];
      reason: string;
    }
  | {
      kind: "requests";
      items: { id: number; courseCode: string; type: ChangeType; status: RequestStatus; createdAt: string }[];
    };

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  institutionName: text("institution_name").notNull(),
  academicTerm: text("academic_term").notNull(),
  bookingLeadDays: integer("booking_lead_days").notNull().default(2),
  maxBookingHours: integer("max_booking_hours").notNull().default(6),
  clubApprovalRequired: boolean("club_approval_required").notNull().default(true),
  allowWeekendBookings: boolean("allow_weekend_bookings").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  advisor: text("advisor"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  supabaseUid: text("supabase_uid").unique(),
  passwordHash: text("password_hash"),
  role: text("role").$type<Role>().notNull(),
  title: text("title"),
  departmentId: integer("department_id").references(() => departments.id),
  clubId: integer("club_id").references(() => clubs.id),
  maxWeeklyPeriods: integer("max_weekly_periods").notNull().default(16),
  approvalStatus: text("approval_status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  building: text("building").notNull(),
  type: text("type").$type<RoomType>().notNull(),
  capacity: integer("capacity").notNull(),
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  accessible: boolean("accessible").notNull().default(true),
  status: text("status").$type<RoomStatus>().notNull().default("active"),
  maintenanceNote: text("maintenance_note"),
  bookable: boolean("bookable").notNull().default(false),
  departmentId: integer("department_id").references(() => departments.id),
});

export const studentGroups = pgTable("student_groups", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  year: integer("year").notNull(),
  size: integer("size").notNull(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  credits: integer("credits").notNull().default(3),
  kind: text("kind").$type<SessionKind>().notNull().default("lecture"),
});

export const offerings = pgTable("offerings", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  facultyId: integer("faculty_id")
    .notNull()
    .references(() => users.id),
  groupIds: integer("group_ids").array().notNull(),
  sessionsPerWeek: integer("sessions_per_week").notNull(),
  duration: integer("duration").notNull().default(1),
  kind: text("kind").$type<SessionKind>().notNull(),
  roomType: text("room_type").$type<RoomType>().notNull(),
});

export const scheduleVersions = pgTable("schedule_versions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  status: text("status").$type<VersionStatus>().notNull().default("draft"),
  notes: text("notes"),
  stats: jsonb("stats").$type<VersionStats>(),
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const scheduledSessions = pgTable(
  "scheduled_sessions",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id")
      .notNull()
      .references(() => scheduleVersions.id, { onDelete: "cascade" }),
    offeringId: integer("offering_id").references(() => offerings.id, { onDelete: "set null" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => users.id),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    groupIds: integer("group_ids").array().notNull(),
    day: integer("day").notNull(),
    startPeriod: integer("start_period").notNull(),
    duration: integer("duration").notNull().default(1),
    kind: text("kind").$type<SessionKind>().notNull(),
    isFixed: boolean("is_fixed").notNull().default(false),
  },
  (t) => [index("scheduled_sessions_version_idx").on(t.versionId)],
);

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: serial("id").primaryKey(),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("availability_blocks_unique").on(t.facultyId, t.day, t.period)],
);

export const changeRequests = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  facultyId: integer("faculty_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => scheduledSessions.id, { onDelete: "set null" }),
  type: text("type").$type<ChangeType>().notNull(),
  reason: text("reason").notNull(),
  proposedDay: integer("proposed_day"),
  proposedPeriod: integer("proposed_period"),
  proposedRoomId: integer("proposed_room_id").references(() => rooms.id),
  courseId: integer("course_id").references(() => courses.id),
  groupIds: integer("group_ids").array(),
  duration: integer("duration"),
  status: text("status").$type<RequestStatus>().notNull().default("pending"),
  source: text("source").$type<"manual" | "assistant">().notNull().default("manual"),
  snapshot: jsonb("snapshot").$type<{ courseCode: string; courseTitle: string; groups: string; from: SlotRef }>(),
  reviewerId: integer("reviewer_id").references(() => users.id),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id),
  clubId: integer("club_id").references(() => clubs.id),
  departmentId: integer("department_id").references(() => departments.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  attendees: integer("attendees").notNull(),
  priority: text("priority").$type<Priority>().notNull().default("normal"),
  status: text("status").$type<RequestStatus>().notNull().default("pending"),
  needs: text("needs").array().notNull().default(sql`'{}'::text[]`),
  rejectionReason: text("rejection_reason"),
  suggestedRoomId: integer("suggested_room_id").references(() => rooms.id),
  reviewerId: integer("reviewer_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  groupIds: integer("group_ids").array().notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id),
  invigilatorId: integer("invigilator_id").references(() => users.id),
  candidates: integer("candidates").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const disruptions = pgTable("disruptions", {
  id: serial("id").primaryKey(),
  type: text("type").$type<DisruptionType>().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  facultyId: integer("faculty_id").references(() => users.id),
  roomId: integer("room_id").references(() => rooms.id),
  day: integer("day"),
  versionId: integer("version_id").references(() => scheduleVersions.id, { onDelete: "cascade" }),
  status: text("status").$type<DisruptionStatus>().notNull().default("proposed"),
  affectedSessionIds: integer("affected_session_ids").array().notNull().default(sql`'{}'::integer[]`),
  proposedChanges: jsonb("proposed_changes").$type<ProposedChange[]>().notNull().default(sql`'[]'::jsonb`),
  validation: jsonb("validation").$type<DisruptionValidation>(),
  createdById: integer("created_by_id").references(() => users.id),
  resolvedById: integer("resolved_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tone: text("tone").$type<Tone>().notNull().default("info"),
    href: text("href"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  payload: jsonb("payload").$type<AssistantPayload>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type GroupRow = typeof studentGroups.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type OfferingRow = typeof offerings.$inferSelect;
export type SessionRow = typeof scheduledSessions.$inferSelect;
export type VersionRow = typeof scheduleVersions.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type ExamRow = typeof exams.$inferSelect;
export type DisruptionRow = typeof disruptions.$inferSelect;
export type ChangeRequestRow = typeof changeRequests.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AuditRow = typeof auditLogs.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type AssistantMessageRow = typeof assistantMessages.$inferSelect;

/* Official Crunch Week (CIT) pipeline runs — produced by the CP-SAT engine,
   checked by the official validator. Never hand-edited. */
export const officialRuns = pgTable("official_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"schedule" | "disruption">().notNull(),
  label: text("label").notNull(),
  datasetId: text("dataset_id").notNull(),
  createdById: integer("created_by_id").references(() => users.id),
  schedule: jsonb("schedule").notNull(),
  report: jsonb("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OfficialRunRow = typeof officialRuns.$inferSelect;

/* ------------------------------------------------------------------ */
/* Teacher coursework: syllabus, assignments, class resources          */
/* ------------------------------------------------------------------ */
export type AssignmentKind = "assignment" | "quiz" | "project" | "lab";
export type AssignmentStatus = "draft" | "published" | "closed";
export type ResourceKind = "link" | "note" | "file" | "reference";

export const syllabusUnits = pgTable(
  "syllabus_units",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topics: text("topics").notNull().default(""),
    plannedHours: integer("planned_hours").notNull().default(1),
    orderIndex: integer("order_index").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    createdById: integer("created_by_id").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("syllabus_course_idx").on(t.courseId)],
);

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").$type<AssignmentKind>().notNull().default("assignment"),
    status: text("status").$type<AssignmentStatus>().notNull().default("draft"),
    dueDate: date("due_date", { mode: "string" }),
    maxMarks: integer("max_marks").notNull().default(10),
    groupIds: integer("group_ids").array().notNull().default(sql`'{}'::integer[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assignments_course_idx").on(t.courseId)],
);

export const courseResources = pgTable(
  "course_resources",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    url: text("url"),
    kind: text("kind").$type<ResourceKind>().notNull().default("link"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resources_course_idx").on(t.courseId)],
);

export type SyllabusUnitRow = typeof syllabusUnits.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;
export type CourseResourceRow = typeof courseResources.$inferSelect;

/* ------------------------------------------------------------------ */
/* Access requests — public users request an account; admin approves  */
/* ------------------------------------------------------------------ */
export type AccessRequestStatus = "pending" | "approved" | "rejected";

export const accessRequests = pgTable(
  "access_requests",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    requestedRole: text("requested_role").$type<Role>().notNull(),
    departmentId: integer("department_id").references(() => departments.id),
    clubId: integer("club_id").references(() => clubs.id),
    reason: text("reason").notNull(),
    status: text("status").$type<AccessRequestStatus>().notNull().default("pending"),
    reviewedById: integer("reviewed_by_id").references(() => users.id),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_requests_email_idx").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Booking priority configuration — admin-configurable priority order */
/* ------------------------------------------------------------------ */
export const bookingPriorities = pgTable(
  "booking_priorities",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull().unique(),
    priorityOrder: integer("priority_order").notNull(),
    updatedById: integer("updated_by_id").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_priorities_order_idx").on(t.priorityOrder)],
);

export type AccessRequestRow = typeof accessRequests.$inferSelect;
export type BookingPriorityRow = typeof bookingPriorities.$inferSelect;

/* ------------------------------------------------------------------ */
/* Password reset tokens                                              */
/* ------------------------------------------------------------------ */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_token_idx").on(t.token)],
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
