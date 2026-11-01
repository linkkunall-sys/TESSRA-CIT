import { CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { InlineAction } from "@/components/client";
import { NotificationList } from "@/components/domain";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { markAllNotificationsReadAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";

export const metadata: Metadata = { title: "Notifications" };

export default async function ClubNotificationsPage() {
  const user = await requireRole("club");
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.read).length;
  return (
    <>
      <PageHeader
        eyebrow={user.clubName ?? "Club"}
        title="Notifications"
        description="Booking decisions, venue changes and reminders."
        actions={
          unread > 0 ? (
            <InlineAction action={markAllNotificationsReadAction} fields={{ all: 1 }} size="md" icon={<CheckCheck />}>
              Mark all as read
            </InlineAction>
          ) : undefined
        }
      />
      <Card>
        <CardHeader title="All notifications" description={unread ? `${unread} unread of ${items.length}` : `${items.length} notifications · all read`} />
        <NotificationList items={items} />
      </Card>
    </>
  );
}
