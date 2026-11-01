"use client";

import { CheckCircle2, LoaderCircle, Send, Sparkles, TriangleAlert, WandSparkles } from "lucide-react";
import { useState } from "react";
import { BOOKING_CATEGORIES, BOOKING_NEEDS, ROOM_TYPE_LABEL, type RoomType } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";
import { ActionForm, FormAlert, FormField, SubmitButton, useActionForm } from "./client";
import { Input, Select, Textarea, buttonClasses } from "./ui";

type VenueOption = { id: number; code: string; name: string; capacity: number; type: RoomType; building: string; status: string };
type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  venues: VenueOption[];
  defaults?: { roomId?: number; date?: string; startTime?: string; endTime?: string };
  mode: "club" | "department";
  minDate: string;
  leadDays: number;
  maxHours: number;
};

type ParsedProposal = {
  title: string;
  category: string;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  attendees: number | null;
  roomId: number | null;
  roomCode: string | null;
  needs: string[];
  priority: string;
  assumptions: string[];
  followUp: string[];
  warnings: string[];
  canSubmit: boolean;
};

type ParseResponse = {
  ok: boolean;
  message?: string;
  proposal?: ParsedProposal;
  policy?: { categoryCeiling: string; note: string };
};

const REQUEST_EXAMPLES = [
  { label: "English", text: "Need a seminar room next Friday sometime between 3 and 6 pm for two hours, 80 people, projector please." },
  { label: "Hinglish", text: "seminar hall kal shaam chhe baje, do ghante, pachaas log, mic chahiye" },
  { label: "Conditional", text: "Auditorium if available, otherwise a seminar hall on Thursday evening for 100 people." },
];

