import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { getExams } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const exams = await getExams();
  const rows = [
    ["Date", "Start", "End", "Course code", "Course title", "Groups", "Room", "Capacity", "Candidates", "Invigilator", "Validation"],
    ...exams.map((e) => [e.date, e.startTime, e.endTime, e.courseCode, e.courseTitle, e.groupCodes.join(" + "), e.roomCode, e.roomCapacity, e.candidates, e.invigilatorName ?? "", e.issues.length ? e.issues.join("; ") : "Valid"]),
  ];
  return csvResponse("tessra-examinations.csv", toCsv(rows));
}
