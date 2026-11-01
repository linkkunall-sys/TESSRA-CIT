"use client";

/**
 * Teacher coursework workspace: syllabus planner, assignments and class resources.
 * Used by the faculty workspace and the admin oversight view. Every mutation is a
 * server action that re-checks that the course belongs to the signed-in teacher.
 */
import {
  ArrowDown, ArrowUp, BookOpen, CalendarClock, Check, CircleCheck, ClipboardList, ExternalLink, FileText,
  Link2, ListChecks, Pencil, Pin, Plus, Quote, Trash, X,
} from "lucide-react";
import { useState } from "react";
import type { AssignmentRow, CourseResourceRow, SyllabusUnitRow } from "@/db/schema";
import {
  deleteAssignmentAction, deleteResourceAction, deleteSyllabusUnitAction, reorderSyllabusUnitAction,
  saveAssignmentAction, saveResourceAction, saveSyllabusUnitAction, setAssignmentStatusAction,
  toggleSyllabusUnitAction,
} from "@/lib/coursework-actions";
import { KIND_LABEL, type SessionKind } from "@/lib/constants";
import { cn, formatDate, pct, plural, todayIso } from "@/lib/utils";
import { ActionForm, ConfirmAction, Dialog, DialogCancel, DialogFooter, FormAlert, FormField, InlineAction, SubmitButton } from "./client";
import { Badge, Card, CardHeader, EmptyState, Input, ProgressBar, Select, Table, TableWrap, TD, TH, THead, TR, Textarea } from "./ui";

type Group = { id: number; code: string; size: number };
type Course = { id: number; code: string; title: string; kind: SessionKind };
type Faculty = { id: number; name: string }[];

const ASSIGN_KIND: Record<string, { label: string; tone: "info" | "warning" | "brand" | "outline" }> = {
  assignment: { label: "Assignment", tone: "info" },
  quiz: { label: "Quiz", tone: "warning" },
  project: { label: "Project", tone: "brand" },
  lab: { label: "Lab work", tone: "outline" },
};
const RESOURCE_ICON = { link: Link2, note: Quote, file: FileText, reference: BookOpen } as const;

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    draft: ["Draft", "bg-muted-bg text-ink-2"],
    published: ["Published", "bg-success-bg text-success-fg"],
    closed: ["Closed", "bg-neutral-bg text-ink-2"],
  };
  const [label, cls] = map[status] ?? [status, "bg-muted-bg text-ink-2"];
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", cls)}>{label}</span>;
}

function DueBadge({ due, status }: { due: string | null; status: string }) {
  if (!due) return <Badge tone="outline">No due date</Badge>;
  const today = todayIso();
  const late = due < today && status !== "closed";
  const soon = !late && due === today;
  return (
    <Badge tone={late ? "danger" : soon ? "warning" : "outline"} icon={CalendarClock}>
      {late ? "Was due" : "Due"} {formatDate(due)}
    </Badge>
  );
}

