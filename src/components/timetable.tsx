import { MapPin, Pin, TriangleAlert, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { DAYS, KIND_LABEL, LUNCH, PERIODS, type SessionKind } from "@/lib/constants";
import type { SessionView } from "@/lib/queries";
import { cn, currentDayIndex, periodLabel, periodTime, shortName } from "@/lib/utils";

export const KIND_STYLE: Record<SessionKind, { card: string; text: string; swatch: string }> = {
  lecture: { card: "bg-cat-lecture-bg border-l-cat-lecture-bar", text: "text-cat-lecture-fg", swatch: "bg-cat-lecture-bar" },
  lab: { card: "bg-cat-lab-bg border-l-cat-lab-bar", text: "text-cat-lab-fg", swatch: "bg-cat-lab-bar" },
  tutorial: { card: "bg-cat-tutorial-bg border-l-cat-tutorial-bar", text: "text-cat-tutorial-fg", swatch: "bg-cat-tutorial-bar" },
};

type Block = { day: number; period: number; reason: string | null };
type Show = { faculty?: boolean; room?: boolean; groups?: boolean };
type Props = {
  sessions: SessionView[];
  issuesBySession?: Record<number, string[]>;
  blocks?: Block[];
  hrefFor?: (id: number) => string;
  selectedId?: number;
  show?: Show;
  dimIds?: Set<number>;
  label?: string;
};

const rowFor = (period: number) => (period <= LUNCH.afterPeriod ? period + 1 : period + 2);

function clusterDay(list: SessionView[]) {
  const sorted = [...list].sort((a, b) => a.startPeriod - b.startPeriod);
  const out: { start: number; end: number; items: SessionView[] }[] = [];
  for (const s of sorted) {
    const end = s.startPeriod + s.duration - 1;
    const last = out[out.length - 1];
    if (last && s.startPeriod <= last.end) {
      last.items.push(s);
      last.end = Math.max(last.end, end);
    } else out.push({ start: s.startPeriod, end, items: [s] });
  }
  return out;
}

function describe(s: SessionView, issues?: string[]) {
  return [
    `${s.courseCode} ${s.courseTitle}`,
    KIND_LABEL[s.kind],
    `${DAYS[s.day]} ${periodLabel(s.startPeriod, s.duration)} ${periodTime(s.startPeriod, s.duration)}`,
    `room ${s.roomCode}`,
    s.facultyName,
    s.groupCodes.join(" and "),
    s.isFixed ? "fixed session" : "",
    s.combined ? "combined session" : "",
    s.basketSlot ? `elective basket ${s.basketSlot}` : "",
    issues?.length ? `conflict: ${issues.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function SessionCard({
  s,
  issues,
  href,
  selected,
  show,
  compact,
  dimmed,
}: {
  s: SessionView;
  issues?: string[];
  href?: string;
  selected?: boolean;
  show: Show;
  compact: boolean;
  dimmed?: boolean;
}) {
  const style = KIND_STYLE[s.kind];
  const conflict = Boolean(issues?.length);
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <span className={cn("text-[12.5px] font-semibold leading-4", style.text)}>{s.courseCode}</span>
        <span className="flex shrink-0 items-center gap-1 text-ink-2">
          {s.isFixed && <Pin className="size-3.5" aria-hidden />}
          {s.combined && <Users className="size-3.5" aria-hidden />}
          {conflict && <TriangleAlert className="size-3.5 text-danger" aria-hidden />}
        </span>
      </div>
      {!compact && <p className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-ink">{s.courseTitle}</p>}
      <div className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-ink-2">
        {show.room !== false && (
          <p className="flex items-center gap-1 truncate">
            <MapPin className="size-3 shrink-0 text-ink-3" aria-hidden />
            {s.roomCode}
          </p>
        )}
        {show.faculty !== false && (
          <p className="flex items-center gap-1 truncate">
            <UserRound className="size-3 shrink-0 text-ink-3" aria-hidden />
            {shortName(s.facultyName)}
          </p>
        )}
        {show.groups !== false && (
          <p className="flex items-center gap-1 truncate">
            <Users className="size-3 shrink-0 text-ink-3" aria-hidden />
            {s.groupCodes.join(" + ")}
          </p>
        )}
      </div>
      {(s.duration > 1 || conflict || s.isFixed || s.basketSlot) && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
          {s.duration > 1 && <span className="rounded bg-surface/85 px-1 text-[10px] font-medium text-ink-2 ring-1 ring-line">{s.duration} periods</span>}
          {s.basketSlot && <span className="rounded bg-info-bg px-1 text-[10px] font-medium text-info-fg">{s.basketSlot}</span>}
          {s.isFixed && !compact && <span className="rounded bg-surface/85 px-1 text-[10px] font-medium text-ink-2 ring-1 ring-line">Fixed</span>}
          {conflict && <span className="rounded bg-danger-bg px-1 text-[10px] font-semibold text-danger-fg" title={issues?.join("\n")}>Conflict</span>}
        </div>
      )}
    </>
  );
  const cls = cn(
    "flex h-full min-h-[72px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-l-[3px] p-2 text-left outline-none transition-[box-shadow,transform,opacity] duration-150 focus-visible:ring-[3px] focus-visible:ring-brand-500/40",
    style.card,
    conflict ? "border-danger/40 ring-1 ring-danger/30" : "border-transparent",
    selected && "ring-2 ring-brand-500",
    dimmed && "opacity-30",
    href && "cursor-pointer hover:-translate-y-px hover:shadow-raised",
  );
  const label = describe(s, issues);
  const title = conflict ? issues?.join("\n") : undefined;
  return href ? (
    <Link href={href} scroll={false} className={cls} aria-label={`${label}. Open details`} title={title}>
      {body}
    </Link>
  ) : (
    <div className={cls} role="gridcell" aria-label={label} title={title}>
      {body}
    </div>
  );
}

function TimetableGrid({ sessions, issuesBySession = {}, blocks = [], hrefFor, selectedId, show = {}, dimIds, label }: Props) {
  const today = currentDayIndex();
  const clusters = DAYS.map((_, day) => clusterDay(sessions.filter((s) => s.day === day)));
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div
        role="grid"
        aria-label={label ?? "Weekly timetable"}
        className="grid min-w-[700px]"
        style={{
          gridTemplateColumns: "76px repeat(5, minmax(0, 1fr))",
          gridTemplateRows: `40px repeat(${LUNCH.afterPeriod}, minmax(84px, auto)) 28px repeat(${PERIODS.length - LUNCH.afterPeriod}, minmax(84px, auto))`,
        }}
      >
        <div className="sticky left-0 z-10 border-b border-r border-line bg-subtle" style={{ gridColumn: 1, gridRow: 1 }} />
        {DAYS.map((d, i) => (
          <div
            key={d}
            role="columnheader"
            className={cn(
              "flex items-center justify-between gap-2 border-b border-line px-3 text-[13px] font-semibold",
              i < 4 && "border-r",
              i === today ? "bg-brand-50 text-brand-800" : "bg-subtle text-ink",
            )}
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            <span>{d}</span>
            {i === today && <span className="rounded-md bg-brand-500 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Today</span>}
          </div>
        ))}

        {PERIODS.map((p) => (
          <Fragment key={p.n}>
            <div
              role="rowheader"
              className="sticky left-0 z-10 flex flex-col justify-center border-b border-r border-line bg-surface px-2"
              style={{ gridColumn: 1, gridRow: rowFor(p.n) }}
            >
              <span className="text-[12.5px] font-semibold leading-4 text-ink">P{p.n}</span>
              <span className="tabular whitespace-nowrap text-[10.5px] leading-4 text-ink-3">
                {p.start}
              </span>
            </div>
            {DAYS.map((_, d) => {
              const block = blocks.find((b) => b.day === d && b.period === p.n);
              return (
                <div
                  key={d}
                  className={cn("border-b border-line", d < 4 && "border-r", d === today && "bg-brand-50/30", block && "hatch bg-subtle")}
                  style={{ gridColumn: d + 2, gridRow: rowFor(p.n) }}
                  title={block ? `Unavailable${block.reason ? `: ${block.reason}` : ""}` : undefined}
                >
                  {block && (
                    <span className="m-1.5 inline-flex items-center rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-2 ring-1 ring-line">
                      Unavailable
                    </span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}

        <div className="sticky left-0 z-10 flex items-center border-b border-r border-line bg-subtle px-2 text-[10.5px] font-medium text-ink-3" style={{ gridColumn: 1, gridRow: LUNCH.afterPeriod + 2 }}>
          Lunch
        </div>
        <div className="flex items-center justify-center border-b border-line bg-subtle text-[10.5px] font-medium tracking-wide text-ink-3" style={{ gridColumn: "2 / span 5", gridRow: LUNCH.afterPeriod + 2 }}>
          Lunch break · {LUNCH.start}–{LUNCH.end}
        </div>

        {clusters.flatMap((dayClusters, day) =>
          dayClusters.map((cluster) => (
            <div
              key={`${day}-${cluster.start}`}
              className="relative z-[1] flex min-w-0 gap-1 p-1"
              style={{ gridColumn: day + 2, gridRow: `${rowFor(cluster.start)} / ${rowFor(cluster.end) + 1}` }}
            >
              {cluster.items.map((s) => (
                <SessionCard
                  key={s.id}
                  s={s}
                  issues={issuesBySession[s.id]}
                  href={hrefFor?.(s.id)}
                  selected={selectedId === s.id}
                  show={show}
                  compact={cluster.items.length > 1}
                  dimmed={dimIds?.has(s.id)}
                />
              ))}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function TimetableAgenda({ sessions, issuesBySession = {}, hrefFor, show = {}, blocks = [], dimIds }: Props) {
  const today = currentDayIndex();
  return (
    <div className="divide-y divide-line">
      {DAYS.map((d, day) => {
        const list = sessions.filter((s) => s.day === day).sort((a, b) => a.startPeriod - b.startPeriod);
        const blocked = blocks.filter((b) => b.day === day).length;
        return (
          <section key={d} aria-label={d} className="py-4 first:pt-1 last:pb-1">
            <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
              {d}
              {day === today && <span className="rounded-md bg-brand-500 px-1.5 py-px text-[10px] font-semibold uppercase text-white">Today</span>}
              <span className="ml-auto text-xs font-normal text-ink-3">
                {list.length} session{list.length === 1 ? "" : "s"}
                {blocked ? ` · ${blocked} blocked` : ""}
              </span>
            </h3>
            {list.length ? (
              <ul className="space-y-2">
                {list.map((s) => {
                  const issues = issuesBySession[s.id];
                  const style = KIND_STYLE[s.kind];
                  const inner = (
                    <div className={cn("flex gap-3 rounded-lg border border-l-[3px] p-3", style.card, issues?.length ? "border-danger/40" : "border-transparent", dimIds?.has(s.id) && "opacity-40")}>
                      <div className="w-[68px] shrink-0">
                        <p className="text-[12px] font-semibold text-ink">{periodLabel(s.startPeriod, s.duration)}</p>
                        <p className="tabular text-[11px] text-ink-2">{periodTime(s.startPeriod, s.duration)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                          <span className={style.text}>{s.courseCode}</span>
                          <span className="truncate font-normal text-ink">{s.courseTitle}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-2">
                          {[show.room !== false && s.roomCode, show.faculty !== false && shortName(s.facultyName), show.groups !== false && s.groupCodes.join(" + ")]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="rounded bg-surface/85 px-1.5 text-[10px] font-medium text-ink-2 ring-1 ring-line">{KIND_LABEL[s.kind]}</span>
                          {s.isFixed && <span className="rounded bg-surface/85 px-1.5 text-[10px] font-medium text-ink-2 ring-1 ring-line">Fixed</span>}
                          {s.combined && <span className="rounded bg-surface/85 px-1.5 text-[10px] font-medium text-ink-2 ring-1 ring-line">Combined</span>}
                          {issues?.length ? <span className="rounded bg-danger-bg px-1.5 text-[10px] font-semibold text-danger-fg">Conflict</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                  const href = hrefFor?.(s.id);
                  return (
                    <li key={s.id}>
                      {href ? (
                        <Link href={href} scroll={false} aria-label={`${describe(s, issues)}. Open details`} className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/40">
                          {inner}
                        </Link>
                      ) : (
                        <div aria-label={describe(s, issues)}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-ink-3">No sessions scheduled</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Weekly grid on tablet/desktop, day-by-day agenda on phones. */
export function Timetable(props: Props) {
  return (
    <>
      <div className="hidden md:block">
        <TimetableGrid {...props} />
      </div>
      <div className="md:hidden">
        <TimetableAgenda {...props} />
      </div>
    </>
  );
}

export function TimetableLegend({ showUnavailable }: { showUnavailable?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2" aria-label="Timetable legend">
      {(Object.keys(KIND_STYLE) as SessionKind[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", KIND_STYLE[k].swatch)} aria-hidden />
          {KIND_LABEL[k]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <Pin className="size-3.5" aria-hidden /> Fixed
      </li>
      <li className="flex items-center gap-1.5">
        <Users className="size-3.5" aria-hidden /> Combined
      </li>
      <li className="flex items-center gap-1.5">
        <TriangleAlert className="size-3.5 text-danger" aria-hidden /> Conflict
      </li>
      {showUnavailable && (
        <li className="flex items-center gap-1.5">
          <span className="hatch size-3 rounded-sm bg-subtle ring-1 ring-line" aria-hidden /> Unavailable
        </li>
      )}
    </ul>
  );
}

/** Compact chronological list used on dashboards (today's classes, upcoming sessions). */
export function SessionList({ sessions, showDay, emptyText = "Nothing scheduled" }: { sessions: SessionView[]; showDay?: boolean; emptyText?: string }) {
  if (!sessions.length) return <p className="px-5 py-8 text-center text-[13px] text-ink-3">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-4 px-5 py-3">
          <div className="w-[92px] shrink-0">
            <p className="text-[13px] font-semibold text-ink">{showDay ? `${DAYS[s.day].slice(0, 3)} · ` : ""}{periodLabel(s.startPeriod, s.duration)}</p>
            <p className="tabular text-xs text-ink-3">{periodTime(s.startPeriod, s.duration)}</p>
          </div>
          <span className={cn("h-9 w-[3px] shrink-0 rounded-full", KIND_STYLE[s.kind].swatch)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">
              <span className="font-semibold">{s.courseCode}</span> · {s.courseTitle}
            </p>
            <p className="truncate text-xs text-ink-2">
              {s.roomCode} · {s.groupCodes.join(" + ")} · {KIND_LABEL[s.kind]}
            </p>
          </div>
          {s.roomStatus !== "active" && <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning-fg">Room unavailable</span>}
        </li>
      ))}
    </ul>
  );
}
