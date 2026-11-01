"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { officialRuns } from "@/db/schema";
import { requireRole } from "./auth";
import { audit } from "./engine";
import {
  getOfficialDataset,
  getSampleDisruption,
  persistExport,
  runOfficialPipeline,
  type OfficialSchedule,
} from "./official";
import {
  getRepairWorkflow,
  stripRepairWorkflow,
  validateOfficialDisruption,
  type StoredValidatorReport,
} from "./official-disruption";
import { fail, ok, type ActionState } from "./utils";

async function latestScheduleRun() {
  const [row] = await db
    .select()
    .from(officialRuns)
    .where(eq(officialRuns.kind, "schedule"))
    .orderBy(desc(officialRuns.id))
    .limit(1);
  return row ?? null;
}

export async function generateOfficialScheduleAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const data = await getOfficialDataset();
  let result: Awaited<ReturnType<typeof runOfficialPipeline>>;
  try {
    result = await runOfficialPipeline({ data, timeLimit: 90 });
  } catch (err) {
    console.error(err);
    return fail("The validated CP-SAT service failed to run. Please retry once; if it still fails, check the engine service health.");
  }
  const { schedule, report } = result;
  if (!schedule.sessions.length) {
    return fail(`Solver returned ${schedule.solver?.status ?? "no result"}: ${(schedule.solver?.reasons ?? ["unknown"]).join("; ")}`);
  }
  await persistExport("schedule.json", schedule);
  await persistExport("report.json", report);
  const count = (await db.select({ id: officialRuns.id }).from(officialRuns)).length;
  const [run] = await db
    .insert(officialRuns)
    .values({
      kind: "schedule",
      label: `Official run ${count + 1}`,
      datasetId: data.dataset_id,
      createdById: user.id,
      schedule: schedule as unknown as Record<string, unknown>,
      report: report as unknown as Record<string, unknown>,
    })
    .returning();
  await audit(user.id, "official.generated", "schedule", run.id,
    `Official CIT schedule generated (${schedule.solver?.status}) — validator: ${report.hard_violation_count} hard violations, soft ${report.soft_total}, bookings ${report.bookings?.booking_score ?? 0}/${report.bookings?.booking_score_max_if_all_approved ?? 0}`);
  revalidatePath("/admin/official");
  return ok(
    report.hard_violation_count === 0
      ? `Schedule generated and independently validated: 0 hard violations, soft penalty ${report.soft_total}.`
      : `Schedule generated but the official validator reports ${report.hard_violation_count} hard violations — review before using it.`,
  );
}

async function disruptionFromForm(fd: FormData) {
  const data = await getOfficialDataset();
  let value: unknown;
  let sourceName: string;
  if (fd.get("useSample") === "true") {
    value = await getSampleDisruption();
    sourceName = "sample_disruption.json";
  } else {
    const upload = fd.get("disruption");
    if (!upload || typeof upload === "string" || typeof upload.text !== "function") {
      return { error: fail("Choose a JSON change file.", { disruption: "A .json file is required" }) };
    }
    if (upload.size > 256 * 1024) {
      return { error: fail("The change file is too large.", { disruption: "Maximum size is 256 KB" }) };
    }
    sourceName = upload.name || "uploaded-change.json";
    try {
      value = JSON.parse(await upload.text());
    } catch {
      return { error: fail("The uploaded file is not valid JSON.", { disruption: "Fix the JSON syntax and retry" }) };
    }
  }
  const checked = validateOfficialDisruption(value, data);
  if (!checked.ok) {
    const detail = checked.errors.slice(0, 6).join(" ");
    return { error: fail(`Change file rejected: ${detail}`, { disruption: checked.errors[0] }) };
  }
  return { data, disruption: checked.disruption, summary: checked.summary, sourceName };
}

