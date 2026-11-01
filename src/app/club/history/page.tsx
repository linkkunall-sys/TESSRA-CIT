import { FileClock } from "lucide-react";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader, StatusBadge, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { categoryLabel } from "@/lib/constants";
import { listBookings } from "@/lib/queries";
import { formatDate, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Booking History" };

export default async function BookingHistoryPage() {
  const user = await requireRole("club");
  const today = todayIso();
  const bookings = await listBookings({ requesterId: user.id });
  const history = bookings.filter((b) => b.date < today || b.status === "rejected" || b.status === "cancelled");

  return (
    <>
      <PageHeader eyebrow={user.clubName ?? "Club"} title="Booking History" description="Past events plus rejected and cancelled requests, with reviewer notes." />
      <Card>
        {history.length ? (
          <TableWrap>
            <Table className="min-w-[860px]">
              <THead>
                <tr>
                  <TH>Event</TH>
                  <TH>Venue</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Attendees</TH>
                  <TH>Status</TH>
                  <TH className="w-72">Notes</TH>
                </tr>
              </THead>
              <tbody>
                {history.map((b) => (
                  <TR key={b.id} className="align-top">
                    <TD>
                      <p className="font-semibold">{b.title}</p>
                      <p className="text-xs text-ink-2">{categoryLabel(b.category)}</p>
                    </TD>
                    <TD>
                      <p className="font-medium">{b.roomCode}</p>
                      <p className="text-xs text-ink-2">{b.roomName}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <p>{formatDate(b.date)}</p>
                      <p className="tabular text-xs text-ink-2">
                        {b.startTime}–{b.endTime}
                      </p>
                    </TD>
                    <TD className="tabular text-right">{b.attendees}</TD>
                    <TD>
                      <StatusBadge status={b.status === "approved" ? "approved" : b.status} />
                    </TD>
                    <TD className="text-xs text-ink-2">
                      {b.rejectionReason ?? (b.status === "approved" ? "Event completed" : b.status === "cancelled" ? "Cancelled by your club" : "—")}
                      {b.suggestedRoomCode && <span className="mt-1 block font-medium text-brand-700">Suggested alternative: {b.suggestedRoomCode}</span>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState icon={FileClock} title="No booking history yet" description="Completed, rejected and cancelled requests will appear here." />
        )}
      </Card>
    </>
  );
}
