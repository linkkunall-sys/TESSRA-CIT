"use client";

/**
 * Manual timetable editor (Admin). Drag a class onto an empty slot to move it,
 * click "+" on any free slot to schedule a class for any teacher, click a class
 * to edit / pin / remove it. Every change is validated server-side against the
 * full timetable before it is saved — the grid never bypasses the engine.
 */
import { CalendarPlus, GripVertical, Info, MapPin, Pencil, Pin, PinOff, Plus, Trash, TriangleAlert, Users, X } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { manualAddSessionAction, manualDeleteSessionAction, manualMoveSessionAction, toggleFixedAction } from "@/lib/actions";
import { DAYS, KIND_LABEL, LUNCH, PERIODS, type SessionKind } from "@/lib/constants";
import type { SessionView } from "@/lib/queries";
import { cn, currentDayIndex, periodLabel, periodTime, shortName } from "@/lib/utils";
import { ActionForm, ConfirmAction, FieldError, FormAlert, FormField, InlineAction, SubmitButton } from "./client";
import { TimetableLegend, KIND_STYLE } from "./timetable";
import { Badge, Button, Select, buttonClasses } from "./ui";

type Course = { id: number; code: string; title: string; kind: SessionKind };
type Person = { id: number; name: string };
type Group = { id: number; code: string; size: number };
type Room = { id: number; code: string; name: string; capacity: number; type: string };
type Slot = { day: number; period: number };

const rowFor = (p: number) => (p <= LUNCH.afterPeriod ? p + 1 : p + 2);

function Modal({ title, subtitle, onClose, children, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn("w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-left text-ink shadow-pop open:animate-pop-in", wide ? "max-w-2xl" : "max-w-lg")}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={id} className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={buttonClasses("ghost", "icon-sm", "-mr-1.5 -mt-1")} aria-label="Close">
            <X aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </dialog>
  );
}

function DayPeriodRoom({ session, move, rooms, prefix, defaultRoomId, kind }: { session?: SessionView; move?: Slot; rooms: Room[]; prefix: string; defaultRoomId?: number; kind?: SessionKind }) {
  const day = move?.day ?? session?.day ?? 0;
  const period = move?.period ?? session?.startPeriod ?? 1;
  const sessionKind = kind ?? session?.kind;
  const selectedPeriod = sessionKind === "lab" && period !== 2 && period !== 6 ? 2 : period;
  return (
    <>
      <FormField name="day" label="Day" required htmlFor={`${prefix}-day`}>
        <Select id={`${prefix}-day`} name="day" defaultValue={day} key={`${prefix}-d${day}`}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
      </FormField>
      <FormField name="startPeriod" label="Start period" required htmlFor={`${prefix}-p`}>
        <Select id={`${prefix}-p`} name="startPeriod" defaultValue={selectedPeriod} key={`${prefix}-p${selectedPeriod}-${sessionKind ?? "any"}`}>
          {PERIODS.filter((p) => sessionKind !== "lab" || p.n === 2 || p.n === 6).map((p) => <option key={p.n} value={p.n}>P{p.n} · {p.start}</option>)}
        </Select>
      </FormField>
      <FormField name="roomId" label="Room" hint={session ? "Leave on auto to keep the room, or take the best free one." : "Auto picks the smallest suitable free room."} className="sm:col-span-2" htmlFor={`${prefix}-r`}>
        <Select id={`${prefix}-r`} name="roomId" defaultValue={session?.roomId ?? defaultRoomId ?? ""} key={`${prefix}-r${session?.roomId ?? defaultRoomId ?? "auto"}`}>
          <option value="">{session ? "Auto — keep current room if free" : "Auto — best free room"}</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name} ({r.capacity})</option>)}
        </Select>
      </FormField>
    </>
  );
}

