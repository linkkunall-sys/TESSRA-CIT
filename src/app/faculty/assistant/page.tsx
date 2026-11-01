import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { AssistantChat } from "@/components/assistant-chat";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { changeRequests } from "@/db/schema";
import { SUGGESTED_PROMPTS } from "@/lib/assistant";
import { requireRole } from "@/lib/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { listAssistantMessages } from "@/lib/queries";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function FacultyAssistantPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("faculty");
  const get = await readParams(searchParams);
  const rows = await listAssistantMessages(user.id);
  const requestIds = rows.flatMap((m) => (m.payload?.kind === "proposal" && m.payload.changeRequestId ? [m.payload.changeRequestId] : []));
  const statuses = requestIds.length ? await db.select({ id: changeRequests.id, status: changeRequests.status }).from(changeRequests).where(inArray(changeRequests.id, requestIds)) : [];

  return (
    <>
      <PageHeader
        eyebrow="Assist"
        title="AI Assistant"
        description="Ask in plain language. Answers come from the live timetable; suggested changes stay proposals until you submit them and your coordinator approves."
      />
      <AssistantChat
        messages={rows.map((m) => ({ id: m.id, role: m.role, content: m.content, payload: m.payload, createdAt: m.createdAt.toISOString() }))}
        requestStatus={Object.fromEntries(statuses.map((s) => [s.id, s.status]))}
        prompts={SUGGESTED_PROMPTS}
        initialInput={get("q") ?? ""}
        userInitials={initials(user.name)}
      />
    </>
  );
}