/* ------------------------------- syllabus --------------------------------- */
function UnitForm({ courseId, unit, groups }: { courseId: number; unit?: SyllabusUnitRow; groups: Group[] }) {
  return (
    <ActionForm action={saveSyllabusUnitAction} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <div><FormAlert /></div>
      <FormField name="title" label="Unit / module title" required>
        <Input id={`u-title-${unit?.id ?? "new"}`} name="title" defaultValue={unit?.title} placeholder="e.g. Relational model & SQL" />
      </FormField>
      <FormField name="topics" label="Topics to cover" hint="One per line — keep it as detailed as you like.">
        <Textarea id={`u-topics-${unit?.id ?? "new"}`} name="topics" defaultValue={unit?.topics} className="min-h-[120px] font-mono text-[12.5px]" placeholder={"ER modelling\nNormalisation (1NF–3NF)\nJoins & subqueries"} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="plannedHours" label="Planned hours" required>
          <Input id={`u-hours-${unit?.id ?? "new"}`} name="plannedHours" type="number" min={1} max={40} defaultValue={unit?.plannedHours ?? 4} />
        </FormField>
        <div className="text-xs text-ink-3">
          Applies to {groups.length ? groups.map((g) => g.code).join(", ") : "your assigned groups"}.
        </div>
      </div>
      <DialogFooter>
        <DialogCancel />
        <SubmitButton pendingLabel="Saving…">{unit ? "Save unit" : "Add unit"}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

export function SyllabusPanel({ courseId, units, groups, editable }: { courseId: number; units: SyllabusUnitRow[]; groups: Group[]; editable: boolean }) {
  const done = units.filter((u) => u.completed).length;
  return (
    <Card>
      <CardHeader
        icon={ListChecks}
        title="Syllabus plan"
        description={`${plural(units.length, "unit")} · ${plural(units.reduce((n, u) => n + u.plannedHours, 0), "planned hour")} · ${pct(done, units.length)}% covered`}
        action={editable ? (
          <Dialog variant="primary" trigger={<><Plus aria-hidden /> Add unit</>} title="Add a syllabus unit" description="Break the course into units you can tick off as you teach.">
            <UnitForm courseId={courseId} groups={groups} />
          </Dialog>
        ) : undefined}
      />
      {units.length > 0 && (
        <div className="border-b border-line px-5 py-3">
          <div className="mb-1 flex justify-between text-xs text-ink-2">
            <span>{done} of {units.length} units covered</span>
            <span className="tabular font-medium text-ink">{pct(done, units.length)}%</span>
          </div>
          <ProgressBar value={done} max={units.length} label="Syllabus coverage" />
        </div>
      )}
      {units.length ? (
        <ol className="divide-y divide-line">
          {units.map((u, i) => (
            <li key={u.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                {editable ? (
                  <InlineAction
                    action={toggleSyllabusUnitAction}
                    fields={{ id: u.id }}
                    variant={u.completed ? "primary" : "secondary"}
                    size="icon-sm"
                    className="mt-0.5 size-6 rounded-md"
                    icon={<Check />}
                    label={u.completed ? `Mark “${u.title}” as not covered` : `Mark “${u.title}” as covered`}
                  />
                ) : (
                  <span className={cn("mt-0.5 grid size-6 place-items-center rounded-md", u.completed ? "bg-brand-500 text-white" : "border border-line text-transparent")}><Check className="size-3.5" aria-hidden /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs font-semibold text-ink-3">Unit {i + 1}</span>
                    <h3 className={cn("text-[14px] font-semibold", u.completed ? "text-ink-2 line-through decoration-1" : "text-ink")}>{u.title}</h3>
                    <Badge tone="outline">{plural(u.plannedHours, "hour")}</Badge>
                    {u.completed && <Badge tone="success" icon={CircleCheck}>Covered</Badge>}
                  </div>
                  {u.topics && (
                    <ul className="mt-2 space-y-0.5">
                      {u.topics.split("\n").map((line) => line.trim()).filter(Boolean).map((line, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[13px] leading-5 text-ink-2">
                          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />{line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {editable && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <InlineAction action={reorderSyllabusUnitAction} fields={{ id: u.id, direction: "up" }} variant="ghost" size="icon-sm" icon={<ArrowUp />} label="Move unit up" disabled={i === 0} />
                    <InlineAction action={reorderSyllabusUnitAction} fields={{ id: u.id, direction: "down" }} variant="ghost" size="icon-sm" icon={<ArrowDown />} label="Move unit down" disabled={i === units.length - 1} />
                    <Dialog variant="ghost" triggerSize="icon-sm" trigger={<Pencil aria-hidden />} triggerLabel={`Edit ${u.title}`} title="Edit syllabus unit">
                      <UnitForm courseId={courseId} unit={u} groups={groups} />
                    </Dialog>
                    <ConfirmAction
                      action={deleteSyllabusUnitAction}
                      fields={{ id: u.id }}
                      trigger={<Trash aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon-sm"
                      triggerLabel={`Delete ${u.title}`}
                      title={`Delete “${u.title}”?`}
                      description="The unit and its topics will be removed from the syllabus."
                      confirmLabel="Delete unit"
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={ListChecks} title="No syllabus yet" description={editable ? "Add your first unit to start planning the course." : "This teacher hasn't published a syllabus plan yet."} />
      )}
    </Card>
  );
}

/* ------------------------------ assignments ------------------------------- */
function AssignmentForm({ course, groups, assignment }: { course: Course; groups: Group[]; assignment?: AssignmentRow }) {
  return (
    <ActionForm action={saveAssignmentAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="courseId" value={course.id} />
      {assignment && <input type="hidden" name="id" value={assignment.id} />}
      <div className="sm:col-span-2"><FormAlert /></div>
      <FormField name="title" label="Title" required className="sm:col-span-2">
        <Input id={`a-title-${assignment?.id ?? "new"}`} name="title" defaultValue={assignment?.title} placeholder="e.g. Lab 3 — Indexing & query plans" />
      </FormField>
      <FormField name="description" label="Instructions" className="sm:col-span-2">
        <Textarea id={`a-desc-${assignment?.id ?? "new"}`} name="description" defaultValue={assignment?.description} placeholder="What students must submit, format, late policy…" />
      </FormField>
      <FormField name="kind" label="Type" required>
        <Select id={`a-kind-${assignment?.id ?? "new"}`} name="kind" defaultValue={assignment?.kind ?? "assignment"}>
          {Object.entries(ASSIGN_KIND).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
        </Select>
      </FormField>
      <FormField name="status" label="Status" hint="Published items are visible and notify your coordinator." required>
        <Select id={`a-status-${assignment?.id ?? "new"}`} name="status" defaultValue={assignment?.status ?? "draft"}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </Select>
      </FormField>
      <FormField name="dueDate" label="Due date">
        <Input id={`a-due-${assignment?.id ?? "new"}`} name="dueDate" type="date" defaultValue={assignment?.dueDate ?? ""} min={undefined} />
      </FormField>
      <FormField name="maxMarks" label="Max marks" required>
        <Input id={`a-marks-${assignment?.id ?? "new"}`} name="maxMarks" type="number" min={1} max={200} defaultValue={assignment?.maxMarks ?? 10} />
      </FormField>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-[13px] font-medium text-ink">Groups</legend>
        <div className="flex flex-wrap gap-2">
          {groups.length ? groups.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="groupIds" value={g.id} defaultChecked={assignment ? assignment.groupIds.includes(g.id) : true} className="size-4 accent-brand-600" />
              <span className="font-medium text-ink">{g.code}</span>
            </label>
          )) : <span className="text-xs text-ink-3">No groups assigned to this course.</span>}
        </div>
      </fieldset>
      <DialogFooter className="sm:col-span-2">
        <DialogCancel />
        <SubmitButton pendingLabel="Saving…">{assignment ? "Save changes" : "Create"}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

export function AssignmentsPanel({ course, groups, assignments, editable }: { course: Course; groups: Group[]; assignments: AssignmentRow[]; editable: boolean }) {
  const today = todayIso();
  const upcoming = assignments.filter((a) => a.status === "published" && (!a.dueDate || a.dueDate >= today)).length;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={ClipboardList}
          title="Assignments & assessments"
          description={`${plural(assignments.length, "item")} · ${upcoming} published and upcoming`}
          action={editable ? (
            <Dialog variant="primary" trigger={<><Plus aria-hidden /> New assignment</>} title="Create an assignment" description="Drafts stay private; publishing notifies your department coordinator.">
              <AssignmentForm course={course} groups={groups} />
            </Dialog>
          ) : undefined}
        />
        {assignments.length ? (
          <ul className="divide-y divide-line">
            {assignments.map((a) => {
              const meta = ASSIGN_KIND[a.kind] ?? ASSIGN_KIND.assignment;
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <StatusPill status={a.status} />
                        <DueBadge due={a.dueDate} status={a.status} />
                        <Badge tone="outline">{a.maxMarks} marks</Badge>
                      </div>
                      <h3 className="mt-1.5 text-[14px] font-semibold text-ink">{a.title}</h3>
                      {a.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-ink-2">{a.description}</p>}
                      {a.groupIds.length > 0 && (
                        <p className="mt-1 text-xs text-ink-3">
                          {a.groupIds.map((g) => groups.find((x) => x.id === g)?.code ?? "—").join(" · ")}
                        </p>
                      )}
                    </div>
                    {editable && (
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {a.status !== "published" ? (
                          <InlineAction action={setAssignmentStatusAction} fields={{ id: a.id, status: "published" }} variant="primary" size="sm" icon={<CircleCheck />} pendingLabel="Publishing…">Publish</InlineAction>
                        ) : (
                          <InlineAction action={setAssignmentStatusAction} fields={{ id: a.id, status: "closed" }} size="sm" icon={<X />}>Close</InlineAction>
                        )}
                        <Dialog variant="ghost" triggerSize="icon-sm" trigger={<Pencil aria-hidden />} triggerLabel={`Edit ${a.title}`} title="Edit assignment" size="lg">
                          <AssignmentForm course={course} groups={groups} assignment={a} />
                        </Dialog>
                        <ConfirmAction
                          action={deleteAssignmentAction}
                          fields={{ id: a.id }}
                          trigger={<Trash aria-hidden />}
                          triggerVariant="ghost"
                          triggerSize="icon-sm"
                          triggerLabel={`Delete ${a.title}`}
                          title={`Delete “${a.title}”?`}
                          description="This removes the assignment from the course."
                          confirmLabel="Delete assignment"
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={ClipboardList} title="No assignments yet" description={editable ? "Create your first assignment, quiz, project or lab task." : "Nothing assigned for this course yet."} />
        )}
      </Card>
    </div>
  );
}
/* -------------------------------- resources ------------------------------- */
function ResourceForm({ courseId }: { courseId: number }) {
  return (
    <ActionForm action={saveResourceAction} className="grid gap-4">
      <FormAlert />
      <input type="hidden" name="courseId" value={courseId} />
      <FormField name="title" label="Title" required><Input id="r-title" name="title" placeholder="e.g. SQL practice set" /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="kind" label="Type" required>
          <Select id="r-kind" name="kind" defaultValue="link">
            <option value="link">Link</option>
            <option value="note">Note / announcement</option>
            <option value="file">File reference</option>
            <option value="reference">Reading reference</option>
          </Select>
        </FormField>
        <FormField name="url" label="URL" hint="Required for links."><Input id="r-url" name="url" type="url" placeholder="https://…" /></FormField>
      </div>
      <FormField name="detail" label="Details"><Textarea id="r-detail" name="detail" placeholder="What is it, and when should students look at it?" /></FormField>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" className="size-4 accent-brand-600" /> Pin to the top
      </label>
      <DialogFooter>
        <DialogCancel />
        <SubmitButton icon={<Plus />} pendingLabel="Saving…">Add resource</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

export function ResourcesPanel({ courseId, resources, editable }: { courseId: number; resources: CourseResourceRow[]; editable: boolean }) {
  return (
    <Card>
      <CardHeader
        icon={BookOpen}
        title="Class resources"
        description="Links, notes and readings your groups should use"
        action={editable ? (
          <Dialog variant="primary" trigger={<><Plus aria-hidden /> Add resource</>} title="Add a class resource">
            <ResourceForm courseId={courseId} />
          </Dialog>
        ) : undefined}
      />
      {resources.length ? (
        <ul className="divide-y divide-line">
          {resources.map((r) => {
            const Icon = RESOURCE_ICON[r.kind] ?? Link2;
            return (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-ink">{r.title}</p>
                    {r.pinned && <Badge tone="brand" icon={Pin}>Pinned</Badge>}
                    <Badge tone="outline">{r.kind}</Badge>
                  </div>
                  {r.detail && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{r.detail}</p>}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      <ExternalLink className="size-3" aria-hidden />{r.url.replace(/^https?:\/\//, "").slice(0, 60)}
                    </a>
                  )}
                </div>
                {editable && (
                  <ConfirmAction
                    action={deleteResourceAction}
                    fields={{ id: r.id }}
                    trigger={<Trash aria-hidden />}
                    triggerVariant="ghost"
                    triggerSize="icon-sm"
                    triggerLabel={`Remove ${r.title}`}
                    title={`Remove “${r.title}”?`}
                    confirmLabel="Remove"
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={BookOpen} title="No resources yet" description={editable ? "Share a link, a note or a reading list." : "This course has no shared resources yet."} />
      )}
    </Card>
  );
}

/* ------------------------------- workspace -------------------------------- */
export function CourseworkWorkspace({
  courses, groupsByCourse, units, assignments, resources, editable, activeCourseId, baseHref,
}: {
  courses: Course[];
  /** Plain data map — Server Components cannot pass functions to Client Components. */
  groupsByCourse: Record<number, Group[]>;
  units: SyllabusUnitRow[]; assignments: AssignmentRow[]; resources: CourseResourceRow[];
  editable: boolean; activeCourseId: number; baseHref: string;
}) {
  const [tab, setTab] = useState<"syllabus" | "assignments" | "resources">("syllabus");
  const course = courses.find((c) => c.id === activeCourseId) ?? courses[0];
  if (!course) return <EmptyState icon={BookOpen} title="No courses assigned" description="Coursework appears once you hold a teaching assignment." />;
  const cg = groupsByCourse[course.id] ?? [];
  const cu = units.filter((u) => u.courseId === course.id);
  const ca = assignments.filter((a) => a.courseId === course.id);
  const cr = resources.filter((r) => r.courseId === course.id);
  const done = cu.filter((u) => u.completed).length;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{course.code}</Badge>
              <Badge tone="outline">{KIND_LABEL[course.kind]}</Badge>
              {cg.map((g) => <span key={g.id} className="rounded-md bg-muted-bg px-2 py-0.5 text-xs text-ink-2">{g.code} · {g.size}</span>)}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-ink">{course.title}</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {plural(cu.length, "unit")} planned · {pct(done, cu.length)}% covered · {plural(ca.length, "assignment")} · {plural(cr.length, "resource")}
            </p>
          </div>
          {courses.length > 1 && (
            <div className="w-full sm:w-64">
              <label htmlFor="course-switch" className="mb-1.5 block text-xs font-medium text-ink-2">Course</label>
              <Select id="course-switch" defaultValue={course.id} onChange={(e) => { window.location.href = `${baseHref}?course=${e.target.value}`; }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="px-3 sm:px-4">
          <div role="tablist" aria-label="Coursework sections" className="flex gap-1 overflow-x-auto border-b border-line">
            {([
              ["syllabus", "Syllabus", cu.length],
              ["assignments", "Assignments", ca.length],
              ["resources", "Resources", cr.length],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors",
                  tab === key ? "text-brand-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500" : "text-ink-2 hover:text-ink",
                )}
              >
                {label}
                <span className={cn("tabular rounded-md px-1.5 text-[11px] font-semibold", tab === key ? "bg-brand-100 text-brand-800" : "bg-muted-bg text-ink-2")}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>
      <div role="tabpanel" aria-label={`${tab} for ${course.code}`}>
        {tab === "syllabus" && <SyllabusPanel courseId={course.id} units={cu} groups={cg} editable={editable} />}
        {tab === "assignments" && <AssignmentsPanel course={course} groups={cg} assignments={ca} editable={editable} />}
        {tab === "resources" && <ResourcesPanel courseId={course.id} resources={cr} editable={editable} />}
      </div>
    </div>
  );
}

/** Admin oversight: every course at a glance. */
export function CourseworkOversight({ rows }: { rows: {
  code: string; title: string; department: string; faculty: string[]; units: number; completed: number;
  hours: number; assignments: number; published: number; resources: number; lastUpdated: Date | null; courseId: number;
}[] }) {
  const active = rows.filter((r) => r.units || r.assignments || r.resources);
  return (
    <Card>
      <CardHeader icon={ClipboardList} title="Coursework oversight" description={`${active.length} of ${rows.length} courses have coursework content`} />
      <TableWrap>
        <Table className="min-w-[900px]">
          <THead>
            <tr><TH>Course</TH><TH>Teacher</TH><TH>Syllabus</TH><TH className="w-40">Coverage</TH><TH className="text-right">Assignments</TH><TH className="text-right">Resources</TH><TH>Last update</TH></tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.courseId} className={cn(!(r.units || r.assignments || r.resources) && "text-ink-3")}>
                <TD>
                  <p className="font-semibold text-ink">{r.code}</p>
                  <p className="text-xs text-ink-2">{r.title} · {r.department}</p>
                </TD>
                <TD className="text-xs text-ink-2">{r.faculty.join(", ") || "—"}</TD>
                <TD className="tabular">{r.units} units · {r.hours} h</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={r.completed} max={Math.max(1, r.units)} label={`${r.code} coverage`} />
                    <span className="tabular w-9 shrink-0 text-right text-xs text-ink-2">{pct(r.completed, r.units)}%</span>
                  </div>
                </TD>
                <TD className="tabular text-right">{r.assignments}<span className="text-xs text-ink-3"> · {r.published} live</span></TD>
                <TD className="tabular text-right">{r.resources}</TD>
                <TD className="text-xs text-ink-2">{r.lastUpdated ? formatDate(r.lastUpdated.toISOString().slice(0, 10)) : "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

