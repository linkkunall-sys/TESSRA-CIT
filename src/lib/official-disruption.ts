import type { OfficialDataset, ValidatorReport } from "./official";

export type OfficialChange =
  | { type: "faculty_unavailable"; faculty_id: string; days: string[]; periods: number[]; reason?: string }
  | { type: "room_unavailable"; room_id: string; days: string[]; periods: number[]; reason?: string }
  | { type: "add_faculty"; faculty: OfficialDataset["faculty"][number] }
  | { type: "add_session"; session: OfficialDataset["sessions"][number] }
  | { type: "remove_session"; session_id: string };

export type OfficialDisruption = {
  id?: string;
  dataset?: string;
  dataset_id?: string;
  description?: string;
  changes: OfficialChange[];
};

export type DisruptionSummary = Record<OfficialChange["type"], number>;

export type RepairWorkflow = {
  status: "proposed" | "approved" | "rejected";
  baselineRunId: number;
  disruption: OfficialDisruption;
  summary: DisruptionSummary;
  sourceName: string;
  proposedAt: string;
  approvedAt?: string;
  approvedById?: number;
  rejectedAt?: string;
  rejectedById?: number;
};

export type StoredValidatorReport = ValidatorReport & { _workflow?: RepairWorkflow };

export type DisruptionValidation =
  | { ok: true; disruption: OfficialDisruption; summary: DisruptionSummary }
  | { ok: false; errors: string[] };

const TYPES = new Set(["faculty_unavailable", "room_unavailable", "add_faculty", "add_session", "remove_session"]);
const KINDS = new Set(["lecture", "tutorial", "lab"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[], at: string, errors: string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) errors.push(`${at} contains unsupported field(s): ${unknown.join(", ")}.`);
}

function validateDaysPeriods(change: Record<string, unknown>, days: Set<string>, at: string, errors: string[]) {
  if (!stringArray(change.days) || change.days.some((day) => !days.has(day))) {
    errors.push(`${at}.days must contain one or more official calendar days.`);
  }
  if (!Array.isArray(change.periods) || !change.periods.length || change.periods.some((period) => !integer(period, 1, 9))) {
    errors.push(`${at}.periods must contain teaching periods P1–P9.`);
  }
}

