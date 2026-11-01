import { ArrowRight, Bell, CalendarDays, ClipboardCheck, Clock, Sparkles, TriangleAlert, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList } from "@/components/domain";
import { KIND_STYLE, SessionList } from "@/components/timetable";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { SUGGESTED_PROMPTS } from "@/lib/assistant";
import { requireRole } from "@/lib/auth";
import { DAY_COUNT, DAYS, KIND_LABEL, PERIOD_COUNT, PERIODS } from "@/lib/constants";
import { getPublishedTimetable, listChangeRequests, listNotifications } from "@/lib/queries";
import { cn, currentDayIndex, firstName, hoursFromPeriods, periodLabel, periodTime, plural, toMinutes } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function FacultyOverviewPage() {
  const user = await requireRole("faculty");
  const [tt, notifications, requests] = await Promise.all([getPublishedTimetable(), listNotifications(user.id, 4), listChangeRequests({ facultyIds: [user.id] })]);
  const mine = tt?.sessions.filter((s) => s.facultyId === user.id) ?? [];
  const dayIdx = currentDayIndex();
  const refDay = dayIdx < 0 ? 0 : dayIdx;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const todays = mine.filter((s) => s.day === refDay);
  const startOf = (p: number) => toMinutes(PERIODS[p - 1].start);
  const endOf = (p: number, d: number) => toMinutes(PERIODS[p + d - 2].end);
  const status = (s: (typeof mine)[number]) => {
    if (dayIdx < 0) return null;
    if (endOf(s.startPeriod, s.duration) <= minutes) return "done" as const;
    if (startOf(s.startPeriod) <= minutes) return "now" as const;
    return "upcoming" as const;
  };
  const nextToday = todays.find((s) => status(s) === "upcoming");
  const upcoming = mine.filter((s) => (dayIdx < 0 ? true : s.day > dayIdx || (s.day === dayIdx && startOf(s.startPeriod) > minutes))).slice(0, 5);
  const periods = mine.reduce((n, s) => n + s.duration, 0);
  const blocks = tt?.state.blockRows.filter((b) => b.facultyId === user.id) ?? [];
  const pending = requests.filter((r) => r.status === "pending").length;
  const unread = notifications.filter((n) => !n.read).length;
  const affected = mine.filter((s) => tt?.issuesBySession[s.id]?.length);

  return (
    <>
      <PageHeader
        eyebrow={user.departmentName ?? "Faculty"}
        title={`Good to see you, ${firstName(user.name)}`}
        description={dayIdx < 0 ? "It's the weekend — here's what Monday looks like." : `Here's your ${DAYS[refDay]} at a glance.`}
        actions={
          <>
            <ButtonLink href="/faculty/timetable" variant="secondary">
              <CalendarDays aria-hidden /> My timetable
            </ButtonLink>
            <ButtonLink href="/faculty/assistant">
              <Sparkles aria-hidden /> Ask the assistant
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={dayIdx < 0 ? "Classes on Monday" : "Classes today"}
          value={todays.length}
          icon={CalendarDays}
          hint={nextToday ? `Next: ${nextToday.courseCode} at ${PERIODS[nextToday.startPeriod - 1].start}` : todays.length ? "No more classes today" : "A free day"}
        />
        <StatCard label="Weekly teaching hours" value={`${hoursFromPeriods(periods)} h`} icon={Clock} hint={`${plural(mine.length, "session")} · ${plural(periods, "period")}`} href="/faculty/timetable" />
        <StatCard label="Availability" value={`${DAY_COUNT * PERIOD_COUNT - blocks.length}/${DAY_COUNT * PERIOD_COUNT}`} icon={UserCheck} hint={blocks.length ? `${plural(blocks.length, "slot")} marked unavailable` : "Open for every slot"} href="/faculty/availability" />
        <StatCard label="Pending change requests" value={pending} icon={ClipboardCheck} tone={pending ? "warning" : "brand"} href="/faculty/requests" hint={`${requests.length} submitted this term`} />
      </section>

      {affected.length > 0 && (
        <Callout
          tone="warning"
          className="mt-6"
          title={`${plural(affected.length, "of your sessions has", "of your sessions have")} a scheduling issue`}
          action={
            <ButtonLink href="/faculty/requests" variant="secondary" size="sm">
              Request a change
            </ButtonLink>
          }
        >
          {affected
            .slice(0, 3)
            .map((s) => `${s.courseCode} (${DAYS[s.day].slice(0, 3)} ${periodLabel(s.startPeriod, s.duration)}): ${tt?.issuesBySession[s.id]?.[0]}`)
            .join(" · ")}
        </Callout>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={CalendarDays}
            title={dayIdx < 0 ? "Monday's timetable" : "Today's timetable"}
            description={`${DAYS[refDay]} · ${plural(todays.length, "session")}`}
            action={
              <ButtonLink href="/faculty/timetable" variant="ghost" size="sm">
                Week view <ArrowRight aria-hidden />
              </ButtonLink>
            }
          />
          {todays.length ? (
            <ol className="relative space-y-3 p-5">
              {todays.map((s) => {
                const st = status(s);
                return (
                  <li key={s.id} className={cn("flex gap-4 rounded-xl border p-3.5 transition-colors", st === "now" ? "border-brand-300 bg-brand-50/60" : "border-line", st === "done" && "opacity-60")}>
                    <div className="w-24 shrink-0">
                      <p className="text-[13px] font-semibold text-ink">{periodLabel(s.startPeriod, s.duration)}</p>
                      <p className="tabular text-xs text-ink-2">{periodTime(s.startPeriod, s.duration)}</p>
                      {st && (
                        <Badge tone={st === "now" ? "brand" : st === "done" ? "neutral" : "outline"} className="mt-1.5" dot={st === "now"}>
                          {st === "now" ? "In progress" : st === "done" ? "Completed" : "Upcoming"}
                        </Badge>
                      )}
                    </div>
                    <span className={cn("w-[3px] shrink-0 rounded-full", KIND_STYLE[s.kind].swatch)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {s.courseCode} <span className="font-normal text-ink-2">· {s.courseTitle}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {s.roomCode} · {s.roomName} · {s.groupCodes.join(" + ")} ({s.size} students) · {KIND_LABEL[s.kind]}
                      </p>
                      {tt?.issuesBySession[s.id]?.length ? (
                        <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-danger-fg">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {tt.issuesBySession[s.id][0]}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon={CalendarDays} title="No classes on this day" description="Use the free time for research, office hours or preparation." />
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader icon={Sparkles} title="AI Assistant" description="Plan changes in plain language" />
          <div className="flex flex-1 flex-col p-5">
            <p className="text-[13px] leading-5 text-ink-2">Ask about your schedule, find free rooms or draft a reschedule. Proposals are validated by the engine and only submitted when you confirm.</p>
            <ul className="mt-4 space-y-2">
              {SUGGESTED_PROMPTS.slice(0, 3).map((p) => (
                <li key={p}>
                  <Link
                    href={`/faculty/assistant?q=${encodeURIComponent(p)}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-ink transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    {p}
                    <ArrowRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <ButtonLink href="/faculty/assistant" variant="dark" className="mt-auto w-full" style={{ marginTop: "1.25rem" }}>
              <Sparkles aria-hidden /> Open assistant
            </ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={Clock} title="Upcoming classes" description="Later this week" />
          <SessionList sessions={upcoming} showDay emptyText="No more classes this week" />
        </Card>
        <Card>
          <CardHeader
            icon={Bell}
            title="Notifications"
            description={unread ? `${unread} unread` : "You're all caught up"}
            action={
              <ButtonLink href="/faculty/notifications" variant="ghost" size="sm">
                View all
              </ButtonLink>
            }
          />
          <NotificationList items={notifications} />
        </Card>
      </div>
    </>
  );
}
