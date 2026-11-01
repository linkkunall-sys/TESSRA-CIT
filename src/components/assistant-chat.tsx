"use client";

import { ArrowRight, Ban, Bot, Check, CircleCheck, Clock, Eraser, Hourglass, MapPin, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import type { AssistantPayload } from "@/db/schema";
import {
  applyAssistantAvailabilityAction,
  clearAssistantAction,
  dismissAssistantProposalAction,
  sendAssistantMessageAction,
  submitAssistantProposalAction,
} from "@/lib/actions";
import { CHANGE_TYPE_LABEL, DAY_SHORT, DAYS, KIND_LABEL, ROOM_TYPE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { cn, periodLabel, periodTime } from "@/lib/utils";
import { InlineAction, useToast } from "./client";
import { Badge, buttonClasses } from "./ui";

export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; payload: AssistantPayload | null; createdAt: string };

function Slot({ day, period, duration, roomCode, tone }: { day: number; period: number; duration: number; roomCode: string; tone: "from" | "to" }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 text-xs ring-1 ring-inset", tone === "to" ? "bg-brand-50 text-brand-800 ring-brand-100" : "bg-subtle text-ink ring-line")}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{tone === "from" ? "Current" : "Proposed"}</p>
      <p className="mt-0.5 font-semibold">
        {DAYS[day]} · {periodLabel(period, duration)}
      </p>
      <p className="opacity-80">
        {periodTime(period, duration)} · {roomCode}
      </p>
    </div>
  );
}

