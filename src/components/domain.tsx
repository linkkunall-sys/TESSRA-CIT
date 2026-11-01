/**
 * Shared domain components used across role workspaces.
 */
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  ArrowRight,
  Bell,
  Building,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleAlert,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  TriangleAlert,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  approveBookingAction,
  approveChangeRequestAction,
  markNotificationReadAction,
  rejectBookingAction,
  rejectChangeRequestAction,
} from "@/lib/actions";
import { CHANGE_TYPE_LABEL, DAY_SHORT, DAYS, ROOM_TYPE_LABEL, categoryLabel } from "@/lib/constants";
import type { ProposedChange, RoomRow, SlotRef } from "@/db/schema";
import type { AuditView, BookingView, ChangeRequestView, DisruptionView } from "@/lib/queries";
import type { BookingConflict } from "@/lib/engine";
import { cn, formatDate, formatRelative, periodLabel, periodTime, relativeDay } from "@/lib/utils";
import { ConfirmAction, FormField, InlineAction } from "./client";
import { Avatar, Badge, ButtonLink, EmptyState, PriorityBadge, Select, StatusBadge, Textarea } from "./ui";

/* --------------------------------- Helpers -------------------------------- */
export function slotText(s: { day: number; period: number; duration: number }) {
  return `${DAY_SHORT[s.day]} ${periodLabel(s.period, s.duration)} · ${periodTime(s.period, s.duration)}`;
}

export function SlotPill({ slot, tone = "neutral" }: { slot: SlotRef; tone?: "neutral" | "brand" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col rounded-lg px-2.5 py-1.5 text-xs leading-4 ring-1 ring-inset",
        tone === "brand" ? "bg-brand-50 text-brand-800 ring-brand-100" : tone === "danger" ? "bg-danger-bg/60 text-danger-fg ring-danger-bg-strong" : "bg-subtle text-ink ring-line",
      )}
    >
      <span className="font-semibold">{slotText(slot)}</span>
      <span className="opacity-80">{slot.roomCode}</span>
    </span>
  );
}

/* ------------------------------ Activity feed ----------------------------- */
const ENTITY_ICON: Record<string, LucideIcon> = {
  schedule: CalendarClock,
  booking: Ticket,
  change_request: ClipboardCheck,
  disruption: TriangleAlert,
  room: Building,
  exam: GraduationCap,
  academics: GraduationCap,
  settings: Settings,
};

