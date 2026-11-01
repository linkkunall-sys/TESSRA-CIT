import { BookOpen, GraduationCap, Layers, Plus, Trash, Users, Building } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, ConfirmAction, Dialog, DialogCancel, DialogFooter, FormField, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, ProgressBar, Select, StatCard, TabLinks, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { createClubAction, createCourseAction, createDepartmentAction, createGroupAction, createOfferingAction, deleteOfferingAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { KIND_LABEL, ROOM_TYPE_LABEL } from "@/lib/constants";
import { readParams, type SearchParams } from "@/lib/params";
import { getPublishedTimetable, getRef } from "@/lib/queries";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Academic Management" };

const TABS = ["overview", "departments", "courses", "groups", "offerings", "faculty", "clubs"] as const;

export default async function AcademicsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const tab = TABS.find((t) => t === get("tab")) ?? "overview";
  const [ref, tt] = await Promise.all([getRef(), getPublishedTimetable()]);
  const scheduledByOffering = new Map<number, number>();
  for (const s of tt?.sessions ?? []) if (s.offeringId) scheduledByOffering.set(s.offeringId, (scheduledByOffering.get(s.offeringId) ?? 0) + 1);
  const students = ref.groups.reduce((n, g) => n + g.size, 0);
  const deptOptions = ref.departments.map((d) => (
    <option key={d.id} value={d.id}>
      {d.code} · {d.name}
    </option>
  ));

  const addDepartment = (
    <Dialog variant="primary" trigger={<><Plus aria-hidden /> Add department</>} title="Add a department">
      <ActionForm action={createDepartmentAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="code" label="Code" required hint="e.g. CHEM">
          <Input id="department-code" name="code" maxLength={10} className="uppercase" />
        </FormField>
        <FormField name="name" label="Department name" required>
          <Input id="department-name" name="name" maxLength={100} />
        </FormField>
        <DialogFooter className="sm:col-span-2"><DialogCancel /><SubmitButton pendingLabel="Saving…">Add department</SubmitButton></DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const addClub = (
    <Dialog variant="primary" trigger={<><Plus aria-hidden /> Add organisation</>} title="Add a campus organisation">
      <ActionForm action={createClubAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="name" label="Name" required className="sm:col-span-2">
          <Input id="club-name" name="name" maxLength={100} />
        </FormField>
        <FormField name="category" label="Category" required>
          <Input id="club-category" name="category" maxLength={60} placeholder="club" />
        </FormField>
        <FormField name="advisor" label="Advisor">
          <Input id="club-advisor" name="advisor" maxLength={100} />
        </FormField>
        <DialogFooter className="sm:col-span-2"><DialogCancel /><SubmitButton pendingLabel="Saving…">Add organisation</SubmitButton></DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const addCourse = (
    <Dialog
      variant="primary"
      trigger={
        <>
          <Plus aria-hidden /> Add course
        </>
      }
      title="Add a course"
      description="Courses become schedulable once assigned to faculty and groups."
    >
      <ActionForm action={createCourseAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="code" label="Course code" required hint="e.g. CS210 or CS210L">
          <Input id="code" name="code" maxLength={8} className="uppercase" />
        </FormField>
        <FormField name="credits" label="Weekly units" required>
          <Input id="credits" name="credits" type="number" min={1} max={12} defaultValue={3} />
        </FormField>
        <FormField name="title" label="Title" required className="sm:col-span-2">
          <Input id="title" name="title" maxLength={80} />
        </FormField>
        <FormField name="departmentId" label="Department" required>
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">Select…</option>
            {deptOptions}
          </Select>
        </FormField>
        <FormField name="year" label="Year" required>
          <Input id="year" name="year" type="number" min={1} max={5} defaultValue={1} />
        </FormField>
        <FormField name="kind" label="Primary delivery" required>
          <Select id="kind" name="kind" defaultValue="lecture">
            <option value="lecture">Lecture</option>
            <option value="lab">Lab (3-hour P2/P6 blocks)</option>
            <option value="tutorial">Tutorial</option>
          </Select>
        </FormField>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <FormField name="lectureHours" label="Lecture hours">
            <Input id="lectureHours" name="lectureHours" type="number" min={0} max={12} defaultValue={3} />
          </FormField>
          <FormField name="tutorialHours" label="Tutorial hours">
            <Input id="tutorialHours" name="tutorialHours" type="number" min={0} max={12} defaultValue={0} />
          </FormField>
          <FormField name="labBlocks" label="Lab blocks">
            <Input id="labBlocks" name="labBlocks" type="number" min={0} max={12} defaultValue={0} />
          </FormField>
        </div>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Saving…">Add course</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const addGroup = (
    <Dialog
      variant="primary"
      trigger={
        <>
          <Plus aria-hidden /> Add group
        </>
      }
      title="Add a student group"
    >
      <ActionForm action={createGroupAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="code" label="Group code" required hint="e.g. CSE-2C">
          <Input id="code" name="code" maxLength={10} className="uppercase" />
        </FormField>
        <FormField name="size" label="Students" required>
          <Input id="size" name="size" type="number" min={5} max={300} />
        </FormField>
        <FormField name="name" label="Programme name" required className="sm:col-span-2">
          <Input id="name" name="name" placeholder="B.Tech CSE · Year 2 · Section C" />
        </FormField>
        <FormField name="departmentId" label="Department" required>
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">Select…</option>
            {deptOptions}
          </Select>
        </FormField>
        <FormField name="year" label="Year" required>
          <Input id="year" name="year" type="number" min={1} max={5} defaultValue={1} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" name="needsAccessible" className="size-4 accent-brand-600" />
          This group requires accessible rooms
        </label>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Saving…">Add group</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const addOffering = (
    <Dialog
      variant="primary"
      size="lg"
      trigger={
        <>
          <Plus aria-hidden /> Assign teaching
        </>
      }
      title="Assign a course to faculty"
      description="Selecting more than one group creates a combined session. New assignments are placed the next time a schedule is generated."
    >
      <ActionForm action={createOfferingAction} className="grid gap-4 sm:grid-cols-2">
        <FormField name="courseId" label="Course" required>
          <Select id="courseId" name="courseId" defaultValue="">
            <option value="">Select…</option>
            {ref.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title} ({KIND_LABEL[c.kind]})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="facultyId" label="Faculty" required>
          <Select id="facultyId" name="facultyId" defaultValue="">
            <option value="">Select…</option>
            {ref.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="sessionsPerWeek" label="Sessions per week" required>
          <Input id="sessionsPerWeek" name="sessionsPerWeek" type="number" min={1} max={6} defaultValue={3} />
        </FormField>
        <FormField name="expectedSize" label="Expected attendance" hint="Optional; useful for elective baskets.">
          <Input id="expectedSize" name="expectedSize" type="number" min={1} max={2000} />
        </FormField>
        <FormField name="basketSlot" label="Elective basket" hint="Use the same code to synchronize choices.">
          <Input id="basketSlot" name="basketSlot" maxLength={40} placeholder="e.g. OEB-4" />
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
          <input type="checkbox" name="needsAccessible" className="size-4 accent-brand-600" /> Accessible room required
        </label>
        <FormField name="groupIds" label="Student groups" required className="sm:col-span-2" htmlFor="groupIds-0">
          <div className="grid gap-2 sm:grid-cols-3">
            {ref.groups.map((g, i) => (
              <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                <input id={`groupIds-${i}`} type="checkbox" name="groupIds" value={g.id} className="size-4 accent-brand-600" />
                <span className="font-medium text-ink">{g.code}</span>
                <span className="ml-auto text-xs text-ink-3">{g.size}</span>
              </label>
            ))}
          </div>
        </FormField>
        <DialogFooter className="sm:col-span-2">
          <DialogCancel />
          <SubmitButton pendingLabel="Saving…">Create assignment</SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "departments", label: "Departments", count: ref.departments.length },
    { key: "courses", label: "Courses", count: ref.courses.length },
    { key: "groups", label: "Student groups", count: ref.groups.length },
    { key: "offerings", label: "Teaching assignments", count: ref.offerings.length },
    { key: "faculty", label: "Faculty", count: ref.faculty.length },
    { key: "clubs", label: "Organisations", count: ref.clubs.length },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic Management"
        description="Departments, courses, student groups and teaching assignments that drive timetable generation."
        actions={tab === "departments" ? addDepartment : tab === "courses" ? addCourse : tab === "groups" ? addGroup : tab === "offerings" ? addOffering : tab === "clubs" ? addClub : undefined}
      />
      <TabLinks
        label="Academic data"
        className="mb-6"
        items={tabs.map((t) => ({ href: t.key === "overview" ? "/admin/academics" : `/admin/academics?tab=${t.key}`, label: t.label, count: t.count, active: tab === t.key }))}
      />

      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Departments" value={ref.departments.length} icon={Building} />
            <StatCard label="Courses" value={ref.courses.length} icon={BookOpen} href="/admin/academics?tab=courses" />
            <StatCard label="Student groups" value={ref.groups.length} icon={Users} hint={`${students} students enrolled`} href="/admin/academics?tab=groups" />
            <StatCard label="Teaching assignments" value={ref.offerings.length} icon={Layers} href="/admin/academics?tab=offerings" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {ref.departments.map((d) => {
              const groups = ref.groups.filter((g) => g.departmentId === d.id);
              const courses = ref.courses.filter((c) => c.departmentId === d.id);
              const faculty = ref.faculty.filter((f) => f.departmentId === d.id);
              return (
                <Card key={d.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-brand-700">{d.code}</p>
                      <h2 className="mt-0.5 text-[15px] font-semibold text-ink">{d.name}</h2>
                    </div>
                    <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <GraduationCap className="size-4" aria-hidden />
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {(
                      [
                        ["Faculty", faculty.length],
                        ["Courses", courses.length],
                        ["Groups", groups.length],
                        ["Students", groups.reduce((n, g) => n + g.size, 0)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-subtle px-2 py-2 ring-1 ring-line">
                        <dd className="tabular text-base font-semibold text-ink">{v}</dd>
                        <dt className="text-[11px] text-ink-2">{k}</dt>
                      </div>
                    ))}
                  </dl>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {tab === "departments" && (
        <Card>
          <CardHeader title="Departments" description={`${ref.departments.length} academic and administrative units`} />
          <TableWrap>
            <Table>
              <THead><tr><TH>Code</TH><TH>Name</TH><TH className="text-right">Faculty</TH><TH className="text-right">Courses</TH><TH className="text-right">Groups</TH></tr></THead>
              <tbody>
                {ref.departments.map((department) => (
                  <TR key={department.id}>
                    <TD className="font-semibold">{department.code}</TD>
                    <TD>{department.name}</TD>
                    <TD className="tabular text-right">{ref.faculty.filter((faculty) => faculty.departmentId === department.id).length}</TD>
                    <TD className="tabular text-right">{ref.courses.filter((course) => course.departmentId === department.id).length}</TD>
                    <TD className="tabular text-right">{ref.groups.filter((group) => group.departmentId === department.id).length}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {tab === "courses" && (
        <Card>
          <CardHeader title="Course catalogue" description={plural(ref.courses.length, "course")} />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Title</TH>
                  <TH>Department</TH>
                  <TH>Delivery</TH>
                  <TH className="text-right">Year</TH>
                  <TH className="text-right">L/T/P</TH>
                  <TH className="text-right">Weekly units</TH>
                  <TH className="text-right">Assignments</TH>
                </tr>
              </THead>
              <tbody>
                {ref.courses.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold">{c.code}</TD>
                    <TD>{c.title}</TD>
                    <TD className="text-ink-2">{ref.deptMap.get(c.departmentId)?.code}</TD>
                    <TD>
                      <Badge tone="outline">{KIND_LABEL[c.kind]}</Badge>
                    </TD>
                    <TD className="tabular text-right">{c.year ?? "—"}</TD>
                    <TD className="tabular text-right">{c.lectureHours}/{c.tutorialHours}/{c.labBlocks}</TD>
                    <TD className="tabular text-right">{c.credits}</TD>
                    <TD className="tabular text-right">{ref.offerings.filter((o) => o.courseId === c.id).length}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {tab === "groups" && (
        <Card>
          <CardHeader title="Student groups" description={`${students} students across ${plural(ref.groups.length, "group")}`} />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Programme</TH>
                  <TH>Department</TH>
                  <TH className="text-right">Year</TH>
                  <TH className="text-right">Students</TH>
                  <TH className="text-right">Weekly periods</TH>
                </tr>
              </THead>
              <tbody>
                {ref.groups.map((g) => (
                  <TR key={g.id}>
                    <TD className="font-semibold">{g.code}</TD>
                    <TD>
                      {g.name}
                      {g.needsAccessible ? <Badge tone="info">Accessible</Badge> : null}
                    </TD>
                    <TD className="text-ink-2">{ref.deptMap.get(g.departmentId)?.code}</TD>
                    <TD className="tabular text-right">{g.year}</TD>
                    <TD className="tabular text-right">{g.size}</TD>
                    <TD className="tabular text-right">
                      {ref.offerings.filter((o) => o.groupIds.includes(g.id)).reduce((n, o) => n + o.sessionsPerWeek * o.duration, 0)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {tab === "offerings" && (
        <Card>
          <CardHeader title="Teaching assignments" description="Each assignment is placed by the scheduling engine as weekly sessions." />
          {ref.offerings.length ? (
            <TableWrap>
              <Table className="min-w-[860px]">
                <THead>
                  <tr>
                    <TH>Course</TH>
                    <TH>Faculty</TH>
                    <TH>Groups</TH>
                    <TH>Pattern</TH>
                    <TH>Room type</TH>
                    <TH>Published</TH>
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {ref.offerings.map((o) => {
                    const c = ref.courseMap.get(o.courseId);
                    const scheduled = scheduledByOffering.get(o.id) ?? 0;
                    return (
                      <TR key={o.id}>
                        <TD>
                          <p className="font-semibold">{c?.code}</p>
                          <p className="text-xs text-ink-2">{c?.title}</p>
                        </TD>
                        <TD>{ref.personMap.get(o.facultyId)?.name}</TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {o.groupIds.map((g) => ref.groupMap.get(g)?.code).join(" + ")}
                            {o.groupIds.length > 1 && <Badge tone="info">Combined</Badge>}
                          </div>
                        </TD>
                        <TD className="text-ink-2">
                          {o.sessionsPerWeek} × {plural(o.duration, "period")} · {KIND_LABEL[o.kind]}
                          {o.expectedSize ? <span className="block text-xs">{o.expectedSize} expected</span> : null}
                          {o.basketSlot ? <Badge tone="info">Basket {o.basketSlot}</Badge> : null}
                        </TD>
                        <TD className="text-ink-2">{ROOM_TYPE_LABEL[o.roomType]}</TD>
                        <TD>
                          <Badge tone={scheduled >= o.sessionsPerWeek ? "success" : "warning"}>
                            {scheduled}/{o.sessionsPerWeek} placed
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <ConfirmAction
                            action={deleteOfferingAction}
                            fields={{ id: o.id }}
                            trigger={<Trash aria-hidden />}
                            triggerVariant="ghost"
                            triggerSize="icon-sm"
                            triggerLabel={`Remove ${c?.code} assignment`}
                            title="Remove teaching assignment?"
                            description="Published sessions remain until the next version is generated and published."
                            confirmLabel="Remove assignment"
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState icon={Layers} title="No teaching assignments" description="Assign courses to faculty and groups to start scheduling." action={addOffering} />
          )}
        </Card>
      )}

      {tab === "faculty" && (
        <Card>
          <CardHeader title="Faculty directory" description="Weekly teaching load in the published timetable" />
          <TableWrap>
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Department</TH>
                  <TH>Designation</TH>
                  <TH className="w-56">Weekly load</TH>
                  <TH className="text-right">Daily limit</TH>
                  <TH className="text-right">Constraints</TH>
                </tr>
              </THead>
              <tbody>
                {ref.faculty.map((f) => {
                  const load = tt?.facultyLoad.get(f.id) ?? 0;
                  const blocked = tt?.state.blockRows.filter((b) => b.facultyId === f.id).length ?? 0;
                  const preferences = tt?.state.preferenceRows.filter((p) => p.facultyId === f.id).length ?? 0;
                  return (
                    <TR key={f.id}>
                      <TD className="font-medium">
                        {f.name}
                        {f.sourceId ? <span className="ml-2 font-mono text-[11px] text-ink-3">{f.sourceId}</span> : null}
                      </TD>
                      <TD className="text-ink-2">{f.departmentId ? ref.deptMap.get(f.departmentId)?.code : "—"}</TD>
                      <TD className="text-ink-2">{f.title}</TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ProgressBar value={load} max={f.maxWeeklyPeriods} tone={load > f.maxWeeklyPeriods ? "danger" : "brand"} label={`${f.name} load`} />
                          <span className="tabular w-12 shrink-0 text-right text-xs text-ink-2">
                            {load}/{f.maxWeeklyPeriods}
                          </span>
                        </div>
                      </TD>
                      <TD className="tabular text-right">{f.maxHoursPerDay ?? "—"}</TD>
                      <TD className="tabular text-right">
                        {blocked} blocked · {preferences} preferred
                        {f.needsAccessible ? <span className="block text-xs text-brand-700">Accessible rooms</span> : null}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {tab === "clubs" && (
        <Card>
          <CardHeader title="Campus organisations" description={`${ref.clubs.length} organisations available to booking representatives`} />
          <TableWrap>
            <Table>
              <THead><tr><TH>Name</TH><TH>Category</TH><TH>Advisor</TH><TH className="text-right">Representatives</TH></tr></THead>
              <tbody>
                {ref.clubs.map((club) => (
                  <TR key={club.id}>
                    <TD className="font-semibold">{club.name}</TD>
                    <TD className="text-ink-2">{club.category}</TD>
                    <TD className="text-ink-2">{club.advisor ?? "—"}</TD>
                    <TD className="tabular text-right">{ref.people.filter((person) => person.clubId === club.id).length}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
