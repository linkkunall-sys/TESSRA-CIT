import { Building, Check, TriangleAlert, UserX, X } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, ConfirmAction, Dialog, DialogCancel, DialogFooter, FormField, SubmitButton } from "@/components/client";
import { dayName, DisruptionChanges, DisruptionSummary, ValidationPanel } from "@/components/domain";
import { Badge, Card, Checkbox, EmptyState, Input, PageHeader, Select, StatusBadge, TabLinks, Textarea } from "@/components/ui";
import { applyDisruptionAction, createDisruptionAction, rejectDisruptionAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { DAYS, DISRUPTION_TYPE_LABEL } from "@/lib/constants";
import { readParams, type SearchParams } from "@/lib/params";
import { getRef, listDisruptions } from "@/lib/queries";
import { formatDateTime, formatRelative, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Disruptions" };

const TABS = ["proposed", "applied", "rejected", "all"] as const;

export default async function DisruptionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const tab = TABS.find((t) => t === get("tab")) ?? "proposed";
  const [all, ref] = await Promise.all([listDisruptions(), getRef()]);
  const list = all.filter((d) => tab === "all" || d.status === tab);
  const counts = Object.fromEntries(TABS.map((t) => [t, t === "all" ? all.length : all.filter((d) => d.status === t).length])) as Record<(typeof TABS)[number], number>;
  const labels = { proposed: "Awaiting approval", applied: "Applied", rejected: "Rejected", all: "All" };

  const absenceDialog = (
    <Dialog
      variant="secondary"
      trigger={
        <>
          <UserX aria-hidden /> Faculty absence
        </>
      }
      title="Report a faculty absence"
      description="TESSRA finds every affected session and proposes conflict-free reschedules for the same week."
    >
      <ActionForm action={createDisruptionAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="type" value="faculty_absence" />
        <FormField name="facultyId" label="Faculty member" required className="sm:col-span-2">
          <Select id="facultyId" name="facultyId" defaultValue="">
            <option value="">Select…</option>
            {ref.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="day" label="Day of absence" required>
          <Select id="day" name="day" defaultValue="">
            <option value="">Select…</option>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="title" label="Title" hint="Optional — generated if left blank.">
          <Input id="title" name="title" maxLength={100} />
        </FormField>
        <FormField name="description" label="Details" className="sm:col-span-2">
          <Textarea id="description" name="description" maxLength={500} placeholder="e.g. Medical leave confirmed by HR" className="min-h-[72px]" />
        </FormField>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Analysing impact…">Analyse impact</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const roomDialog = (
    <Dialog
      variant="primary"
      trigger={
        <>
          <Building aria-hidden /> Room unavailable
        </>
      }
      title="Report an unavailable room"
      description="Sessions are relocated to free rooms of the right type and size, or rescheduled when no room is free."
    >
      <ActionForm action={createDisruptionAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="type" value="room_unavailable" />
        <FormField name="roomId" label="Room" required className="sm:col-span-2">
          <Select id="roomId" name="roomId" defaultValue="">
            <option value="">Select…</option>
            {ref.rooms
              .filter((r) => r.type !== "outdoor")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                  {r.status !== "active" ? " (currently unavailable)" : ""}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField name="day" label="When">
          <Select id="day" name="day" defaultValue="all">
            <option value="all">Whole week</option>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d} only
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="title" label="Title" hint="Optional — generated if left blank.">
          <Input id="title" name="title" maxLength={100} />
        </FormField>
        <FormField name="description" label="Details" className="sm:col-span-2">
          <Textarea id="description" name="description" maxLength={500} placeholder="e.g. Projector replacement by facilities team" className="min-h-[72px]" />
        </FormField>
        <div className="sm:col-span-2">
          <Checkbox name="markMaintenance" label="Also mark the room as under maintenance" description="Blocks new bookings and flags any remaining sessions." />
        </div>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Analysing impact…">Analyse impact</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  return (
    <>
      <PageHeader
        eyebrow="Campus"
        title="Disruptions"
        description="Report absences and room outages. TESSRA proposes a validated relocation plan — review the before-and-after comparison before approving."
        actions={
          <>
            {absenceDialog}
            {roomDialog}
          </>
        }
      />
      <TabLinks
        label="Disruption status"
        className="mb-6"
        items={TABS.map((t) => ({ href: t === "proposed" ? "/admin/disruptions" : `/admin/disruptions?tab=${t}`, label: labels[t], count: counts[t], active: tab === t }))}
      />

      {!list.length ? (
        <Card>
          <EmptyState icon={TriangleAlert} title={tab === "proposed" ? "No disruptions awaiting approval" : "No disruptions in this view"} description="Report a faculty absence or an unavailable room to generate a relocation plan." />
        </Card>
      ) : (
        <div className="space-y-6">
          {list.map((d) => (
            <Card key={d.id} id={`disruption-${d.id}`} className="scroll-mt-20">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.status} />
                    <Badge tone="warning">{DISRUPTION_TYPE_LABEL[d.type]}</Badge>
                    <Badge tone="outline">{dayName(d.day)}</Badge>
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-ink">{d.title}</h2>
                  {d.description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{d.description}</p>}
                  <p className="mt-1.5 text-xs text-ink-3">
                    Reported by {d.createdByName ?? "System"} · {formatRelative(d.createdAt)}
                    {d.resolvedAt && ` · ${d.status === "applied" ? "Applied" : "Rejected"} by ${d.resolvedByName ?? "—"} on ${formatDateTime(d.resolvedAt)}`}
                  </p>
                </div>
                {d.status === "proposed" && (
                  <div className="flex flex-wrap gap-2">
                    <ConfirmAction
                      action={rejectDisruptionAction}
                      fields={{ id: d.id }}
                      triggerSize="md"
                      trigger={
                        <>
                          <X aria-hidden /> Reject
                        </>
                      }
                      title="Reject this plan?"
                      description="The timetable stays unchanged."
                      confirmLabel="Reject plan"
                    />
                    <ConfirmAction
                      action={applyDisruptionAction}
                      fields={{ id: d.id }}
                      tone="primary"
                      triggerVariant="primary"
                      triggerSize="md"
                      trigger={
                        <>
                          <Check aria-hidden /> Approve &amp; apply
                        </>
                      }
                      title="Apply disruption plan?"
                      description={`${plural(d.proposedChanges.filter((c) => c.to).length, "session")} will move. The plan is re-validated against the live timetable first and affected faculty are notified.`}
                      confirmLabel="Apply changes"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <DisruptionSummary d={d} />
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold text-ink">Proposed changes · before and after</h3>
                  <DisruptionChanges changes={d.proposedChanges} />
                </div>
                {d.validation && <ValidationPanel {...d.validation} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
