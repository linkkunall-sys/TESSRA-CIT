import { CalendarClock, CircleCheck, Download, Pin, PinOff, ShieldCheck, Trash, TriangleAlert, Users, WandSparkles, X, History, Gauge } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ActionForm, AutoSubmitSelect, ConfirmAction, DialogCancel, DialogFooter, Dialog, FormField, InlineAction, SubmitButton } from "@/components/client";
import { ConflictList } from "@/components/domain";
import { ScheduleEditor } from "@/components/schedule-editor";
import { Badge, Button, ButtonLink, Callout, Card, CardBody, CardHeader, EmptyState, KeyValue, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { discardVersionAction, generateScheduleAction, publishVersionAction, toggleFixedAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { DAYS, KIND_LABEL } from "@/lib/constants";
import { explainPlacement } from "@/lib/explanations";
import { qs, readParams, type SearchParams } from "@/lib/params";
import { getRef, getTimetable, getVersions } from "@/lib/queries";
import { findAlternatives, ISSUE_LABEL } from "@/lib/scheduler";
import { cn, formatDateTime, formatRelative, periodLabel, periodTime, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Smart Scheduling" };

function GenerateDialog() {
  return (
    <Dialog
      variant="primary"
      trigger={
        <>
          <WandSparkles aria-hidden /> Generate schedule
        </>
      }
      title="Generate a new timetable version"
      description="The engine places every teaching assignment while respecting faculty availability, group clashes, room capacity and room type. Fixed sessions from the published version stay in place."
    >
      <ActionForm action={generateScheduleAction} className="space-y-4">
        <ul className="space-y-2 rounded-lg bg-subtle p-3 text-[13px] text-ink-2 ring-1 ring-line">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Saved as a draft — the published timetable is not changed.
          </li>
          <li className="flex gap-2">
            <Pin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Pinned sessions are preserved exactly.
          </li>
          <li className="flex gap-2">
            <Gauge className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Validation runs automatically on the result.
          </li>
        </ul>
        <FormField name="notes" label="Version notes" hint="Optional — visible in version history.">
          <Textarea id="notes" name="notes" maxLength={200} placeholder="e.g. Regenerated after new BBA electives were added" className="min-h-[72px]" />
        </FormField>
        <DialogFooter>
          <DialogCancel />
          <SubmitButton icon={<WandSparkles />} pendingLabel="Generating…">
            Generate draft
          </SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );
}

export default async function SchedulingPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const [versions, ref] = await Promise.all([getVersions(), getRef()]);

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      eyebrow="Academics"
      title="Smart Scheduling"
      description="Generate, validate and publish conflict-free timetables. Review sessions by group, faculty or room before anything goes live."
      actions={actions}
    />
  );

  if (!versions.length) {
    return (
      <>
        {header(<GenerateDialog />)}
        <Card>
          <EmptyState icon={CalendarClock} title="No timetable yet" description="Generate the first version from the current teaching assignments." action={<GenerateDialog />} />
        </Card>
      </>
    );
  }

  const published = versions.find((v) => v.status === "published");
  const version = versions.find((v) => String(v.id) === get("version")) ?? published ?? versions[0];
  const tt = await getTimetable(version.id);
  const view = (["group", "faculty", "room"] as const).find((v) => v === get("view")) ?? "group";
  const options =
    view === "group"
      ? ref.groups.map((g) => ({ id: g.id, label: `${g.code} · ${g.name}` }))
      : view === "faculty"
        ? ref.faculty.map((f) => ({ id: f.id, label: f.name }))
        : ref.rooms.filter((r) => r.type !== "exam_hall" && r.type !== "outdoor").map((r) => ({ id: r.id, label: `${r.code} · ${r.name}` }));
  const entityId = options.find((o) => String(o.id) === get("id"))?.id ?? options[0]?.id ?? 0;
  const entityLabel = options.find((o) => o.id === entityId)?.label ?? "";
  const filtered = tt.sessions.filter((s) => (view === "group" ? s.groupIds.includes(entityId) : view === "faculty" ? s.facultyId === entityId : s.roomId === entityId));
  const blocks = view === "faculty" ? tt.state.blockRows.filter((b) => b.facultyId === entityId) : [];
  const selected = tt.sessions.find((s) => String(s.id) === get("session"));
  const selectedRoom = selected ? tt.state.rooms.get(selected.roomId) : null;
  const selectedIssues = selected ? tt.issues.filter((issue) => issue.sessionIds.includes(selected.id)) : [];
  const alternativeLimit = 8;
  const selectedAlternatives = selected && !selected.isFixed
    ? findAlternatives(tt.state.sessions, selected.id, tt.state.ctx, { limit: alternativeLimit })
    : [];
  const rationale = selected && selectedRoom
    ? explainPlacement({
        courseCode: selected.courseCode,
        kind: selected.kind,
        isFixed: selected.isFixed,
        combined: selected.combined,
        roomCode: selected.roomCode,
        roomType: selectedRoom.type,
        roomCapacity: selectedRoom.capacity,
        students: selected.size,
        issueCount: selectedIssues.length,
        alternativeCount: selectedAlternatives.length,
        alternativesCapped: selectedAlternatives.length === alternativeLimit,
      })
    : null;
  const base = { version: version.id, view, id: entityId };
  const link = (extra: Record<string, string | number | undefined>) => qs("/admin/scheduling", { ...base, ...extra });
  const errors = tt.issues.filter((i) => i.severity === "error");
  const warnings = tt.issues.filter((i) => i.severity === "warning");
  const stats = version.stats;
  const creator = version.createdById ? ref.personMap.get(version.createdById)?.name : null;
  const periods = filtered.reduce((n, s) => n + s.duration, 0);
  const viewConflicts = filtered.filter((s) => tt.issuesBySession[s.id]?.length).length;

  return (
    <>
      {header(
        <>
          <ButtonLink href={`/api/export/timetable?version=${version.id}`} variant="secondary" prefetch={false}>
            <Download aria-hidden /> Export CSV
          </ButtonLink>
          <GenerateDialog />
        </>,
      )}

      {get("generated") && version.status === "draft" && (
        <Callout tone="success" title={`${version.label} generated as a draft`} className="mb-6">
          Review the validation results and the timetable below, then publish when you are satisfied. The live timetable is unchanged.
        </Callout>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Form action="/admin/scheduling" className="w-full sm:w-64">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="id" value={entityId} />
              <label htmlFor="version" className="sr-only">
                Timetable version
              </label>
              <AutoSubmitSelect id="version" name="version" defaultValue={version.id} key={version.id}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {v.status}
                  </option>
                ))}
              </AutoSubmitSelect>
            </Form>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <StatusBadge status={version.status} />
              <span>
                Generated {formatRelative(version.createdAt)}
                {creator ? ` by ${creator}` : ""}
              </span>
              {version.publishedAt && version.status === "published" && <span>· Live since {formatDateTime(version.publishedAt)}</span>}
            </div>
          </div>
          {version.status === "draft" && (
            <div className="flex flex-wrap gap-2">
              <ConfirmAction
                action={discardVersionAction}
                fields={{ versionId: version.id }}
                trigger={
                  <>
                    <Trash aria-hidden /> Discard
                  </>
                }
                triggerSize="md"
                title={`Discard ${version.label}?`}
                description="This permanently deletes the draft and its sessions. The published timetable is not affected."
                confirmLabel="Discard draft"
              />
              <ConfirmAction
                action={publishVersionAction}
                fields={{ versionId: version.id }}
                tone="primary"
                triggerVariant="primary"
                triggerSize="md"
                trigger={
                  <>
                    <CircleCheck aria-hidden /> Publish version
                  </>
                }
                title={`Publish ${version.label}?`}
                description={`It replaces the current published timetable for every role. ${errors.length ? `Warning: ${plural(errors.length, "conflict")} still detected.` : "Validation passed with no conflicts."}`}
                confirmLabel="Publish timetable"
              />
            </div>
          )}
        </div>
        {stats && (
          <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-5">
            {(
              [
                ["Sessions placed", `${stats.placedUnits}/${stats.requiredUnits}`],
                ["Periods placed", `${stats.placedPeriods}/${stats.requiredPeriods}`],
                ["Fixed preserved", String(stats.fixedUnits)],
                ["Conflicts", String(errors.length)],
                ["Unplaced", String(stats.unplaced.length)],
              ] as const
            ).map(([k, v], i) => (
              <div key={k} className={cn("px-5 py-3", i > 0 && "border-l border-line", i === 2 && "max-sm:border-l-0 max-sm:border-t", i > 2 && "max-sm:border-t")}>
                <dt className="text-xs text-ink-2">{k}</dt>
                <dd className={cn("tabular mt-0.5 text-lg font-semibold", k === "Conflicts" && errors.length ? "text-danger-fg" : "text-ink")}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="border-b border-line p-4 sm:p-5">
              <Form action="/admin/scheduling" className="flex flex-wrap items-end gap-3" aria-label="Timetable filters">
                <input type="hidden" name="version" value={version.id} />
                <div className="w-full sm:w-44">
                  <label htmlFor="view" className="mb-1.5 block text-xs font-medium text-ink-2">
                    View by
                  </label>
                  <AutoSubmitSelect id="view" name="view" defaultValue={view} key={`view-${view}`}>
                    <option value="group">Student group</option>
                    <option value="faculty">Faculty</option>
                    <option value="room">Room</option>
                  </AutoSubmitSelect>
                </div>
                <div className="w-full sm:w-72">
                  <label htmlFor="id" className="mb-1.5 block text-xs font-medium text-ink-2">
                    {view === "group" ? "Group" : view === "faculty" ? "Faculty member" : "Room"}
                  </label>
                  <AutoSubmitSelect id="id" name="id" defaultValue={entityId} key={`id-${view}-${entityId}`}>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </div>
                <Button type="submit" variant="secondary">
                  Apply
                </Button>
              </Form>
            </div>
            <div className="px-4 pt-3 sm:px-5">
              <h2 className="text-[15px] font-semibold text-ink">{entityLabel}</h2>
              <p className="text-xs text-ink-2">
                {plural(filtered.length, "session")} · {plural(periods, "period")} per week
                {viewConflicts ? ` · ${plural(viewConflicts, "session")} with conflicts` : ""}
              </p>
            </div>
            <ScheduleEditor
              versionId={version.id}
              versionStatus={version.status}
              sessions={filtered}
              issuesBySession={tt.issuesBySession}
              blocks={blocks}
              view={view}
              entityId={entityId}
              selectedId={selected?.id}
              courses={ref.courses.map((c) => ({ id: c.id, code: c.code, title: c.title, kind: c.kind }))}
              faculty={ref.faculty.map((f) => ({ id: f.id, name: f.name }))}
              groups={ref.groups.map((g) => ({ id: g.id, code: g.code, size: g.size }))}
              rooms={ref.rooms
                .filter((r) => r.status === "active" && ["lecture", "lab", "seminar", "auditorium"].includes(r.type))
                .map((r) => ({ id: r.id, code: r.code, name: r.name, capacity: r.capacity, type: r.type }))}
            />
          </Card>
        </div>

        <aside className="space-y-4" aria-label="Scheduling insights">
          {selected && (
            <Card className="animate-slide-up ring-2 ring-brand-100">
              <CardHeader
                title={
                  <>
                    {selected.courseCode} <span className="font-normal text-ink-2">· {selected.courseTitle}</span>
                  </>
                }
                description={`${DAYS[selected.day]} · ${periodLabel(selected.startPeriod, selected.duration)} · ${periodTime(selected.startPeriod, selected.duration)}`}
                action={
                  <ButtonLink href={link({})} scroll={false} variant="ghost" size="icon-sm" aria-label="Close session details">
                    <X aria-hidden />
                  </ButtonLink>
                }
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="outline">{KIND_LABEL[selected.kind]}</Badge>
                  {selected.isFixed && (
                    <Badge tone="brand" icon={Pin}>
                      Fixed
                    </Badge>
                  )}
                  {selected.combined && (
                    <Badge tone="info" icon={Users}>
                      Combined
                    </Badge>
                  )}
                </div>
                <KeyValue
                  items={[
                    ["Room", `${selected.roomCode} · ${selected.roomName}`],
                    ["Faculty", selected.facultyName],
                    ["Groups", selected.groupCodes.join(" + ")],
                    ["Students", selected.size],
                    ["Duration", plural(selected.duration, "period")],
                  ]}
                />
                {rationale && (
                  <div className="rounded-lg bg-brand-50/70 p-3 ring-1 ring-brand-100" aria-label="Placement rationale">
                    <p className="text-xs font-semibold text-brand-900">Why this slot?</p>
                    <p className="mt-1 text-xs leading-5 text-brand-900/80">{rationale.headline}</p>
                    <ul className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-2">
                      {rationale.facts.map((fact) => (
                        <li key={fact} className="flex gap-1.5">
                          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink-2">Validation</p>
                  <ConflictList items={selectedIssues.map((i) => ({ severity: i.severity, message: i.message }))} />
                </div>
                <InlineAction action={toggleFixedAction} fields={{ sessionId: selected.id }} icon={selected.isFixed ? <PinOff /> : <Pin />} size="sm">
                  {selected.isFixed ? "Unpin session" : "Pin as fixed"}
                </InlineAction>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs font-medium">
                  <Link className="text-brand-700 hover:underline" href={qs("/admin/scheduling", { version: version.id, view: "group", id: selected.groupIds[0] })}>
                    Group timetable
                  </Link>
                  <Link className="text-brand-700 hover:underline" href={qs("/admin/scheduling", { version: version.id, view: "faculty", id: selected.facultyId })}>
                    Faculty timetable
                  </Link>
                  <Link className="text-brand-700 hover:underline" href={qs("/admin/scheduling", { version: version.id, view: "room", id: selected.roomId })}>
                    Room timetable
                  </Link>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              icon={errors.length ? TriangleAlert : ShieldCheck}
              title="Validation results"
              description={errors.length || warnings.length ? `${plural(errors.length, "error")} · ${plural(warnings.length, "warning")}` : "All constraints satisfied"}
            />
            {tt.issues.length ? (
              <ul className="scrollbar-thin max-h-[360px] divide-y divide-line overflow-y-auto">
                {tt.issues.map((i, idx) => (
                  <li key={idx} className="px-5 py-3">
                    <Badge tone={i.severity === "error" ? "danger" : "warning"}>{ISSUE_LABEL[i.code]}</Badge>
                    <p className="mt-1.5 text-[13px] leading-5 text-ink">{i.message}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {i.sessionIds.slice(0, 2).map((sid) => {
                        const s = tt.sessions.find((x) => x.id === sid);
                        return s ? (
                          <Link key={sid} href={qs("/admin/scheduling", { version: version.id, view: "group", id: s.groupIds[0], session: sid })} scroll={false} className="font-medium text-brand-700 hover:underline">
                            View {s.courseCode}
                          </Link>
                        ) : null;
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ShieldCheck} title="No conflicts" description="No double-bookings, capacity or availability violations." compact />
            )}
          </Card>

          <Card>
            <CardHeader icon={Gauge} title="Generation status" />
            <CardBody className="space-y-4">
              {stats ? (
                <>
                  <KeyValue
                    items={[
                      ["Required sessions", stats.requiredUnits],
                      ["Placed", stats.placedUnits],
                      ["Fixed preserved", stats.fixedUnits],
                      ["Unplaced", stats.unplaced.length],
                      ["Engine runtime", `${stats.durationMs} ms`],
                    ]}
                  />
                  {stats.unplaced.length > 0 && (
                    <ul className="space-y-2">
                      {stats.unplaced.map((u) => (
                        <li key={`${u.offeringId}-${u.reason}`} className="rounded-lg bg-warning-bg/40 px-3 py-2 text-xs text-warning-fg">
                          <span className="font-semibold">{u.label}</span> — {u.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-ink-3">No generation statistics recorded.</p>
              )}
              {version.notes && <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-ink-2 ring-1 ring-line">{version.notes}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={History} title="Version history" />
            <ul className="divide-y divide-line">
              {versions.slice(0, 6).map((v) => (
                <li key={v.id}>
                  <Link
                    href={qs("/admin/scheduling", { version: v.id, view, id: entityId })}
                    className={cn("flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-subtle", v.id === version.id && "bg-brand-50/50")}
                    aria-current={v.id === version.id ? "true" : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{v.label}</span>
                      <span className="block text-xs text-ink-3">
                        {formatRelative(v.createdAt)} · {v.stats ? `${v.stats.placedUnits}/${v.stats.requiredUnits} placed` : "—"}
                      </span>
                    </span>
                    <StatusBadge status={v.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
