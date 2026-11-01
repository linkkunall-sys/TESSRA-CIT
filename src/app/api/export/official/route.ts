import { eq } from "drizzle-orm";
import { db } from "@/db";
import { officialRuns } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getRepairWorkflow, stripRepairWorkflow } from "@/lib/official-disruption";

export const dynamic = "force-dynamic";

/** Downloads an app-produced official export (schedule.json / report.json). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("run"));
  const file = url.searchParams.get("file") === "report" ? "report" : "schedule";
  const [run] = Number.isInteger(id) ? await db.select().from(officialRuns).where(eq(officialRuns.id, id)) : [];
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.kind === "disruption") {
    const workflow = getRepairWorkflow(run.report);
    if (!workflow || workflow.status !== "approved") {
      return Response.json({ error: "This repair must be approved before it can be exported." }, { status: 409 });
    }
  }
  const name = file === "report" ? (run.kind === "disruption" ? "report_after.json" : "report.json") : run.kind === "disruption" ? "schedule_after.json" : "schedule.json";
  const body = file === "report" ? stripRepairWorkflow(run.report) : run.schedule;
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
