import { CalendarDays, ChartColumn, ClipboardCheck, Download, Gauge, Layers, Ticket, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import { BarList, ButtonLink, Card, CardBody, CardHeader, ColumnChart, KeyValue, PageHeader, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DAY_SHORT, KIND_LABEL, type SessionKind } from "@/lib/constants";
import { listBookings, listChangeRequests } from "@/lib/queries";
import { getDepartmentScope } from "@/lib/scope";
import { currentDayIndex, pct, shortName } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function CoordinatorReportsPage() {
  const user = await requireRole("coordinator");
  const scope = await getDepartmentScope(user.departmentId);
  const [requests, bookings] = await Promise.all([
    listChangeRequests({ facultyIds: [...scope.facultyIds] }),
    user.departmentId ? listBookings({ departmentId: user.departmentId }) : Promise.resolve([]),
  ]);
  const periods = scope.sessions.reduce((n, s) => n + s.duration, 0);
  const capacity = scope.faculty.reduce((n, f) => n + f.maxWeeklyPeriods, 0);
  const load = scope.faculty.map((f) => {
    const v = scope.tt?.facultyLoad.get(f.id) ?? 0;
    return { label: shortName(f.name), value: v, hint: `/ ${f.maxWeeklyPeriods}`, tone: (v > f.maxWeeklyPeriods ? "danger" : "brand") as "danger" | "brand" };
  });
  const today = currentDayIndex();
  const byDay = DAY_SHORT.map((d, i) => ({ label: d, value: scope.sessions.filter((s) => s.day === i).reduce((n, s) => n + s.duration, 0), highlight: i === today }));
  const mix = (["lecture", "lab", "tutorial"] as SessionKind[]).map((k) => ({ label: KIND_LABEL[k], value: scope.sessions.filter((s) => s.kind === k).length }));
  const reviewed = requests.filter((r) => r.status === "approved" || r.status === "rejected");
  const approved = requests.filter((r) => r.status === "approved").length;
  const errors = scope.issues.filter((i) => i.severity === "error").length;

  return (
    <>
      <PageHeader
        eyebrow={scope.department?.name}
        title="Reports"
        description="Teaching load, timetable distribution and request outcomes for your department — computed from live data."
        actions={
          <ButtonLink href="/api/export/timetable" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Export timetable CSV
          </ButtonLink>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weekly teaching periods" value={periods} icon={CalendarDays} hint={`${scope.sessions.length} sessions`} />
        <StatCard label="Faculty utilisation" value={`${pct(periods ? scope.faculty.reduce((n, f) => n + (scope.tt?.facultyLoad.get(f.id) ?? 0), 0) : 0, capacity)}%`} icon={Gauge} hint="Scheduled vs. maximum load" />
        <StatCard label="Open conflicts" value={errors} icon={TriangleAlert} tone={errors ? "danger" : "brand"} />
        <StatCard label="Change approval rate" value={reviewed.length ? `${pct(approved, reviewed.length)}%` : "—"} icon={ClipboardCheck} hint={`${approved} approved of ${reviewed.length} reviewed`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={Users} title="Faculty load distribution" description="Scheduled periods per week vs. maximum" />
          <CardBody>
            <BarList items={load} unit=" periods" empty="No faculty in this department" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={ChartColumn} title="Periods by day" description="Department teaching across the week" />
          <CardBody>
            <ColumnChart items={byDay} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={Layers} title="Session mix" />
          <CardBody>
            <BarList items={mix} unit=" sessions" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={ClipboardCheck} title="Change requests" />
          <CardBody>
            <KeyValue
              items={[
                ["Pending", requests.filter((r) => r.status === "pending").length],
                ["Approved", approved],
                ["Rejected", requests.filter((r) => r.status === "rejected").length],
                ["Withdrawn", requests.filter((r) => r.status === "cancelled").length],
                ["Via AI Assistant", requests.filter((r) => r.source === "assistant").length],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={Ticket} title="Department venue bookings" />
          <CardBody>
            <KeyValue
              items={[
                ["Approved", bookings.filter((b) => b.status === "approved").length],
                ["Pending", bookings.filter((b) => b.status === "pending").length],
                ["Rejected", bookings.filter((b) => b.status === "rejected").length],
                ["Cancelled", bookings.filter((b) => b.status === "cancelled").length],
                ["Total attendees", bookings.filter((b) => b.status === "approved").reduce((n, b) => n + b.attendees, 0)],
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
