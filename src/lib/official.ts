/**
 * Official Crunch Week pipeline integration.
 *
 * The app reads the untouched official dataset, runs the Python OR-Tools CP-SAT
 * engine (remote FastAPI service when ENGINE_URL is set, otherwise a local
 * subprocess), then runs the OFFICIAL validator.py on the result. Reports shown
 * in the UI are the validator's own output — the app never grades itself.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cache } from "react";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
export const PACK_DIR = path.join(ROOT, "official", "starterpack", "CrunchWeek_StarterPack");
export const DATA_PATH = path.join(PACK_DIR, "data", "cit_public.json");
export const VALIDATOR_PATH = path.join(PACK_DIR, "validator.py");
export const DISRUPTION_PATH = path.join(PACK_DIR, "examples", "sample_disruption.json");
const PYTHON = process.env.PYTHON_BIN ?? "python3";

export type OfficialDataset = {
  dataset_id: string;
  institute: string;
  calendar: {
    days: string[];
    periods: { id: number; start: string; end: string; teaching: boolean }[];
    lunch: { after_period: number; start: string; end: string };
    lab_start_periods: number[];
    event_only_periods?: number[];
    fest_week?: string;
    exam_week: { days: string[]; sessions: { id: string; start?: string; end?: string }[] };
  };
  priority_order: string[];
  role_category_cap: Record<string, string>;
  rooms: { id: string; name: string; building: string; type: string; capacity: number; features: string[]; accessible: boolean; allowed_uses: string[] }[];
  room_unavailability: { room_id: string; day: string; periods: number[]; reason?: string }[];
  faculty: { id: string; name: string; department: string; max_hours_per_day: number; needs_accessible: boolean; unavailable: { day: string; periods: number[]; reason?: string }[]; preferences: unknown[] }[];
  student_groups: { id: string; name: string; year: number; department: string; size: number; needs_accessible: boolean }[];
  courses: { id: string; title?: string; name?: string; department: string; year: number; lecture_hours: number; tutorial_hours: number; lab_blocks: number }[];
  sessions: { id: string; course_id: string; kind: "lecture" | "tutorial" | "lab"; groups: string[]; faculty_id: string; size: number; duration: number; room_types: string[]; needs_accessible: boolean; basket_slot: string | null; fixed_slot: { day: string; start_period: number } | null }[];
  booking_requests: OfficialBookingRequest[];
  cancellations: { request_id: string; note?: string }[];
  exams: { id: string; course_ids: string[]; groups: string[]; size: number; duration_hours: number }[];
};

export type OfficialBookingRequest = {
  id: string; submitted_at: string; requester: string; role: string; department: string | null; requested_category: string;
  title: string; attendance: number; duration_periods: number;
  windows: { day: string; from_period: number; to_period: number }[];
  room_types: string[]; needs: string[]; requested_room: string | null;
  mandatory_for_groups: string[]; series_id: string | null; raw_text: string;
};

export type OfficialSchedule = {
  team: string;
  dataset_id: string;
  solver?: {
    status: string;
    objective?: number | null;
    wall_time?: number;
    reasons?: string[];
    sessions_moved_from_baseline?: number | null;
    minimum_moves_proven?: boolean | null;
    minimum_moves?: number | null;
    minimum_move_objective?: "lexicographic" | null;
  };
  sessions: { session_id: string; day: string; start_period: number; room_id: string }[];
  fest_week?: {
    bookings: { request_id: string; status: "approved" | "rejected" | "alternative_offered"; day?: string; start_period?: number; end_period?: number; room_id?: string; reason?: string }[];
    session_overrides: { session_id: string; day: string; start_period: number; room_id: string; displaced_by: string }[];
  };
  exams?: { exam_id: string; day: string; session: string; rooms: string[] }[];
};

export type ValidatorReport = {
  hard_violation_count: number;
  hard_by_rule: Record<string, number>;
  hard_violations: { rule: string; where: string; detail: string }[];
  soft_penalties: Record<string, number>;
  soft_total: number;
  exam_soft_penalty?: number;
  bookings?: {
    booking_score: number; booking_score_max_if_all_approved: number;
    approved: number; alternatives: number; rejected: number;
    session_overrides: number; priority_inversions: string[];
  };
  stability?: { sessions_moved: number; time_changed: number; room_only_changed: number; moved_ids: string[] };
  warnings: string[];
};

export const getOfficialDataset = cache(async (): Promise<OfficialDataset> => {
  return JSON.parse(await readFile(DATA_PATH, "utf-8")) as OfficialDataset;
});

export const getSampleDisruption = cache(async (): Promise<{ changes: unknown[]; description?: string }> => {
  return JSON.parse(await readFile(DISRUPTION_PATH, "utf-8"));
});

export function effectiveCategory(data: OfficialDataset, req: OfficialBookingRequest) {
  const order = data.priority_order;
  const cap = data.role_category_cap[req.role] ?? "club_event";
  const a = order.includes(req.requested_category) ? order.indexOf(req.requested_category) : order.length - 1;
  return order[Math.max(a, order.indexOf(cap))];
}

async function tempJson(prefix: string, value: unknown) {
  const file = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(file, JSON.stringify(value), "utf-8");
  return file;
}

/** Runs the CP-SAT engine. Remote service when configured, local subprocess otherwise. */
export async function runEngine(opts: { data: OfficialDataset; disruption?: unknown; baseline?: OfficialSchedule; timeLimit?: number }): Promise<OfficialSchedule> {
  const timeLimit = opts.timeLimit ?? 90;
  const url = process.env.ENGINE_URL;
  if (url) {
    const res = await fetch(`${url.replace(/\/$/, "")}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.ENGINE_TOKEN ? { Authorization: `Bearer ${process.env.ENGINE_TOKEN}` } : {}) },
      body: JSON.stringify({ data: opts.data, disruption: opts.disruption ?? null, baseline: opts.baseline ?? null, team: "TESSRA", time_limit: timeLimit }),
      signal: AbortSignal.timeout((timeLimit + 60) * 1000),
    });
    if (!res.ok) throw new Error(`Scheduling service returned HTTP ${res.status}`);
    return (await res.json()) as OfficialSchedule;
  }
  const dataFile = await tempJson("tessra-data", opts.data);
  const outFile = path.join(os.tmpdir(), `tessra-out-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = [path.join(ROOT, "engine", "solve.py"), "--data", dataFile, "--out", outFile, "--time-limit", String(timeLimit)];
  if (opts.disruption) args.push("--disruption", await tempJson("tessra-dis", opts.disruption));
  if (opts.baseline) args.push("--baseline", await tempJson("tessra-base", opts.baseline));
  await execFileAsync(PYTHON, args, { timeout: (timeLimit + 120) * 1000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(await readFile(outFile, "utf-8")) as OfficialSchedule;
}

/** Runs the untouched official validator and returns its JSON report. */
export async function runOfficialValidator(opts: { schedule: OfficialSchedule; disruption?: unknown; baseline?: OfficialSchedule }): Promise<ValidatorReport> {
  const dataFile = DATA_PATH;
  const schedFile = await tempJson("tessra-sched", opts.schedule);
  const reportFile = path.join(os.tmpdir(), `tessra-report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = [VALIDATOR_PATH, "--data", dataFile, "--schedule", schedFile, "--json", reportFile, "--quiet"];
  if (opts.disruption) args.push("--disruption", await tempJson("tessra-dis", opts.disruption));
  if (opts.baseline) args.push("--baseline", await tempJson("tessra-base", opts.baseline));
  await execFileAsync(PYTHON, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(await readFile(reportFile, "utf-8")) as ValidatorReport;
}

/**
 * Generates and validates in one runtime boundary.
 *
 * In production the Vercel service binding injects ENGINE_URL and the Python
 * service runs the byte-identical organiser validator. Locally, both commands
 * are executed as subprocesses exactly as before.
 */
export async function runOfficialPipeline(opts: {
  data: OfficialDataset;
  disruption?: unknown;
  baseline?: OfficialSchedule;
  timeLimit?: number;
}): Promise<{ schedule: OfficialSchedule; report: ValidatorReport }> {
  const timeLimit = opts.timeLimit ?? 90;
  const url = process.env.ENGINE_URL;
  if (url) {
    const res = await fetch(`${url.replace(/\/$/, "")}/solve-validated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ENGINE_TOKEN ? { Authorization: `Bearer ${process.env.ENGINE_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        data: opts.data,
        disruption: opts.disruption ?? null,
        baseline: opts.baseline ?? null,
        team: "TESSRA",
        time_limit: timeLimit,
        workers: 2,
      }),
      signal: AbortSignal.timeout((timeLimit + 90) * 1000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Validated scheduling service returned HTTP ${res.status}`);
    const value = (await res.json()) as { schedule?: OfficialSchedule; report?: ValidatorReport };
    if (!value.schedule || !value.report) throw new Error("Validated scheduling service returned an incomplete response");
    return { schedule: value.schedule, report: value.report };
  }

  const schedule = await runEngine(opts);
  const report = await runOfficialValidator({ schedule, disruption: opts.disruption, baseline: opts.baseline });
  return { schedule, report };
}

/** The repo's exports/ folder must contain app-produced files (official README rule). */
export async function persistExport(name: "schedule.json" | "schedule_after.json" | "report.json" | "report_after.json", value: unknown) {
  try {
    const dir = path.join(ROOT, "exports");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), JSON.stringify(value, null, 2), "utf-8");
  } catch {
    // read-only filesystems (serverless) keep results in the database instead
  }
}
