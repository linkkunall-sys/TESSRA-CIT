import { DAY_COUNT, INSTITUTE_TIME_ZONE, PERIOD_COUNT, PERIOD_MINUTES, PERIODS } from "./constants";

/** Standard result returned by every server action consumed through <ActionForm>. */
export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  suggestions?: { id: number; code: string; name: string; capacity: number }[];
  /** Where the client should navigate after a successful action (used by sign-in). */
  redirectTo?: string;
  at?: number;
} | null;

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ---------------------------------- Names --------------------------------- */
const TITLE_RE = /^(dr|prof|mr|ms|mrs)\.?\s+/i;

export function stripTitle(name: string) {
  return name.replace(TITLE_RE, "").trim();
}

export function initials(name: string) {
  const parts = stripTitle(name).split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function shortName(name: string) {
  const title = name.match(TITLE_RE)?.[0]?.trim() ?? "";
  const parts = stripTitle(name).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${title ? `${title} ` : ""}${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export function firstName(name: string) {
  const title = name.match(TITLE_RE)?.[0]?.trim();
  const parts = stripTitle(name).split(/\s+/);
  return title ? `${title} ${parts[parts.length - 1]}` : parts[0];
}

/* ------------------------------ Time & periods ----------------------------- */
export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function periodsInRange(start: string, end: string) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return PERIODS.filter((p) => overlaps(s, e, toMinutes(p.start), toMinutes(p.end))).map((p) => p.n);
}

export function periodTime(start: number, duration = 1) {
  const a = PERIODS[start - 1];
  const b = PERIODS[start + duration - 2];
  return a && b ? `${a.start}–${b.end}` : "";
}

export function periodLabel(start: number, duration = 1) {
  return duration > 1 ? `P${start}–P${start + duration - 1}` : `P${start}`;
}

export function hoursFromPeriods(periods: number) {
  return Math.round(((periods * PERIOD_MINUTES) / 60) * 10) / 10;
}

export function isValidDay(d: number | null): d is number {
  return d !== null && Number.isInteger(d) && d >= 0 && d < DAY_COUNT;
}

export function isValidPeriod(p: number | null): p is number {
  return p !== null && Number.isInteger(p) && p >= 1 && p <= PERIOD_COUNT;
}

export function isValidTime(t: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/* ---------------------------------- Dates --------------------------------- */
export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: INSTITUTE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isIsoDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseIso(iso).getTime());
}

export function addDaysIso(iso: string, n: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

/** 0 = Monday … 4 = Friday, -1 for weekends. */
export function dayIndexFromIso(iso: string) {
  const g = parseIso(iso).getDay();
  return g >= 1 && g <= 5 ? g - 1 : -1;
}

export function currentDayIndex() {
  return dayIndexFromIso(todayIso());
}

export function formatDate(iso: string) {
  return parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function formatDateLong(iso: string) {
  return parseIso(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(d: Date) {
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(d: Date) {
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function daysUntil(iso: string) {
  return Math.round((parseIso(iso).getTime() - parseIso(todayIso()).getTime()) / 86400000);
}

export function relativeDay(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < 0 && n > -7) return `${-n} days ago`;
  return formatDate(iso);
}

/* --------------------------------- Numbers -------------------------------- */
export function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------- Form helpers ------------------------------ */
export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function num(fd: FormData, key: string) {
  const v = str(fd, key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ok(message: string, extra?: Partial<NonNullable<ActionState>>): ActionState {
  return { ok: true, message, at: Date.now(), ...extra };
}

export function fail(
  message: string,
  fieldErrors?: Record<string, string>,
  extra?: Partial<NonNullable<ActionState>>,
): ActionState {
  return { ok: false, message, fieldErrors, at: Date.now(), ...extra };
}
