import { Activity, ArrowRight, Building, CalendarClock, CalendarDays, FlaskConical, Gauge, GraduationCap, Search, ShieldAlert, ShieldCheck, Ticket, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { ActivityFeed, UpcomingBookingRow } from "@/components/domain";
import { ResetDemoDataButton } from "@/components/reset-demo-data";
import { Avatar, Badge, BarList, ButtonLink, Card, CardHeader, EmptyState, PageHeader, PriorityBadge, ProgressBar, StatCard } from "@/components/ui";
import { prepareApprovalDemoAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { DAYS } from "@/lib/constants";
import { getExams, getPublishedTimetable, getRef, getSettings, listAudit, listBookings, listChangeRequests, listDisruptions } from "@/lib/queries";
import { ISSUE_LABEL } from "@/lib/scheduler";
import { currentDayIndex, firstName, formatDate, formatRelative, pct, plural, relativeDay, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;

export default async function AdminOverviewPage() {
  const user = await requireRole("admin");
  const [settings, tt, ref, bookings, requests, disruptions, exams, activity] = await Promise.all([
    getSettings(),
    getPublishedTimetable(),
    getRef(),
    listBookings(),
    listChangeRequests({ status: "pending" }),
    listDisruptions("proposed"),
    getExams(),
    listAudit({ limit: 7 }),
  ]);
  const today = todayIso();
  const dayIdx = currentDayIndex();
  const refDay = dayIdx < 0 ? 0 : dayIdx;

  const pendingBookings = bookings
    .filter((b) => b.status === "pending")
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.date.localeCompare(b.date));
  const events = bookings
    .filter((b) => b.status === "approved" && b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 5);
  const upcomingExams = exams.filter((e) => e.date >= today).slice(0, 5);
  const examIssues = exams.filter((e) => e.issues.length).length;

  const teachingRooms = ref.rooms.filter((r) => ["lecture", "lab", "seminar"].includes(r.type));
  const activeTeaching = teachingRooms.filter((r) => r.status === "active");
  const used = tt ? teachingRooms.reduce((n, r) => n + (tt.roomLoad.get(r.id) ?? 0), 0) : 0;
  const utilisation = pct(used, activeTeaching.length * 40);
  const stats = tt?.version.stats;
  const completion = stats ? pct(stats.placedPeriods, stats.requiredPeriods) : 0;
  const errors = tt?.issues.filter((i) => i.severity === "error") ?? [];

  const blocksToday = (tt?.state.blockRows ?? []).filter((b) => b.day === refDay);
  const blockedFaculty = new Map<number, number[]>();
  for (const b of blocksToday) blockedFaculty.set(b.facultyId, [...(blockedFaculty.get(b.facultyId) ?? []), b.period]);
  const available = ref.faculty.length - blockedFaculty.size;
  const approvals = pendingBookings.length + requests.length + disruptions.length;

  const roomBars = tt
    ? teachingRooms
        .map((r) => ({
          label: `${r.code} · ${r.name}`,
          value: pct(tt.roomLoad.get(r.id) ?? 0, 40),
          hint: r.status !== "active" ? "· maintenance" : undefined,
          tone: (r.status !== "active" ? "warning" : "brand") as "warning" | "brand",
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  return (
    <>
      <PageHeader
        eyebrow={`${settings.institutionName} · ${settings.academicTerm}`}
        title={`Welcome back, ${firstName(user.name)}`}
        description="Scheduling health, pending decisions and upcoming campus activity — everything that needs your attention today."
        actions={
          <>
            <ResetDemoDataButton compact />
            <ButtonLink href="/admin/scheduling" variant="secondary">
              <CalendarClock aria-hidden /> Smart Scheduling
            </ButtonLink>
            <ButtonLink href="/admin/approvals">
              <ShieldCheck aria-hidden /> Review approvals
              {approvals > 0 && <span className="tabular rounded-md bg-white/20 px-1.5 text-xs">{approvals}</span>}
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-line bg-gradient-to-r from-brand-50/80 via-surface to-surface px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="brand">Quick start</Badge>
                <span className="text-xs text-ink-2">Three common operations · live data</span>
              </div>
              <h2 id="common-workflows" className="mt-2 text-base font-semibold text-ink">Find it, read it, decide it</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">Direct paths to the workflows used most often by campus operations.</p>
            </div>
            <span className="text-xs font-medium text-ink-2">Use <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px]">Ctrl/⌘ K</kbd> from anywhere to jump to a page</span>
          </div>
        </div>
        <div className="grid md:grid-cols-3">
          <Link href="/admin/venues" className="group flex gap-3 border-b border-line px-5 py-4 outline-none transition-colors hover:bg-subtle focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-brand-500/30 md:border-b-0 md:border-r">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Search className="size-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">1 · Find a room</span>
              <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-ink">Live venue availability <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="mt-1 block text-xs leading-4 text-ink-2">Filter by capacity, features, date and time.</span>
            </span>
          </Link>
          <Link href="/admin/scheduling" className="group flex gap-3 border-b border-line px-5 py-4 outline-none transition-colors hover:bg-subtle focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-brand-500/30 md:border-b-0 md:border-r">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><FlaskConical className="size-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">2 · Read the timetable</span>
              <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-ink">Published week view <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="mt-1 block text-xs leading-4 text-ink-2">Switch between group, faculty and room.</span>
            </span>
          </Link>
          <div className="flex gap-3 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><ShieldCheck className="size-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">3 · Approve a change</span>
              <Link href="/admin/approvals" className="group mt-0.5 flex items-center gap-1 text-sm font-semibold text-ink hover:text-brand-700">Approval Centre <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>
              {approvals > 0 ? (
                <span className="mt-1 block text-xs leading-4 text-ink-2">{plural(approvals, "decision")} ready with conflict checks.</span>
              ) : (
                <ActionForm action={prepareApprovalDemoAction} className="mt-2 inline-flex">
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Preparing…">Prepare safe example</SubmitButton>
                </ActionForm>
              )}
            </span>
          </div>
        </div>
      </Card>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Academic sessions"
          value={tt?.sessions.length ?? 0}
          icon={CalendarDays}
          href="/admin/scheduling"
          hint={tt ? `${tt.version.label} · published ${tt.version.publishedAt ? formatRelative(tt.version.publishedAt) : ""}` : "No published timetable"}
        />
        <StatCard
          label="Scheduling completion"
          value={`${completion}%`}
          icon={Gauge}
          progress={completion}
          hint={stats ? `${stats.placedPeriods}/${stats.requiredPeriods} periods placed${stats.unplaced.length ? ` · ${stats.unplaced.length} unplaced` : ""}` : "Generate a timetable to begin"}
        />
        <StatCard
          label="Room utilisation"
          value={`${utilisation}%`}
          icon={Building}
          href="/admin/venues"
          progress={utilisation}
          hint={`${activeTeaching.length} of ${teachingRooms.length} teaching rooms active`}
        />
        <StatCard
          label="Pending approvals"
          value={approvals}
          icon={ShieldCheck}
          tone={approvals ? "warning" : "brand"}
          href="/admin/approvals"
          hint={`${plural(pendingBookings.length, "booking")} · ${plural(requests.length, "change")} · ${plural(disruptions.length, "disruption")}`}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={ShieldAlert}
            title="Scheduling health"
            description={errors.length ? `${plural(errors.length, "conflict")} in the published timetable need attention` : "The published timetable passes every validation rule"}
            action={
              <ButtonLink href="/admin/scheduling" variant="ghost" size="sm">
                Open scheduler <ArrowRight aria-hidden />
              </ButtonLink>
            }
          />
          {errors.length ? (
            <ul className="divide-y divide-line">
              {errors.slice(0, 5).map((i, idx) => (
                <li key={idx} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <Badge tone="danger" className="w-fit">
                    {ISSUE_LABEL[i.code]}
                  </Badge>
                  <p className="min-w-0 flex-1 text-[13px] text-ink">{i.message}</p>
                </li>
              ))}
              {disruptions.length > 0 && (
                <li className="flex items-center justify-between gap-3 bg-subtle px-5 py-3 text-[13px]">
                  <span className="text-ink-2">{plural(disruptions.length, "disruption plan")} ready to resolve these conflicts.</span>
                  <Link href="/admin/disruptions" className="font-medium text-brand-700 hover:underline">
                    Review plans
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="No conflicts detected" description="Faculty, groups and rooms are all free of clashes." compact />
          )}
        </Card>

        <Card>
          <CardHeader icon={UserCheck} title="Faculty availability" description={dayIdx < 0 ? "Next teaching day · Monday" : `Today · ${DAYS[refDay]}`} />
          <div className="px-5 pt-4">
            <p className="tabular text-[28px] font-semibold leading-none text-ink">
              {available}
              <span className="text-base font-medium text-ink-3"> / {ref.faculty.length}</span>
            </p>
            <p className="mt-1.5 text-xs text-ink-2">faculty fully available</p>
            <ProgressBar value={available} max={Math.max(1, ref.faculty.length)} className="mt-3" label="Faculty available" />
          </div>
          {blockedFaculty.size ? (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {[...blockedFaculty.entries()].slice(0, 5).map(([id, periods]) => {
                const f = ref.personMap.get(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar name={f?.name ?? "?"} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f?.name}</span>
                    <Badge tone="warning">Unavailable P{periods.sort((a, b) => a - b).join(", P")}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-5 text-[13px] text-ink-3">No availability restrictions for this day.</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader
            icon={Ticket}
            title="Booking approvals"
            description={pendingBookings.length ? `${plural(pendingBookings.length, "request")} awaiting a decision` : "Queue is clear"}
            action={
              <ButtonLink href="/admin/bookings?status=pending" variant="ghost" size="sm">
                View all
              </ButtonLink>
            }
          />
          {pendingBookings.length ? (
            <ul className="divide-y divide-line">
              {pendingBookings.slice(0, 5).map((b) => (
                <li key={b.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-medium text-ink">{b.title}</p>
                    <PriorityBadge priority={b.priority} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-2">
                    {b.orgName} · {b.roomCode} · {formatDate(b.date)} {b.startTime}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Ticket} title="No pending bookings" compact />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={GraduationCap}
            title="Upcoming examinations"
            description={examIssues ? `${plural(examIssues, "exam")} with validation issues` : "All examinations validated"}
            action={
              <ButtonLink href="/admin/examinations" variant="ghost" size="sm">
                Schedule
              </ButtonLink>
            }
          />
          {upcomingExams.length ? (
            <ul className="divide-y divide-line">
              {upcomingExams.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-16 shrink-0">
                    <p className="text-xs font-medium text-ink-2">{relativeDay(e.date)}</p>
                    <p className="tabular text-xs text-ink-3">{e.startTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {e.courseCode} · {e.courseTitle}
                    </p>
                    <p className="truncate text-xs text-ink-2">
                      {e.roomCode} · {e.candidates} candidates · {e.groupCodes.join(" + ")}
                    </p>
                  </div>
                  {e.issues.length > 0 && <Badge tone="danger">Conflict</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={GraduationCap} title="No upcoming examinations" compact />
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader icon={CalendarDays} title="Campus events" description="Approved bookings coming up" />
          {events.length ? (
            <ul className="divide-y divide-line">
              {events.map((b) => (
                <UpcomingBookingRow key={b.id} b={b} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarDays} title="No upcoming events" compact />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader icon={Building} title="Room utilisation" description="Share of weekly teaching periods in use" />
          <div className="p-5">
            <BarList items={roomBars} max={100} unit="%" empty="Publish a timetable to see utilisation" />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Activity}
            title="Recent activity"
            description="Administrative changes across the platform"
            action={
              <ButtonLink href="/admin/audit" variant="ghost" size="sm">
                Audit log <ArrowRight aria-hidden />
              </ButtonLink>
            }
          />
          <div className="py-2">
            <ActivityFeed items={activity} />
          </div>
        </Card>
      </div>
    </>
  );
}
