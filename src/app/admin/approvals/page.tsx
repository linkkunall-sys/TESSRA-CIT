import { ArrowRight, CalendarPlus, Check, ClipboardCheck, ShieldCheck, Ticket, TriangleAlert, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/client";
import { BookingCard, BookingReviewActions, ChangeRequestCard, ChangeReviewActions, DisruptionSummary, ValidationPanel } from "@/components/domain";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, StatCard, TabLinks } from "@/components/ui";
import { applyDisruptionAction, prepareApprovalDemoAction, rejectDisruptionAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { DISRUPTION_TYPE_LABEL } from "@/lib/constants";
import { buildBookingAnalyzer } from "@/lib/engine";
import { readParams, type SearchParams } from "@/lib/params";
import { listBookings, listChangeRequests, listDisruptions } from "@/lib/queries";
import { formatRelative, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Approval Centre" };

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;
const TABS = ["all", "bookings", "changes", "classes", "disruptions"] as const;

export default async function ApprovalCentrePage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const tab = TABS.find((t) => t === get("tab")) ?? "all";
  const [bookings, requests, disruptions, analyzer] = await Promise.all([
    listBookings({ status: "pending" }),
    listChangeRequests({ status: "pending" }),
    listDisruptions("proposed"),
    buildBookingAnalyzer(),
  ]);
  bookings.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.date.localeCompare(b.date));
  const classRequests = requests.filter((r) => r.type === "extra_class");
  const changeRequests = requests.filter((r) => r.type !== "extra_class");
  const total = bookings.length + requests.length + disruptions.length;
  const counts = { all: total, bookings: bookings.length, changes: changeRequests.length, classes: classRequests.length, disruptions: disruptions.length };
  const labels = { all: "All pending", bookings: "Venue bookings", changes: "Schedule changes", classes: "New classes", disruptions: "Disruptions" };
  const show = (t: (typeof TABS)[number]) => tab === "all" || tab === t;

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Approval Centre"
        description="Every decision waiting on you, with conflict checks re-run live. Nothing changes until you approve."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Venue bookings" value={bookings.length} icon={Ticket} tone={bookings.length ? "warning" : "neutral"} href="/admin/approvals?tab=bookings" />
        <StatCard label="Schedule changes" value={changeRequests.length} icon={ClipboardCheck} tone={changeRequests.length ? "warning" : "neutral"} href="/admin/approvals?tab=changes" />
        <StatCard label="New class requests" value={classRequests.length} icon={CalendarPlus} tone={classRequests.length ? "warning" : "neutral"} href="/admin/approvals?tab=classes" />
        <StatCard label="Disruption plans" value={disruptions.length} icon={TriangleAlert} tone={disruptions.length ? "danger" : "neutral"} href="/admin/approvals?tab=disruptions" />
      </div>

      <TabLinks
        label="Approval categories"
        className="mb-6 mt-6"
        items={TABS.map((t) => ({ href: t === "all" ? "/admin/approvals" : `/admin/approvals?tab=${t}`, label: labels[t], count: counts[t], active: tab === t }))}
      />

      {counts[tab] === 0 ? (
        <Card>
          {total === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing waiting for approval"
              description="New booking requests, schedule changes and disruption plans will appear here. You can prepare one real, conflict-free example to explore the complete decision flow."
              action={
                <ActionForm action={prepareApprovalDemoAction} className="inline-flex">
                  <SubmitButton variant="secondary" pendingLabel="Preparing example…">Prepare approval example</SubmitButton>
                </ActionForm>
              }
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title={`No ${labels[tab].toLowerCase()} waiting`}
              description={`${plural(total, "item")} remain in other approval categories.`}
              action={<ButtonLink href="/admin/approvals" variant="secondary">View all pending</ButtonLink>}
            />
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {show("disruptions") && disruptions.length > 0 && (
            <section aria-labelledby="disruptions-heading">
              <h2 id="disruptions-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                Disruption plans <Badge tone="danger">{disruptions.length}</Badge>
              </h2>
              <div className="space-y-4">
                {disruptions.map((d) => (
                  <Card key={d.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">{DISRUPTION_TYPE_LABEL[d.type]}</Badge>
                          <Badge tone="outline">Requested by {d.createdByName ?? "System"}</Badge>
                        </div>
                        <h3 className="mt-2 text-[15px] font-semibold text-ink">{d.title}</h3>
                        {d.description && <p className="mt-1 text-[13px] text-ink-2">{d.description}</p>}
                        <p className="mt-1 text-xs text-ink-3">Reported {formatRelative(d.createdAt)}</p>
                      </div>
                      <Link href={`/admin/disruptions#disruption-${d.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
                        Before / after comparison <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                    <div className="mt-4 space-y-3">
                      <DisruptionSummary d={d} />
                      {d.validation && <ValidationPanel {...d.validation} />}
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                      <ConfirmAction
                        action={rejectDisruptionAction}
                        fields={{ id: d.id }}
                        trigger={
                          <>
                            <X aria-hidden /> Reject
                          </>
                        }
                        title="Reject this plan?"
                        description="The timetable stays unchanged. You can report the disruption again later."
                        confirmLabel="Reject plan"
                      />
                      <ConfirmAction
                        action={applyDisruptionAction}
                        fields={{ id: d.id }}
                        tone="primary"
                        triggerVariant="primary"
                        trigger={
                          <>
                            <Check aria-hidden /> Approve &amp; apply
                          </>
                        }
                        title="Apply disruption plan?"
                        description={`${plural(d.proposedChanges.filter((c) => c.to).length, "session")} will move. The plan is re-validated before any change is written, and affected faculty are notified.`}
                        confirmLabel="Apply changes"
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {show("classes") && classRequests.length > 0 && (
            <section aria-labelledby="classes-heading">
              <h2 id="classes-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                New class requests <Badge tone="info">{classRequests.length}</Badge>
              </h2>
              <p className="mb-3 text-[13px] text-ink-2">Teachers picked a free slot for an extra class — approving adds it to the live timetable after a final validation.</p>
              <div className="grid gap-4 xl:grid-cols-2">
                {classRequests.map((r) => (
                  <ChangeRequestCard key={r.id} r={r} showFaculty actions={<ChangeReviewActions id={r.id} extra />} />
                ))}
              </div>
            </section>
          )}

          {show("bookings") && bookings.length > 0 && (
            <section aria-labelledby="bookings-heading">
              <h2 id="bookings-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                Venue bookings <Badge tone="warning">{bookings.length}</Badge>
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {bookings.map((b) => (
                  <BookingCard
                    key={b.id}
                    b={b}
                    showRequester
                    conflicts={analyzer.check(b)}
                    actions={<BookingReviewActions booking={b} alternatives={analyzer.alternatives(b, { bookableOnly: b.requesterRole === "club" })} />}
                  />
                ))}
              </div>
            </section>
          )}

          {show("changes") && changeRequests.length > 0 && (
            <section aria-labelledby="changes-heading">
              <h2 id="changes-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                Schedule change requests <Badge tone="warning">{changeRequests.length}</Badge>
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {changeRequests.map((r) => (
                  <ChangeRequestCard key={r.id} r={r} showFaculty actions={<ChangeReviewActions id={r.id} />} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
