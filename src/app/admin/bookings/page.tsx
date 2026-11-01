import { CalendarCheck, Hourglass, Search, Ticket, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import { BookingReviewActions, ConflictList } from "@/components/domain";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, PriorityBadge, StatCard, StatusBadge, TabLinks, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { buildBookingAnalyzer } from "@/lib/engine";
import { categoryLabel } from "@/lib/constants";
import { qs, readParams, type SearchParams } from "@/lib/params";
import { listBookings } from "@/lib/queries";
import { formatDate, plural, relativeDay, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Bookings" };

const STATUSES = ["all", "pending", "approved", "rejected", "cancelled"] as const;

export default async function AdminBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const status = STATUSES.find((s) => s === get("status")) ?? "all";
  const q = (get("q") ?? "").trim();
  const [all, analyzer] = await Promise.all([listBookings(), buildBookingAnalyzer()]);
  const today = todayIso();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, s === "all" ? all.length : all.filter((b) => b.status === s).length])) as Record<(typeof STATUSES)[number], number>;
  const rows = all
    .filter((b) => status === "all" || b.status === status)
    .filter((b) => !q || `${b.title} ${b.orgName} ${b.requesterName} ${b.roomCode}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.date.localeCompare(a.date));
  const pending = all.filter((b) => b.status === "pending");
  const conflicted = pending.filter((b) => analyzer.check(b).some((c) => c.severity === "error")).length;

  return (
    <>
      <PageHeader eyebrow="Campus" title="Bookings" description="Venue requests from clubs and departments, checked live against the timetable, examinations and other bookings." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting decision" value={pending.length} icon={Hourglass} tone={pending.length ? "warning" : "brand"} href="/admin/bookings?status=pending" />
        <StatCard label="Pending with conflicts" value={conflicted} icon={TriangleAlert} tone={conflicted ? "danger" : "neutral"} hint="Need an alternative venue" />
        <StatCard label="Upcoming confirmed" value={all.filter((b) => b.status === "approved" && b.date >= today).length} icon={CalendarCheck} />
        <StatCard label="Total requests" value={all.length} icon={Ticket} hint={`${counts.rejected} rejected · ${counts.cancelled} cancelled`} />
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-line px-4 pt-3 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <TabLinks
            label="Booking status"
            bordered={false}
            items={STATUSES.map((s) => ({ href: qs("/admin/bookings", { status: s === "all" ? undefined : s, q: q || undefined }), label: s === "all" ? "All" : s[0].toUpperCase() + s.slice(1), count: counts[s], active: status === s }))}
          />
          <Form action="/admin/bookings" className="flex gap-2 pb-3" aria-label="Search bookings">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <div className="relative w-full lg:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <label htmlFor="q" className="sr-only">
                Search bookings
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="Event, organisation, venue…" className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </Form>
        </div>
        {rows.length ? (
          <TableWrap>
            <Table className="min-w-[1080px]">
              <THead>
                <tr>
                  <TH>Event</TH>
                  <TH>Venue</TH>
                  <TH>Date &amp; time</TH>
                  <TH className="text-right">Attendees</TH>
                  <TH>Priority</TH>
                  <TH>Status</TH>
                  <TH className="w-64">Checks &amp; notes</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((b) => {
                  const conflicts = b.status === "pending" ? analyzer.check(b) : [];
                  const alternatives = b.status === "pending" ? analyzer.alternatives(b, { bookableOnly: b.requesterRole === "club" }) : [];
                  return (
                    <TR key={b.id} className="align-top">
                      <TD className="align-top">
                        <p className="font-semibold">{b.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
                          <Avatar name={b.requesterName} size="xs" />
                          {b.requesterName} · {b.orgName}
                        </p>
                        <p className="mt-1 text-xs text-ink-3">{categoryLabel(b.category)}</p>
                      </TD>
                      <TD className="align-top">
                        <p className="font-medium">{b.roomCode}</p>
                        <p className="text-xs text-ink-2">{b.roomName}</p>
                      </TD>
                      <TD className="whitespace-nowrap align-top">
                        <p className="font-medium">{formatDate(b.date)}</p>
                        <p className="tabular text-xs text-ink-2">
                          {b.startTime}–{b.endTime} · {relativeDay(b.date)}
                        </p>
                      </TD>
                      <TD className={`tabular text-right align-top ${b.attendees > b.roomCapacity ? "text-danger-fg" : ""}`}>
                        {b.attendees}
                        <span className="text-xs text-ink-3">/{b.roomCapacity}</span>
                      </TD>
                      <TD className="align-top">
                        <PriorityBadge priority={b.priority} />
                      </TD>
                      <TD className="align-top">
                        <StatusBadge status={b.status} />
                      </TD>
                      <TD className="align-top">
                        {b.status === "pending" ? (
                          <ConflictList items={conflicts} okText="No conflicts" />
                        ) : b.status === "rejected" ? (
                          <p className="text-xs text-ink-2">
                            {b.rejectionReason}
                            {b.suggestedRoomCode && <span className="mt-1 block font-medium text-brand-700">Suggested: {b.suggestedRoomCode}</span>}
                          </p>
                        ) : (
                          <p className="text-xs text-ink-3">{b.reviewerName ? `Reviewed by ${b.reviewerName}` : "—"}</p>
                        )}
                      </TD>
                      <TD className="text-right align-top">
                        {b.status === "pending" ? (
                          <div className="flex justify-end">
                            <BookingReviewActions booking={b} alternatives={alternatives} />
                          </div>
                        ) : (
                          <Badge tone="outline">Closed</Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState icon={Ticket} title={q ? "No bookings match your search" : "No bookings in this view"} description={plural(all.length, "booking") + " in total."} />
        )}
      </Card>
    </>
  );
}
