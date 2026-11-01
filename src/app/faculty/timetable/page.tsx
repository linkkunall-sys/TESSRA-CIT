import { CalendarDays, ClipboardCheck, MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import { Timetable, TimetableLegend } from "@/components/timetable";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAY_SHORT } from "@/lib/constants";
import { getPublishedTimetable } from "@/lib/queries";
import { formatRelative, hoursFromPeriods, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "My Timetable" };

export default async function FacultyTimetablePage() {
  const user = await requireRole("faculty");
  const tt = await getPublishedTimetable();
  const mine = tt?.sessions.filter((s) => s.facultyId === user.id) ?? [];
  const blocks = tt?.state.blockRows.filter((b) => b.facultyId === user.id) ?? [];
  const periods = mine.reduce((n, s) => n + s.duration, 0);
  const days = DAY_SHORT.filter((_, i) => mine.some((s) => s.day === i));
  const conflicts = mine.filter((s) => tt?.issuesBySession[s.id]?.length).length;
  const explainHref = (id: number) => {
    const session = mine.find((item) => item.id === id);
    if (!session) return "/faculty/assistant";
    const question = `Why is my ${session.courseCode} class on ${DAY_SHORT[session.day]} at P${session.startPeriod}?`;
    return `/faculty/assistant?q=${encodeURIComponent(question)}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="My Timetable"
        description={tt ? `${tt.version.label} · published ${tt.version.publishedAt ? formatRelative(tt.version.publishedAt) : ""}` : "No timetable has been published yet."}
        actions={
          <ButtonLink href="/faculty/requests" variant="secondary">
            <ClipboardCheck aria-hidden /> Request a change
          </ButtonLink>
        }
        meta={
          tt ? (
            <>
              <span className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">{plural(mine.length, "session")}</span>
              <span className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">{hoursFromPeriods(periods)} contact hours</span>
              <span className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">Teaching on {days.join(", ") || "no days"}</span>
              {conflicts > 0 && <span className="rounded-lg bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger-fg">{plural(conflicts, "session")} with conflicts</span>}
            </>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Weekly schedule</h2>
            {mine.length > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
                <MessageCircleQuestion className="size-3.5 text-brand-600" aria-hidden /> Select a class to ask why it was placed there.
              </p>
            )}
          </div>
          <TimetableLegend showUnavailable />
        </div>
        <div className="p-2 sm:p-3">
          {mine.length ? (
            <Timetable sessions={mine} issuesBySession={tt?.issuesBySession} blocks={blocks} hrefFor={explainHref} show={{ faculty: false }} label="My weekly timetable" />
          ) : (
            <EmptyState icon={CalendarDays} title="No sessions assigned" description="Once a timetable is published, your classes appear here." />
          )}
        </div>
      </Card>
    </>
  );
}
