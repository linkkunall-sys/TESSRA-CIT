/**
 * TESSRA design-system primitives. Hook-free, so they render in both server
 * and client components. All colours come from the tokens in globals.css.
 */
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Ban,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  FileText,
  Flag,
  Hourglass,
  Inbox,
  Info,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

/* --------------------------------- Buttons -------------------------------- */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "subtle" | "dark";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BTN_BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium outline-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-brand-500/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white shadow-xs hover:bg-brand-600 active:bg-brand-700",
  secondary: "border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-muted-bg hover:text-ink",
  destructive: "bg-danger-bg text-danger-fg hover:bg-danger-bg-strong",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  dark: "bg-ink text-white shadow-xs hover:bg-ink/90",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-sm",
  icon: "size-9",
  "icon-sm": "size-8",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

/* ---------------------------------- Cards --------------------------------- */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3 border-t border-line px-5 py-3", className)} {...props} />;
}

/* ------------------------------- Page header ------------------------------ */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink md:text-[28px] md:leading-9">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-2">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

/* --------------------------------- Badges --------------------------------- */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand" | "outline";
const TONE: Record<Tone, string> = {
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
  outline: "bg-surface text-ink-2 ring-1 ring-inset ring-line",
};
const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-3",
  brand: "bg-brand-500",
  outline: "bg-ink-3",
};

export function Badge({
  tone = "neutral",
  dot,
  icon: Icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium", TONE[tone], className)}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />}
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string, LucideIcon]> = {
  pending: ["warning", "Pending", Hourglass],
  approved: ["success", "Approved", CircleCheck],
  rejected: ["danger", "Rejected", CircleX],
  cancelled: ["neutral", "Cancelled", Ban],
  proposed: ["warning", "Awaiting approval", Hourglass],
  applied: ["success", "Applied", CircleCheck],
  draft: ["info", "Draft", FileText],
  published: ["success", "Published", CircleCheck],
  archived: ["neutral", "Archived", Archive],
  active: ["success", "Active", CircleCheck],
  maintenance: ["warning", "Maintenance", Wrench],
  inactive: ["neutral", "Inactive", Ban],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [tone, label, Icon] = STATUS[status] ?? ["neutral", status, CircleDot];
  return (
    <Badge tone={tone} icon={Icon} className={className}>
      {label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, [Tone, string]> = {
    low: ["neutral", "Low priority"],
    normal: ["outline", "Normal"],
    high: ["warning", "High priority"],
    critical: ["danger", "Critical"],
  };
  const [tone, label] = map[priority] ?? ["neutral", priority];
  return (
    <Badge tone={tone} icon={priority === "high" || priority === "critical" ? Flag : undefined}>
      {label}
    </Badge>
  );
}

/* ---------------------------------- Forms --------------------------------- */
export const controlClasses =
  "block w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 hover:border-line-strong focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-3";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, "h-9", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlClasses, "h-9 cursor-pointer appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-[88px] resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong accent-brand-600" {...props} />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

/* --------------------------------- Tables --------------------------------- */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scrollbar-thin overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  const customMin = className?.includes("min-w-");
  return <table className={cn("w-full border-collapse text-left text-sm", !customMin && "min-w-[680px]", className)} {...props} />;
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-subtle text-xs text-ink-2">{children}</thead>;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("h-10 whitespace-nowrap px-4 font-medium first:pl-5 last:pr-5", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line transition-colors last:border-0 hover:bg-subtle/80", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-ink first:pl-5 last:pr-5", className)} {...props} />;
}

/* ------------------------------ Feedback/state ---------------------------- */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-14")}>
      <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CALLOUT: Record<"success" | "warning" | "danger" | "info" | "brand", [string, LucideIcon]> = {
  success: ["border-success-bg bg-success-bg/50 text-success-fg", CircleCheck],
  warning: ["border-warning-bg bg-warning-bg/50 text-warning-fg", TriangleAlert],
  danger: ["border-danger-bg-strong bg-danger-bg/50 text-danger-fg", CircleAlert],
  info: ["border-info-bg bg-info-bg/40 text-info-fg", Info],
  brand: ["border-brand-100 bg-brand-50 text-brand-800", Info],
};

export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: keyof typeof CALLOUT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const [cls, DefaultIcon] = CALLOUT[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-start", cls, className)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? "mt-0.5" : "", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted-bg", className)} aria-hidden />;
}

