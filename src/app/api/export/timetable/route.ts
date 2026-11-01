import { getCurrentUser } from "@/lib/auth";
import { DAYS, KIND_LABEL } from "@/lib/constants";
import { csvResponse, toCsv } from "@/lib/csv";
import { getPublished, getTimetable, getVersions } from "@/lib/queries";
import { periodLabel, periodTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "coordinator") return Response.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const versions = await getVersions();
  const requested = versions.find((v) => String(v.id) === url.searchParams.get("version"));
  const version = (user.role === "admin" ? requested : undefined) ?? (await getPublished());
  if (!version) return Response.json({ error: "No timetable" }, { status: 404 });
  const tt = await getTimetable(version.id);
  const deptId = user.role === "coordinator" ? user.departmentId : Number(url.searchParams.get("dept")) || null;
  const deptFaculty = new Set(tt.state.userRows.filter((u) => u.departmentId === deptId).map((u) => u.id));
  const deptGroups = new Set(tt.state.groupRows.filter((g) => g.departmentId === deptId).map((g) => g.id));
  const sessions = deptId ? tt.sessions.filter((s) => deptFaculty.has(s.facultyId) || s.groupIds.some((g) => deptGroups.has(g))) : tt.sessions;
  const rows = [
    ["Day", "Period", "Time", "Course code", "Course title", "Type", "Groups", "Students", "Faculty", "Room", "Fixed", "Combined", "Conflicts"],
    ...sessions.map((s) => [
      DAYS[s.day],
      periodLabel(s.startPeriod, s.duration),
      periodTime(s.startPeriod, s.duration),
      s.courseCode,
      s.courseTitle,
      KIND_LABEL[s.kind],
      s.groupCodes.join(" + "),
      s.size,
      s.facultyName,
      s.roomCode,
      s.isFixed ? "Yes" : "No",
      s.combined ? "Yes" : "No",
      (tt.issuesBySession[s.id] ?? []).join("; "),
    ]),
  ];
  return csvResponse(`tessra-timetable-${version.label.toLowerCase().replace(/\s+/g, "-")}.csv`, toCsv(rows));
}