/** Strictly validates the organiser change-file format before CP-SAT sees it. */
export function validateOfficialDisruption(value: unknown, data: OfficialDataset): DisruptionValidation {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ["The JSON root must be an object."] };
  rejectUnknownKeys(value, ["id", "dataset", "dataset_id", "description", "changes"], "root", errors);

  for (const declaredDataset of [value.dataset, value.dataset_id]) {
    if (declaredDataset !== undefined && declaredDataset !== data.dataset_id) {
      errors.push(`This change file targets ${String(declaredDataset)}, not ${data.dataset_id}.`);
    }
  }
  if (value.id !== undefined && !nonEmptyString(value.id)) errors.push("id must be a non-empty string when provided.");
  if (value.description !== undefined && typeof value.description !== "string") errors.push("description must be a string when provided.");
  if (!Array.isArray(value.changes) || value.changes.length === 0) {
    errors.push("changes must be a non-empty array.");
    return { ok: false, errors };
  }
  if (value.changes.length > 100) errors.push("A change file may contain at most 100 changes.");

  const days = new Set(data.calendar.days);
  const facultyIds = new Set(data.faculty.map((faculty) => faculty.id));
  const roomIds = new Set(data.rooms.map((room) => room.id));
  const groupIds = new Set(data.student_groups.map((group) => group.id));
  const courseIds = new Set(data.courses.map((course) => course.id));
  const roomTypes = new Set(data.rooms.map((room) => room.type));
  const sessionIds = new Set(data.sessions.map((session) => session.id));
  const removed = new Set<string>();
  const changes: OfficialChange[] = [];
  const summary: Record<OfficialChange["type"], number> = {
    faculty_unavailable: 0,
    room_unavailable: 0,
    add_faculty: 0,
    add_session: 0,
    remove_session: 0,
  };

  value.changes.forEach((raw, index) => {
    const at = `changes[${index}]`;
    if (!record(raw)) {
      errors.push(`${at} must be an object.`);
      return;
    }
    if (!nonEmptyString(raw.type) || !TYPES.has(raw.type)) {
      errors.push(`${at}.type is unsupported.`);
      return;
    }

    if (raw.type === "faculty_unavailable") {
      rejectUnknownKeys(raw, ["type", "faculty_id", "days", "periods", "reason"], at, errors);
      if (!nonEmptyString(raw.faculty_id) || !facultyIds.has(raw.faculty_id)) errors.push(`${at}.faculty_id is unknown.`);
      validateDaysPeriods(raw, days, at, errors);
      if (raw.reason !== undefined && typeof raw.reason !== "string") errors.push(`${at}.reason must be a string.`);
    } else if (raw.type === "room_unavailable") {
      rejectUnknownKeys(raw, ["type", "room_id", "days", "periods", "reason"], at, errors);
      if (!nonEmptyString(raw.room_id) || !roomIds.has(raw.room_id)) errors.push(`${at}.room_id is unknown.`);
      validateDaysPeriods(raw, days, at, errors);
      if (raw.reason !== undefined && typeof raw.reason !== "string") errors.push(`${at}.reason must be a string.`);
    } else if (raw.type === "add_faculty") {
      rejectUnknownKeys(raw, ["type", "faculty"], at, errors);
      const faculty = raw.faculty;
      if (!record(faculty)) {
        errors.push(`${at}.faculty must be an object.`);
      } else {
        rejectUnknownKeys(faculty, ["id", "name", "department", "max_hours_per_day", "needs_accessible", "unavailable", "preferences"], `${at}.faculty`, errors);
        if (!nonEmptyString(faculty.id)) errors.push(`${at}.faculty.id is required.`);
        else if (facultyIds.has(faculty.id)) errors.push(`${at}.faculty.id ${faculty.id} already exists.`);
        if (!nonEmptyString(faculty.name)) errors.push(`${at}.faculty.name is required.`);
        if (!nonEmptyString(faculty.department)) errors.push(`${at}.faculty.department is required.`);
        if (!integer(faculty.max_hours_per_day, 1, 9)) errors.push(`${at}.faculty.max_hours_per_day must be 1–9.`);
        if (typeof faculty.needs_accessible !== "boolean") errors.push(`${at}.faculty.needs_accessible must be boolean.`);
        if (!Array.isArray(faculty.unavailable)) {
          errors.push(`${at}.faculty.unavailable must be an array.`);
        } else {
          faculty.unavailable.forEach((entry, unavailableIndex) => {
            const entryAt = `${at}.faculty.unavailable[${unavailableIndex}]`;
            if (!record(entry)) {
              errors.push(`${entryAt} must be an object.`);
            } else {
              rejectUnknownKeys(entry, ["day", "periods", "reason"], entryAt, errors);
              if (!nonEmptyString(entry.day) || !days.has(entry.day)) errors.push(`${entryAt}.day is invalid.`);
              if (!Array.isArray(entry.periods) || !entry.periods.length || entry.periods.some((period) => !integer(period, 1, 9))) errors.push(`${entryAt}.periods must contain P1–P9.`);
              if (entry.reason !== undefined && typeof entry.reason !== "string") errors.push(`${entryAt}.reason must be a string.`);
            }
          });
        }
        if (!Array.isArray(faculty.preferences)) {
          errors.push(`${at}.faculty.preferences must be an array.`);
        } else {
          faculty.preferences.forEach((preference, preferenceIndex) => {
            const preferenceAt = `${at}.faculty.preferences[${preferenceIndex}]`;
            if (!record(preference)) {
              errors.push(`${preferenceAt} must be an object.`);
            } else {
              rejectUnknownKeys(preference, ["type", "days", "periods", "note"], preferenceAt, errors);
              if (preference.type !== "avoid") errors.push(`${preferenceAt}.type must be avoid.`);
              if (!stringArray(preference.days) || preference.days.some((day) => !days.has(day))) errors.push(`${preferenceAt}.days contains an invalid day.`);
              if (!Array.isArray(preference.periods) || !preference.periods.length || preference.periods.some((period) => !integer(period, 1, 9))) errors.push(`${preferenceAt}.periods must contain P1–P9.`);
              if (preference.note !== undefined && typeof preference.note !== "string") errors.push(`${preferenceAt}.note must be a string.`);
            }
          });
        }
        if (nonEmptyString(faculty.id) && !facultyIds.has(faculty.id)) facultyIds.add(faculty.id);
      }
    } else if (raw.type === "add_session") {
      rejectUnknownKeys(raw, ["type", "session"], at, errors);
      const session = raw.session;
      if (!record(session)) {
        errors.push(`${at}.session must be an object.`);
      } else {
        rejectUnknownKeys(session, ["id", "course_id", "kind", "groups", "faculty_id", "size", "duration", "room_types", "needs_accessible", "basket_slot", "fixed_slot"], `${at}.session`, errors);
        if (!nonEmptyString(session.id)) errors.push(`${at}.session.id is required.`);
        else if (sessionIds.has(session.id)) errors.push(`${at}.session.id ${session.id} already exists.`);
        if (!nonEmptyString(session.course_id) || !courseIds.has(session.course_id)) errors.push(`${at}.session.course_id is unknown.`);
        if (!nonEmptyString(session.kind) || !KINDS.has(session.kind)) errors.push(`${at}.session.kind must be lecture, tutorial or lab.`);
        if (!stringArray(session.groups) || session.groups.some((group) => !groupIds.has(group))) errors.push(`${at}.session.groups contains an unknown group.`);
        if (!nonEmptyString(session.faculty_id) || !facultyIds.has(session.faculty_id)) errors.push(`${at}.session.faculty_id is unknown.`);
        if (!integer(session.size, 1, 5000)) errors.push(`${at}.session.size must be a positive integer.`);
        if (!integer(session.duration, 1, 9)) errors.push(`${at}.session.duration must be 1–9.`);
        if (!stringArray(session.room_types) || session.room_types.some((type) => !roomTypes.has(type))) errors.push(`${at}.session.room_types contains an unknown room type.`);
        if (typeof session.needs_accessible !== "boolean") errors.push(`${at}.session.needs_accessible must be boolean.`);
        if (session.basket_slot !== null && session.basket_slot !== undefined && !nonEmptyString(session.basket_slot)) errors.push(`${at}.session.basket_slot must be null or a string.`);
        if (session.fixed_slot !== null && session.fixed_slot !== undefined) {
          if (!record(session.fixed_slot)) {
            errors.push(`${at}.session.fixed_slot must contain a valid day and start_period.`);
          } else {
            rejectUnknownKeys(session.fixed_slot, ["day", "start_period"], `${at}.session.fixed_slot`, errors);
            if (!nonEmptyString(session.fixed_slot.day) || !days.has(session.fixed_slot.day) || !integer(session.fixed_slot.start_period, 1, 9)) {
              errors.push(`${at}.session.fixed_slot must contain a valid day and start_period.`);
            }
          }
        }
        if (nonEmptyString(session.id) && !sessionIds.has(session.id)) sessionIds.add(session.id);
      }
    } else if (raw.type === "remove_session") {
      rejectUnknownKeys(raw, ["type", "session_id"], at, errors);
      if (!nonEmptyString(raw.session_id) || !sessionIds.has(raw.session_id) || removed.has(raw.session_id)) {
        errors.push(`${at}.session_id must identify an existing, not-yet-removed session.`);
      } else {
        removed.add(raw.session_id);
        sessionIds.delete(raw.session_id);
      }
    }

    changes.push(raw as unknown as OfficialChange);
    summary[raw.type as OfficialChange["type"]] += 1;
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    disruption: {
      ...(nonEmptyString(value.id) ? { id: value.id } : {}),
      ...(nonEmptyString(value.dataset) ? { dataset: value.dataset } : {}),
      ...(nonEmptyString(value.dataset_id) ? { dataset_id: value.dataset_id } : {}),
      ...(typeof value.description === "string" ? { description: value.description } : {}),
      changes,
    },
    summary,
  };
}

