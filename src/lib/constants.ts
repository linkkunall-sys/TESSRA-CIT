import type {
  ChangeType,
  DisruptionType,
  Priority,
  RequestStatus,
  Role,
  RoomStatus,
  RoomType,
  SessionKind,
} from "@/db/schema";

export type { ChangeType, DisruptionType, Priority, RequestStatus, Role, RoomStatus, RoomType, SessionKind };

export const PRODUCT = {
  name: "TESSRA CIT",
  descriptor: "Chilika Institute of Technology",
  tagline: "One CIT workspace for schedules, resources, bookings, and decisions.",
  summary:
    "The directly editable campus operations workspace for Chilika Institute of Technology, powered exclusively by the CIT CrunchWeek dataset.",
};

/** Institute calendar dates are interpreted in Indian Standard Time, including on UTC serverless hosts. */
export const INSTITUTE_TIME_ZONE = "Asia/Kolkata";

export const ROLES: Role[] = ["admin", "coordinator", "faculty", "club"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Department Coordinator",
  faculty: "Faculty",
  club: "Club Representative",
};

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  coordinator: "/coordinator",
  faculty: "/faculty",
  club: "/club",
};

export const ROLE_WORKSPACE: Record<Role, string> = {
  admin: "Admin workspace",
  coordinator: "Coordinator workspace",
  faculty: "Faculty workspace",
  club: "Club workspace",
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const DAY_COUNT = 5;
// The role workspaces use the same teaching-day model as the official CIT
// dataset: nine one-hour periods, with lunch between P5 and P6. Event-only
// P10–P13 belong to venue bookings and therefore are not teaching-grid rows.
export const PERIOD_COUNT = 9;
export const PERIOD_MINUTES = 60;

export const PERIODS: { n: number; start: string; end: string }[] = [
  { n: 1, start: "08:00", end: "09:00" },
  { n: 2, start: "09:00", end: "10:00" },
  { n: 3, start: "10:00", end: "11:00" },
  { n: 4, start: "11:00", end: "12:00" },
  { n: 5, start: "12:00", end: "13:00" },
  { n: 6, start: "14:00", end: "15:00" },
  { n: 7, start: "15:00", end: "16:00" },
  { n: 8, start: "16:00", end: "17:00" },
  { n: 9, start: "17:00", end: "18:00" },
];

/** Multi-period sessions may not span the lunch break that follows this period. */
export const LUNCH = { afterPeriod: 5, start: "13:00", end: "14:00" };

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  lecture: "Lecture hall",
  lab: "Laboratory",
  seminar: "Seminar room",
  auditorium: "Auditorium",
  exam_hall: "Examination hall",
  outdoor: "Outdoor venue",
};

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  active: "Active",
  maintenance: "Under maintenance",
  inactive: "Inactive",
};

export const KIND_LABEL: Record<SessionKind, string> = {
  lecture: "Lecture",
  lab: "Lab",
  tutorial: "Tutorial",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  reschedule: "Reschedule",
  room_change: "Room change",
  extra_class: "New class",
};

export const DISRUPTION_TYPE_LABEL: Record<DisruptionType, string> = {
  faculty_absence: "Faculty absence",
  room_unavailable: "Room unavailable",
};

export const BOOKING_CATEGORIES: { value: string; label: string }[] = [
  { value: "exam", label: "Examination" },
  { value: "regular_session", label: "Regular session" },
  { value: "institute_event", label: "Institute event" },
  { value: "guest_lecture", label: "Guest lecture" },
  { value: "department_event", label: "Department event" },
  { value: "club_event", label: "Club event" },
];

export function categoryLabel(value: string) {
  return BOOKING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const ROOM_FEATURES = ["projector", "pa_system", "stage", "ac", "computers", "power_benches"];

export const BOOKING_NEEDS = [
  "Projector",
  "Audio system",
  "Microphones",
  "Stage lighting",
  "Air conditioning",
  "Recording",
  "Wi-Fi access",
  "Lab workstations",
  "Power benches",
  "Accessibility",
];

/** Match human-facing request labels to both CIT source feature codes and manually entered legacy labels. */
export function roomSupportsBookingNeed(features: string[], accessible: boolean, need: string) {
  const available = new Set(features.map((feature) => feature.toLowerCase().replace(/[ -]+/g, "_")));
  switch (need) {
    case "Accessibility":
      return accessible;
    case "Audio system":
    case "Microphones":
      return available.has("pa_system") || available.has("audio_system");
    case "Stage lighting":
      return available.has("stage") || available.has("stage_lighting");
    case "Air conditioning":
      return available.has("ac") || available.has("air_conditioning");
    case "Recording":
      return available.has("recording") || available.has("lecture_capture");
    case "Wi-Fi access":
      return available.has("wi_fi") || available.has("wifi");
    case "Lab workstations":
      return available.has("computers") || available.has("lab_workstations");
    case "Power benches":
      return available.has("power_benches");
    default:
      return available.has(need.toLowerCase().replace(/[ -]+/g, "_"));
  }
}

export const DEMO_PASSWORD = "tessra123";

export const DEMO_ACCOUNTS: { role: Role; email: string; name: string; detail: string }[] = [
  { role: "admin", email: "spectra.core.team@cit.ac.in", name: "Spectra Core Team", detail: "Institute event administration" },
  { role: "coordinator", email: "ece.department@cit.ac.in", name: "ECE Department", detail: "Department coordination" },
  { role: "faculty", email: "f01@cit.ac.in", name: "Dr. Ananya Mishra", detail: "Faculty · CSE" },
  { role: "club", email: "coding.club@cit.ac.in", name: "Coding Club", detail: "Club representative" },
];