/* ------------------------------- Data display ----------------------------- */
const STAT_TONE = {
  brand: "bg-brand-50 text-brand-600",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-muted-bg text-ink-2",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "brand",
  progress,
  href,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  tone?: keyof typeof STAT_TONE;
  progress?: number;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", STAT_TONE[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-1 text-[28px] font-semibold leading-9 tracking-tight text-ink">{value}</p>
      {progress !== undefined && <ProgressBar value={progress} className="mt-2" label={label} tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "brand"} />}
      {hint && <p className="mt-2 text-xs leading-5 text-ink-2">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "warning" | "danger" | "info" | "neutral";
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { brand: "bg-brand-500", warning: "bg-warning", danger: "bg-danger", info: "bg-info", neutral: "bg-ink-3" }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted-bg", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 72, label }: { value: number; size?: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(var(--color-brand-500) ${v * 3.6}deg, var(--color-muted-bg) 0deg)` }}
      role="img"
      aria-label={`${label}: ${v}%`}
    >
      <div className="grid place-items-center rounded-full bg-surface" style={{ width: size - 12, height: size - 12 }}>
        <span className="tabular text-sm font-semibold text-ink">{v}%</span>
      </div>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-brand-100 text-brand-800",
  "bg-cat-lecture-bg text-cat-lecture-fg ring-1 ring-inset ring-cat-lecture-bar/30",
  "bg-cat-lab-bg text-cat-lab-fg ring-1 ring-inset ring-cat-lab-bar/30",
  "bg-cat-exam-bg text-cat-exam-fg ring-1 ring-inset ring-cat-exam-bar/30",
  "bg-cat-event-bg text-cat-event-fg ring-1 ring-inset ring-cat-event-bar/30",
];

export function Avatar({ name, size = "md", className }: { name: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const dims = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold", dims, AVATAR_TONES[hash % AVATAR_TONES.length], className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function TabLinks({
  items,
  label,
  className,
  bordered = true,
}: {
  items: { href: string; label: string; count?: number; active: boolean }[];
  label: string;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <nav aria-label={label} className={cn("scrollbar-thin -mb-px flex gap-1 overflow-x-auto", bordered && "border-b border-line", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150",
            i.active
              ? "text-brand-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {i.label}
          {i.count !== undefined && (
            <span className={cn("tabular rounded-md px-1.5 text-[11px] font-semibold", i.active ? "bg-brand-100 text-brand-800" : "bg-muted-bg text-ink-2")}>
              {i.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,auto)_1fr] gap-x-6 gap-y-2.5 text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BarList({
  items,
  max,
  unit = "",
  empty = "No data yet",
}: {
  items: { label: ReactNode; value: number; hint?: ReactNode; tone?: "brand" | "warning" | "danger" | "info" | "neutral" }[];
  max?: number;
  unit?: string;
  empty?: string;
}) {
  if (!items.length) return <p className="py-4 text-center text-[13px] text-ink-3">{empty}</p>;
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => (
        <li key={idx}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-ink">{i.label}</span>
            <span className="tabular shrink-0 text-ink-2">
              {i.value}
              {unit}
              {i.hint && <span className="ml-1 text-ink-3">{i.hint}</span>}
            </span>
          </div>
          <ProgressBar value={i.value} max={top} tone={i.tone ?? "brand"} />
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ items, unit = "" }: { items: { label: string; value: number; highlight?: boolean }[]; unit?: string }) {
  const top = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-40 items-end gap-2 sm:gap-3" role="list">
      {items.map((i) => (
        <div key={i.label} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-2" aria-label={`${i.label}: ${i.value}${unit}`}>
          <span className="tabular text-xs font-medium text-ink-2">{i.value}</span>
          <div
            className={cn("w-full max-w-12 rounded-t-md transition-[height] duration-500", i.highlight ? "bg-brand-500" : "bg-brand-200")}
            style={{ height: `${Math.max(4, (i.value / top) * 100)}%` }}
          />
          <span className="text-xs text-ink-2">{i.label}</span>
        </div>
      ))}
    </div>
  );
}
