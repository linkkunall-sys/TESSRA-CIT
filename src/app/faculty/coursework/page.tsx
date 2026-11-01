import { BookOpen, ClipboardList, ListChecks, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import { CourseworkWorkspace } from "@/components/coursework";
import { ButtonLink, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCoursework } from "@/lib/coursework";
import { readParams, type SearchParams } from "@/lib/params";
import { pct, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Coursework" };

export default async function FacultyCourseworkPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("faculty");
  const get = await readParams(searchParams);
  const data = await getCoursework(user);
  const activeId = Number(get("course")) || data.cards[0]?.courseId || 0;
  const course = data.cards.find((c) => c.courseId === activeId) ?? data.cards[0];
  const groupsByCourse = Object.fromEntries(data.cards.map((c) => [c.courseId, c.groups]));
  const units = data.units.filter((u) => u.courseId === activeId);
  const totalUnits = data.cards.reduce((n, c) => n + c.units, 0);
  const doneUnits = data.cards.reduce((n, c) => n + c.completedUnits, 0);
  const assignments = data.assigns.filter((a) => a.courseId === activeId);

  return (
    <>
      <PageHeader
        eyebrow={user.departmentName ?? "Teaching"}
        title="Coursework"
        description="Plan your syllabus, set assignments and share class resources. Everything is saved instantly and your coordinator can follow progress."
        actions={<ButtonLink href="/faculty/timetable" variant="secondary"><NotebookPen aria-hidden /> My timetable</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My courses" value={data.cards.length} icon={BookOpen} hint="With a teaching assignment" />
        <StatCard label="Syllabus coverage" value={`${pct(doneUnits, totalUnits)}%`} icon={ListChecks} progress={pct(doneUnits, totalUnits)} hint={`${doneUnits} of ${totalUnits} units covered across your courses`} />
        <StatCard label="Assignments" value={data.assigns.length} icon={ClipboardList} hint={`${data.assigns.filter((a) => a.status === "published").length} published`} />
        <StatCard label={`${course?.code ?? "Selected course"} progress`} value={plural(units.length, "unit")} icon={ListChecks} hint={`${units.filter((u) => u.completed).length} covered · ${assignments.length} assignments`} />
      </div>
      <div className="mt-6">
        {data.cards.length ? (
          <CourseworkWorkspace
            courses={data.cards.map((c) => ({ id: c.courseId, code: c.code, title: c.title, kind: c.kind }))}
            groupsByCourse={groupsByCourse}
            units={data.units}
            assignments={data.assigns}
            resources={data.resources}
            editable
            activeCourseId={activeId}
            baseHref="/faculty/coursework"
          />
        ) : (
          <Card><EmptyState icon={BookOpen} title="No courses assigned" description="Coursework appears once your coordinator assigns you a course." /></Card>
        )}
      </div>
    </>
  );
}
