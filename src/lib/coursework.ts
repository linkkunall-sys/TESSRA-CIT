/**
 * Teacher coursework data: syllabus, assignments and class resources.
 *
 * Access rules (enforced in course-access.ts and re-checked in every action):
 *  - admin: every course
 *  - faculty: only courses they hold a teaching assignment (offering) for
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { CurrentUser } from "./auth";
import { getRef } from "./queries";

export type CourseCard = {
  courseId: number;
  code: string;
  title: string;
  kind: t.SessionKind;
  departmentId: number;
  facultyNames: string[];
  groups: { id: number; code: string; size: number }[];
  units: number;
  completedUnits: number;
  plannedHours: number;
  assignments: number;
  published: number;
  openDue: number;
  resources: number;
  sessionsPerWeek: number;
  periodId: number | null;
};

export const getAvailableCourses = cache(async (user: Pick<CurrentUser, "role" | "id">) => {
  const ref = await getRef();
  const offerings = user.role === "admin" ? ref.offerings : ref.offerings.filter((o) => o.facultyId === user.id);
  const courseIds = [...new Set(offerings.map((o) => o.courseId))];
  const courses = ref.courses.filter((c) => courseIds.includes(c.id));
  return { ref, offerings, courses };
});

export const getCoursework = cache(async (user: Pick<CurrentUser, "role" | "id">) => {
  const { ref, offerings, courses } = await getAvailableCourses(user);
  const courseIds = courses.map((c) => c.id);
  const [units, assigns, resources] = courseIds.length
    ? await Promise.all([
        db.select().from(t.syllabusUnits).where(inArray(t.syllabusUnits.courseId, courseIds)).orderBy(asc(t.syllabusUnits.orderIndex), asc(t.syllabusUnits.id)),
        db.select().from(t.assignments).where(inArray(t.assignments.courseId, courseIds)).orderBy(desc(t.assignments.dueDate), desc(t.assignments.id)),
        db.select().from(t.courseResources).where(inArray(t.courseResources.courseId, courseIds)).orderBy(desc(t.courseResources.pinned), desc(t.courseResources.id)),
      ])
    : [[], [], []];
  const today = new Date().toISOString().slice(0, 10);
  const cards: CourseCard[] = courses.map((c) => {
    const mine = offerings.filter((o) => o.courseId === c.id);
    const groups = [...new Set(mine.flatMap((o) => o.groupIds))]
      .map((id) => ref.groupMap.get(id))
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map((g) => ({ id: g.id, code: g.code, size: g.size }));
    const cu = units.filter((u) => u.courseId === c.id);
    const ca = assigns.filter((a) => a.courseId === c.id);
    return {
      courseId: c.id,
      code: c.code,
      title: c.title,
      kind: c.kind,
      departmentId: c.departmentId,
      facultyNames: [...new Set(mine.map((o) => ref.personMap.get(o.facultyId)?.name ?? ""))].filter(Boolean),
      groups,
      units: cu.length,
      completedUnits: cu.filter((u) => u.completed).length,
      plannedHours: cu.reduce((n, u) => n + u.plannedHours, 0),
      assignments: ca.length,
      published: ca.filter((a) => a.status === "published").length,
      openDue: ca.filter((a) => a.status === "published" && (!a.dueDate || a.dueDate >= today)).length,
      resources: resources.filter((r) => r.courseId === c.id).length,
      sessionsPerWeek: mine.reduce((n, o) => n + o.sessionsPerWeek, 0),
      periodId: null,
    };
  });
  const facultyChoices = ref.faculty.map((f) => ({ id: f.id, name: f.name, departmentId: f.departmentId }));
  return { ref, cards, units, assigns, resources, facultyChoices };
});

export type CourseworkData = Awaited<ReturnType<typeof getCoursework>>;

export async function loadCourseUnits(courseId: number) {
  return db
    .select()
    .from(t.syllabusUnits)
    .where(eq(t.syllabusUnits.courseId, courseId))
    .orderBy(asc(t.syllabusUnits.orderIndex), asc(t.syllabusUnits.id));
}

export async function loadCourseAssignments(courseId: number) {
  return db.select().from(t.assignments).where(eq(t.assignments.courseId, courseId)).orderBy(desc(t.assignments.dueDate), desc(t.assignments.id));
}

export async function loadCourseResources(courseId: number) {
  return db.select().from(t.courseResources).where(eq(t.courseResources.courseId, courseId)).orderBy(desc(t.courseResources.pinned), desc(t.courseResources.id));
}

/** Admin oversight rows: one line per course, including courses with no content yet. */
export async function getCourseworkOversight() {
  const ref = await getRef();
  const [units, assigns, resources] = await Promise.all([
    db.select().from(t.syllabusUnits),
    db.select().from(t.assignments),
    db.select().from(t.courseResources),
  ]);
  return ref.courses.map((c) => {
    const cu = units.filter((u) => u.courseId === c.id);
    const ca = assigns.filter((a) => a.courseId === c.id);
    return {
      course: c,
      department: ref.deptMap.get(c.departmentId)?.code ?? "—",
      faculty: ref.offerings.filter((o) => o.courseId === c.id).map((o) => ref.personMap.get(o.facultyId)?.name ?? "").filter(Boolean),
      units: cu.length,
      completed: cu.filter((u) => u.completed).length,
      hours: cu.reduce((n, u) => n + u.plannedHours, 0),
      assignments: ca.length,
      published: ca.filter((a) => a.status === "published").length,
      resources: resources.filter((r) => r.courseId === c.id).length,
      lastUpdated: [...cu.map((u) => u.updatedAt), ...ca.map((a) => a.updatedAt)].sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  });
}

export async function canManageCourse(user: Pick<CurrentUser, "role" | "id">, courseId: number) {
  if (user.role === "admin") return true;
  if (user.role !== "faculty") return false;
  const [row] = await db
    .select({ id: t.offerings.id })
    .from(t.offerings)
    .where(and(eq(t.offerings.courseId, courseId), eq(t.offerings.facultyId, user.id)))
    .limit(1);
  return Boolean(row);
}
