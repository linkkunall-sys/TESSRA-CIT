"use client";

import { Ban, BookOpen, Check, LoaderCircle } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toggleAvailabilityAction } from "@/lib/actions";
import { DAYS, LUNCH, PERIODS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "./client";
import { Input } from "./ui";

type Block = { day: number; period: number; reason: string | null };
type Teaching = { day: number; period: number; label: string };

export function AvailabilityGrid({ blocks, teaching }: { blocks: Block[]; teaching: Teaching[] }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { push } = useToast();
  const [optimistic, apply] = useOptimistic(blocks, (state: Block[], change: { day: number; period: number; add: boolean; reason: string }) =>
    change.add ? [...state, { day: change.day, period: change.period, reason: change.reason }] : state.filter((b) => !(b.day === change.day && b.period === change.period)),
  );

  const toggle = (day: number, period: number) => {
    const blocked = optimistic.some((b) => b.day === day && b.period === period);
    const key = `${day}:${period}`;
    setBusy(key);
    startTransition(async () => {
      apply({ day, period, add: !blocked, reason: reason || "Unavailable" });
      const res = await toggleAvailabilityAction(day, period, reason);
      if (res) push(res.ok ? "success" : "error", res.message);
      setBusy(null);
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="reason" className="mb-1.5 block text-xs font-medium text-ink-2">
            Reason for new blocks (optional)
          </label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Research meeting" maxLength={80} />
        </div>
        <p className="text-xs text-ink-3">Select a slot to toggle it. Changes save instantly and are used by the next schedule generation.</p>
      </div>
      <div className="scrollbar-thin overflow-x-auto p-3 sm:p-4">
        <table className="w-full min-w-[680px] table-fixed border-separate border-spacing-1.5 text-left">
          <caption className="sr-only">Weekly availability. Teaching slots are locked; other slots toggle between available and unavailable.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-20" />
              {DAYS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-center text-[13px] font-semibold text-ink">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <FragmentRow key={p.n} period={p} lunchAfter={p.n === LUNCH.afterPeriod}>
                {DAYS.map((d, day) => {
                  const teach = teaching.find((t) => t.day === day && t.period === p.n);
                  const block = optimistic.find((b) => b.day === day && b.period === p.n);
                  const key = `${day}:${p.n}`;
                  if (teach) {
                    return (
                      <td key={d}>
                        <div className="flex h-14 flex-col justify-center rounded-lg border border-l-[3px] border-transparent border-l-cat-lecture-bar bg-cat-lecture-bg px-2.5" aria-label={`${d} P${p.n}: teaching ${teach.label}`}>
                          <span className="flex items-center gap-1 text-[12px] font-semibold text-cat-lecture-fg">
                            <BookOpen className="size-3.5" aria-hidden /> {teach.label}
                          </span>
                          <span className="text-[11px] text-ink-2">Teaching · locked</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        onClick={() => toggle(day, p.n)}
                        aria-pressed={Boolean(block)}
                        aria-label={`${d} P${p.n} ${p.start}–${p.end}: ${block ? `unavailable${block.reason ? ` (${block.reason})` : ""}` : "available"}. Activate to mark ${block ? "available" : "unavailable"}.`}
                        title={block?.reason ?? undefined}
                        className={cn(
                          "group flex h-14 w-full cursor-pointer flex-col justify-center rounded-lg border px-2.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-[3px] focus-visible:ring-brand-500/30",
                          block ? "hatch border-danger-bg-strong bg-danger-bg/50 hover:border-danger/40" : "border-line bg-surface hover:border-brand-300 hover:bg-brand-50/50",
                        )}
                      >
                        <span className={cn("flex items-center gap-1 text-[12px] font-semibold", block ? "text-danger-fg" : "text-success-fg")}>
                          {busy === key ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : block ? <Ban className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                          {block ? "Unavailable" : "Available"}
                        </span>
                        <span className="truncate text-[11px] text-ink-3">{block?.reason ?? `${p.start}–${p.end}`}</span>
                      </button>
                    </td>
                  );
                })}
              </FragmentRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ period, lunchAfter, children }: { period: { n: number; start: string; end: string }; lunchAfter: boolean; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <th scope="row" className="pr-2 align-middle">
          <span className="block text-[13px] font-semibold text-ink">P{period.n}</span>
          <span className="tabular block text-[11px] font-normal text-ink-3">
            {period.start}–{period.end}
          </span>
        </th>
        {children}
      </tr>
      {lunchAfter && (
        <tr aria-hidden>
          <td />
          <td colSpan={5} className="rounded-md bg-subtle py-1 text-center text-[11px] font-medium text-ink-3">
            Lunch break · {LUNCH.start}–{LUNCH.end}
          </td>
        </tr>
      )}
    </>
  );
}