export function ScheduleEditor({
  versionId, versionStatus, sessions, issuesBySession, blocks = [], view, entityId, selectedId,
  courses, faculty, groups, rooms,
}: {
  versionId: number; versionStatus: string; sessions: SessionView[];
  issuesBySession: Record<number, string[]>; blocks?: { day: number; period: number; reason: string | null }[];
  view: "group" | "faculty" | "room"; entityId: number; selectedId?: number;
  courses: Course[]; faculty: Person[]; groups: Group[]; rooms: Room[];
}) {
  const [add, setAdd] = useState<Slot | null>(null);
  const [edit, setEdit] = useState<{ session: SessionView; move?: Slot } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const today = currentDayIndex();

  const covered = new Set<string>();
  for (const s of sessions) for (let p = s.startPeriod; p < s.startPeriod + s.duration; p++) covered.add(`${s.day}:${p}`);
  const clusters = DAYS.map((_, day) => {
    const list = sessions.filter((s) => s.day === day).sort((a, b) => a.startPeriod - b.startPeriod);
    const out: { start: number; end: number; items: SessionView[] }[] = [];
    for (const s of list) {
      const end = s.startPeriod + s.duration - 1;
      const last = out[out.length - 1];
      if (last && s.startPeriod <= last.end) { last.items.push(s); last.end = Math.max(last.end, end); }
      else out.push({ start: s.startPeriod, end, items: [s] });
    }
    return out;
  });

  const onDrop = (e: DragEvent, day: number, period: number) => {
    e.preventDefault();
    setDropKey(null);
    const id = Number(e.dataTransfer.getData("text/plain") || dragId);
    const session = sessions.find((s) => s.id === id);
    setDragId(null);
    if (session) setEdit({ session, move: { day, period } });
  };

  const prefillFaculty = view === "faculty" ? entityId : undefined;
  // If the session disappears (removed here or elsewhere) the modal unmounts and closes itself.
  const live = edit ? sessions.find((s) => s.id === edit.session.id) ?? null : null;

  const card = (s: SessionView, compact: boolean) => {
    const style = KIND_STYLE[s.kind];
    const conflict = Boolean(issuesBySession[s.id]?.length);
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; setDragId(s.id); }}
        onDragEnd={() => { setDragId(null); setDropKey(null); }}
        onClick={() => setEdit({ session: s })}
        aria-label={`Edit ${s.courseCode} ${s.courseTitle}, ${DAYS[s.day]} ${periodLabel(s.startPeriod, s.duration)}, room ${s.roomCode}. Drag to move.`}
        title={conflict ? issuesBySession[s.id].join("\n") : "Click to edit · drag to move"}
        className={cn(
          "group/card flex h-full min-w-0 flex-1 cursor-grab flex-col rounded-lg border border-transparent border-l-[3px] p-2 text-left outline-none transition-[box-shadow,transform,opacity] duration-150 hover:-translate-y-px hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-brand-500/40 active:cursor-grabbing",
          style.card,
          conflict && "border-danger/40 ring-1 ring-danger/30",
          selectedId === s.id && "ring-2 ring-brand-500",
          dragId === s.id && "opacity-40",
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span className={cn("text-[12.5px] font-semibold leading-4", style.text)}>{s.courseCode}</span>
          <span className="flex shrink-0 items-center gap-1 text-ink-2">
            {s.isFixed && <Pin className="size-3.5" aria-hidden />}
            {conflict && <TriangleAlert className="size-3.5 text-danger" aria-hidden />}
            <GripVertical className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover/card:opacity-100" aria-hidden />
          </span>
        </span>
        {!compact && <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-ink">{s.courseTitle}</span>}
        <span className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-ink-2">
          {view !== "room" && <span className="flex items-center gap-1 truncate"><MapPin className="size-3 shrink-0 text-ink-3" aria-hidden />{s.roomCode}</span>}
          {view !== "faculty" && <span className="block truncate">{shortName(s.facultyName)}</span>}
          {view !== "group" && <span className="block truncate">{s.groupCodes.join(" + ")}</span>}
        </span>
        {s.duration > 1 && <span className="mt-auto pt-1.5"><span className="rounded bg-surface/85 px-1 text-[10px] font-medium text-ink-2 ring-1 ring-line">{s.duration} periods</span></span>}
      </button>
    );
  };

  const emptyCell = (day: number, period: number) => {
    const key = `${day}:${period}`;
    const blocked = blocks.find((b) => b.day === day && b.period === period);
    return (
      <button
        type="button"
        onClick={() => setAdd({ day, period })}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropKey(key); }}
        onDragLeave={() => setDropKey((k) => (k === key ? null : k))}
        onDrop={(e) => onDrop(e, day, period)}
        aria-label={`Add a class on ${DAYS[day]} period ${period}${blocked ? " (faculty unavailable)" : ""}`}
        className={cn(
          "group/cell flex h-full w-full items-center justify-center rounded-md outline-none transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-brand-500/40",
          blocked && "hatch",
          dropKey === key ? "bg-brand-100/80 ring-2 ring-inset ring-brand-400" : "hover:bg-brand-50/60",
        )}
      >
        {dropKey === key ? (
          <span className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-xs">Move here</span>
        ) : (
          <span className="grid size-6 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity duration-100 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100">
            <Plus className="size-4" aria-hidden />
          </span>
        )}
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <Info className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          Drag a class to move it · click <Plus className="inline size-3.5" aria-hidden /> on a free slot to add · every change is validated
          {versionStatus !== "published" && <Badge tone="info" className="ml-1">Draft — publish to go live</Badge>}
        </p>
        <div className="flex items-center gap-3">
          <TimetableLegend showUnavailable={view === "faculty"} />
          <Button size="sm" onClick={() => setAdd({ day: today < 0 ? 0 : today, period: 1 })}>
            <CalendarPlus aria-hidden /> Add class
          </Button>
        </div>
      </div>

      {/* Desktop / tablet grid */}
      <div className="scrollbar-thin hidden overflow-x-auto p-2 sm:p-3 md:block">
        <div className="grid min-w-[700px]" role="grid" aria-label="Editable weekly timetable"
          style={{
            gridTemplateColumns: "76px repeat(5, minmax(0,1fr))",
            gridTemplateRows: `40px repeat(${LUNCH.afterPeriod}, minmax(84px,auto)) 28px repeat(${PERIODS.length - LUNCH.afterPeriod}, minmax(84px,auto))`,
          }}>
          <div className="sticky left-0 z-10 border-b border-r border-line bg-subtle" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAYS.map((d, i) => (
            <div key={d} role="columnheader" className={cn("flex items-center justify-between border-b border-line px-3 text-[13px] font-semibold", i < 4 && "border-r", i === today ? "bg-brand-50 text-brand-800" : "bg-subtle text-ink")} style={{ gridColumn: i + 2, gridRow: 1 }}>
              {d}
              {i === today && <span className="rounded-md bg-brand-500 px-1.5 py-px text-[10px] font-semibold uppercase text-white">Today</span>}
            </div>
          ))}
          {PERIODS.map((p) => (
            <Fragment key={p.n}>
              <div role="rowheader" className="sticky left-0 z-10 flex h-full flex-col justify-center border-b border-r border-line bg-surface px-2" style={{ gridColumn: 1, gridRow: rowFor(p.n) }}>
                <span className="text-[12.5px] font-semibold leading-4 text-ink">P{p.n}</span>
                <span className="tabular whitespace-nowrap text-[10.5px] leading-4 text-ink-3">{p.start}</span>
              </div>
              {DAYS.map((_, d) => (
                <div key={d} className={cn("min-w-0 border-b border-line p-0.5", d < 4 && "border-r", d === today && "bg-brand-50/30")} style={{ gridColumn: d + 2, gridRow: rowFor(p.n) }}>
                  {!covered.has(`${d}:${p.n}`) && emptyCell(d, p.n)}
                </div>
              ))}
            </Fragment>
          ))}
          <div className="sticky left-0 z-10 flex items-center border-b border-r border-line bg-subtle px-2 text-[10.5px] font-medium text-ink-3" style={{ gridColumn: 1, gridRow: LUNCH.afterPeriod + 2 }}>Lunch</div>
          <div className="flex items-center justify-center border-b border-line bg-subtle text-[10.5px] font-medium text-ink-3" style={{ gridColumn: "2 / span 5", gridRow: LUNCH.afterPeriod + 2 }}>
            Lunch break · {LUNCH.start}–{LUNCH.end}
          </div>
          {clusters.flatMap((dayClusters, day) =>
            dayClusters.map((cluster) => (
              <div key={`${day}-${cluster.start}`} className="relative z-[1] flex min-w-0 gap-1 p-1" style={{ gridColumn: day + 2, gridRow: `${rowFor(cluster.start)} / ${rowFor(cluster.end) + 1}` }}>
                {cluster.items.map((s) => <span key={s.id} className="flex h-full min-w-0 flex-1">{card(s, cluster.items.length > 1)}</span>)}
              </div>
            )),
          )}
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="divide-y divide-line px-4 md:hidden">
        {DAYS.map((d, day) => {
          const list = sessions.filter((s) => s.day === day).sort((a, b) => a.startPeriod - b.startPeriod);
          return (
            <section key={d} className="py-3" aria-label={d}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-ink">{d}</h3>
                <Button variant="ghost" size="xs" onClick={() => setAdd({ day, period: 1 })}><Plus aria-hidden /> Add</Button>
              </div>
              {list.length ? (
                <ul className="space-y-2">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setEdit({ session: s })} className={cn("flex w-full items-center gap-3 rounded-lg border border-transparent border-l-[3px] p-2.5 text-left", KIND_STYLE[s.kind].card)}>
                        <span className="w-16 shrink-0 text-[12px] font-semibold text-ink">{periodLabel(s.startPeriod, s.duration)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{s.courseCode} · {s.roomCode}</span>
                          <span className="block truncate text-xs text-ink-2">{shortName(s.facultyName)} · {s.groupCodes.join(" + ")}</span>
                        </span>
                        <Pencil className="size-4 shrink-0 text-ink-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-3">No classes — tap Add</p>
              )}
            </section>
          );
        })}
      </div>

      {/* Add class */}
      {add && (
        <Modal title="Schedule a class" subtitle={`Manually add a session for any teacher — validated against the ${versionStatus === "published" ? "live timetable" : "draft"} before saving.`} onClose={() => setAdd(null)} wide>
          <AddForm versionId={versionId} slot={add} courses={courses} faculty={faculty} groups={groups} rooms={rooms}
            prefillFaculty={prefillFaculty} prefillGroup={view === "group" ? entityId : undefined} prefillRoom={view === "room" ? entityId : undefined}
            onDone={() => setAdd(null)} />
        </Modal>
      )}

      {/* Edit / move class */}
      {edit && live && (
        <Modal
          title={<>{live.courseCode} · {live.courseTitle}</>}
          subtitle={edit.move
            ? `Move to ${DAYS[edit.move.day]} P${edit.move.period} — currently ${DAYS[live.day]} ${periodLabel(live.startPeriod, live.duration)} in ${live.roomCode}`
            : `${DAYS[live.day]} ${periodLabel(live.startPeriod, live.duration)} · ${live.roomCode} · ${shortName(live.facultyName)} · ${live.groupCodes.join(" + ")}`}
          onClose={() => setEdit(null)}
        >
          <div className="space-y-4">
            <ActionForm action={manualMoveSessionAction} onSuccess={(s) => s.ok && setEdit(null)} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="sessionId" value={live.id} />
              <div className="sm:col-span-2"><FormAlert /></div>
              <DayPeriodRoom session={live} move={edit.move} rooms={rooms} prefix={`e${live.id}`} />
              <div className="flex justify-end border-t border-line pt-4 sm:col-span-2">
                <SubmitButton pendingLabel="Validating…">Save changes</SubmitButton>
              </div>
            </ActionForm>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="mr-auto text-xs text-ink-3">More actions</span>
              <InlineAction action={toggleFixedAction} fields={{ sessionId: live.id }} size="sm" icon={live.isFixed ? <PinOff /> : <Pin />}>
                {live.isFixed ? "Unpin" : "Pin as fixed"}
              </InlineAction>
              <ConfirmAction
                action={manualDeleteSessionAction}
                fields={{ sessionId: live.id }}
                trigger={<><Trash aria-hidden /> Remove</>}
                triggerVariant="destructive"
                title={`Remove ${live.courseCode}?`}
                description={`${DAYS[live.day]} ${periodLabel(live.startPeriod, live.duration)} in ${live.roomCode} will be deleted and the teacher notified.`}
                confirmLabel="Remove class"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddForm({ versionId, slot, courses, faculty, groups, rooms, prefillFaculty, prefillGroup, prefillRoom, onDone }: {
  versionId: number; slot: Slot; courses: Course[]; faculty: Person[]; groups: Group[]; rooms: Room[];
  prefillFaculty?: number; prefillGroup?: number; prefillRoom?: number; onDone: () => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? 0);
  const kind = courses.find((c) => c.id === courseId)?.kind ?? "lecture";
  return (
    <ActionForm action={manualAddSessionAction} onSuccess={(s) => s.ok && onDone()} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="versionId" value={versionId} />
      <div className="sm:col-span-2"><FormAlert /></div>
      <FormField name="courseId" label="Course" required className="sm:col-span-2" htmlFor="add-course">
        <Select id="add-course" name="courseId" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title} ({KIND_LABEL[c.kind]})</option>)}
        </Select>
      </FormField>
      <FormField name="facultyId" label="Teacher" required htmlFor="add-fac">
        <Select id="add-fac" name="facultyId" defaultValue={prefillFaculty ?? faculty[0]?.id ?? ""}>
          {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </FormField>
      <FormField name="duration" label="Duration" hint={kind === "lab" ? "Labs run three periods, starting P2 or P6." : undefined} htmlFor="add-dur">
        {kind === "lab" ? (
          <>
            <input type="hidden" name="duration" value={3} />
            <div className="flex h-9 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-ink-2">3 periods (lab)</div>
          </>
        ) : (
          <Select id="add-dur" name="duration" defaultValue={1} key={`dur-${kind}`}>
            <option value={1}>1 period</option>
            <option value={2}>2 periods</option>
          </Select>
        )}
      </FormField>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink"><Users className="size-3.5 text-ink-3" aria-hidden /> Groups <span className="text-danger">*</span></legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {groups.map((g, i) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[13px] transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input id={`add-g-${i}`} type="checkbox" name="groupIds" value={g.id} defaultChecked={prefillGroup === g.id} className="size-4 accent-brand-600" />
              <span className="font-medium text-ink">{g.code}</span>
              <span className="ml-auto text-xs text-ink-3">{g.size}</span>
            </label>
          ))}
        </div>
        <FieldError name="groupIds" />
      </fieldset>
      <DayPeriodRoom move={slot} rooms={rooms} prefix="add" defaultRoomId={prefillRoom} kind={kind} />
      <label className="flex cursor-pointer items-start gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" name="isFixed" className="mt-0.5 size-4 accent-brand-600" />
        <span>
          <span className="font-medium text-ink">Pin as fixed</span>
          <span className="block text-xs text-ink-2">Pinned classes stay in place when the timetable is regenerated.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <SubmitButton icon={<CalendarPlus />} pendingLabel="Validating slot…">Add to timetable</SubmitButton>
      </div>
    </ActionForm>
  );
}