function Fields({ venues, defaults = {}, mode, minDate, leadDays, maxHours }: Omit<Props, "action">) {
  const { state } = useActionForm();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(mode === "club" ? "club_event" : "department_event");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaults.date ?? "");
  const [startTime, setStartTime] = useState(defaults.startTime ?? "17:00");
  const [endTime, setEndTime] = useState(defaults.endTime ?? "19:00");
  const [roomId, setRoomId] = useState(defaults.roomId ? String(defaults.roomId) : "");
  const [attendees, setAttendees] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [plainText, setPlainText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<ParseResponse | null>(null);

  const selected = venues.find((v) => String(v.id) === roomId);
  const suggestions = state && !state.ok ? state.suggestions ?? [] : [];
  const over = selected && attendees !== "" && Number(attendees) > selected.capacity;
  const categories = BOOKING_CATEGORIES.filter((c) =>
    mode === "club" ? c.value !== "department_event" : c.value !== "club_event" && c.value !== "sports" && c.value !== "cultural",
  );

  const parseRequest = async () => {
    if (plainText.trim().length < 5) {
      setParseError("Describe the event, date, time and expected attendance first.");
      return;
    }
    setParsing(true);
    setParseError("");
    try {
      const response = await fetch("/api/club/parse-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: plainText }),
      });
      const result = (await response.json()) as ParseResponse;
      if (!response.ok || !result.ok || !result.proposal) throw new Error(result.message || "The request could not be parsed.");
      const p = result.proposal;
      setParsed(result);
      setTitle(p.title);
      setCategory(categories.some((c) => c.value === p.category) ? p.category : mode === "club" ? "club_event" : "department_event");
      setDescription(p.description);
      if (p.date) setDate(p.date);
      if (p.startTime) setStartTime(p.startTime);
      if (p.endTime) setEndTime(p.endTime);
      setAttendees(p.attendees ? String(p.attendees) : "");
      setRoomId(p.roomId ? String(p.roomId) : "");
      setNeeds(p.needs.filter((n) => BOOKING_NEEDS.includes(n)));
    } catch (error) {
      setParsed(null);
      setParseError(error instanceof Error ? error.message : "The request could not be parsed.");
    } finally {
      setParsing(false);
    }
  };

  const toggleNeed = (need: string, checked: boolean) => {
    setNeeds((current) => (checked ? [...new Set([...current, need])] : current.filter((n) => n !== need)));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-brand-100 bg-brand-50/60 p-4" aria-labelledby="plain-language-booking">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-brand-100">
            <WandSparkles className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="plain-language-booking" className="text-sm font-semibold text-brand-900">
              Describe it in English or Hinglish
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-brand-800/80">
              Example: “Seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye.” We fill an editable draft; no booking is made yet.
            </p>
          </div>
        </div>
        <Textarea
          value={plainText}
          onChange={(event) => setPlainText(event.target.value)}
          className="mt-3 min-h-24 bg-white"
          maxLength={1000}
          placeholder="Tell us the event, date, time, attendance and any venue or equipment needs…"
          aria-label="Plain-language booking request"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Example booking requests">
          <span className="mr-0.5 text-[11px] font-medium text-brand-800/75">Try:</span>
          {REQUEST_EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => { setPlainText(example.text); setParsed(null); setParseError(""); }}
              className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-800 transition-colors hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
            >
              {example.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-brand-800/75">Role and priority ceilings are enforced by code, even if the request asks for a higher category.</p>
          <button type="button" className={buttonClasses("primary", "sm")} onClick={parseRequest} disabled={parsing}>
            {parsing ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {parsing ? "Reading request…" : "Fill booking draft"}
          </button>
        </div>
        {parseError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-fg" role="alert">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {parseError}
          </p>
        )}
        {parsed?.proposal && (
          <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-brand-100" role="status" aria-live="polite">
            <p className={parsed.proposal.canSubmit ? "flex items-center gap-2 text-xs font-semibold text-brand-800" : "flex items-center gap-2 text-xs font-semibold text-warning-fg"}>
              {parsed.proposal.canSubmit ? <CheckCircle2 className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
              {parsed.proposal.canSubmit ? "Draft filled — review every field before submitting" : "Draft partially filled — complete the items below before submitting"}
            </p>
            {parsed.proposal.assumptions.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Visible assumptions</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-ink-2">
                  {parsed.proposal.assumptions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {[...parsed.proposal.warnings, ...parsed.proposal.followUp].length > 0 && (
              <div className="mt-2 rounded-md bg-warning-bg/60 px-3 py-2 text-xs leading-5 text-warning-fg">
                <p className="font-semibold">Needs your attention</p>
                <ul className="list-disc pl-4">
                  {[...parsed.proposal.warnings, ...parsed.proposal.followUp].map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {parsed.policy && <p className="mt-2 text-[11px] text-ink-3">{parsed.policy.note} Category ceiling: {parsed.policy.categoryCeiling}.</p>}
          </div>
        )}
      </section>

      <FormAlert />
      <input type="hidden" name="priority" value={mode === "club" ? "normal" : "high"} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-ink">Event details</legend>
        <FormField name="title" label="Event title" required className="sm:col-span-2">
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "club" ? "e.g. RoboWars Qualifier Round" : "e.g. Guest lecture: AI in Healthcare"}
            maxLength={120}
          />
        </FormField>
        <FormField name="category" label="Category" required>
          <Select id="category" name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FormField>
        <div className="rounded-lg border border-line bg-subtle px-3 py-2 text-xs leading-5 text-ink-2">
          <span className="font-semibold text-ink">Effective priority:</span> {mode === "club" ? "Club event" : "Department event"}. Submission text cannot raise this ceiling.
        </div>
        <FormField name="description" label="Description" hint="Purpose, audience and anything the venue team should prepare." className="sm:col-span-2">
          <Textarea id="description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-ink">Schedule &amp; venue</legend>
        <FormField name="date" label="Date" required hint={leadDays ? `At least ${leadDays} day(s) notice.` : undefined}>
          <Input id="date" name="date" type="date" min={minDate} value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField name="startTime" label="Start time" required>
          <Input id="startTime" name="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </FormField>
        <FormField name="endTime" label="End time" required hint={`Up to ${maxHours} hours.`}>
          <Input id="endTime" name="endTime" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </FormField>
        <FormField name="attendees" label="Expected attendees" required>
          <Input id="attendees" name="attendees" type="number" min={1} inputMode="numeric" value={attendees} onChange={(event) => setAttendees(event.target.value)} />
        </FormField>
        <FormField name="roomId" label="Venue" required className="sm:col-span-2 lg:col-span-4">
          <Select id="roomId" name="roomId" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">Select a venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id} disabled={v.status !== "active"}>
                {v.code} · {v.name} — {v.capacity} seats · {ROOM_TYPE_LABEL[v.type]}
                {v.status !== "active" ? " (unavailable)" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        {selected && (
          <p className="text-xs text-ink-2 sm:col-span-2 lg:col-span-4">
            {selected.building} · seats {selected.capacity}
            {over && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning-fg">
                <TriangleAlert className="size-3.5" aria-hidden /> Attendance exceeds capacity
              </span>
            )}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 sm:col-span-2 lg:col-span-4" role="status">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-800">
              <Sparkles className="size-4" aria-hidden /> Conflict-free alternatives for this time
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => setRoomId(String(s.id))} className={buttonClasses(String(s.id) === roomId ? "primary" : "secondary", "sm")}>
                  {s.code} · {s.name} ({s.capacity})
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-800/80">Select one, then submit again — availability is re-checked on submission.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="border-t border-line pt-6">
        <legend className="mb-3 text-sm font-semibold text-ink">Requirements</legend>
        <div className="flex flex-wrap gap-2">
          {BOOKING_NEEDS.map((need) => (
            <label
              key={need}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink transition-colors hover:border-line-strong has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
            >
              <input
                type="checkbox"
                name="needs"
                value={need}
                checked={needs.includes(need)}
                onChange={(event) => toggleNeed(need, event.target.checked)}
                className="size-4 accent-brand-600"
              />
              {need}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-3">Availability is checked against the timetable, exams and approved bookings. Parsed drafts never bypass these checks.</p>
        <SubmitButton icon={<Send />} pendingLabel="Checking availability…">
          Submit request
        </SubmitButton>
      </div>
    </div>
  );
}

export function BookingForm({ action, ...rest }: Props) {
  return (
    <ActionForm action={action} aria-label="Venue booking request">
      <Fields {...rest} />
    </ActionForm>
  );
}
