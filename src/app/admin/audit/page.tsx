import { History, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, TabLinks, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { getRef, getVersions, listAudit } from "@/lib/queries";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit & History" };

const TYPES: { key: string; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "schedule", label: "Scheduling" },
  { key: "booking", label: "Bookings" },
  { key: "change_request", label: "Change requests" },
  { key: "disruption", label: "Disruptions" },
  { key: "room", label: "Venues" },
  { key: "exam", label: "Examinations" },
  { key: "academics", label: "Academics" },
  { key: "settings", label: "Settings" },
];

function actionTone(action: string) {
  if (/approved|published|applied|created|generated/.test(action)) return "success" as const;
  if (/rejected|deleted|discarded|cancelled|withdrawn/.test(action)) return "danger" as const;
  if (/maintenance|inactive|reported/.test(action)) return "warning" as const;
  return "neutral" as const;
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const type = TYPES.find((t) => t.key === get("type"))?.key ?? "all";
  const [entries, versions, ref] = await Promise.all([listAudit({ entityType: type === "all" ? undefined : type, limit: 200 }), getVersions(), getRef()]);

  return (
    <>
      <PageHeader eyebrow="Governance" title="Audit & History" description="An immutable record of every administrative decision, plus the full history of timetable versions." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <div className="px-4 pt-2 sm:px-5">
            <TabLinks label="Activity type" bordered={false} items={TYPES.map((t) => ({ href: t.key === "all" ? "/admin/audit" : `/admin/audit?type=${t.key}`, label: t.label, active: type === t.key }))} />
          </div>
          <div className="border-t border-line">
            {entries.length ? (
              <TableWrap>
                <Table className="min-w-[760px]">
                  <THead>
                    <tr>
                      <TH className="w-44">When</TH>
                      <TH className="w-52">Actor</TH>
                      <TH className="w-48">Action</TH>
                      <TH>Summary</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {entries.map((a) => (
                      <TR key={a.id}>
                        <TD className="whitespace-nowrap">
                          <time dateTime={a.createdAt.toISOString()} className="block text-[13px] font-medium">
                            {formatDateTime(a.createdAt)}
                          </time>
                          <span className="text-xs text-ink-3">{formatRelative(a.createdAt)}</span>
                        </TD>
                        <TD>
                          <span className="flex items-center gap-2">
                            <Avatar name={a.actorName} size="sm" />
                            <span className="truncate text-[13px]">{a.actorName}</span>
                          </span>
                        </TD>
                        <TD>
                          <Badge tone={actionTone(a.action)} className="font-mono text-[11px]">
                            {a.action}
                          </Badge>
                        </TD>
                        <TD className="text-[13px]">{a.summary}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <EmptyState icon={ScrollText} title="No activity for this filter" />
            )}
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader icon={History} title="Timetable versions" description={`${versions.length} version${versions.length === 1 ? "" : "s"} generated`} />
          <ol className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/admin/scheduling?version=${v.id}`} className="text-[13px] font-semibold text-ink hover:text-brand-700 hover:underline">
                    {v.label}
                  </Link>
                  <StatusBadge status={v.status} />
                </div>
                <p className="mt-1 text-xs text-ink-2">
                  {formatDateTime(v.createdAt)}
                  {v.createdById ? ` · ${ref.personMap.get(v.createdById)?.name ?? ""}` : ""}
                </p>
                {v.stats && (
                  <p className="mt-0.5 text-xs text-ink-3">
                    {v.stats.placedUnits}/{v.stats.requiredUnits} sessions placed · {v.stats.durationMs} ms
                  </p>
                )}
                {v.notes && <p className="mt-1 text-xs text-ink-2">{v.notes}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
