import { Accessibility, Building, CalendarCheck, LayoutGrid, List, Plus, Search, Settings2, Users, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ActionForm, AutoSubmitSelect, Dialog, DialogCancel, DialogFooter, FormField, SubmitButton } from "@/components/client";
import { VenueCard } from "@/components/domain";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, Input, PageHeader, Select, StatCard, StatusBadge, Table, TableWrap, TD, TH, THead, TR, Textarea, buttonClasses } from "@/components/ui";
import { createRoomAction, updateRoomStatusAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { buildBookingAnalyzer } from "@/lib/engine";
import { ROOM_FEATURES, ROOM_TYPE_LABEL, type RoomType } from "@/lib/constants";
import type { RoomRow } from "@/db/schema";
import { qs, readParams, type SearchParams } from "@/lib/params";
import { getPublishedTimetable, getRef } from "@/lib/queries";
import { cn, formatDateLong, isIsoDate, isValidTime, pct, toMinutes, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Venues" };

function StatusDialog({ room }: { room: RoomRow }) {
  return (
    <Dialog
      variant="secondary"
      triggerSize="sm"
      trigger={
        <>
          <Settings2 aria-hidden /> Update status
        </>
      }
      title={`Update ${room.code} status`}
      description="Marking a venue unavailable flags affected timetable sessions and bookings for review."
      size="sm"
    >
      <ActionForm action={updateRoomStatusAction} className="space-y-4">
        <input type="hidden" name="roomId" value={room.id} />
        <FormField name="status" label="Status" required>
          <Select id="status" name="status" defaultValue={room.status}>
            <option value="active">Active</option>
            <option value="maintenance">Under maintenance</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormField>
        <FormField name="note" label="Note" hint="Required when the venue is unavailable.">
          <Textarea id="note" name="note" defaultValue={room.maintenanceNote ?? ""} maxLength={200} className="min-h-[72px]" />
        </FormField>
        <DialogFooter>
          <DialogCancel />
          <SubmitButton pendingLabel="Saving…">Save status</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );
}

export default async function VenuesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const [ref, tt] = await Promise.all([getRef(), getPublishedTimetable()]);
  const q = (get("q") ?? "").trim().toLowerCase();
  const type = get("type") ?? "";
  const status = get("status") ?? "";
  const cap = Number(get("cap") ?? 0) || 0;
  const date = get("date") ?? "";
  const start = get("start") ?? "";
  const end = get("end") ?? "";
  const checking = isIsoDate(date) && isValidTime(start) && isValidTime(end) && toMinutes(end) > toMinutes(start);
  const view = get("view") === "table" ? "table" : "cards";
  const rooms = ref.rooms.filter(
    (r) =>
      (!q || `${r.code} ${r.name} ${r.building} ${r.features.join(" ")}`.toLowerCase().includes(q)) &&
      (!type || r.type === type) &&
      (!status || r.status === status) &&
      r.capacity >= cap,
  );
  const analyzer = checking ? await buildBookingAnalyzer() : null;
  const availability = (roomId: number) => {
    if (!analyzer) return null;
    const errors = analyzer.check({ roomId, date, startTime: start, endTime: end, attendees: cap || 1 }).filter((conflict) => conflict.severity === "error");
    return errors.length ? { ok: false, reason: errors[0].message } : { ok: true };
  };
  const results = rooms.map((room) => ({ room, availability: availability(room.id) }));
  if (checking) results.sort((a, b) => Number(b.availability?.ok) - Number(a.availability?.ok) || a.room.code.localeCompare(b.room.code));
  const util = (r: RoomRow) => pct(tt?.roomLoad.get(r.id) ?? 0, 40);
  const params = { q: get("q"), type, status, cap: cap || undefined, date: date || undefined, start: start || undefined, end: end || undefined };

  const addVenue = (
    <Dialog
      variant="primary"
      size="lg"
      trigger={
        <>
          <Plus aria-hidden /> Add venue
        </>
      }
      title="Add a venue"
    >
      <ActionForm action={createRoomAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="code" label="Code" required hint="e.g. C-301">
          <Input id="code" name="code" maxLength={10} className="uppercase" />
        </FormField>
        <FormField name="capacity" label="Capacity" required>
          <Input id="capacity" name="capacity" type="number" min={5} />
        </FormField>
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" />
        </FormField>
        <FormField name="building" label="Building" required>
          <Input id="building" name="building" />
        </FormField>
        <FormField name="type" label="Type" required className="sm:col-span-2">
          <Select id="type" name="type" defaultValue="lecture">
            {(Object.keys(ROOM_TYPE_LABEL) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink">Features</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROOM_FEATURES.map((f) => (
              <Checkbox key={f} name="features" value={f} label={f} />
            ))}
          </div>
        </fieldset>
        <div className="space-y-2 sm:col-span-2">
          <Checkbox name="accessible" defaultChecked label="Step-free access" description="Wheelchair accessible entrance and seating" />
          <Checkbox name="bookable" label="Open to club & event bookings" />
        </div>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Saving…">Add venue</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  return (
    <>
      <PageHeader eyebrow="Campus" title="Venues" description="Find a free room by date, time and capacity, or manage every venue's features, accessibility and maintenance status." actions={addVenue} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Venues" value={ref.rooms.length} icon={Building} />
        <StatCard label="Active" value={ref.rooms.filter((r) => r.status === "active").length} icon={Building} hint="Available for scheduling" />
        <StatCard label="Under maintenance" value={ref.rooms.filter((r) => r.status !== "active").length} icon={Wrench} tone={ref.rooms.some((r) => r.status !== "active") ? "warning" : "neutral"} />
        <StatCard label="Total seats" value={ref.rooms.reduce((n, r) => n + r.capacity, 0).toLocaleString("en-GB")} icon={Users} hint={`${ref.rooms.filter((r) => r.accessible).length} step-free venues`} />
      </div>

      <Card className="mt-6 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="size-4 text-brand-600" aria-hidden />
          <p className="text-[13px] font-semibold text-ink">Live room finder</p>
          <span className="text-xs text-ink-3">Checks classes, exams and approved bookings</span>
        </div>
        <Form action="/admin/venues" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(210px,1.5fr)_repeat(6,minmax(95px,.75fr))_auto_auto] xl:items-end" aria-label="Find and filter venues">
          <input type="hidden" name="view" value={view} />
          <div className="sm:col-span-2 lg:col-span-4 xl:col-span-1">
            <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-ink-2">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input id="q" name="q" defaultValue={get("q")} placeholder="Code, building or feature…" className="pl-9" />
            </div>
          </div>
          <div>
            <label htmlFor="type" className="mb-1.5 block text-xs font-medium text-ink-2">Type</label>
            <AutoSubmitSelect id="type" name="type" defaultValue={type}>
              <option value="">All types</option>
              {(Object.keys(ROOM_TYPE_LABEL) as RoomType[]).map((t) => <option key={t} value={t}>{ROOM_TYPE_LABEL[t]}</option>)}
            </AutoSubmitSelect>
          </div>
          <div>
            <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-ink-2">Status</label>
            <AutoSubmitSelect id="status" name="status" defaultValue={status}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </AutoSubmitSelect>
          </div>
          <div>
            <label htmlFor="cap" className="mb-1.5 block text-xs font-medium text-ink-2">Min. seats</label>
            <Input id="cap" name="cap" type="number" min={0} defaultValue={cap || ""} placeholder="Any" />
          </div>
          <div>
            <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-ink-2">Date</label>
            <Input id="date" name="date" type="date" min={todayIso()} defaultValue={date} />
          </div>
          <div>
            <label htmlFor="start" className="mb-1.5 block text-xs font-medium text-ink-2">From</label>
            <Input id="start" name="start" type="time" defaultValue={start} />
          </div>
          <div>
            <label htmlFor="end" className="mb-1.5 block text-xs font-medium text-ink-2">To</label>
            <Input id="end" name="end" type="time" defaultValue={end} />
          </div>
          <Button type="submit"><Search aria-hidden /> Find</Button>
          <div className="flex w-fit rounded-lg border border-line p-0.5" role="group" aria-label="Layout">
            <Link href={qs("/admin/venues", { ...params, view: "cards" })} aria-label="Card view" aria-current={view === "cards" ? "true" : undefined} className={cn(buttonClasses("ghost", "icon-sm"), view === "cards" && "bg-brand-50 text-brand-700")}>
              <LayoutGrid aria-hidden />
            </Link>
            <Link href={qs("/admin/venues", { ...params, view: "table" })} aria-label="Table view" aria-current={view === "table" ? "true" : undefined} className={cn(buttonClasses("ghost", "icon-sm"), view === "table" && "bg-brand-50 text-brand-700")}>
              <List aria-hidden />
            </Link>
          </div>
        </Form>
      </Card>

      {checking ? (
        <Callout tone="brand" className="mt-4" title={`Availability for ${formatDateLong(date)}, ${start}–${end}`}>
          {results.filter((result) => result.availability?.ok).length} of {results.length} matching venues are free. Available rooms are listed first.
        </Callout>
      ) : (
        (date || start || end) && <Callout tone="warning" className="mt-4">Enter a date plus a valid start and end time to run the live availability check.</Callout>
      )}

      <p className="mb-3 mt-6 text-[13px] text-ink-2" aria-live="polite">
        Showing {results.length} of {ref.rooms.length} venues{checking ? ` · ${results.filter((result) => result.availability?.ok).length} free` : ""}
      </p>

      {!results.length ? (
        <Card>
          <EmptyState icon={Search} title="No venues match these filters" description="Try a broader search or clear the filters." />
        </Card>
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map(({ room, availability: roomAvailability }) => (
            <VenueCard
              key={room.id}
              room={room}
              utilisation={["lecture", "lab", "seminar", "auditorium"].includes(room.type) ? util(room) : undefined}
              availability={roomAvailability}
              actions={<StatusDialog room={room} />}
            />
          ))}
        </div>
      ) : (
        <Card>
          <TableWrap>
            <Table className="min-w-[900px]">
              <THead>
                <tr>
                  <TH>Venue</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Seats</TH>
                  <TH>Features</TH>
                  <TH>Access</TH>
                  <TH className="text-right">Weekly use</TH>
                  {checking && <TH>Availability</TH>}
                  <TH>Status</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {results.map(({ room: r, availability: roomAvailability }) => (
                  <TR key={r.id}>
                    <TD>
                      <p className="font-semibold">{r.code}</p>
                      <p className="text-xs text-ink-2">
                        {r.name} · {r.building}
                      </p>
                    </TD>
                    <TD className="text-ink-2">{ROOM_TYPE_LABEL[r.type]}</TD>
                    <TD className="tabular text-right">{r.capacity}</TD>
                    <TD className="max-w-[220px] text-xs text-ink-2">{r.features.join(", ") || "—"}</TD>
                    <TD>{r.accessible ? <Badge tone="success" icon={Accessibility}>Step-free</Badge> : <Badge tone="neutral">Stairs only</Badge>}</TD>
                    <TD className="tabular text-right">{util(r)}%</TD>
                    {checking && (
                      <TD>
                        {roomAvailability?.ok ? <Badge tone="success">Free</Badge> : <Badge tone="danger" title={roomAvailability?.reason}>Busy</Badge>}
                        {!roomAvailability?.ok && <p className="mt-1 max-w-[220px] text-xs text-danger-fg">{roomAvailability?.reason}</p>}
                      </TD>
                    )}
                    <TD>
                      <StatusBadge status={r.status} />
                      {r.maintenanceNote && r.status !== "active" && <p className="mt-1 max-w-[200px] text-xs text-warning-fg">{r.maintenanceNote}</p>}
                    </TD>
                    <TD className="text-right">
                      <StatusDialog room={r} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