/** Mirrors the organiser's apply semantics for rendering added/removed entities. */
export function applyOfficialDisruptionForDisplay(data: OfficialDataset, disruption?: OfficialDisruption): OfficialDataset {
  if (!disruption) return data;
  const next: OfficialDataset = {
    ...data,
    faculty: [...data.faculty],
    sessions: [...data.sessions],
    room_unavailability: [...data.room_unavailability],
  };
  for (const change of disruption.changes) {
    if (change.type === "faculty_unavailable") {
      next.faculty = next.faculty.map((faculty) =>
        faculty.id === change.faculty_id
          ? { ...faculty, unavailable: [...faculty.unavailable, ...change.days.map((day) => ({ day, periods: change.periods, reason: change.reason }))] }
          : faculty,
      );
    } else if (change.type === "room_unavailable") {
      next.room_unavailability.push(...change.days.map((day) => ({ room_id: change.room_id, day, periods: change.periods, reason: change.reason })));
    } else if (change.type === "add_faculty") {
      next.faculty.push(change.faculty);
    } else if (change.type === "add_session") {
      next.sessions.push(change.session);
    } else if (change.type === "remove_session") {
      next.sessions = next.sessions.filter((session) => session.id !== change.session_id);
    }
  }
  return next;
}

export function getRepairWorkflow(report: unknown): RepairWorkflow | null {
  if (!record(report) || !record(report._workflow)) return null;
  const workflow = report._workflow;
  if (!(["proposed", "approved", "rejected"] as unknown[]).includes(workflow.status)) return null;
  if (!integer(workflow.baselineRunId, 1, Number.MAX_SAFE_INTEGER) || !record(workflow.disruption) || !Array.isArray(workflow.disruption.changes)) return null;
  if (!record(workflow.summary) || !nonEmptyString(workflow.sourceName) || !nonEmptyString(workflow.proposedAt)) return null;
  return workflow as unknown as RepairWorkflow;
}

/** Internal workflow metadata is never included in the organiser report download. */
export function stripRepairWorkflow(report: unknown): ValidatorReport {
  const stored = report as StoredValidatorReport;
  const { _workflow: _ignored, ...officialReport } = stored;
  return officialReport as ValidatorReport;
}
