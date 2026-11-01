import { CalendarClock, Download, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import { AutoSubmitSelect } from "@/components/client";
import { Timetable, TimetableLegend } from "@/components/timetable";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { ISSUE_LABEL } from "@/lib/scheduler";
import { getDepartmentScope } from "@/lib/scope";
import { formatRelative, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Academic Scheduling" };

export default async function CoordinatorSchedulingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("coordinator");
  const get = await readParams(searchParams);
  const scope = await getDepartmentScope(user.departmentId);
  const header = (
    <PageHeader
      eyebrow={scope.department?.name}
      title="Academic Scheduling"
      description="The published timetable for your department's groups, faculty and rooms. Changes are requested by faculty and approved by you."
      actions={
        scope.tt ? (
          <ButtonLink href="/api/export/timetable" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Export department CSV
          </ButtonLink>
        ) : undefined
      }
    />
  );
  if (!scope.tt) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={CalendarClock} title="No published timetable" description="The administrator hasn't published a timetable yet." />
        </Card>
      </>
    );
  }
  const view = (["group", "faculty", "room"] as const).find((v) => v === get("view")) ?? "group";
  const deptRoomIds = new Set(scope.sessions.map((s) => s.roomId));
  const options =
    view === "group"
      ? scope.groups.map((g) => ({ id: g.id, label: `${g.code} · ${g.name}` }))
      : view === "faculty"
        ? scope.faculty.map((f) => ({ id: f.id, label: f.name }))
        : scope.ref.rooms.filter((r) => deptRoomIds.has(r.id)).map((r) => ({ id: r.id, label: `${r.code} · ${r.name}` }));
  const entityId = options.find((o) => String(o.id) === get("id"))?.id ?? options[0]?.id ?? 0;
  const entityLabel = options.find((o) => o.id === entityId)?.label ?? "";
  const filtered = scope.tt.sessions.filter((s) => (view === "group" ? s.groupIds.includes(entityId) : view === "faculty" ? s.facultyId === entityId : s.roomId === entityId));
  const blocks = view === "faculty" ? scope.blocks.filter((b) => b.facultyId === entityId) : [];
  const errors = scope.issues.filter((i) => i.severity === "error");

  return (
    <>
      {header}
      <Callout tone="brand" className="mb-6" title={`${scope.tt.version.label} · published ${scope.tt.version.publishedAt ? formatRelative(scope.tt.version.publishedAt) : ""}`}>
        Showing the live timetable. {errors.length ? `${plural(errors.length, "conflict")} currently affect your department.` : "No conflicts affect your department."}
      </Callout>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <div className="border-b border-line p-4 sm:p-5">
            <Form action="/coordinator/scheduling" className="flex flex-wrap items-end gap-3" aria-label="Timetable filters">
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
              <div className="w-full sm:w-80">
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
            </Form>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{entityLabel}</h2>
              <p className="text-xs text-ink-2">{plural(filtered.length, "session")} per week</p>
            </div>
            <TimetableLegend showUnavailable={view === "faculty"} />
          </div>
          <div className="px-2 pb-3 sm:px-3">
            {filtered.length ? (
              <Timetable
                sessions={filtered}
                issuesBySession={scope.tt.issuesBySession}
                blocks={blocks}
                show={{ groups: view !== "group", faculty: view !== "faculty", room: view !== "room" }}
                label={`Timetable for ${entityLabel}`}
              />
            ) : (
              <EmptyState icon={CalendarClock} title="No sessions for this selection" />
            )}
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader icon={errors.length ? TriangleAlert : ShieldCheck} title="Department validation" description={`${plural(scope.issues.length, "issue")} across ${plural(scope.sessions.length, "session")}`} />
          {scope.issues.length ? (
            <ul className="divide-y divide-line">
              {scope.issues.map((i, idx) => (
                <li key={idx} className="px-5 py-3">
                  <Badge tone={i.severity === "error" ? "danger" : "warning"}>{ISSUE_LABEL[i.code]}</Badge>
                  <p className="mt-1.5 text-[13px] leading-5 text-ink">{i.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="No conflicts" compact />
          )}
        </Card>
      </div>
    </>
  );
}