function PayloadCard({ messageId, payload, requestStatus }: { messageId: number; payload: AssistantPayload; requestStatus: Record<number, string> }) {
  if (payload.kind === "sessions") {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        <p className="border-b border-line bg-subtle px-3 py-2 text-xs font-semibold text-ink-2">{payload.title}</p>
        <ul className="divide-y divide-line">
          {payload.items.map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <span className="w-24 shrink-0">
                <span className="block font-semibold text-ink">
                  {DAY_SHORT[s.day]} · {periodLabel(s.startPeriod, s.duration)}
                </span>
                <span className="tabular block text-[11px] text-ink-3">{periodTime(s.startPeriod, s.duration)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {s.courseCode} · {s.courseTitle}
                </span>
                <span className="block truncate text-xs text-ink-2">
                  {s.roomCode} · {s.groups} · {KIND_LABEL[s.kind]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (payload.kind === "rooms") {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        <p className="border-b border-line bg-subtle px-3 py-2 text-xs font-semibold text-ink-2">{payload.title}</p>
        <ul className="divide-y divide-line">
          {payload.items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{r.code}</span> <span className="text-ink-2">· {r.name}</span>
              </span>
              <span className="text-xs text-ink-2">
                {r.capacity} seats · {ROOM_TYPE_LABEL[r.type]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (payload.kind === "requests") {
    return (
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {payload.items.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
            <span>
              <span className="font-semibold text-ink">{r.courseCode}</span> <span className="text-ink-2">· {CHANGE_TYPE_LABEL[r.type]}</span>
            </span>
            <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : r.status === "pending" ? "warning" : "neutral"}>{STATUS_LABEL[r.status]}</Badge>
          </li>
        ))}
      </ul>
    );
  }
  if (payload.kind === "proposal") {
    const live = payload.changeRequestId ? requestStatus[payload.changeRequestId] : undefined;
    const p = payload.proposal;
    const state =
      payload.status === "dismissed"
        ? { tone: "neutral" as const, icon: Ban, label: "Dismissed — no changes made" }
        : payload.status === "submitted"
          ? live === "approved"
            ? { tone: "success" as const, icon: CircleCheck, label: "Approved by coordinator · timetable updated" }
            : live === "rejected"
              ? { tone: "danger" as const, icon: X, label: "Declined by coordinator" }
              : live === "cancelled"
                ? { tone: "neutral" as const, icon: Ban, label: "Request withdrawn" }
                : { tone: "warning" as const, icon: Hourglass, label: "Submitted · awaiting coordinator review" }
          : { tone: "info" as const, icon: Sparkles, label: "AI proposal · not submitted" };
    return (
      <div className={cn("mt-3 rounded-xl border bg-surface p-4", payload.status === "proposed" ? "border-dashed border-info/40" : "border-line")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={state.tone} icon={state.icon}>
            {state.label}
          </Badge>
          <span className="text-xs text-ink-3">{p.groups}</span>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-ink">
          Move {p.courseCode} · {p.courseTitle}
        </p>
        <div className="mt-3 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <Slot day={p.from.day} period={p.from.period} duration={p.from.duration} roomCode={p.from.roomCode} tone="from" />
          <ArrowRight className="mx-auto size-4 rotate-90 text-ink-3 sm:rotate-0" aria-hidden />
          <Slot day={p.to.day} period={p.to.period} duration={p.to.duration} roomCode={p.to.roomCode} tone="to" />
        </div>
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <ShieldCheck className="size-3.5" aria-hidden /> Engine checks against the published timetable
          </p>
          <ul className="mt-1.5 space-y-1">
            {p.checks.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-xs text-ink-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>
        {payload.status === "proposed" && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <InlineAction action={submitAssistantProposalAction} fields={{ messageId }} variant="primary" icon={<Send />} pendingLabel="Validating…">
              Submit as change request
            </InlineAction>
            <InlineAction action={dismissAssistantProposalAction} fields={{ messageId }} variant="ghost">
              Dismiss
            </InlineAction>
          </div>
        )}
        {payload.status === "proposed" && <p className="mt-2 text-[11px] text-ink-3">Submitting re-validates the slot and sends it to your coordinator. The timetable changes only after approval.</p>}
      </div>
    );
  }
  // availability
  const statusLabel =
    payload.status === "applied"
      ? { tone: "success" as const, icon: CircleCheck, label: "Applied to your availability" }
      : payload.status === "dismissed"
        ? { tone: "neutral" as const, icon: Ban, label: "Dismissed — no changes made" }
        : { tone: "info" as const, icon: Sparkles, label: "Proposed availability update" };
  return (
    <div className={cn("mt-3 rounded-xl border bg-surface p-4", payload.status === "proposed" ? "border-dashed border-info/40" : "border-line")}>
      <Badge tone={statusLabel.tone} icon={statusLabel.icon}>
        {statusLabel.label}
      </Badge>
      <p className="mt-2 text-xs font-semibold text-ink-2">Mark unavailable</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {payload.blocks.map((b) => (
          <li key={`${b.day}-${b.period}`} className="rounded-md bg-danger-bg/50 px-2 py-0.5 text-xs font-medium text-danger-fg">
            {DAY_SHORT[b.day]} P{b.period}
          </li>
        ))}
      </ul>
      {payload.skipped.length > 0 && (
        <p className="mt-2 text-xs text-ink-2">
          Skipped teaching slots: {payload.skipped.map((s) => `${DAY_SHORT[s.day]} P${s.period} (${s.courseCode})`).join(", ")}
        </p>
      )}
      {payload.status === "proposed" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          <InlineAction action={applyAssistantAvailabilityAction} fields={{ messageId }} variant="primary" icon={<Check />} pendingLabel="Applying…">
            Apply to my availability
          </InlineAction>
          <InlineAction action={dismissAssistantProposalAction} fields={{ messageId }} variant="ghost">
            Dismiss
          </InlineAction>
        </div>
      )}
    </div>
  );
}

export function AssistantChat({
  messages,
  requestStatus,
  prompts,
  initialInput = "",
  userInitials,
}: {
  messages: ChatMessage[];
  requestStatus: Record<number, string>;
  prompts: string[];
  initialInput?: string;
  userInitials: string;
}) {
  const [input, setInput] = useState(initialInput);
  const [isPending, startTransition] = useTransition();
  const { push } = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  const [optimistic, addOptimistic] = useOptimistic(messages, (state: ChatMessage[], text: string) => [
    ...state,
    { id: -1 - state.length, role: "user" as const, content: text, payload: null, createdAt: new Date().toISOString() },
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [optimistic.length, isPending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isPending) return;
    setInput("");
    startTransition(async () => {
      addOptimistic(t);
      const fd = new FormData();
      fd.set("message", t);
      const res = await sendAssistantMessageAction(null, fd);
      if (res && !res.ok) push("error", res.message);
    });
  };

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[540px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-brand-300">
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">TESSRA Assistant</p>
          <p className="truncate text-xs text-ink-2">Answers from live timetable data · proposals are never applied automatically</p>
        </div>
        {messages.length > 0 && (
          <InlineAction action={clearAssistantAction} fields={{ all: 1 }} variant="ghost" size="sm" icon={<Eraser />} label="Clear conversation">
            <span className="hidden sm:inline">Clear</span>
          </InlineAction>
        )}
      </div>

      <div role="log" aria-live="polite" aria-label="Conversation" className="scrollbar-thin flex-1 space-y-5 overflow-y-auto bg-subtle/60 px-4 py-5 sm:px-6">
        {optimistic.length === 0 && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Sparkles className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink">How can I help with your schedule?</h2>
            <p className="mt-1 text-[13px] text-ink-2">Ask about your classes, find free rooms, plan a reschedule or update your availability.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="cursor-pointer rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[13px] text-ink shadow-xs transition-[border-color,background-color] duration-150 hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {optimistic.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end gap-2.5">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[13.5px] leading-6 text-white sm:max-w-[70%]">{m.content}</div>
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800" aria-hidden>
                {userInitials}
              </span>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-brand-300" aria-hidden>
                <Bot className="size-4" />
              </span>
              <div className="min-w-0 max-w-[92%] sm:max-w-[80%]">
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-2.5 text-[13.5px] leading-6 text-ink shadow-xs">{m.content}</div>
                {m.payload && <PayloadCard messageId={m.id} payload={m.payload} requestStatus={requestStatus} />}
              </div>
            </div>
          ),
        )}

        {isPending && (
          <div className="flex gap-2.5" role="status">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-brand-300" aria-hidden>
              <Bot className="size-4" />
            </span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3">
              <span className="sr-only">Assistant is checking the timetable…</span>
              <Clock className="size-3.5 text-ink-3" aria-hidden />
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3" aria-hidden />
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:150ms]" aria-hidden />
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:300ms]" aria-hidden />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-surface p-3 sm:p-4">
        {optimistic.length > 0 && (
          <div className="scrollbar-thin mb-2.5 flex gap-2 overflow-x-auto pb-1">
            {prompts.slice(0, 4).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={isPending}
                className="shrink-0 cursor-pointer rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <textarea
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder="Ask about your schedule, rooms or availability…"
            className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-line bg-white px-3.5 py-[7px] text-sm text-ink shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
          />
          <button type="submit" disabled={!input.trim() || isPending} className={buttonClasses("primary", "icon", "rounded-xl")} aria-label="Send message">
            <Send aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
