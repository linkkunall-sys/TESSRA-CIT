import { CalendarDays, Users } from "lucide-react";
import type { Metadata } from "next";
import { Avatar, Badge, ButtonLink, Card, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAY_SHORT } from "@/lib/constants";
import { listChangeRequests } from "@/lib/queries";
import { getDepartmentScope } from "@/lib/scope";
import { hoursFromPeriods, pct, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Faculty" };

export default async function CoordinatorFacultyPage() {
  const user = await requireRole("coordinator");
  const scope = await getDepartmentScope(user.departmentId);
  const pending = await listChangeRequests({ facultyIds: [...scope.facultyIds], status: "pending" });
  const totalLoad = scope.faculty.reduce((n, f) => n + (scope.tt?.facultyLoad.get(f.id) ?? 0), 0);
  const capacity = scope.faculty.reduce((n, f) => n + f.maxWeeklyPeriods, 0);

  return (
    <>
      <PageHeader eyebrow={scope.department?.name} title="Faculty" description="Teaching load, courses and availability for every faculty member in your department." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Faculty members" value={scope.faculty.length} icon={Users} />
        <StatCard label="Average load" value={`${pct(totalLoad, capacity)}%`} icon={CalendarDays} progress={pct(totalLoad, capacity)} hint={`${totalLoad} of ${capacity} available periods`} />
        <StatCard label="Blocked slots" value={scope.blocks.length} icon={CalendarDays} hint="Across all department faculty" />
      </div>

      {!scope.faculty.length ? (
        <Card className="mt-6">
          <EmptyState icon={Users} title="No faculty in this department" />
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {scope.faculty.map((f) => {
            const load = scope.tt?.facultyLoad.get(f.id) ?? 0;
            const blocks = scope.blocks.filter((b) => b.facultyId === f.id).sort((a, b) => a.day - b.day || a.period - b.period);
            const courses = [...new Set((scope.tt?.sessions ?? []).filter((s) => s.facultyId === f.id).map((s) => s.courseCode))];
            const requests = pending.filter((r) => r.facultyId === f.id).length;
            return (
              <Card key={f.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={f.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold text-ink">{f.name}</h2>
                    <p className="truncate text-xs text-ink-2">
                      {f.title} · {f.email}
                    </p>
                  </div>
                  {requests > 0 && <Badge tone="warning">{plural(requests, "request")}</Badge>}
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-ink-2">Weekly teaching load</span>
                    <span className="tabular font-medium text-ink">
                      {load}/{f.maxWeeklyPeriods} periods · {hoursFromPeriods(load)} h
                    </span>
                  </div>
                  <ProgressBar value={load} max={f.maxWeeklyPeriods} tone={load > f.maxWeeklyPeriods ? "danger" : "brand"} label={`${f.name} load`} />
                </div>
                <div className="mt-4">
                  <p className="text-xs font-medium text-ink-2">Courses</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {courses.length ? courses.map((c) => <Badge key={c} tone="outline">{c}</Badge>) : <span className="text-xs text-ink-3">No sessions scheduled</span>}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-medium text-ink-2">Unavailable slots</p>
                  {blocks.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {blocks.map((b) => (
                        <li key={b.id} className="rounded-md bg-warning-bg/60 px-2 py-0.5 text-xs text-warning-fg" title={b.reason ?? undefined}>
                          {DAY_SHORT[b.day]} P{b.period}
                          {b.reason ? ` · ${b.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-success-fg">Fully available all week</p>
                  )}
                </div>
                <div className="mt-auto pt-4">
                  <ButtonLink href={`/coordinator/scheduling?view=faculty&id=${f.id}`} variant="secondary" size="sm">
                    <CalendarDays aria-hidden /> View timetable
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
