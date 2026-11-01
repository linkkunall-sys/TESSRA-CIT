import { ArrowRight, Bell, CalendarCheck, CalendarPlus, CircleX, Compass, Hourglass, Sparkles, Ticket, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList, UpcomingBookingRow } from "@/components/domain";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { ROOM_TYPE_LABEL } from "@/lib/constants";
import { qs } from "@/lib/params";
import { getRef, getSettings, listBookings, listNotifications } from "@/lib/queries";
import { firstName, formatDate, plural, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function ClubOverviewPage() {
  const user = await requireRole("club");
  const [bookings, ref, settings, notifications] = await Promise.all([listBookings({ requesterId: user.id }), getRef(), getSettings(), listNotifications(user.id, 4)]);
  const today = todayIso();
  const pending = bookings.filter((b) => b.status === "pending");
  const approvedUpcoming = bookings.filter((b) => b.status === "approved" && b.date >= today);
  const rejected = bookings.filter((b) => b.status === "rejected").sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0));
  const upcoming = bookings.filter((b) => b.date >= today && (b.status === "approved" || b.status === "pending")).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const venues = ref.rooms.filter((r) => r.bookable && r.status === "active").sort((a, b) => b.capacity - a.capacity).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow={user.clubName ?? "Club"}
        title={`Welcome back, ${firstName(user.name)}`}
        description="Track your venue requests, see what's coming up and book your next event."
        actions={
          <>
            <ButtonLink href="/club/venues" variant="secondary">
              <Compass aria-hidden /> Discover venues
            </ButtonLink>
            <ButtonLink href="/club/bookings/new">
              <CalendarPlus aria-hidden /> New booking
            </ButtonLink>
          </>
        }
      />
      <section aria-label="Booking overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending requests" value={pending.length} icon={Hourglass} tone={pending.length ? "warning" : "neutral"} href="/club/bookings" hint="Awaiting administrator review" />
        <StatCard label="Approved & upcoming" value={approvedUpcoming.length} icon={CalendarCheck} href="/club/bookings" />
        <StatCard label="Rejected" value={rejected.length} icon={CircleX} tone={rejected.length ? "danger" : "neutral"} href="/club/history" hint={rejected.length ? "Reasons shown below" : "None so far"} />
        <StatCard label="Total requests" value={bookings.length} icon={Ticket} hint={settings.academicTerm} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={CalendarCheck}
            title="Upcoming events"
            description={upcoming.length ? `${plural(upcoming.length, "event")} scheduled or awaiting approval` : "Nothing scheduled yet"}
            action={
              <ButtonLink href="/club/bookings" variant="ghost" size="sm">
                My bookings <ArrowRight aria-hidden />
              </ButtonLink>
            }
          />
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 6).map((b) => (
                <UpcomingBookingRow key={b.id} b={b} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck} title="No upcoming events" description="Book a venue to get your next event on the calendar." action={<ButtonLink href="/club/bookings/new">New booking</ButtonLink>} />
          )}
        </Card>
        <Card className="flex flex-col overflow-hidden">
          <div className="tile-pattern bg-ink p-5 text-white">
            <CalendarPlus className="size-6 text-brand-300" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Quick booking</h2>
            <p className="mt-1 text-[13px] leading-5 text-white/70">Pick a venue and time — TESSRA checks the timetable, exams and other bookings instantly.</p>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <ul className="space-y-2 text-[13px] text-ink-2">
              <li>• At least {plural(settings.bookingLeadDays, "day")} notice</li>
              <li>• Up to {settings.maxBookingHours} hours per booking</li>
              <li>• {settings.clubApprovalRequired ? "Reviewed by the administrator" : "Conflict-free requests confirm instantly"}</li>
            </ul>
            <ButtonLink href="/club/bookings/new" className="mt-5 w-full">
              Start a booking
            </ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader icon={CircleX} title="Rejected requests" description="Reasons and suggested alternatives" />
          {rejected.length ? (
            <ul className="divide-y divide-line">
              {rejected.slice(0, 3).map((b) => (
                <li key={b.id} className="px-5 py-3.5">
                  <p className="text-[13px] font-semibold text-ink">{b.title}</p>
                  <p className="text-xs text-ink-3">
                    {b.roomCode} · {formatDate(b.date)} {b.startTime}–{b.endTime}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-5 text-danger-fg">{b.rejectionReason}</p>
                  {b.suggestedRoomId && b.suggestedRoomCode && b.date >= today && (
                    <Link
                      href={qs("/club/bookings/new", { room: b.suggestedRoomId, date: b.date, start: b.startTime, end: b.endTime })}
                      className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:underline"
                    >
                      <Sparkles className="size-3.5" aria-hidden /> Book suggested venue {b.suggestedRoomCode}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CircleX} title="No rejected requests" compact />
          )}
        </Card>
        <Card>
          <CardHeader
            icon={Compass}
            title="Discover venues"
            action={
              <ButtonLink href="/club/venues" variant="ghost" size="sm">
                Browse all
              </ButtonLink>
            }
          />
          <ul className="divide-y divide-line">
            {venues.map((r) => (
              <li key={r.id}>
                <Link href={qs("/club/bookings/new", { room: r.id })} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">{r.code.slice(0, 3)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-ink-2">{ROOM_TYPE_LABEL[r.type]}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-2">
                    <Users className="size-3.5 text-ink-3" aria-hidden />
                    {r.capacity}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            icon={Bell}
            title="Notifications"
            action={
              <ButtonLink href="/club/notifications" variant="ghost" size="sm">
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
