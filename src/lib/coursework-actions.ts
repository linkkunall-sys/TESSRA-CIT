"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import * as t from "@/db/schema";
import { requireRole } from "./auth";
import { canManageCourse } from "./coursework";
import { audit, notify } from "./engine";
import { fail, isIsoDate, num, ok, str, type ActionState } from "./utils";

const refresh = () => revalidatePath("/", "layout");

async function guard(courseId: number | null) {
  const user = await requireRole("admin", "faculty");
  if (!courseId) return { user, course: null, error: "Select a course." as const };
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId));
  if (!course) return { user, course: null, error: "Course not found." as const };
  if (!(await canManageCourse(user, course.id))) {
    return { user, course: null, error: "You can only manage coursework for courses you teach." as const };
  }
  return { user, course, error: null };
}

/* --------------------------------- syllabus -------------------------------- */
export async function saveSyllabusUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = num(fd, "courseId");
  const { user, course, error } = await guard(courseId);
  if (!course) return fail(error ?? "Course not found.");
  const id = num(fd, "id");
  const title = str(fd, "title");
  const topics = str(fd, "topics").slice(0, 2000);
  const plannedHours = num(fd, "plannedHours") ?? 1;
  const errors: Record<string, string> = {};
  if (title.length < 3) errors.title = "Give the unit a clear title";
  if (plannedHours < 1 || plannedHours > 40) errors.plannedHours = "1–40 hours";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  if (id) {
    const [unit] = await db.select().from(t.syllabusUnits).where(and(eq(t.syllabusUnits.id, id), eq(t.syllabusUnits.courseId, course.id)));
    if (!unit) return fail("Syllabus unit not found.");
    await db.update(t.syllabusUnits).set({ title, topics, plannedHours, updatedAt: new Date() }).where(eq(t.syllabusUnits.id, id));
    await audit(user.id, "syllabus.updated", "coursework", id, `Updated syllabus unit “${title}” in ${course.code}`);
    refresh();
    return ok("Syllabus unit updated.");
  }
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(order_index), 0)::int + 1` }).from(t.syllabusUnits).where(eq(t.syllabusUnits.courseId, course.id));
  const [row] = await db
    .insert(t.syllabusUnits)
    .values({ courseId: course.id, title, topics, plannedHours, orderIndex: n, createdById: user.id })
    .returning();
  await audit(user.id, "syllabus.created", "coursework", row.id, `Added syllabus unit “${title}” to ${course.code}`);
  refresh();
  return ok("Syllabus unit added.");
}

export async function toggleSyllabusUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const [unit] = id ? await db.select().from(t.syllabusUnits).where(eq(t.syllabusUnits.id, id)) : [];
  if (!unit) return fail("Syllabus unit not found.");
  const { user, course, error } = await guard(unit.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  await db.update(t.syllabusUnits).set({ completed: !unit.completed, updatedAt: new Date() }).where(eq(t.syllabusUnits.id, unit.id));
  await audit(user.id, "syllabus.progress", "coursework", unit.id, `Marked “${unit.title}” ${unit.completed ? "not covered" : "covered"} in ${course.code}`);
  refresh();
  return ok(unit.completed ? "Marked as not covered." : "Marked as covered.");
}

export async function deleteSyllabusUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const [unit] = id ? await db.select().from(t.syllabusUnits).where(eq(t.syllabusUnits.id, id)) : [];
  if (!unit) return fail("Syllabus unit not found.");
  const { user, course, error } = await guard(unit.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  await db.delete(t.syllabusUnits).where(eq(t.syllabusUnits.id, unit.id));
  await audit(user.id, "syllabus.deleted", "coursework", unit.id, `Removed syllabus unit “${unit.title}” from ${course.code}`);
  refresh();
  return ok("Syllabus unit removed.");
}

export async function reorderSyllabusUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const direction = str(fd, "direction") === "up" ? -1 : 1;
  const [unit] = id ? await db.select().from(t.syllabusUnits).where(eq(t.syllabusUnits.id, id)) : [];
  if (!unit) return fail("Syllabus unit not found.");
  const { user, course, error } = await guard(unit.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  const [neighbour] = await db
    .select()
    .from(t.syllabusUnits)
    .where(and(eq(t.syllabusUnits.courseId, unit.courseId), direction < 0 ? sql`${t.syllabusUnits.orderIndex} < ${unit.orderIndex}` : sql`${t.syllabusUnits.orderIndex} > ${unit.orderIndex}`))
    .orderBy(direction < 0 ? sql`${t.syllabusUnits.orderIndex} desc` : sql`${t.syllabusUnits.orderIndex} asc`)
    .limit(1);
  if (!neighbour) return fail(direction < 0 ? "Already first." : "Already last.");
  await db.update(t.syllabusUnits).set({ orderIndex: neighbour.orderIndex }).where(eq(t.syllabusUnits.id, unit.id));
  await db.update(t.syllabusUnits).set({ orderIndex: unit.orderIndex }).where(eq(t.syllabusUnits.id, neighbour.id));
  await audit(user.id, "syllabus.reordered", "coursework", unit.id, `Reordered syllabus for ${course.code}`);
  refresh();
  return ok("Order updated.");
}

/* -------------------------------- assignments ------------------------------ */
export async function saveAssignmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = num(fd, "courseId");
  const { user, course, error } = await guard(courseId);
  if (!course) return fail(error ?? "Course not found.");
  const id = num(fd, "id");
  const title = str(fd, "title");
  const description = str(fd, "description").slice(0, 2000);
  const kind = str(fd, "kind") as t.AssignmentKind;
  const status = (str(fd, "status") || "draft") as t.AssignmentStatus;
  const dueDate = str(fd, "dueDate");
  const maxMarks = num(fd, "maxMarks") ?? 10;
  const groupIds = fd.getAll("groupIds").map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
  const errors: Record<string, string> = {};
  if (title.length < 3) errors.title = "Give the assignment a title";
  if (!["assignment", "quiz", "project", "lab"].includes(kind)) errors.kind = "Select a type";
  if (!["draft", "published", "closed"].includes(status)) errors.status = "Select a status";
  if (dueDate && !isIsoDate(dueDate)) errors.dueDate = "Use a valid date";
  if (maxMarks < 1 || maxMarks > 200) errors.maxMarks = "1–200 marks";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const values = { title, description, kind, status, dueDate: dueDate || null, maxMarks, groupIds, updatedAt: new Date() };
  if (id) {
    const [row] = await db.select().from(t.assignments).where(and(eq(t.assignments.id, id), eq(t.assignments.courseId, course.id)));
    if (!row) return fail("Assignment not found.");
    await db.update(t.assignments).set(values).where(eq(t.assignments.id, id));
    await audit(user.id, "assignment.updated", "coursework", id, `Updated ${kind} “${title}” in ${course.code} (${status})`);
    refresh();
    return ok("Assignment saved.");
  }
  const [row] = await db.insert(t.assignments).values({ ...values, courseId: course.id, createdById: user.id }).returning();
  await audit(user.id, "assignment.created", "coursework", row.id, `Created ${kind} “${title}” in ${course.code} (${status})`);
  if (status === "published") await announcePublication(course, title, dueDate, user.id);
  refresh();
  return ok(status === "published" ? "Assignment published — your coordinator has been notified." : "Assignment saved as a draft.");
}

async function announcePublication(course: t.CourseRow, title: string, dueDate: string, actorId: number) {
  const coordinators = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(and(eq(t.users.role, "coordinator"), eq(t.users.departmentId, course.departmentId)));
  for (const c of coordinators.filter((c) => c.id !== actorId)) {
    await notify(c.id, `New assignment: ${course.code}`, `“${title}” was published${dueDate ? ` — due ${dueDate}` : ""}.`, "info", "/coordinator/faculty");
  }
}

export async function setAssignmentStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const status = str(fd, "status") as t.AssignmentStatus;
  if (!["draft", "published", "closed"].includes(status)) return fail("Unknown status.");
  const [row] = id ? await db.select().from(t.assignments).where(eq(t.assignments.id, id)) : [];
  if (!row) return fail("Assignment not found.");
  const { user, course, error } = await guard(row.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  await db.update(t.assignments).set({ status, updatedAt: new Date() }).where(eq(t.assignments.id, row.id));
  await audit(user.id, `assignment.${status}`, "coursework", row.id, `${status === "closed" ? "Closed" : status === "published" ? "Published" : "Reopened as draft"} “${row.title}” in ${course.code}`);
  if (status === "published") await announcePublication(course, row.title, row.dueDate ?? "", user.id);
  refresh();
  return ok(status === "closed" ? "Assignment closed." : status === "published" ? "Assignment published." : "Moved back to draft.");
}

export async function deleteAssignmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const [row] = id ? await db.select().from(t.assignments).where(eq(t.assignments.id, id)) : [];
  if (!row) return fail("Assignment not found.");
  const { user, course, error } = await guard(row.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  await db.delete(t.assignments).where(eq(t.assignments.id, row.id));
  await audit(user.id, "assignment.deleted", "coursework", row.id, `Deleted “${row.title}” from ${course.code}`);
  refresh();
  return ok("Assignment deleted.");
}

/* --------------------------------- resources ------------------------------- */
export async function saveResourceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const courseId = num(fd, "courseId");
  const { user, course, error } = await guard(courseId);
  if (!course) return fail(error ?? "Course not found.");
  const title = str(fd, "title");
  const detail = str(fd, "detail").slice(0, 2000);
  const url = str(fd, "url").slice(0, 500);
  const kind = (str(fd, "kind") || "link") as t.ResourceKind;
  const pinned = fd.get("pinned") === "on";
  const errors: Record<string, string> = {};
  if (title.length < 2) errors.title = "Give the resource a name";
  if (!["link", "note", "file", "reference"].includes(kind)) errors.kind = "Select a type";
  if (url && !/^https?:\/\/.+\..+/i.test(url)) errors.url = "Enter a full http(s) link";
  if (kind === "link" && !url) errors.url = "A link resource needs a URL";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  const [row] = await db
    .insert(t.courseResources)
    .values({ courseId: course.id, createdById: user.id, title, detail, url: url || null, kind, pinned })
    .returning();
  await audit(user.id, "resource.created", "coursework", row.id, `Added ${kind} “${title}” to ${course.code}`);
  refresh();
  return ok("Resource added.");
}

export async function deleteResourceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = num(fd, "id");
  const [row] = id ? await db.select().from(t.courseResources).where(eq(t.courseResources.id, id)) : [];
  if (!row) return fail("Resource not found.");
  const { user, course, error } = await guard(row.courseId);
  if (!course) return fail(error ?? "Not allowed.");
  await db.delete(t.courseResources).where(eq(t.courseResources.id, row.id));
  await audit(user.id, "resource.deleted", "coursework", row.id, `Removed resource “${row.title}” from ${course.code}`);
  refresh();
  return ok("Resource removed.");
}