export function ActivityFeed({ items, empty = "No activity recorded yet" }: { items: AuditView[]; empty?: string }) {
  if (!items.length) return <EmptyState icon={ScrollText} title={empty} compact />;
  return (
    <ol className="relative space-y-0">
      {items.map((a, i) => {
        const Icon = ENTITY_ICON[a.entityType] ?? ShieldCheck;
        return (
          <li key={a.id} className="relative flex gap-3 px-5 py-3">
            {i < items.length - 1 && <span className="absolute bottom-0 left-[35px] top-11 w-px bg-line" aria-hidden />}
            <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-ink-2 ring-1 ring-line">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] leading-5 text-ink">{a.summary}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {a.actorName} · <time dateTime={a.createdAt.toISOString()}>{formatRelative(a.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Notifications ----------------------------- */
const NOTE_TONE = {
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  error: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
};

export function NotificationList({
  items,
  actions = true,
  empty = "You're all caught up",
}: {
  items: { id: number; title: string; body: string; tone: keyof typeof NOTE_TONE; href: string | null; read: boolean; createdAt: Date }[];
  actions?: boolean;
  empty?: string;
}) {
  if (!items.length) return <EmptyState icon={Bell} title={empty} description="New updates about your requests and schedule will appear here." compact />;
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className={cn("flex gap-3 px-5 py-3.5 transition-colors", !n.read && "bg-brand-50/40")}>
          <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", NOTE_TONE[n.tone])}>
            <Bell className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-[13px] text-ink", !n.read ? "font-semibold" : "font-medium")}>{n.title}</p>
              {!n.read && <Badge tone="brand" dot>Unread</Badge>}
            </div>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{n.body}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-3">
              <time dateTime={n.createdAt.toISOString()}>{formatRelative(n.createdAt)}</time>
              {n.href && (
                <Link href={n.href} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800 hover:underline">
                  View <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </div>
          </div>
          {actions && !n.read && (
            <InlineAction action={markNotificationReadAction} fields={{ id: n.id }} variant="ghost" size="icon-sm" icon={<Check />} label={`Mark “${n.title}” as read`} />
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Conflicts ------------------------------- */
export function ConflictList({ items, okText = "No conflicts detected" }: { items: { severity: "error" | "warning"; message: string }[]; okText?: string }) {
  if (!items.length) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-success-fg">
        <Check className="size-3.5" aria-hidden />
        {okText}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map((c, i) => (
        <li key={i} className={cn("flex items-start gap-1.5 text-xs leading-5", c.severity === "error" ? "text-danger-fg" : "text-warning-fg")}>
          {c.severity === "error" ? <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
          <span>
            <span className="sr-only">{c.severity === "error" ? "Blocking conflict: " : "Warning: "}</span>
            {c.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- Bookings ------------------------------- */
export function BookingReviewActions({ booking, alternatives }: { booking: BookingView; alternatives: Pick<RoomRow, "id" | "code" | "name" | "capacity">[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InlineAction action={approveBookingAction} fields={{ id: booking.id }} variant="primary" icon={<Check />} pendingLabel="Approving…">
        Approve
      </InlineAction>
      <ConfirmAction
        action={rejectBookingAction}
        fields={{ id: booking.id }}
        trigger={
          <>
            <X aria-hidden /> Reject
          </>
        }
        title={`Reject “${booking.title}”`}
        description="The requester will be notified with your reason and any suggested alternative."
        confirmLabel="Reject request"
      >
        <FormField name="reason" label="Reason" required>
          <Textarea id="reason" name="reason" placeholder="Explain why the request can't be approved…" maxLength={400} />
        </FormField>
        <FormField name="suggestedRoomId" label="Suggest an alternative venue" hint={alternatives.length ? "Only conflict-free venues with enough capacity are listed." : "No conflict-free alternative is available for this slot."}>
          <Select id="suggestedRoomId" name="suggestedRoomId" defaultValue={alternatives[0]?.id ?? ""}>
            <option value="">No suggestion</option>
            {alternatives.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name} ({r.capacity} seats)
              </option>
            ))}
          </Select>
        </FormField>
      </ConfirmAction>
    </div>
  );
}

export function BookingCard({
  b,
  conflicts,
  actions,
  showRequester,
}: {
  b: BookingView;
  conflicts?: BookingConflict[];
  actions?: ReactNode;
  showRequester?: boolean;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={b.status} />
            <PriorityBadge priority={b.priority} />
            <Badge tone="outline">{categoryLabel(b.category)}</Badge>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-ink">{b.title}</h3>
          {b.description && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-2">{b.description}</p>}
        </div>
        <div className="shrink-0 rounded-lg bg-subtle px-3 py-2 text-right ring-1 ring-line">
          <p className="text-xs font-medium text-ink-2">{relativeDay(b.date)}</p>
          <p className="text-[13px] font-semibold text-ink">{formatDate(b.date)}</p>
          <p className="tabular text-xs text-ink-2">
            {b.startTime}–{b.endTime}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-3">Venue</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
            <MapPin className="size-3.5 text-ink-3" aria-hidden />
            {b.roomCode} · {b.roomName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Attendance</dt>
          <dd className={cn("mt-0.5 flex items-center gap-1.5 font-medium", b.attendees > b.roomCapacity ? "text-danger-fg" : "text-ink")}>
            <Users className="size-3.5 text-ink-3" aria-hidden />
            {b.attendees} / {b.roomCapacity} seats
          </dd>
        </div>
        {showRequester ? (
          <div>
            <dt className="text-xs text-ink-3">Requested by</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-medium text-ink">
              <Avatar name={b.requesterName} size="sm" />
              <span className="min-w-0 truncate">
                {b.requesterName} <span className="font-normal text-ink-2">· {b.orgName}</span>
              </span>
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs text-ink-3">Requested</dt>
            <dd className="mt-0.5 font-medium text-ink">{formatRelative(b.createdAt)}</dd>
          </div>
        )}
      </dl>
      {b.needs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.needs.map((n) => (
            <span key={n} className="rounded-md bg-muted-bg px-2 py-0.5 text-xs text-ink-2">
              {n}
            </span>
          ))}
        </div>
      )}
      {b.status === "rejected" && b.rejectionReason && (
        <div className="mt-4 rounded-lg border border-danger-bg-strong bg-danger-bg/40 px-3 py-2.5 text-[13px] text-danger-fg">
          <p className="font-semibold">Reason for rejection</p>
          <p className="mt-0.5">{b.rejectionReason}</p>
          {b.suggestedRoomCode && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5" aria-hidden /> Suggested alternative: {b.suggestedRoomCode}
            </p>
          )}
        </div>
      )}
      {conflicts && b.status === "pending" && (
        <div className="mt-4 rounded-lg bg-subtle px-3 py-2.5 ring-1 ring-line">
          <p className="mb-1.5 text-xs font-semibold text-ink-2">Conflict check</p>
          <ConflictList items={conflicts} okText="Venue is free — no conflicts detected" />
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">{actions}</div>}
    </article>
  );
}

/* ----------------------------- Change requests ---------------------------- */
export function ChangeReviewActions({ id, extra }: { id: number; extra?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmAction
        action={approveChangeRequestAction}
        fields={{ id }}
        tone="primary"
        triggerVariant="primary"
        trigger={
          <>
            <Check aria-hidden /> Approve
          </>
        }
        title={extra ? "Approve new class" : "Approve schedule change"}
        description={extra
          ? "The slot is re-validated against the live timetable, then the class is added and the teacher notified."
          : "The proposed slot is re-validated against the live timetable before anything changes."}
        confirmLabel={extra ? "Approve & add class" : "Approve & update timetable"}
      >
        <FormField name="note" label="Note to faculty (optional)">
          <Textarea id="note" name="note" placeholder="Anything they should know…" maxLength={300} className="min-h-[72px]" />
        </FormField>
      </ConfirmAction>
      <ConfirmAction
        action={rejectChangeRequestAction}
        fields={{ id }}
        trigger={
          <>
            <X aria-hidden /> Reject
          </>
        }
        title="Reject schedule change"
        description="The faculty member will see your note."
        confirmLabel="Reject request"
      >
        <FormField name="note" label="Reason" required>
          <Textarea id="note" name="note" placeholder="Explain the decision…" maxLength={300} />
        </FormField>
      </ConfirmAction>
    </div>
  );
}

export function ChangeRequestCard({ r, actions, showFaculty }: { r: ChangeRequestView; actions?: ReactNode; showFaculty?: boolean }) {
  if (r.type === "extra_class") {
    const slot: SlotRef | null = r.proposedDay !== null && r.proposedPeriod !== null
      ? { day: r.proposedDay, period: r.proposedPeriod, duration: r.duration ?? 1, roomId: r.proposedRoomId ?? 0, roomCode: r.proposedRoomCode ?? "Auto" }
      : null;
    return (
      <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} />
              <Badge tone="info" icon={CalendarPlus}>New class request</Badge>
              <span className="text-xs text-ink-3">verified by the admin</span>
            </div>
            <h3 className="mt-2 text-[15px] font-semibold text-ink">
              {r.snapshot?.courseCode ?? "Class"} <span className="font-normal text-ink-2">· {r.snapshot?.courseTitle}</span>
            </h3>
            <p className="mt-0.5 text-xs text-ink-2">
              {r.snapshot?.groups}{showFaculty && <> · {r.facultyName}</>} · submitted {formatRelative(r.createdAt)}
            </p>
          </div>
          {showFaculty && <Avatar name={r.facultyName} />}
        </div>
        {slot && (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Requested slot">
            <span className="text-xs font-medium text-ink-2">Requested slot</span>
            <SlotPill slot={slot} tone="brand" />
          </div>
        )}
        <p className="mt-3 text-[13px] leading-5 text-ink-2"><span className="font-medium text-ink">Reason: </span>{r.reason}</p>
        {r.reviewNote && (
          <p className={cn("mt-3 rounded-lg px-3 py-2 text-[13px] ring-1", r.status === "rejected" ? "bg-danger-bg/40 text-danger-fg ring-danger-bg-strong" : "bg-subtle text-ink-2 ring-line")}>
            <span className="font-semibold">{r.reviewerName ?? "Reviewer"}: </span>{r.reviewNote}
          </p>
        )}
        {actions && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">{actions}</div>}
      </article>
    );
  }
  const from = r.snapshot?.from;
  const to: SlotRef | null =
    r.proposedDay !== null && r.proposedPeriod !== null
      ? { day: r.proposedDay, period: r.proposedPeriod, duration: from?.duration ?? 1, roomId: r.proposedRoomId ?? 0, roomCode: r.proposedRoomCode ?? from?.roomCode ?? "—" }
      : null;
  const stale = r.status === "pending" && r.sessionVersionStatus !== "published";
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <Badge tone="outline">{CHANGE_TYPE_LABEL[r.type]}</Badge>
            {r.source === "assistant" && (
              <Badge tone="info" icon={Sparkles}>
                From AI Assistant
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-ink">
            {r.snapshot?.courseCode ?? "Session"} <span className="font-normal text-ink-2">· {r.snapshot?.courseTitle}</span>
          </h3>
          <p className="mt-0.5 text-xs text-ink-2">
            {r.snapshot?.groups}
            {showFaculty && <> · {r.facultyName}</>} · submitted {formatRelative(r.createdAt)}
          </p>
        </div>
        {showFaculty && <Avatar name={r.facultyName} />}
      </div>
      {from && (
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Proposed change">
          <span className="sr-only">From</span>
          <SlotPill slot={from} />
          <ArrowRight className="size-4 text-ink-3" aria-hidden />
          <span className="sr-only">To</span>
          {to ? <SlotPill slot={to} tone="brand" /> : <span className="text-xs text-ink-3">No slot proposed</span>}
        </div>
      )}
      <p className="mt-3 text-[13px] leading-5 text-ink-2">
        <span className="font-medium text-ink">Reason: </span>
        {r.reason}
      </p>
      {stale && <p className="mt-2 text-xs font-medium text-warning-fg">This request refers to a timetable version that is no longer published.</p>}
      {r.reviewNote && (
        <p className={cn("mt-3 rounded-lg px-3 py-2 text-[13px] ring-1", r.status === "rejected" ? "bg-danger-bg/40 text-danger-fg ring-danger-bg-strong" : "bg-subtle text-ink-2 ring-line")}>
          <span className="font-semibold">{r.reviewerName ?? "Reviewer"}: </span>
          {r.reviewNote}
        </p>
      )}
      {actions && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">{actions}</div>}
    </article>
  );
}

/* -------------------------------- Disruptions ----------------------------- */
const ACTION_LABEL: Record<ProposedChange["action"], [string, "brand" | "info" | "danger"]> = {
  move: ["Reschedule", "info"],
  room_change: ["Room change", "brand"],
  unresolved: ["Needs decision", "danger"],
};

export function DisruptionSummary({ d }: { d: DisruptionView }) {
  const faculty = new Set(d.proposedChanges.map((c) => c.facultyName)).size;
  const groups = new Set(d.proposedChanges.flatMap((c) => c.groupCodes.split(" + "))).size;
  const rooms = new Set(d.proposedChanges.map((c) => c.from.roomCode)).size;
  const items: [string, number][] = [
    ["Sessions", d.proposedChanges.length],
    ["Faculty", faculty],
    ["Groups", groups],
    ["Rooms", rooms],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-subtle px-3 py-2 ring-1 ring-line">
          <dt className="text-xs text-ink-2">Affected {k.toLowerCase()}</dt>
          <dd className="tabular text-lg font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DisruptionChanges({ changes }: { changes: ProposedChange[] }) {
  if (!changes.length) return <p className="text-[13px] text-ink-2">No timetabled sessions are affected.</p>;
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg ring-1 ring-line">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-subtle text-xs text-ink-2">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Session</th>
            <th scope="col" className="px-3 py-2 font-medium">Before</th>
            <th scope="col" className="w-6 px-1 py-2" aria-label="changes to" />
            <th scope="col" className="px-3 py-2 font-medium">After</th>
            <th scope="col" className="px-3 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {changes.map((c) => {
            const [label, tone] = ACTION_LABEL[c.action];
            return (
              <tr key={c.sessionId}>
                <td className="px-3 py-2.5 align-top">
                  <p className="font-semibold text-ink">{c.courseCode}</p>
                  <p className="text-xs text-ink-2">
                    {c.groupCodes} · {c.facultyName}
                  </p>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <SlotPill slot={c.from} tone={c.action === "unresolved" ? "danger" : "neutral"} />
                </td>
                <td className="px-1 py-2.5 align-middle text-ink-3">
                  <ArrowRight className="size-4" aria-hidden />
                </td>
                <td className="px-3 py-2.5 align-top">{c.to ? <SlotPill slot={c.to} tone="brand" /> : <span className="text-xs text-ink-3">—</span>}</td>
                <td className="px-3 py-2.5 align-top">
                  <Badge tone={tone}>{label}</Badge>
                  <p className="mt-1 max-w-[220px] text-xs text-ink-2">{c.note}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ValidationPanel({ ok, issues, checkedAt }: { ok: boolean; issues: string[]; checkedAt?: string }) {
  return (
    <div className={cn("rounded-lg px-3 py-2.5 ring-1", ok ? "bg-success-bg/40 ring-success-bg" : "bg-warning-bg/40 ring-warning-bg")}>
      <p className={cn("flex items-center gap-1.5 text-[13px] font-semibold", ok ? "text-success-fg" : "text-warning-fg")}>
        {ok ? <ShieldCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
        {ok ? "Validation passed — no conflicts after applying this plan" : `Validation found ${issues.length} issue${issues.length === 1 ? "" : "s"}`}
      </p>
      {!ok && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-warning-fg">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {checkedAt && <p className="mt-1 text-[11px] text-ink-3">Checked {formatRelative(new Date(checkedAt))}</p>}
    </div>
  );
}

/* ---------------------------------- Venues -------------------------------- */
export function VenueCard({
  room,
  utilisation,
  availability,
  actions,
}: {
  room: RoomRow;
  utilisation?: number;
  availability?: { ok: boolean; reason?: string } | null;
  actions?: ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-brand-700">{room.code}</p>
          <h3 className="mt-0.5 truncate text-[15px] font-semibold text-ink">{room.name}</h3>
          <p className="mt-0.5 truncate text-xs text-ink-2">
            {room.building} · {ROOM_TYPE_LABEL[room.type]}
          </p>
        </div>
        <StatusBadge status={room.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-ink-3" aria-hidden />
          <span className="tabular font-semibold">{room.capacity}</span> seats
        </span>
        <span className={cn("inline-flex items-center gap-1.5", room.accessible ? "text-ink" : "text-ink-3")}>
          <Accessibility className="size-4 text-ink-3" aria-hidden />
          {room.accessible ? "Step-free access" : "No step-free access"}
        </span>
      </div>
      {room.features.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Features">
          {room.features.map((f) => (
            <li key={f} className="rounded-md bg-muted-bg px-2 py-0.5 text-xs text-ink-2">
              {f}
            </li>
          ))}
        </ul>
      )}
      {room.status !== "active" && room.maintenanceNote && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-bg/50 px-2.5 py-2 text-xs text-warning-fg">
          <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {room.maintenanceNote}
        </p>
      )}
      {availability && (
        <p className={cn("mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium", availability.ok ? "bg-success-bg/50 text-success-fg" : "bg-danger-bg/50 text-danger-fg")}>
          {availability.ok ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
          {availability.ok ? "Available for the selected time" : `Unavailable: ${availability.reason}`}
        </p>
      )}
      {utilisation !== undefined && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-ink-2">
            <span>Weekly timetable use</span>
            <span className="tabular font-medium text-ink">{utilisation}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted-bg" role="progressbar" aria-valuenow={utilisation} aria-valuemin={0} aria-valuemax={100} aria-label={`${room.code} weekly utilisation`}>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${utilisation}%` }} />
          </div>
        </div>
      )}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-4">{actions}</div>}
    </article>
  );
}

export function UpcomingBookingRow({ b }: { b: BookingView }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-subtle py-1.5 text-center ring-1 ring-line">
        <span className="text-[10px] font-semibold uppercase text-ink-3">{formatDate(b.date).split(" ")[0].replace(",", "")}</span>
        <span className="tabular text-base font-semibold leading-5 text-ink">{b.date.slice(8, 10)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{b.title}</p>
        <p className="truncate text-xs text-ink-2">
          {b.startTime}–{b.endTime} · {b.roomCode} · {b.orgName}
        </p>
      </div>
      <StatusBadge status={b.status} />
    </li>
  );
}

export function dayName(day: number | null) {
  return day === null ? "Whole week" : DAYS[day];
}
