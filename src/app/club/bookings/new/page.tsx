import { CalendarPlus, CircleCheck, ClipboardList, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { BookingForm } from "@/components/booking-form";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { createBookingAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { getRef, getSettings } from "@/lib/queries";
import { addDaysIso, isIsoDate, isValidTime, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "New Booking" };

export default async function NewBookingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("club");
  const get = await readParams(searchParams);
  const [ref, settings] = await Promise.all([getRef(), getSettings()]);
  const venues = ref.rooms
    .filter((r) => r.bookable || r.type === "lab")
    .map((r) => ({ id: r.id, code: r.code, name: r.name, capacity: r.capacity, type: r.type, building: r.building, status: r.status }));
  const room = Number(get("room"));
  const date = get("date") ?? "";
  const start = get("start") ?? "";
  const end = get("end") ?? "";
  const steps = [
    { icon: ClipboardList, title: "Submit your request", body: "Availability is checked instantly; conflicts come with alternative venues." },
    { icon: ShieldCheck, title: settings.clubApprovalRequired ? "Administrator review" : "Automatic confirmation", body: settings.clubApprovalRequired ? "High-priority requests are reviewed first." : "Conflict-free requests are confirmed immediately." },
    { icon: CircleCheck, title: "Get notified", body: "You'll receive a notification with the decision and any notes." },
  ];

  return (
    <>
      <PageHeader eyebrow={user.clubName ?? "Club"} title="New Booking" description="Request a campus venue for your club's event." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader icon={CalendarPlus} title="Booking request" description="Fields marked * are required." />
          <CardBody>
            <BookingForm
              action={createBookingAction}
              venues={venues}
              mode="club"
              minDate={addDaysIso(todayIso(), settings.bookingLeadDays)}
              leadDays={settings.bookingLeadDays}
              maxHours={settings.maxBookingHours}
              defaults={{
                roomId: venues.some((v) => v.id === room) ? room : undefined,
                date: isIsoDate(date) ? date : undefined,
                startTime: isValidTime(start) ? start : undefined,
                endTime: isValidTime(end) ? end : undefined,
              }}
            />
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="How it works" />
          <ol className="space-y-4 p-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {i + 1}. {s.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-5 py-4 text-xs leading-5 text-ink-2">
            Policy: at least {settings.bookingLeadDays} day(s) notice · maximum {settings.maxBookingHours} hours · {settings.allowWeekendBookings ? "weekends allowed" : "weekdays only"}.
          </div>
        </Card>
      </div>
    </>
  );
}
