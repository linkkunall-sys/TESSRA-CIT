import { CalendarCheck, CalendarPlus, FlaskConical, History, X } from "lucide-react";
import type { Metadata } from "next";
import { BookingForm } from "@/components/booking-form";
import { ConfirmAction, Dialog } from "@/components/client";
import { BookingCard, DepartmentLabBookingReviewActions } from "@/components/domain";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { cancelBookingAction, createBookingAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { compareBookingPriority } from "@/lib/booking-policy";
import { buildBookingAnalyzer } from "@/lib/engine";
import { getBookingPriorityPolicy, getRef, getSettings, listBookings } from "@/lib/queries";
import { todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Department Events" };

export default async function CoordinatorEventsPage() {
  const user = await requireRole("coordinator");
  const [ref, settings, allBookings, analyzer, priorityPolicy] = await Promise.all([getRef(), getSettings(), listBookings(), buildBookingAnalyzer(), getBookingPriorityPolicy()]);
  const bookings = user.departmentId ? allBookings.filter((booking) => booking.departmentId === user.departmentId) : [];
  const sourceLabOwner: Record<string, string> = { lab_cs: "CSE", lab_elec: "ECE", lab_phy: "PH", workshop: "ME", lab_civil: "CE" };
  const ownedLabIds = new Set(ref.rooms
    .filter((room) => Boolean(user.departmentId) && room.type === "lab" && (room.departmentId === user.departmentId || (room.sourceType && sourceLabOwner[room.sourceType] === user.departmentName)))
    .map((room) => room.id));
  const labApprovals = allBookings
    .filter((booking) => booking.status === "pending" && ownedLabIds.has(booking.roomId))
    .sort((a, b) => compareBookingPriority(a, b, priorityPolicy));
  const today = todayIso();
  const upcoming = bookings.filter((b) => b.date >= today && b.status !== "cancelled" && b.status !== "rejected").sort((a, b) => a.date.localeCompare(b.date));
  const past = bookings.filter((b) => !upcoming.includes(b));
  const venues = ref.rooms
    .filter((room) => room.bookable || room.allowedUses.includes("event"))
    .map((r) => ({ id: r.id, code: r.code, name: r.name, capacity: r.capacity, type: r.type, building: r.building, status: r.status }));

  const request = (
    <Dialog
      variant="primary"
      size="lg"
      trigger={
        <>
          <CalendarPlus aria-hidden /> Request a venue
        </>
      }
      title="Request a venue for a department event"
      description="Availability is checked against the timetable, examinations and approved bookings before the request is sent to the administrator."
    >
      <BookingForm action={createBookingAction} venues={venues} mode="department" minDate={today} leadDays={0} maxHours={settings.maxBookingHours} />
    </Dialog>
  );

  return (
    <>
      <PageHeader eyebrow={user.departmentName ?? "Department"} title="Department Events" description="Seminars, workshops, guest lectures and approval of requests for department-owned labs." actions={request} />

      <section aria-labelledby="lab-approvals-heading" className="mb-10">
        <SectionTitle>
          <span id="lab-approvals-heading" className="flex items-center gap-2"><FlaskConical className="size-4 text-ink-3" aria-hidden /> Department lab approvals</span>
        </SectionTitle>
        {labApprovals.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {labApprovals.map((booking) => {
              const alternatives = analyzer.alternatives(booking, { includeLabs: true, limit: ref.rooms.length }).filter((room) => ownedLabIds.has(room.id));
              return (
                <BookingCard
                  key={booking.id}
                  b={booking}
                  showRequester
                  conflicts={analyzer.check(booking)}
                  actions={<DepartmentLabBookingReviewActions booking={booking} alternatives={alternatives} />}
                />
              );
            })}
          </div>
        ) : (
          <Card>
            <EmptyState icon={FlaskConical} title="No department lab bookings awaiting review" description="Pending requests for labs owned by your department will appear here." compact />
          </Card>
        )}
      </section>

      <section aria-labelledby="upcoming-heading">
        <SectionTitle>
          <span id="upcoming-heading">Upcoming</span>
        </SectionTitle>
        {upcoming.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                actions={
                  <ConfirmAction
                    action={cancelBookingAction}
                    fields={{ id: b.id }}
                    trigger={
                      <>
                        <X aria-hidden /> Cancel booking
                      </>
                    }
                    title={`Cancel “${b.title}”?`}
                    description="The venue will be released for other requests."
                    confirmLabel="Cancel booking"
                  />
                }
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={CalendarCheck} title="No upcoming department events" description="Request a venue to schedule your next seminar or workshop." action={request} />
          </Card>
        )}
      </section>
      <section aria-labelledby="past-heading" className="mt-10">
        <SectionTitle>
          <span id="past-heading" className="flex items-center gap-2">
            <History className="size-4 text-ink-3" aria-hidden /> Past &amp; closed
          </span>
        </SectionTitle>
        {past.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {past.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={History} title="No past events yet" compact />
          </Card>
        )}
      </section>
    </>
  );
}
