import { ClipboardCheck, Plus, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import { ChangeRequestForm } from "@/components/change-request-form";
import { ConfirmAction, Dialog } from "@/components/client";
import { ChangeRequestCard } from "@/components/domain";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { withdrawChangeRequestAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { DAY_SHORT, ROOM_TYPE_LABEL } from "@/lib/constants";
import { getPublishedTimetable, getRef, listChangeRequests } from "@/lib/queries";
import { periodLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Schedule Change Requests" };

export default async function FacultyRequestsPage() {
  const user = await requireRole("faculty");
  const [tt, ref, requests] = await Promise.all([getPublishedTimetable(), getRef(), listChangeRequests({ facultyIds: [user.id] })]);
  const mine = tt?.sessions.filter((s) => s.facultyId === user.id) ?? [];
  const sessions = mine.map((s) => ({ id: s.id, kind: s.kind, label: `${s.courseCode} · ${s.groupCodes.join(" + ")} — ${DAY_SHORT[s.day]} ${periodLabel(s.startPeriod, s.duration)} in ${s.roomCode}` }));
  const rooms = ref.rooms
    .filter((r) => r.status === "active" && ["lecture", "lab", "seminar", "auditorium"].includes(r.type))
    .map((r) => ({ id: r.id, type: r.type, label: `${r.code} · ${r.name} (${r.capacity} seats, ${ROOM_TYPE_LABEL[r.type]})` }));
  const myOfferings = ref.offerings.filter((o) => o.facultyId === user.id);
  const offerings = myOfferings.flatMap((o) => {
    const c = ref.courseMap.get(o.courseId);
    if (!c) return [];
    return [{ courseId: o.courseId, code: c.code, title: c.title, kind: o.kind,
      groups: o.groupIds.flatMap((g) => { const x = ref.groupMap.get(g); return x ? [{ id: x.id, code: x.code, size: x.size }] : []; }) }];
  });
  const facultyBusy = mine.map((s) => ({ day: s.day, start: s.startPeriod, duration: s.duration }));
  const myGroupIds = new Set(myOfferings.flatMap((o) => o.groupIds));
  const groupBusy: Record<number, { day: number; start: number; duration: number }[]> = {};
  for (const s of tt?.sessions ?? []) {
    for (const g of s.groupIds) if (myGroupIds.has(g)) (groupBusy[g] ??= []).push({ day: s.day, start: s.startPeriod, duration: s.duration });
  }
  const blocks = (tt?.state.blockRows ?? []).filter((b) => b.facultyId === user.id).map((b) => ({ day: b.day, period: b.period }));
  const counts = { pending: requests.filter((r) => r.status === "pending").length, approved: requests.filter((r) => r.status === "approved").length, rejected: requests.filter((r) => r.status === "rejected").length };

  const newRequest = sessions.length || offerings.length ? (
    <Dialog
      variant="primary"
      size="lg"
      trigger={
        <>
          <Plus aria-hidden /> New request
        </>
      }
      title="Request a schedule change or a new class"
      description="Moves go to your coordinator; new extra classes are verified by the admin. Every slot is validated against the live timetable first."
    >
      <ChangeRequestForm sessions={sessions} rooms={rooms} offerings={offerings} facultyBusy={facultyBusy} groupBusy={groupBusy} blocks={blocks} />
    </Dialog>
  ) : undefined;

  return (
    <>
      <PageHeader eyebrow="Teaching" title="Schedule Change Requests" description="Reschedule a class, change its room, or request a new extra class in a free slot (verified by the admin). Approved changes update the published timetable." actions={newRequest} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={counts.pending} icon={ClipboardCheck} tone={counts.pending ? "warning" : "neutral"} />
        <StatCard label="Approved" value={counts.approved} icon={ClipboardCheck} />
        <StatCard label="Declined" value={counts.rejected} icon={ClipboardCheck} tone={counts.rejected ? "danger" : "neutral"} />
      </div>
      {requests.length ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {requests.map((r) => (
            <ChangeRequestCard
              key={r.id}
              r={r}
              actions={
                r.status === "pending" ? (
                  <ConfirmAction
                    action={withdrawChangeRequestAction}
                    fields={{ id: r.id }}
                    trigger={
                      <>
                        <Undo2 aria-hidden /> Withdraw
                      </>
                    }
                    title="Withdraw this request?"
                    description="Your coordinator will no longer see it. You can submit a new one at any time."
                    confirmLabel="Withdraw request"
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <Card className="mt-6">
          <EmptyState icon={ClipboardCheck} title="No requests yet" description="Need to move a class? Submit a request and track its review here." action={newRequest} />
        </Card>
      )}
    </>
  );
}