/** Solve and validate a repair, but do not publish/export it until a second Admin action approves it. */
export async function proposeOfficialRepairAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const baselineRun = await latestScheduleRun();
  if (!baselineRun) return fail("Generate the official schedule first — repair needs a baseline.");
  const baselineReport = stripRepairWorkflow(baselineRun.report);
  if (baselineReport.hard_violation_count !== 0) return fail("The latest baseline is not hard-valid; generate a valid baseline first.");

  const input = await disruptionFromForm(fd);
  if ("error" in input) return input.error ?? fail("The change file could not be read.");
  const { data, disruption, summary, sourceName } = input;
  const baseline = baselineRun.schedule as unknown as OfficialSchedule;
  let result: Awaited<ReturnType<typeof runOfficialPipeline>>;
  try {
    result = await runOfficialPipeline({ data, disruption, baseline, timeLimit: 120 });
  } catch (err) {
    console.error(err);
    return fail("The validated CP-SAT service failed to prepare the repair. Retry once, then check engine health.");
  }
  const { schedule, report } = result;
  if (!schedule.sessions.length) {
    return fail(`No valid repair exists (${schedule.solver?.status ?? "unknown"}): ${(schedule.solver?.reasons ?? ["The submitted changes conflict with hard constraints."]).join("; ")}`);
  }
  if (report.hard_violation_count !== 0) {
    return fail(`The proposal was blocked: the official validator found ${report.hard_violation_count} hard violation(s).`);
  }
  if (schedule.solver?.minimum_moves_proven !== true) {
    return fail("A hard-valid repair was found, but CP-SAT did not finish proving the minimum move count. Retry the proposal.");
  }
  if (schedule.solver.minimum_moves !== report.stability?.sessions_moved) {
    return fail("The proposal was blocked because the solver move proof and official validator stability count disagree.");
  }

  const workflow = {
    status: "proposed" as const,
    baselineRunId: baselineRun.id,
    disruption,
    summary,
    sourceName: sourceName.replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 160) || "uploaded-change.json",
    proposedAt: new Date().toISOString(),
  };
  const storedReport: StoredValidatorReport = { ...report, _workflow: workflow };
  const count = (await db.select({ id: officialRuns.id }).from(officialRuns)).length;
  const [run] = await db
    .insert(officialRuns)
    .values({
      kind: "disruption",
      label: `Proposed repair ${count + 1} · ${workflow.sourceName}`,
      datasetId: data.dataset_id,
      createdById: user.id,
      schedule: schedule as unknown as Record<string, unknown>,
      report: storedReport as unknown as Record<string, unknown>,
    })
    .returning();
  await audit(
    user.id,
    "official.disruption_proposed",
    "disruption",
    run.id,
    `Repair proposed from ${workflow.sourceName}: validator 0 hard violations, ${report.stability?.sessions_moved ?? "?"} moved. Awaiting Admin approval.`,
  );
  revalidatePath("/admin/official");
  return ok(`Repair proposal ready: 0 hard violations and ${report.stability?.sessions_moved ?? "?"} moved session(s). Review the diff, then approve or reject it.`);
}

export async function approveOfficialRepairAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const runId = Number(fd.get("runId"));
  if (!Number.isInteger(runId)) return fail("Repair proposal not found.");
  const [run] = await db.select().from(officialRuns).where(eq(officialRuns.id, runId)).limit(1);
  if (!run || run.kind !== "disruption") return fail("Repair proposal not found.");
  const workflow = getRepairWorkflow(run.report);
  if (!workflow || workflow.status !== "proposed") return fail("This repair is no longer awaiting approval.");
  const latestBaseline = await latestScheduleRun();
  if (!latestBaseline || latestBaseline.id !== workflow.baselineRunId) {
    return fail("The baseline changed after this proposal was created. Generate a fresh repair before approving.");
  }
  const report = stripRepairWorkflow(run.report);
  if (report.hard_violation_count !== 0) return fail("A repair with hard violations cannot be approved.");
  const schedule = run.schedule as unknown as OfficialSchedule;
  if (schedule.solver?.minimum_moves_proven !== true) {
    return fail("Approval blocked because CP-SAT did not prove this is the minimum-move repair. Generate the proposal again.");
  }
  if (schedule.solver.minimum_moves !== report.stability?.sessions_moved) {
    return fail("Approval blocked because the proof count no longer matches the official validator report.");
  }

  const approvedWorkflow = { ...workflow, status: "approved" as const, approvedAt: new Date().toISOString(), approvedById: user.id };
  const storedReport: StoredValidatorReport = { ...report, _workflow: approvedWorkflow };
  await db
    .update(officialRuns)
    .set({ label: `Approved repair ${run.id} · ${workflow.sourceName}`, report: storedReport as unknown as Record<string, unknown> })
    .where(eq(officialRuns.id, run.id));
  await persistExport("schedule_after.json", run.schedule);
  await persistExport("report_after.json", report);
  await audit(
    user.id,
    "official.disruption_approved",
    "disruption",
    run.id,
    `Approved validated repair from ${workflow.sourceName}: 0 hard violations, ${report.stability?.sessions_moved ?? "?"} moved.`,
  );
  revalidatePath("/admin/official");
  return ok(`Repair approved and published: 0 hard violations, ${report.stability?.sessions_moved ?? "?"} moved session(s).`);
}

export async function rejectOfficialRepairAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const runId = Number(fd.get("runId"));
  if (!Number.isInteger(runId)) return fail("Repair proposal not found.");
  const [run] = await db.select().from(officialRuns).where(eq(officialRuns.id, runId)).limit(1);
  if (!run || run.kind !== "disruption") return fail("Repair proposal not found.");
  const workflow = getRepairWorkflow(run.report);
  if (!workflow || workflow.status !== "proposed") return fail("This repair is no longer awaiting approval.");
  const report = stripRepairWorkflow(run.report);
  const rejectedWorkflow = { ...workflow, status: "rejected" as const, rejectedAt: new Date().toISOString(), rejectedById: user.id };
  const storedReport: StoredValidatorReport = { ...report, _workflow: rejectedWorkflow };
  await db
    .update(officialRuns)
    .set({ label: `Rejected repair ${run.id} · ${workflow.sourceName}`, report: storedReport as unknown as Record<string, unknown> })
    .where(eq(officialRuns.id, run.id));
  await audit(user.id, "official.disruption_rejected", "disruption", run.id, `Rejected repair proposal from ${workflow.sourceName}.`);
  revalidatePath("/admin/official");
  return ok("Repair proposal rejected. The baseline and approved export were not changed.");
}
