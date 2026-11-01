import type { OfficialDataset } from "./official";

export type OfficialDatasetValidation =
  | { ok: true; data: OfficialDataset }
  | { ok: false; errors: string[] };

const ROOT_KEYS = [
  "dataset_id",
  "institute",
  "calendar",
  "priority_order",
  "role_category_cap",
  "rooms",
  "room_unavailability",
  "faculty",
  "student_groups",
  "courses",
  "sessions",
  "booking_requests",
  "cancellations",
  "exams",
];
const SESSION_KINDS = new Set(["lecture", "tutorial", "lab"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function integer(value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function stringArray(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(nonEmptyString);
}

function unique(values: string[]) {
  return new Set(values).size === values.length;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Strict validation for the organiser dataset format before solver execution. */
export function validateOfficialDataset(value: unknown): OfficialDatasetValidation {
  const errors: string[] = [];
  const add = (message: string) => {
    if (errors.length < 100) errors.push(message);
  };
  const objectKeys = (item: Record<string, unknown>, allowed: string[], at: string) => {
    const unknown = Object.keys(item).filter((key) => !allowed.includes(key));
    if (unknown.length) add(`${at} contains unsupported field(s): ${unknown.join(", ")}.`);
  };
  const array = (item: Record<string, unknown>, key: string, max: number) => {
    const found = item[key];
    if (!Array.isArray(found)) {
      add(`${key} must be an array.`);
      return [] as unknown[];
    }
    if (found.length > max) add(`${key} exceeds the supported limit of ${max}.`);
    return found;
  };
  const ids = (items: unknown[], at: string) => {
    const values: string[] = [];
    items.forEach((item, index) => {
      if (!record(item) || !nonEmptyString(item.id)) add(`${at}[${index}].id must be a non-empty string.`);
      else values.push(item.id);
    });
    if (!unique(values)) add(`${at} contains duplicate IDs.`);
    return new Set(values);
  };

  if (!record(value)) return { ok: false, errors: ["The dataset JSON root must be an object."] };
  objectKeys(value, ROOT_KEYS, "root");
  for (const key of ROOT_KEYS) if (!(key in value)) add(`root.${key} is required.`);
  if (!nonEmptyString(value.dataset_id)) add("dataset_id must be a non-empty string.");
  if (!nonEmptyString(value.institute)) add("institute must be a non-empty string.");

  const calendar = record(value.calendar) ? value.calendar : null;
  if (!calendar) add("calendar must be an object.");
  else {
    objectKeys(calendar, ["days", "periods", "lunch", "lab_start_periods", "event_only_periods", "fest_week", "exam_week"], "calendar");
    if (calendar.fest_week !== undefined && !nonEmptyString(calendar.fest_week)) add("calendar.fest_week must be a non-empty string when provided.");
  }
  const days = calendar && stringArray(calendar.days, false) ? calendar.days : [];
  if (!days.length || !unique(days)) add("calendar.days must be a non-empty list of unique day IDs.");
  const dayIds = new Set(days);
  const periods = calendar && Array.isArray(calendar.periods) ? calendar.periods : [];
  if (!periods.length) add("calendar.periods must be a non-empty array.");
  const periodIds: number[] = [];
  periods.forEach((period, index) => {
    const at = `calendar.periods[${index}]`;
    if (!record(period)) return add(`${at} must be an object.`);
    objectKeys(period, ["id", "start", "end", "teaching"], at);
    if (!integer(period.id, 1, 100)) add(`${at}.id must be an integer from 1 to 100.`);
    else periodIds.push(period.id);
    if (!validTime(period.start) || !validTime(period.end)) add(`${at} must contain HH:MM start and end values.`);
    else if (String(period.start) >= String(period.end)) add(`${at}.end must be later than start.`);
    if (typeof period.teaching !== "boolean") add(`${at}.teaching must be boolean.`);
  });
  if (new Set(periodIds).size !== periodIds.length) add("calendar.periods contains duplicate IDs.");
  const periodIdSet = new Set(periodIds);
  const teachingPeriodIds = new Set(periods.filter((period) => record(period) && period.teaching === true && integer(period.id, 1, 100)).map((period) => (period as Record<string, unknown>).id as number));
  if (calendar) {
    if (!record(calendar.lunch)) {
      add("calendar.lunch must contain after_period, start and end.");
    } else {
      objectKeys(calendar.lunch, ["after_period", "start", "end"], "calendar.lunch");
      if (!integer(calendar.lunch.after_period, 1, 100) || !periodIdSet.has(calendar.lunch.after_period) || !validTime(calendar.lunch.start) || !validTime(calendar.lunch.end)) {
        add("calendar.lunch must reference a period and contain valid start and end times.");
      } else if (String(calendar.lunch.start) >= String(calendar.lunch.end)) add("calendar.lunch.end must be later than start.");
    }
    if (!Array.isArray(calendar.lab_start_periods) || !unique(calendar.lab_start_periods.map(String)) || calendar.lab_start_periods.some((period) => !integer(period, 1, 100) || !teachingPeriodIds.has(period))) {
      add("calendar.lab_start_periods must contain unique teaching-period IDs.");
    }
    if (calendar.event_only_periods !== undefined && (!Array.isArray(calendar.event_only_periods) || !unique(calendar.event_only_periods.map(String)) || calendar.event_only_periods.some((period) => !integer(period, 1, 100) || !periodIdSet.has(period)))) {
      add("calendar.event_only_periods must contain unique calendar period IDs.");
    }
    if (!record(calendar.exam_week) || !stringArray(calendar.exam_week.days, false) || !unique(calendar.exam_week.days) || !Array.isArray(calendar.exam_week.sessions) || !calendar.exam_week.sessions.length) {
      add("calendar.exam_week must contain unique non-empty days and a non-empty sessions array.");
    } else {
      objectKeys(calendar.exam_week, ["days", "sessions"], "calendar.exam_week");
      const examSessionIds: string[] = [];
      calendar.exam_week.sessions.forEach((session, index) => {
        const at = `calendar.exam_week.sessions[${index}]`;
        if (!record(session) || !nonEmptyString(session.id)) return add(`${at}.id is required.`);
        objectKeys(session, ["id", "start", "end"], at);
        examSessionIds.push(session.id);
        if (!validTime(session.start) || !validTime(session.end)) add(`${at} must contain HH:MM start and end values.`);
        else if (String(session.start) >= String(session.end)) add(`${at}.end must be later than start.`);
      });
      if (!unique(examSessionIds)) add("calendar.exam_week.sessions contains duplicate IDs.");
    }
  }

  const priorityOrder = stringArray(value.priority_order, false) ? value.priority_order : [];
  if (!priorityOrder.length || !unique(priorityOrder)) add("priority_order must contain unique category IDs.");
  const prioritySet = new Set(priorityOrder);
  const roleCaps = record(value.role_category_cap) ? value.role_category_cap : {};
  if (!record(value.role_category_cap) || !Object.keys(roleCaps).length) add("role_category_cap must be a non-empty object.");
  else {
    for (const [role, category] of Object.entries(roleCaps)) {
      if (!nonEmptyString(role) || !nonEmptyString(category) || !prioritySet.has(category)) add(`role_category_cap.${role} must reference priority_order.`);
    }
  }

  const rooms = array(value, "rooms", 500);
  if (!rooms.length) add("rooms must contain at least one room.");
  const roomIds = ids(rooms, "rooms");
  const roomTypes = new Set<string>();
  rooms.forEach((room, index) => {
    const at = `rooms[${index}]`;
    if (!record(room)) return add(`${at} must be an object.`);
    objectKeys(room, ["id", "name", "building", "type", "capacity", "features", "accessible", "allowed_uses"], at);
    if (!nonEmptyString(room.name) || !nonEmptyString(room.building) || !nonEmptyString(room.type)) add(`${at} requires name, building and type.`);
    else roomTypes.add(room.type);
    if (!integer(room.capacity, 1, 100000)) add(`${at}.capacity must be a positive integer.`);
    if (!stringArray(room.features) || !unique(room.features) || !stringArray(room.allowed_uses) || !unique(room.allowed_uses)) add(`${at}.features and allowed_uses must be unique string arrays.`);
    if (typeof room.accessible !== "boolean") add(`${at}.accessible must be boolean.`);
  });

  const faculty = array(value, "faculty", 2000);
  if (!faculty.length) add("faculty must contain at least one person.");
  const facultyIds = ids(faculty, "faculty");
  faculty.forEach((person, index) => {
    const at = `faculty[${index}]`;
    if (!record(person)) return add(`${at} must be an object.`);
    objectKeys(person, ["id", "name", "department", "max_hours_per_day", "needs_accessible", "unavailable", "preferences"], at);
    if (!nonEmptyString(person.name) || !nonEmptyString(person.department)) add(`${at} requires name and department.`);
    if (!integer(person.max_hours_per_day, 1, 24)) add(`${at}.max_hours_per_day must be 1–24.`);
    if (typeof person.needs_accessible !== "boolean") add(`${at}.needs_accessible must be boolean.`);
    if (!Array.isArray(person.unavailable) || !Array.isArray(person.preferences)) add(`${at}.unavailable and preferences must be arrays.`);
    else {
      person.unavailable.forEach((entry, unavailableIndex) => {
        const entryAt = `${at}.unavailable[${unavailableIndex}]`;
        if (!record(entry)) return add(`${entryAt} must be an object.`);
        objectKeys(entry, ["day", "periods", "reason"], entryAt);
        if (!nonEmptyString(entry.day) || !dayIds.has(entry.day) || !Array.isArray(entry.periods) || !entry.periods.length || !unique(entry.periods.map(String)) || entry.periods.some((period) => !integer(period, 1, 100) || !teachingPeriodIds.has(period))) {
          add(`${entryAt} must reference an official day and unique teaching-period IDs.`);
        }
        if (entry.reason !== undefined && typeof entry.reason !== "string") add(`${entryAt}.reason must be a string.`);
      });
      person.preferences.forEach((preference, preferenceIndex) => {
        const preferenceAt = `${at}.preferences[${preferenceIndex}]`;
        if (!record(preference)) return add(`${preferenceAt} must be an object.`);
        objectKeys(preference, ["type", "days", "periods", "note"], preferenceAt);
        if (preference.type !== "avoid") add(`${preferenceAt}.type must be avoid.`);
        if (!stringArray(preference.days, false) || !unique(preference.days) || preference.days.some((day) => !dayIds.has(day))) add(`${preferenceAt}.days must contain unique official days.`);
        if (!Array.isArray(preference.periods) || !preference.periods.length || !unique(preference.periods.map(String)) || preference.periods.some((period) => !integer(period, 1, 100) || !teachingPeriodIds.has(period))) add(`${preferenceAt}.periods must contain unique teaching-period IDs.`);
        if (preference.note !== undefined && typeof preference.note !== "string") add(`${preferenceAt}.note must be a string.`);
      });
    }
  });

  const groups = array(value, "student_groups", 2000);
  if (!groups.length) add("student_groups must contain at least one group.");
  const groupIds = ids(groups, "student_groups");
  groups.forEach((group, index) => {
    const at = `student_groups[${index}]`;
    if (!record(group)) return add(`${at} must be an object.`);
    objectKeys(group, ["id", "name", "year", "department", "size", "needs_accessible"], at);
    if (!nonEmptyString(group.name) || !nonEmptyString(group.department)) add(`${at} requires name and department.`);
    if (!integer(group.year, 1, 20) || !integer(group.size, 1, 100000)) add(`${at}.year and size must be positive integers.`);
    if (typeof group.needs_accessible !== "boolean") add(`${at}.needs_accessible must be boolean.`);
  });

  const courses = array(value, "courses", 5000);
  if (!courses.length) add("courses must contain at least one course.");
  const courseIds = ids(courses, "courses");
  courses.forEach((course, index) => {
    const at = `courses[${index}]`;
    if (!record(course)) return add(`${at} must be an object.`);
    objectKeys(course, ["id", "title", "name", "department", "year", "lecture_hours", "tutorial_hours", "lab_blocks"], at);
    if (!nonEmptyString(course.title) && !nonEmptyString(course.name)) add(`${at} requires title or name.`);
    if (!nonEmptyString(course.department) || !integer(course.year, 1, 20)) add(`${at} requires department and a valid year.`);
    for (const key of ["lecture_hours", "tutorial_hours", "lab_blocks"] as const) if (!integer(course[key], 0, 100)) add(`${at}.${key} must be a non-negative integer.`);
  });

  const sessions = array(value, "sessions", 20000);
  if (!sessions.length) add("sessions must contain at least one session.");
  ids(sessions, "sessions");
  sessions.forEach((session, index) => {
    const at = `sessions[${index}]`;
    if (!record(session)) return add(`${at} must be an object.`);
    objectKeys(session, ["id", "course_id", "kind", "groups", "faculty_id", "size", "duration", "room_types", "needs_accessible", "basket_slot", "fixed_slot"], at);
    if (!nonEmptyString(session.course_id) || !courseIds.has(session.course_id)) add(`${at}.course_id is unknown.`);
    if (!nonEmptyString(session.faculty_id) || !facultyIds.has(session.faculty_id)) add(`${at}.faculty_id is unknown.`);
    if (!nonEmptyString(session.kind) || !SESSION_KINDS.has(session.kind)) add(`${at}.kind must be lecture, tutorial or lab.`);
    if (!stringArray(session.groups, false) || !unique(session.groups) || session.groups.some((group) => !groupIds.has(group))) add(`${at}.groups must contain unique known groups.`);
    if (!integer(session.size, 1, 100000) || !integer(session.duration, 1, 24)) add(`${at}.size and duration must be positive integers.`);
    if (!stringArray(session.room_types, false) || !unique(session.room_types) || session.room_types.some((type) => !roomTypes.has(type))) add(`${at}.room_types must contain unique known room types.`);
    if (typeof session.needs_accessible !== "boolean") add(`${at}.needs_accessible must be boolean.`);
    if (session.basket_slot !== null && !nonEmptyString(session.basket_slot)) add(`${at}.basket_slot must be null or a string.`);
    if (session.fixed_slot !== null) {
      if (!record(session.fixed_slot)) {
        add(`${at}.fixed_slot must reference an official day and period.`);
      } else {
        objectKeys(session.fixed_slot, ["day", "start_period"], `${at}.fixed_slot`);
        if (!nonEmptyString(session.fixed_slot.day) || !dayIds.has(session.fixed_slot.day) || !integer(session.fixed_slot.start_period, 1, 100) || !teachingPeriodIds.has(session.fixed_slot.start_period)) {
          add(`${at}.fixed_slot must reference an official day and teaching period.`);
        } else if (integer(session.duration, 1, 24)) {
          const fixedStart = session.fixed_slot.start_period;
          if (Array.from({ length: session.duration }, (_, offset) => fixedStart as number + offset).some((period) => !teachingPeriodIds.has(period))) {
            add(`${at}.fixed_slot does not fit entirely within teaching periods.`);
          }
        }
      }
    }
    if (session.kind === "lab" && record(session.fixed_slot) && Array.isArray(calendar?.lab_start_periods) && !calendar.lab_start_periods.includes(session.fixed_slot.start_period)) {
      add(`${at}.fixed_slot must use a calendar.lab_start_periods value for a lab.`);
    }
  });

  const roomUnavailability = array(value, "room_unavailability", 10000);
  roomUnavailability.forEach((entry, index) => {
    const at = `room_unavailability[${index}]`;
    if (!record(entry)) return add(`${at} must be an object.`);
    objectKeys(entry, ["room_id", "day", "periods", "reason"], at);
    if (!nonEmptyString(entry.room_id) || !roomIds.has(entry.room_id) || !nonEmptyString(entry.day) || !dayIds.has(entry.day) || !Array.isArray(entry.periods) || !entry.periods.length || !unique(entry.periods.map(String)) || entry.periods.some((period) => !integer(period, 1, 100) || !teachingPeriodIds.has(period))) {
      add(`${at} must reference a known room, day and unique teaching-period IDs.`);
    }
    if (entry.reason !== undefined && typeof entry.reason !== "string") add(`${at}.reason must be a string.`);
  });

  const bookings = array(value, "booking_requests", 5000);
  const bookingIds = ids(bookings, "booking_requests");
  bookings.forEach((request, index) => {
    const at = `booking_requests[${index}]`;
    if (!record(request)) return add(`${at} must be an object.`);
    objectKeys(request, ["id", "submitted_at", "requester", "role", "department", "requested_category", "title", "attendance", "duration_periods", "windows", "room_types", "needs", "requested_room", "mandatory_for_groups", "series_id", "raw_text"], at);
    if (!nonEmptyString(request.submitted_at) || Number.isNaN(Date.parse(request.submitted_at))) add(`${at}.submitted_at must be an ISO date-time.`);
    if (!nonEmptyString(request.requester) || !nonEmptyString(request.role) || !nonEmptyString(request.requested_category) || !nonEmptyString(request.title)) add(`${at} requires requester, role, category and title.`);
    if (nonEmptyString(request.role) && !Object.prototype.hasOwnProperty.call(roleCaps, request.role)) add(`${at}.role is not declared in role_category_cap.`);
    if (nonEmptyString(request.requested_category) && !prioritySet.has(request.requested_category)) add(`${at}.requested_category is not declared in priority_order.`);
    if (request.department !== null && !nonEmptyString(request.department)) add(`${at}.department must be null or a string.`);
    if (!integer(request.attendance, 1, 100000) || !integer(request.duration_periods, 1, 48)) add(`${at}.attendance and duration_periods must be positive integers.`);
    if (!Array.isArray(request.windows) || !request.windows.length) add(`${at}.windows must be non-empty.`);
    else request.windows.forEach((window, windowIndex) => {
      const windowAt = `${at}.windows[${windowIndex}]`;
      if (!record(window)) return add(`${windowAt} must be an object.`);
      objectKeys(window, ["day", "from_period", "to_period"], windowAt);
      if (!nonEmptyString(window.day) || !dayIds.has(window.day) || !integer(window.from_period, 1, 48) || !integer(window.to_period, window.from_period as number, 48)) add(`${windowAt} is invalid.`);
      else if (integer(request.duration_periods, 1, 48) && window.to_period - window.from_period + 1 < request.duration_periods) add(`${windowAt} is shorter than duration_periods.`);
    });
    if (!stringArray(request.room_types, false) || !unique(request.room_types) || request.room_types.some((type) => !roomTypes.has(type))) add(`${at}.room_types must contain unique known room types.`);
    if (!stringArray(request.needs) || !unique(request.needs) || !stringArray(request.mandatory_for_groups) || !unique(request.mandatory_for_groups) || request.mandatory_for_groups.some((group) => !groupIds.has(group))) add(`${at}.needs or mandatory_for_groups is invalid.`);
    // The organiser dataset intentionally permits a free-form requested-room alias (for example LHC-5),
    // so only the type is validated here; placed room IDs remain strict references.
    if (request.requested_room !== null && !nonEmptyString(request.requested_room)) add(`${at}.requested_room must be null or a string.`);
    if (request.series_id !== null && !nonEmptyString(request.series_id)) add(`${at}.series_id must be null or a string.`);
    if (!nonEmptyString(request.raw_text)) add(`${at}.raw_text is required.`);
  });

  const cancellations = array(value, "cancellations", 5000);
  const cancelledRequestIds: string[] = [];
  cancellations.forEach((cancellation, index) => {
    const at = `cancellations[${index}]`;
    if (!record(cancellation)) return add(`${at} must be an object.`);
    objectKeys(cancellation, ["request_id", "cancelled_at", "by", "note"], at);
    if (!nonEmptyString(cancellation.request_id) || !bookingIds.has(cancellation.request_id)) add(`${at}.request_id is unknown.`);
    else cancelledRequestIds.push(cancellation.request_id);
    if (cancellation.cancelled_at !== undefined && (!nonEmptyString(cancellation.cancelled_at) || Number.isNaN(Date.parse(cancellation.cancelled_at)))) add(`${at}.cancelled_at must be an ISO date-time.`);
    if (cancellation.by !== undefined && !nonEmptyString(cancellation.by)) add(`${at}.by must be a non-empty string.`);
    if (cancellation.note !== undefined && typeof cancellation.note !== "string") add(`${at}.note must be a string.`);
  });
  if (!unique(cancelledRequestIds)) add("cancellations contains duplicate request IDs.");

  const exams = array(value, "exams", 5000);
  ids(exams, "exams");
  exams.forEach((exam, index) => {
    const at = `exams[${index}]`;
    if (!record(exam)) return add(`${at} must be an object.`);
    objectKeys(exam, ["id", "course_ids", "groups", "size", "duration_hours"], at);
    if (!stringArray(exam.course_ids, false) || !unique(exam.course_ids) || exam.course_ids.some((course) => !courseIds.has(course))) add(`${at}.course_ids must contain unique known courses.`);
    if (!stringArray(exam.groups, false) || !unique(exam.groups) || exam.groups.some((group) => !groupIds.has(group))) add(`${at}.groups must contain unique known groups.`);
    if (!integer(exam.size, 1, 100000) || !integer(exam.duration_hours, 1, 24)) add(`${at}.size and duration_hours must be positive integers.`);
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: value as unknown as OfficialDataset };
}
