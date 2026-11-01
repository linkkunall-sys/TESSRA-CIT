import { getPublishedTimetable, getRef } from "./queries";

/** Everything a department coordinator is allowed to see, derived from live data. */
export async function getDepartmentScope(departmentId: number | null) {
  const [ref, tt] = await Promise.all([getRef(), getPublishedTimetable()]);
  const department = departmentId ? ref.deptMap.get(departmentId) ?? null : null;
  const faculty = ref.faculty.filter((f) => f.departmentId === departmentId);
  const groups = ref.groups.filter((g) => g.departmentId === departmentId);
  const facultyIds = new Set(faculty.map((f) => f.id));
  const groupIds = new Set(groups.map((g) => g.id));
  const sessions = tt ? tt.sessions.filter((s) => facultyIds.has(s.facultyId) || s.groupIds.some((g) => groupIds.has(g))) : [];
  const sessionIds = new Set(sessions.map((s) => s.id));
  const issues = tt ? tt.issues.filter((i) => i.sessionIds.some((id) => sessionIds.has(id))) : [];
  const offerings = ref.offerings.filter((o) => facultyIds.has(o.facultyId) || o.groupIds.some((g) => groupIds.has(g)));
  const placedByOffering = new Map<number, number>();
  for (const s of sessions) if (s.offeringId) placedByOffering.set(s.offeringId, (placedByOffering.get(s.offeringId) ?? 0) + 1);
  const required = offerings.reduce((n, o) => n + o.sessionsPerWeek, 0);
  const placed = offerings.reduce((n, o) => n + Math.min(o.sessionsPerWeek, placedByOffering.get(o.id) ?? 0), 0);
  const blocks = tt ? tt.state.blockRows.filter((b) => facultyIds.has(b.facultyId)) : [];
  return { ref, tt, department, faculty, groups, facultyIds, groupIds, sessions, issues, offerings, required, placed, blocks };
}
