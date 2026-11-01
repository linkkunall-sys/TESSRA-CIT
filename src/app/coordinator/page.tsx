import { ArrowRight, CalendarCheck, CalendarDays, ClipboardCheck, Gauge, ShieldAlert, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { UpcomingBookingRow } from "@/components/domain";
import { SessionList } from "@/components/timetable";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAYS, CHANGE_TYPE_LABEL } from "@/lib/constants";
import { listBookings, listChangeRequests } from "@/lib/queries";
import { ISSUE_LABEL } from "@/lib/scheduler";
import { getDepartmentScope } from "@/lib/scope";
import { currentDayIndex, firstName, formatRelative, pct, plural, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function CoordinatorOverviewPage() {
  const user = await requireRole("coordinator");
  const scope = await getDepartmentScope(user.departmentId);
  const [requests, bookings] = await Promise.all([
    listChangeRequests({ facultyIds: [...scope.facultyIds], status: "pending" }),
    user.departmentId ? listBookings({ departmentId: user.departmentId }) : Promise.resolve([]),
  ]);
  const today = todayIso();
  const dayIdx = currentDayIndex();
  const refDay = dayIdx < 0 ? 0 : dayIdx;
  const todays = scope.sessions.filter((s) => s.day === refDay);
  const completion = pct(scope.placed, scope.required);
  const blockedToday = new Set(scope.blocks.filter((b) => b.day === refDay).map((b) => b.facultyId));
  const available = scope.faculty.length - blockedToday.size;
  const upcoming = bookings.filter((b) => b.date >= today && (b.status === "approved" || b.status === "pending")).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const pendingBookings = bookings.filter((b) => b.status === "pending").length;
  const errors = scope.issues.filter((i) => i.severity === "error");
  const periods = scope.sessions.reduce((n, s) => n + s.duration, 0);

  return (
    <>
      <PageHeader
        eyebrow={scope.department?.name ?? "Department"}
        title={`Welcome back, ${firstName(user.name)}`}
        description="Your department's timetable, faculty availability and pending decisions at a glance."
        actions={
          <>
            <ButtonLink href="/coordinator/scheduling" variant="secondary">
              <CalendarDays aria-hidden /> Department timetable
            </ButtonLink>
            <ButtonLink href="/coordinator/approvals">
              <ShieldCheck aria-hidden /> Review requests
              {requests.length > 0 && <span className="tabular rounded-md bg-white/20 px-1.5 text-xs">{requests.length}</span>}
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Department sessions" value={scope.sessions.length} icon={CalendarDays} hint={`${periods} teaching periods per week`} href="/coordinator/scheduling" />
        <StatCard label="Scheduling status" value={`${completion}%`} icon={Gauge} progress={completion} hint={`${scope.placed}/${scope.required} required sessions placed`} />
        <StatCard
          label="Faculty available"
          value={`${available}/${scope.faculty.length}`}
          icon={UserCheck}
          hint={dayIdx < 0 ? "Next teaching day · Monday" : `Today · ${DAYS[refDay]}`}
          href="/coordinator/faculty"
        />
        <StatCard
          label="Pending requests"
          value={requests.length + pendingBookings}
          icon={ClipboardCheck}
          tone={requests.length ? "warning" : "brand"}
          hint={`${plural(requests.length, "schedule change")} · ${plural(pendingBookings, "venue request")}`}
          href="/coordinator/approvals"
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={CalendarDays}
            title={dayIdx < 0 ? "Monday's department timetable" : "Today's department timetable"}
            description={`${plural(todays.length, "session")} on ${DAYS[refDay]}`}
            action={
              <ButtonLink href="/coordinator/scheduling" variant="ghost" size="sm">
                Full week <ArrowRight aria-hidden />
              </ButtonLink>
            }
          />
          <SessionList sessions={todays} emptyText="No department sessions on this day" />
        </Card>
        <Card>
          <CardHeader icon={ShieldAlert} title="Scheduling alerts" description={errors.length ? `${plural(errors.length, "conflict")} affect your department` : "No conflicts in your sessions"} />
          {scope.issues.length ? (
            <ul className="divide-y divide-line">
              {scope.issues.slice(0, 5).map((i, idx) => (
                <li key={idx} className="px-5 py-3">
                  <Badge tone={i.severity === "error" ? "danger" : "warning"}>{ISSUE_LABEL[i.code]}</Badge>
                  <p className="mt-1.5 text-[13px] leading-5 text-ink">{i.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="All clear" description="Faculty, groups and rooms are conflict-free." compact />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader
            icon={Users}
            title="Faculty availability"
            description="Weekly load and blocked slots"
            action={
              <ButtonLink href="/coordinator/faculty" variant="ghost" size="sm">
                All faculty
              </ButtonLink>
            }
          />
          <ul className="divide-y divide-line">
            {scope.faculty.map((f) => {
              const load = scope.tt?.facultyLoad.get(f.id) ?? 0;
              const blocked = scope.blocks.filter((b) => b.facultyId === f.id).length;
              return (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={f.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-ink">{f.name}</p>
                      {blockedToday.has(f.id) ? <Badge tone="warning">Limited today</Badge> : <Badge tone="success">Available</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProgressBar value={load} max={f.maxWeeklyPeriods} label={`${f.name} load`} />
                      <span className="tabular shrink-0 text-xs text-ink-2">
                        {load}/{f.maxWeeklyPeriods}
                      </span>
                    </div>
                    {blocked > 0 && <p className="mt-1 text-xs text-ink-3">{plural(blocked, "blocked slot")}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon={ClipboardCheck}
            title="Pending requests"
            description="Schedule changes awaiting your decision"
            action={
              <ButtonLink href="/coordinator/approvals" variant="ghost" size="sm">
                Review
              </ButtonLink>
            }
          />
          {requests.length ? (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href="/coordinator/approvals" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
                    <Avatar name={r.facultyName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {r.snapshot?.courseCode} · {CHANGE_TYPE_LABEL[r.type]}
                      </p>
                      <p className="truncate text-xs text-ink-2">
                        {r.facultyName} · {formatRelative(r.createdAt)}
                      </p>
                    </div>
                    <Badge tone="warning">Pending</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ClipboardCheck} title="No pending requests" compact />
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            icon={CalendarCheck}
            title="Upcoming department events"
            action={
              <ButtonLink href="/coordinator/events" variant="ghost" size="sm">
                Manage
              </ButtonLink>
            }
          />
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((b) => (
                <UpcomingBookingRow key={b.id} b={b} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck} title="No upcoming events" description="Request a venue for seminars, workshops and guest lectures." compact />
          )}
        </Card>
      </div>
    </>
  );
}
