import { BookOpen, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import { KIND_STYLE } from "@/components/timetable";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAY_SHORT, KIND_LABEL } from "@/lib/constants";
import { getPublishedTimetable, getRef } from "@/lib/queries";
import { cn, periodLabel, periodTime, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "My Courses" };

export default async function FacultyCoursesPage() {
  const user = await requireRole("faculty");
  const [ref, tt] = await Promise.all([getRef(), getPublishedTimetable()]);
  const offerings = ref.offerings.filter((o) => o.facultyId === user.id);
  const sessions = tt?.sessions.filter((s) => s.facultyId === user.id) ?? [];
  const students = offerings.reduce((n, o) => n + o.groupIds.reduce((m, g) => m + (ref.groupMap.get(g)?.size ?? 0), 0), 0);

  return (
    <>
      <PageHeader eyebrow="Teaching" title="My Courses" description="Your teaching assignments this term, with the groups you teach and where each session is scheduled." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Teaching assignments" value={offerings.length} icon={BookOpen} />
        <StatCard label="Distinct courses" value={new Set(offerings.map((o) => o.courseId)).size} icon={BookOpen} />
        <StatCard label="Students taught" value={students} icon={Users} hint="Across all assigned groups" />
      </div>
      {!offerings.length ? (
        <Card className="mt-6">
          <EmptyState icon={BookOpen} title="No courses assigned yet" description="Your administrator assigns courses before the timetable is generated." />
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {offerings.map((o) => {
            const course = ref.courseMap.get(o.courseId);
            const groups = o.groupIds.map((g) => ref.groupMap.get(g)).filter((g): g is NonNullable<typeof g> => Boolean(g));
            const placed = sessions.filter((s) => s.offeringId === o.id);
            const size = groups.reduce((n, g) => n + g.size, 0);
            return (
              <Card key={o.id} className="overflow-hidden">
                <div className={cn("h-1", KIND_STYLE[o.kind].swatch)} aria-hidden />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-xs font-semibold tracking-wide", KIND_STYLE[o.kind].text)}>{course?.code}</p>
                      <h2 className="mt-0.5 text-[15px] font-semibold text-ink">{course?.title}</h2>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {course?.credits} credits · {KIND_LABEL[o.kind]} · {o.sessionsPerWeek} × {plural(o.duration, "period")} weekly
                      </p>
                    </div>
                    <Badge tone={placed.length >= o.sessionsPerWeek ? "success" : "warning"}>
                      {placed.length}/{o.sessionsPerWeek} scheduled
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {groups.map((g) => (
                      <span key={g.id} className="rounded-md bg-muted-bg px-2 py-0.5 text-xs font-medium text-ink-2">
                        {g.code} · {g.size}
                      </span>
                    ))}
                    {groups.length > 1 && <Badge tone="info">Combined · {size} students</Badge>}
                  </div>
                  <ul className="mt-4 divide-y divide-line rounded-lg ring-1 ring-line">
                    {placed.length ? (
                      placed.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                          <span className="font-medium text-ink">
                            {DAY_SHORT[s.day]} · {periodLabel(s.startPeriod, s.duration)}
                            <span className="tabular ml-1.5 font-normal text-ink-3">{periodTime(s.startPeriod, s.duration)}</span>
                          </span>
                          <span className="flex items-center gap-1 text-xs text-ink-2">
                            <MapPin className="size-3.5 text-ink-3" aria-hidden /> {s.roomCode}
                            {s.isFixed && <Badge tone="brand" className="ml-1">Fixed</Badge>}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2.5 text-xs text-ink-3">Not yet placed in the published timetable</li>
                    )}
                  </ul>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
