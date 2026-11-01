import { CalendarPlus, Ticket, X } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmAction } from "@/components/client";
import { BookingCard } from "@/components/domain";
import { ButtonLink, Callout, Card, EmptyState, PageHeader } from "@/components/ui";
import { cancelBookingAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { listBookings } from "@/lib/queries";
import { plural, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "My Bookings" };

export default async function MyBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("club");
  const get = await readParams(searchParams);
  const today = todayIso();
  const bookings = await listBookings({ requesterId: user.id });
  const active = bookings
    .filter((b) => b.date >= today && (b.status === "pending" || b.status === "approved"))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const pending = active.filter((b) => b.status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow={user.clubName ?? "Club"}
        title="My Bookings"
        description={`${plural(active.length, "active booking")} · ${pending} awaiting review`}
        actions={
          <ButtonLink href="/club/bookings/new">
            <CalendarPlus aria-hidden /> New booking
          </ButtonLink>
        }
      />
      {get("submitted") && (
        <Callout tone="success" title="Request submitted" className="mb-6">
          Your venue passed the availability check and is now with the administrator. You&apos;ll be notified when it&apos;s reviewed.
        </Callout>
      )}
      {active.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {active.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              actions={
                <ConfirmAction
                  action={cancelBookingAction}
                  fields={{ id: b.id }}
                  trigger={
                    <>
                      <X aria-hidden /> {b.status === "pending" ? "Withdraw request" : "Cancel booking"}
                    </>
                  }
                  title={`Cancel “${b.title}”?`}
                  description="The venue will be released for other requests. This cannot be undone."
                  confirmLabel={b.status === "pending" ? "Withdraw request" : "Cancel booking"}
                />
              }
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Ticket} title="No active bookings" description="Find a venue and submit a request — it only takes a minute." action={<ButtonLink href="/club/venues">Discover venues</ButtonLink>} />
        </Card>
      )}
    </>
  );
}
