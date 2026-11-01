import { BookOpen, ClipboardList, ListChecks, Users } from "lucide-react";
import type { Metadata } from "next";
import { CourseworkOversight, CourseworkWorkspace } from "@/components/coursework";
import { ButtonLink, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCoursework, getCourseworkOversight } from "@/lib/coursework";
import { readParams, type SearchParams } from "@/lib/params";
import { pct, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Coursework" };

export default async function AdminCourseworkPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("admin");
  const get = await readParams(searchParams);
  const [rows, data] = await Promise.all([getCourseworkOversight(), getCoursework(user)]);
  const withContent = rows.filter((r) => r.units || r.assignments || r.resources);
  const totalUnits = rows.reduce((n, r) => n + r.units, 0);
  const totalDone = rows.reduce((n, r) => n + r.completed, 0);
  const assignments = rows.reduce((n, r) => n + r.assignments, 0);
  const selected = Number(get("course")) || withContent[0]?.course.id || 0;
  const groupsByCourse = Object.fromEntries(data.cards.map((c) => [c.courseId, c.groups]));

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Coursework"
        description="Syllabus progress, assignments and resources across every course. Admins can edit any course; teachers manage their own."
        actions={<ButtonLink href="/admin/academics?tab=offerings" variant="secondary"><Users aria-hidden /> Teaching assignments</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses with coursework" value={withContent.length} icon={BookOpen} hint={`of ${rows.length} courses`} />
        <StatCard label="Syllabus coverage" value={`${pct(totalDone, totalUnits)}%`} icon={ListChecks} progress={pct(totalDone, totalUnits)} hint={`${totalDone} of ${totalUnits} units covered`} />
        <StatCard label="Assignments" value={assignments} icon={ClipboardList} hint={`${rows.reduce((n, r) => n + r.published, 0)} published`} />
        <StatCard label="Resources shared" value={rows.reduce((n, r) => n + r.resources, 0)} icon={BookOpen} />
      </div>
      <div className="mt-6 space-y-6">
        <CourseworkOversight rows={rows.map((r) => ({ courseId: r.course.id, code: r.course.code, title: r.course.title, department: r.department, faculty: r.faculty, units: r.units, completed: r.completed, hours: r.hours, assignments: r.assignments, published: r.published, resources: r.resources, lastUpdated: r.lastUpdated }))} />
        <section aria-labelledby="edit-course">
          <SectionTitle><span id="edit-course">Manage a course</span></SectionTitle>
          {data.cards.length ? (
            <CourseworkWorkspace
              courses={data.cards.map((c) => ({ id: c.courseId, code: c.code, title: c.title, kind: c.kind }))}
              groupsByCourse={groupsByCourse}
              units={data.units}
              assignments={data.assigns}
              resources={data.resources}
              editable
              activeCourseId={selected}
              baseHref="/admin/coursework"
            />
          ) : (
            <Card><EmptyState icon={BookOpen} title="No coursework yet" description="Teachers build their syllabus in the faculty workspace; you can edit any course here." /></Card>
          )}
        </section>
        <p className="text-xs text-ink-3">{plural(rows.length, "course")} tracked · changes are audited and coordinator notifications are sent when assignments are published.</p>
      </div>
    </>
  );
}
