import { Info, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import { AvailabilityGrid } from "@/components/availability-grid";
import { Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAY_COUNT, DAY_SHORT, PERIOD_COUNT } from "@/lib/constants";
import { getPublishedTimetable } from "@/lib/queries";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Availability" };

export default async function FacultyAvailabilityPage() {
  const user = await requireRole("faculty");
  const tt = await getPublishedTimetable();
  const mine = tt?.sessions.filter((s) => s.facultyId === user.id) ?? [];
  const blocks = (tt?.state.blockRows ?? []).filter((b) => b.facultyId === user.id).map((b) => ({ day: b.day, period: b.period, reason: b.reason }));
  const teaching = mine.flatMap((s) => Array.from({ length: s.duration }, (_, i) => ({ day: s.day, period: s.startPeriod + i, label: s.courseCode })));
  const conflicting = mine.filter((s) => blocks.some((b) => b.day === s.day && b.period >= s.startPeriod && b.period < s.startPeriod + s.duration));

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="Availability"
        description="Tell the scheduling engine when you can't teach. New generations avoid these slots; existing classes need a change request."
      />
      {conflicting.length > 0 && (
        <Callout tone="warning" title="Some teaching slots are also marked unavailable" className="mb-6">
          {conflicting.map((s) => `${s.courseCode} (${DAY_SHORT[s.day]} P${s.startPeriod})`).join(", ")} — submit a schedule change request so your coordinator can move them.
        </Callout>
      )}
      <Card>
        <CardHeader
          icon={UserCheck}
          title="Weekly availability"
          description={`${plural(DAY_COUNT * PERIOD_COUNT - blocks.length, "slot")} open · ${plural(blocks.length, "slot")} blocked · ${plural(teaching.length, "teaching period")}`}
        />
        <AvailabilityGrid blocks={blocks} teaching={teaching} />
        <div className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-ink-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
          Teaching slots are locked to protect the published timetable. Use Schedule Change Requests to move a class.
        </div>
      </Card>
    </>
  );
}
