import { CalendarDays, Download, GraduationCap, Pencil, Plus, ShieldCheck, Trash, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, ConfirmAction, Dialog, DialogCancel, DialogFooter, FormField, SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, Input, PageHeader, ProgressBar, Select, StatCard, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { deleteExamAction, saveExamAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { getExams, getRef, type ExamView, type Ref } from "@/lib/queries";
import { formatDate, formatDateLong, pct, plural, relativeDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Examinations" };

function ExamFields({ data: ref, exam }: { data: Ref; exam?: ExamView }) {
  const examRooms = ref.rooms.filter((room) => room.allowedUses.includes("exam"));
  const selectedRoomIds = exam ? (exam.roomIds.length ? exam.roomIds : [exam.roomId]) : [];
  return (
    <ActionForm action={saveExamAction} className="grid gap-4 sm:grid-cols-2">
      {exam && <input type="hidden" name="id" value={exam.id} />}
      <FormField name="courseIds" label="Courses" required className="sm:col-span-2" htmlFor="exam-course-0" hint="Select every course represented by this examination.">
        <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {ref.courses
            .filter((c) => c.kind !== "lab")
            .map((c, i) => {
              const selected = exam ? (exam.courseIds.length ? exam.courseIds : [exam.courseId]) : [];
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                  <input id={`exam-course-${i}`} type="checkbox" name="courseIds" value={c.id} defaultChecked={selected.includes(c.id)} className="size-4 accent-brand-600" />
                  <span className="font-medium text-ink">{c.code}</span>
                  <span className="min-w-0 truncate text-xs text-ink-3">{c.title}</span>
                </label>
              );
            })}
        </div>
      </FormField>
      <FormField name="groupIds" label="Groups sitting the exam" required className="sm:col-span-2" htmlFor="exam-group-0">
        <div className="grid gap-2 sm:grid-cols-3">
          {ref.groups.map((g, i) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input id={`exam-group-${i}`} type="checkbox" name="groupIds" value={g.id} defaultChecked={exam?.groupIds.includes(g.id)} className="size-4 accent-brand-600" />
              <span className="font-medium text-ink">{g.code}</span>
              <span className="ml-auto text-xs text-ink-3">{g.size}</span>
            </label>
          ))}
        </div>
      </FormField>
      <FormField name="date" label="Date" required>
        <Input id="date" name="date" type="date" defaultValue={exam?.date} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField name="startTime" label="Start" required>
          <Input id="startTime" name="startTime" type="time" defaultValue={exam?.startTime ?? "10:00"} />
        </FormField>
        <FormField name="endTime" label="End" required>
          <Input id="endTime" name="endTime" type="time" defaultValue={exam?.endTime ?? "12:00"} />
        </FormField>
      </div>
      <FormField name="roomIds" label="Rooms" required className="sm:col-span-2" htmlFor="exam-room-0" hint="Select one or more rooms. Exam capacity uses half of each room’s normal capacity.">
        <div className="grid gap-2 sm:grid-cols-3">
          {examRooms.map((r, i) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input id={`exam-room-${i}`} type="checkbox" name="roomIds" value={r.id} defaultChecked={selectedRoomIds.includes(r.id)} disabled={r.status !== "active"} className="size-4 accent-brand-600" />
              <span className="font-medium text-ink">{r.code}</span>
              <span className="ml-auto text-xs text-ink-3">{Math.floor(r.capacity / 2)} exam seats</span>
            </label>
          ))}
        </div>
      </FormField>
      <FormField name="invigilatorId" label="Invigilator">
        <Select id="invigilatorId" name="invigilatorId" defaultValue={exam?.invigilatorId ?? ""}>
          <option value="">Unassigned</option>
          {ref.faculty.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField name="candidates" label="Candidates" hint="Leave blank to use the combined group size." className="sm:col-span-2">
        <Input id="candidates" name="candidates" type="number" min={1} defaultValue={exam?.candidates} />
      </FormField>
      <DialogFooter className="sm:col-span-2">
        <DialogCancel />
        <SubmitButton pendingLabel="Validating…">{exam ? "Save changes" : "Schedule exam"}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

export default async function ExaminationsPage() {
  await requireRole("admin");
  const [exams, ref] = await Promise.all([getExams(), getRef()]);
  const withIssues = exams.filter((e) => e.issues.length);
  const dates = [...new Set(exams.map((e) => e.date))].sort();
  const candidates = exams.reduce((n, e) => n + e.candidates, 0);

  const addExam = (
    <Dialog
      variant="primary"
      size="lg"
      trigger={
        <>
          <Plus aria-hidden /> Schedule exam
        </>
      }
      title="Schedule an examination"
      description="Room, group and invigilator clashes are validated as soon as you save."
    >
      <ExamFields data={ref} />
    </Dialog>
  );

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Examinations"
        description="Mid-term examination timetable with room capacity, invigilation and clash validation."
        actions={
          <>
            <ButtonLink href="/api/export/exams" variant="secondary" prefetch={false}>
              <Download aria-hidden /> Export CSV
            </ButtonLink>
            {addExam}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Examinations" value={exams.length} icon={GraduationCap} />
        <StatCard label="Examination days" value={dates.length} icon={CalendarDays} hint={dates.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : "Nothing scheduled"} />
        <StatCard label="Candidates" value={candidates} icon={Users} hint={`${new Set(exams.flatMap((e) => e.roomIds.length ? e.roomIds : [e.roomId])).size} rooms in use`} />
        <StatCard
          label="Validation"
          value={withIssues.length ? plural(withIssues.length, "issue") : "Valid"}
          icon={withIssues.length ? TriangleAlert : ShieldCheck}
          tone={withIssues.length ? "danger" : "brand"}
          hint={withIssues.length ? "Resolve before publishing to students" : "No clashes or capacity problems"}
        />
      </div>

      {withIssues.length > 0 && (
        <Callout tone="danger" title={`${plural(withIssues.length, "examination")} need attention`} className="mt-6">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {withIssues.map((e) => (
              <li key={e.id}>
                <span className="font-medium">
                  {e.courseCode} ({formatDate(e.date)} {e.startTime})
                </span>
                : {e.issues.join("; ")}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="mt-6 space-y-6">
        {!exams.length && (
          <Card>
            <EmptyState icon={GraduationCap} title="No examinations scheduled" description="Add the first examination to build the timetable." action={addExam} />
          </Card>
        )}
        {dates.map((date) => {
          const list = exams.filter((e) => e.date === date);
          return (
            <Card key={date}>
              <CardHeader
                icon={CalendarDays}
                title={formatDateLong(date)}
                description={`${relativeDay(date)} · ${plural(list.length, "examination")} · ${list.reduce((n, e) => n + e.candidates, 0)} candidates`}
              />
              <TableWrap>
                <Table className="min-w-[900px]">
                  <THead>
                    <tr>
                      <TH>Time</TH>
                      <TH>Course</TH>
                      <TH>Groups</TH>
                      <TH className="w-52">Room &amp; capacity</TH>
                      <TH>Invigilator</TH>
                      <TH>Status</TH>
                      <TH className="text-right">
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {list.map((e) => {
                      const fill = pct(e.candidates, e.roomCapacity);
                      return (
                        <TR key={e.id} className={e.issues.length ? "bg-danger-bg/20" : undefined}>
                          <TD className="tabular whitespace-nowrap font-medium">
                            {e.startTime}–{e.endTime}
                            {e.sourceDay && e.sourceSession ? <span className="block text-[11px] font-normal text-ink-3">Source: {e.sourceDay} · {e.sourceSession}</span> : null}
                          </TD>
                          <TD>
                            <p className="font-semibold">{e.courseCode}</p>
                            <p className="text-xs text-ink-2">{e.courseTitle}</p>
                          </TD>
                          <TD>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {e.groupCodes.join(" + ")}
                              {e.groupIds.length > 1 && <Badge tone="info">Combined</Badge>}
                            </div>
                          </TD>
                          <TD>
                            <p className="text-[13px] font-medium">{e.roomCode}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <ProgressBar value={e.candidates} max={e.roomCapacity} tone={fill > 100 ? "danger" : fill > 90 ? "warning" : "brand"} label={`${e.roomCode} capacity`} />
                              <span className="tabular shrink-0 text-xs text-ink-2">
                                {e.candidates}/{e.roomCapacity}
                              </span>
                            </div>
                          </TD>
                          <TD className="text-ink-2">{e.invigilatorName ?? <span className="text-ink-3">Unassigned</span>}</TD>
                          <TD>
                            {e.issues.length ? (
                              <div className="max-w-[240px]">
                                <Badge tone="danger" icon={TriangleAlert}>
                                  {plural(e.issues.length, "conflict")}
                                </Badge>
                                <p className="mt-1 text-xs text-danger-fg">{e.issues[0]}</p>
                              </div>
                            ) : (
                              <Badge tone="success" icon={ShieldCheck}>
                                Valid
                              </Badge>
                            )}
                          </TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-1">
                              <Dialog
                                variant="ghost"
                                triggerSize="icon-sm"
                                trigger={<Pencil aria-hidden />}
                                triggerLabel={`Edit ${e.courseCode} examination`}
                                title={`Edit ${e.courseCode} examination`}
                                size="lg"
                              >
                                <ExamFields data={ref} exam={e} />
                              </Dialog>
                              <ConfirmAction
                                action={deleteExamAction}
                                fields={{ id: e.id }}
                                trigger={<Trash aria-hidden />}
                                triggerVariant="ghost"
                                triggerSize="icon-sm"
                                triggerLabel={`Delete ${e.courseCode} examination`}
                                title={`Delete ${e.courseCode} examination?`}
                                description={`${formatDate(e.date)} ${e.startTime}–${e.endTime} in ${e.roomCode}. This cannot be undone.`}
                                confirmLabel="Delete examination"
                              />
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>
          );
        })}
      </div>
    </>
  );
}
