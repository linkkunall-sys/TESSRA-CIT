import { Building, Clock, LogOut, Save, Ticket, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, FormField, SubmitButton } from "@/components/client";
import { ResetDemoDataButton } from "@/components/reset-demo-data";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Checkbox, Input, KeyValue, PageHeader, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { logoutAction, updateSettingsAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { LUNCH, PERIODS, ROLE_LABEL } from "@/lib/constants";
import { getSettings } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireRole("admin");
  const settings = await getSettings();
  return (
    <>
      <PageHeader eyebrow="System" title="Settings" description="Institution profile, booking policy and the teaching-period structure used by the scheduling engine." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader icon={Building} title="Institution & booking policy" description={`Last updated ${formatDateTime(settings.updatedAt)}`} />
          <ActionForm action={updateSettingsAction} className="space-y-6 p-5">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 text-sm font-semibold text-ink">Institution</legend>
              <FormField name="institutionName" label="Institution name" required>
                <Input id="institutionName" name="institutionName" defaultValue={settings.institutionName} />
              </FormField>
              <FormField name="academicTerm" label="Academic term" required hint="Shown in the header of every workspace.">
                <Input id="academicTerm" name="academicTerm" defaultValue={settings.academicTerm} />
              </FormField>
            </fieldset>
            <fieldset className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Ticket className="size-4 text-ink-3" aria-hidden /> Venue booking policy
              </legend>
              <FormField name="bookingLeadDays" label="Minimum notice for clubs (days)" required>
                <Input id="bookingLeadDays" name="bookingLeadDays" type="number" min={0} max={30} defaultValue={settings.bookingLeadDays} />
              </FormField>
              <FormField name="maxBookingHours" label="Maximum booking length (hours)" required>
                <Input id="maxBookingHours" name="maxBookingHours" type="number" min={1} max={12} defaultValue={settings.maxBookingHours} />
              </FormField>
              <div className="space-y-3 sm:col-span-2">
                <Checkbox name="clubApprovalRequired" defaultChecked={settings.clubApprovalRequired} label="Club bookings require administrator approval" description="When off, conflict-free club requests are confirmed automatically." />
                <Checkbox name="allowWeekendBookings" defaultChecked={settings.allowWeekendBookings} label="Allow weekend bookings" />
              </div>
            </fieldset>
            <div className="flex justify-end border-t border-line pt-5">
              <SubmitButton icon={<Save />} pendingLabel="Saving…">
                Save settings
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={UserRound} title="Your account" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={user.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-xs text-ink-2">{user.email}</p>
                </div>
              </div>
              <KeyValue
                items={[
                  ["Role", <Badge key="r" tone="brand">{ROLE_LABEL[user.role]}</Badge>],
                  ["Title", user.title ?? "—"],
                ]}
              />
              <form action={logoutAction}>
                <Button type="submit" variant="secondary" className="w-full">
                  <LogOut aria-hidden /> Sign out
                </Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={Clock} title="Teaching periods" description="Monday – Friday · labs run in two-period blocks" />
            <TableWrap>
              <Table className="min-w-0">
                <THead>
                  <tr>
                    <TH>Period</TH>
                    <TH className="text-right">Time</TH>
                  </tr>
                </THead>
                <tbody>
                  {PERIODS.map((p) => (
                    <TR key={p.n}>
                      <TD className="font-medium">P{p.n}</TD>
                      <TD className="tabular text-right text-ink-2">
                        {p.start}–{p.end}
                      </TD>
                    </TR>
                  )).flatMap((row, i) =>
                    i === 3
                      ? [
                          row,
                          <TR key="lunch" className="bg-subtle">
                            <TD className="text-ink-2">Lunch</TD>
                            <TD className="tabular text-right text-ink-3">
                              {LUNCH.start}–{LUNCH.end}
                            </TD>
                          </TR>,
                        ]
                      : [row],
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <Card>
            <CardHeader
              title="CIT baseline restore"
              description="Atomically restore the committed validator-clean CIT operations while preserving accounts and academic reference data."
              action={<ResetDemoDataButton compact />}
            />
            <CardBody>
              <p className="text-xs leading-5 text-ink-3">
                The restore is guarded by an administrator role check and rolls back completely if any CIT source
                reference is missing, so a partial baseline is never published.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
