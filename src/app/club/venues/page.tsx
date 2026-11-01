import { CalendarPlus, Compass, Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import { AutoSubmitSelect } from "@/components/client";
import { VenueCard } from "@/components/domain";
import { Button, ButtonLink, Callout, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { ROOM_TYPE_LABEL, type RoomType } from "@/lib/constants";
import { buildBookingAnalyzer } from "@/lib/engine";
import { qs, readParams, type SearchParams } from "@/lib/params";
import { getRef } from "@/lib/queries";
import { formatDateLong, isIsoDate, isValidTime, toMinutes, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Discover Venues" };

export default async function DiscoverVenuesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("club");
  const get = await readParams(searchParams);
  const ref = await getRef();
  const q = (get("q") ?? "").trim().toLowerCase();
  const type = get("type") ?? "";
  const cap = Number(get("cap") ?? 0) || 0;
  const date = get("date") ?? "";
  const start = get("start") ?? "";
  const end = get("end") ?? "";
  const checking = isIsoDate(date) && isValidTime(start) && isValidTime(end) && toMinutes(end) > toMinutes(start);
  const bookable = ref.rooms.filter((r) => r.bookable || r.type === "lab");
  const types = [...new Set(bookable.map((r) => r.type))] as RoomType[];
  const venues = bookable.filter((r) => (!q || `${r.code} ${r.name} ${r.building} ${r.features.join(" ")}`.toLowerCase().includes(q)) && (!type || r.type === type) && r.capacity >= cap);
  const analyzer = checking ? await buildBookingAnalyzer() : null;
  const availability = (roomId: number) => {
    if (!analyzer) return null;
    const errors = analyzer.check({ roomId, date, startTime: start, endTime: end, attendees: cap || 1 }).filter((c) => c.severity === "error");
    return errors.length ? { ok: false, reason: errors[0].message } : { ok: true };
  };
  const results = venues.map((r) => ({ room: r, availability: availability(r.id) }));
  if (checking) results.sort((a, b) => Number(b.availability?.ok) - Number(a.availability?.ok));

  return (
    <>
      <PageHeader eyebrow="Venues" title="Discover Venues" description="Find the right space for your event. Add a date and time to see live availability." />
      <Card className="p-4 sm:p-5">
        <Form action="/club/venues" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto] lg:items-end" aria-label="Search venues">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-ink-2">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input id="q" name="q" defaultValue={get("q")} placeholder="Name or feature…" className="pl-9" />
            </div>
          </div>
          <div>
            <label htmlFor="type" className="mb-1.5 block text-xs font-medium text-ink-2">
              Type
            </label>
            <AutoSubmitSelect id="type" name="type" defaultValue={type}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {ROOM_TYPE_LABEL[t]}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div>
            <label htmlFor="cap" className="mb-1.5 block text-xs font-medium text-ink-2">
              Attendees
            </label>
            <Input id="cap" name="cap" type="number" min={0} defaultValue={cap || ""} placeholder="Any" />
          </div>
          <div>
            <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-ink-2">
              Date
            </label>
            <Input id="date" name="date" type="date" min={todayIso()} defaultValue={date} />
          </div>
          <div>
            <label htmlFor="start" className="mb-1.5 block text-xs font-medium text-ink-2">
              From
            </label>
            <Input id="start" name="start" type="time" defaultValue={start} />
          </div>
          <div>
            <label htmlFor="end" className="mb-1.5 block text-xs font-medium text-ink-2">
              To
            </label>
            <Input id="end" name="end" type="time" defaultValue={end} />
          </div>
          <Button type="submit" className="sm:col-span-2 lg:col-span-1">
            <Search aria-hidden /> Search
          </Button>
        </Form>
      </Card>

      {checking ? (
        <Callout tone="brand" className="mt-6" title={`Availability for ${formatDateLong(date)}, ${start}–${end}`}>
          {results.filter((r) => r.availability?.ok).length} of {results.length} venues are free. Checked against the timetable, examinations and approved bookings.
        </Callout>
      ) : (
        (date || start || end) && (
          <Callout tone="warning" className="mt-6">
            Enter a date plus a valid start and end time to check availability.
          </Callout>
        )
      )}

      <p className="mb-3 mt-6 text-[13px] text-ink-2" aria-live="polite">
        {results.length} venue{results.length === 1 ? "" : "s"} open to club bookings
      </p>
      {results.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map(({ room, availability: a }) => (
            <VenueCard
              key={room.id}
              room={room}
              availability={a}
              actions={
                room.status === "active" ? (
                  <ButtonLink href={qs("/club/bookings/new", { room: room.id, date: date || undefined, start: start || undefined, end: end || undefined })} variant={a?.ok ? "primary" : "secondary"} size="sm">
                    <CalendarPlus aria-hidden /> Book this venue
                  </ButtonLink>
                ) : (
                  <span className="text-xs text-ink-3">Not bookable while unavailable</span>
                )
              }
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Compass} title="No venues match your search" description="Try fewer attendees or a different type." />
        </Card>
      )}
    </>
  );
}
