import { ClipboardCheck, History, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ChangeRequestCard, ChangeReviewActions } from "@/components/domain";
import { Callout, Card, EmptyState, PageHeader, TabLinks } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { getDepartmentFacultyIds, listChangeRequests } from "@/lib/queries";

export const metadata: Metadata = { title: "Approvals" };

export default async function CoordinatorApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("coordinator");
  const get = await readParams(searchParams);
  const tab = get("tab") === "reviewed" ? "reviewed" : "pending";
  const facultyIds = await getDepartmentFacultyIds(user.departmentId);
  const all = await listChangeRequests({ facultyIds });
  const pending = all.filter((r) => r.status === "pending" && r.type !== "extra_class");
  const reviewed = all.filter((r) => r.status !== "pending" && r.type !== "extra_class");
  const list = tab === "pending" ? pending : reviewed;

  return (
    <>
      <PageHeader eyebrow={user.departmentName ?? "Department"} title="Approvals" description="Schedule change requests from your faculty. Each approval is re-validated against the live timetable before it is applied." />
      <Callout tone="brand" icon={ShieldCheck} className="mb-6">
        Approving a request moves the session in the published timetable immediately and notifies the faculty member. Requests that would create a clash are blocked automatically.
      </Callout>
      <TabLinks
        label="Request status"
        className="mb-6"
        items={[
          { href: "/coordinator/approvals", label: "Pending", count: pending.length, active: tab === "pending" },
          { href: "/coordinator/approvals?tab=reviewed", label: "Reviewed", count: reviewed.length, active: tab === "reviewed" },
        ]}
      />
      {list.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((r) => (
            <ChangeRequestCard key={r.id} r={r} showFaculty actions={r.status === "pending" ? <ChangeReviewActions id={r.id} /> : undefined} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={tab === "pending" ? ClipboardCheck : History}
            title={tab === "pending" ? "No pending requests" : "No reviewed requests yet"}
            description={tab === "pending" ? "Requests submitted by your faculty will appear here." : undefined}
          />
        </Card>
      )}
    </>
  );
}
