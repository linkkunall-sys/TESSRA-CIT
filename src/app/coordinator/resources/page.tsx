import { Boxes, Building, FlaskConical, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { VenueCard } from "@/components/domain";
import { BarList, Card, CardHeader, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getDepartmentScope } from "@/lib/scope";
import { pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Resources" };

export default async function CoordinatorResourcesPage() {
  const user = await requireRole("coordinator");
  const scope = await getDepartmentScope(user.departmentId);
  const owned = scope.ref.rooms.filter((r) => r.departmentId === user.departmentId);
  const usage = new Map<number, number>();
  for (const s of scope.sessions) usage.set(s.roomId, (usage.get(s.roomId) ?? 0) + s.duration);
  const used = scope.ref.rooms
    .filter((r) => usage.has(r.id))
    .map((r) => ({ label: `${r.code} · ${r.name}`, value: usage.get(r.id) ?? 0, tone: (r.status !== "active" ? "warning" : "brand") as "warning" | "brand", hint: r.status !== "active" ? "· unavailable" : undefined }))
    .sort((a, b) => b.value - a.value);
  const unavailable = owned.filter((r) => r.status !== "active");
  const labSessions = scope.sessions.filter((s) => s.kind === "lab");

  return (
    <>
      <PageHeader eyebrow={scope.department?.name} title="Resources" description="Rooms and labs your department owns or depends on, with live timetable usage and maintenance status." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Department-owned venues" value={owned.length} icon={Building} />
        <StatCard label="Rooms in use" value={used.length} icon={Boxes} hint="By department sessions" />
        <StatCard label="Lab sessions" value={labSessions.length} icon={FlaskConical} hint={`${labSessions.reduce((n, s) => n + s.duration, 0)} lab periods per week`} />
        <StatCard label="Unavailable" value={unavailable.length} icon={Wrench} tone={unavailable.length ? "warning" : "neutral"} hint={unavailable.map((r) => r.code).join(", ") || "All owned venues active"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="owned-heading" className="min-w-0">
          <SectionTitle>
            <span id="owned-heading">Department venues</span>
          </SectionTitle>
          {owned.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {owned.map((r) => (
                <VenueCard key={r.id} room={r} utilisation={pct(scope.tt?.roomLoad.get(r.id) ?? 0, 40)} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon={Building} title="No venues assigned to your department" />
            </Card>
          )}
        </section>
        <Card className="h-fit">
          <CardHeader icon={Boxes} title="Rooms used by your sessions" description="Teaching periods per week" />
          <div className="p-5">
            <BarList items={used} unit=" periods" empty="No department sessions scheduled" />
          </div>
        </Card>
      </div>
    </>
  );
}
