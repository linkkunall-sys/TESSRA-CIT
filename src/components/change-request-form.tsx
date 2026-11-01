"use client";

import { CalendarPlus, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { createChangeRequestAction } from "@/lib/actions";
import { DAYS, DAY_SHORT, KIND_LABEL, LUNCH, PERIODS, type SessionKind } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ActionForm, DialogCancel, DialogFooter, FormAlert, FormField, SubmitButton } from "./client";
import { Select, Textarea } from "./ui";

type Busy = { day: number; start: number; duration: number };
type Offering = { courseId: number; code: string; title: string; kind: SessionKind; groups: { id: number; code: string; size: number }[] };

const overlaps = (aStart: number, aDur: number, b: Busy) => aStart < b.start + b.duration && b.start < aStart + aDur;

export function ChangeRequestForm({
  sessions, rooms, offerings = [], facultyBusy = [], groupBusy = {}, blocks = [],
}: {
  sessions: { id: number; label: string; kind: string }[];
  rooms: { id: number; label: string; type: string }[];
  offerings?: Offering[];
  facultyBusy?: Busy[];
  groupBusy?: Record<number, Busy[]>;
  blocks?: { day: number; period: number }[];
}) {
  const [type, setType] = useState<"reschedule" | "room_change" | "extra_class">("reschedule");
  const [sessionId, setSessionId] = useState(sessions[0] ? String(sessions[0].id) : "");
  const kind = sessions.find((s) => String(s.id) === sessionId)?.kind;
  const roomOptions = rooms.filter((r) => (kind === "lab" ? r.type === "lab" : r.type !== "lab"));

  // ----- extra class state -----
  const [courseId, setCourseId] = useState(offerings[0]?.courseId ?? 0);
  const offering = offerings.find((o) => o.courseId === courseId);
  const [groupIds, setGroupIds] = useState<number[]>(offering?.groups.map((g) => g.id) ?? []);
  const [duration, setDuration] = useState(1);
  const [day, setDay] = useState(0);
  const [period, setPeriod] = useState(offerings[0]?.kind === "lab" ? 2 : 1);
  const effDuration = offering?.kind === "lab" ? 3 : duration;
  const extraRooms = rooms.filter((r) => (offering?.kind === "lab" ? r.type === "lab" : r.type !== "lab"));

  const pickCourse = (id: number) => {
    setCourseId(id);
    const o = offerings.find((x) => x.courseId === id);
    setGroupIds(o?.groups.map((g) => g.id) ?? []);
    setPeriod(o?.kind === "lab" ? 2 : 1);
  };

  const freeSlots = useMemo(() => {
    if (type !== "extra_class" || !offering || !groupIds.length) return [];
    const out: { day: number; period: number }[] = [];
    for (let d = 0; d < 5; d++) {
      for (let p = 1; p + effDuration - 1 <= PERIODS.length; p++) {
        if (p <= LUNCH.afterPeriod && p + effDuration - 1 > LUNCH.afterPeriod) continue;
        if (offering.kind === "lab" && p !== 2 && p !== 6) continue;
        const periods = Array.from({ length: effDuration }, (_, i) => p + i);
        if (facultyBusy.some((b) => b.day === d && overlaps(p, effDuration, b))) continue;
        if (blocks.some((b) => b.day === d && periods.includes(b.period))) continue;
        if (groupIds.some((g) => (groupBusy[g] ?? []).some((b) => b.day === d && overlaps(p, effDuration, b)))) continue;
        out.push({ day: d, period: p });
      }
    }
    return out;
  }, [type, offering, groupIds, effDuration, facultyBusy, groupBusy, blocks]);

  const options: { value: typeof type; label: string; hint: string }[] = [
    { value: "reschedule", label: "Reschedule", hint: "Move a class to a different day or period" },
    { value: "room_change", label: "Room change", hint: "Keep the slot, change the room" },
    ...(offerings.length ? [{ value: "extra_class" as const, label: "New extra class", hint: "Book a free slot — the admin verifies it" }] : []),
  ];

  return (
    <ActionForm action={createChangeRequestAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormAlert /></div>

      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] font-medium text-ink">What would you like to do?</legend>
        <div className={cn("grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input type="radio" name="type" value={o.value} checked={type === o.value} onChange={() => setType(o.value)} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block text-[13px] font-medium text-ink">{o.label}</span>
                <span className="block text-xs text-ink-2">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {type !== "extra_class" && (
        <>
          <FormField name="sessionId" label="Session" required className="sm:col-span-2">
            <Select id="sessionId" name="sessionId" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </FormField>
          {type === "reschedule" && (
            <>
              <FormField name="proposedDay" label="Proposed day" required>
                <Select id="proposedDay" name="proposedDay" defaultValue="">
                  <option value="">Select…</option>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </Select>
              </FormField>
              <FormField name="proposedPeriod" label="Proposed start period" required>
                <Select id="proposedPeriod" name="proposedPeriod" defaultValue="">
                  <option value="">Select…</option>
                  {PERIODS.filter((p) => kind !== "lab" || p.n === 2 || p.n === 6).map((p) => <option key={p.n} value={p.n}>P{p.n} · {p.start}</option>)}
                </Select>
              </FormField>
            </>
          )}
          <FormField name="proposedRoomId" label={type === "room_change" ? "Room needed" : "Room (optional)"} required={type === "room_change"} hint={type === "reschedule" ? "Leave blank to keep the current room." : undefined} className="sm:col-span-2">
            <Select id="proposedRoomId" name="proposedRoomId" defaultValue="" key={`${type}-${kind}`}>
              <option value="">{type === "room_change" ? "Select…" : "Keep current room"}</option>
              {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </FormField>
        </>
      )}

      {type === "extra_class" && offering && (
        <>
          <FormField name="courseId" label="Course" required className="sm:col-span-2" htmlFor="xc-course">
            <Select id="xc-course" name="courseId" value={courseId} onChange={(e) => pickCourse(Number(e.target.value))}>
              {offerings.map((o) => <option key={o.courseId} value={o.courseId}>{o.code} · {o.title} ({KIND_LABEL[o.kind]})</option>)}
            </Select>
          </FormField>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-ink">Groups attending <span className="text-danger">*</span></legend>
            <div className="flex flex-wrap gap-2">
              {offering.groups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                  <input type="checkbox" name="groupIds" value={g.id} checked={groupIds.includes(g.id)}
                    onChange={(e) => setGroupIds((ids) => e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id))}
                    className="size-4 accent-brand-600" />
                  <span className="font-medium text-ink">{g.code}</span>
                  <span className="text-xs text-ink-3">{g.size}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {offering.kind !== "lab" && (
            <FormField name="duration" label="Duration" htmlFor="xc-dur">
              <Select id="xc-dur" name="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={1}>1 period</option>
                <option value={2}>2 periods</option>
              </Select>
            </FormField>
          )}
          {offering.kind === "lab" && <input type="hidden" name="duration" value={3} />}
          <div className={cn(offering.kind === "lab" && "sm:col-span-2")}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <Sparkles className="size-3.5 text-brand-600" aria-hidden /> Free slots for you &amp; these groups
            </p>
            {freeSlots.length ? (
              <div className="scrollbar-thin flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-subtle p-2">
                {freeSlots.map((f) => (
                  <button key={`${f.day}-${f.period}`} type="button" onClick={() => { setDay(f.day); setPeriod(f.period); }}
                    aria-pressed={day === f.day && period === f.period}
                    className={cn("cursor-pointer rounded-md px-2 py-1 text-xs font-medium ring-1 transition-colors",
                      day === f.day && period === f.period ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-2 ring-line hover:border-brand-300 hover:text-brand-700")}>
                    {DAY_SHORT[f.day]} P{f.period}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-3">No common free slot for this selection — try fewer groups or a shorter class.</p>
            )}
          </div>
          <FormField name="day" label="Day" required htmlFor="xc-day">
            <Select id="xc-day" name="day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </FormField>
          <FormField name="startPeriod" label="Start period" required htmlFor="xc-p">
            <Select id="xc-p" name="startPeriod" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIODS.filter((p) => offering.kind !== "lab" || p.n === 2 || p.n === 6).map((p) => <option key={p.n} value={p.n}>P{p.n} · {p.start}</option>)}
            </Select>
          </FormField>
          <FormField name="roomId" label="Room (optional)" hint="Leave on auto — the best free room is reserved for you." className="sm:col-span-2" htmlFor="xc-room">
            <Select id="xc-room" name="roomId" defaultValue="">
              <option value="">Auto — best free room</option>
              {extraRooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </FormField>
        </>
      )}

      <FormField name="reason" label="Reason" required className="sm:col-span-2"
        hint={type === "extra_class" ? "The admin sees this when verifying your request." : "Your coordinator sees this when reviewing."}>
        <Textarea id="reason" name="reason" maxLength={500}
          placeholder={type === "extra_class" ? "e.g. Revision class before the midsem exam" : "e.g. Conference travel on the original day"} />
      </FormField>
      <DialogFooter className="sm:col-span-2">
        <DialogCancel />
        <SubmitButton icon={type === "extra_class" ? <CalendarPlus /> : <Send />} pendingLabel="Validating slot…">
          {type === "extra_class" ? "Request admin approval" : "Validate & submit"}
        </SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}
