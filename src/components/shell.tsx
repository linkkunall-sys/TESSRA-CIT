"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Bot,
  Building,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  CirclePlus,
  ClipboardCheck,
  ClipboardList,
  NotebookPen,
  Compass,
  FileClock,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  Users,
  Boxes,
  CalendarSearch,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/actions";
import { ROLE_WORKSPACE, type Role } from "@/lib/constants";
import { activeNavItem, NAV, type NavIconKey, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LogoMark, Wordmark } from "./brand";
import { Avatar, buttonClasses } from "./ui";

const ICONS: Record<NavIconKey, LucideIcon> = {
  overview: LayoutDashboard,
  academics: GraduationCap,
  scheduling: CalendarClock,
  exams: ClipboardList,
  venues: Building,
  bookings: Ticket,
  disruptions: TriangleAlert,
  approvals: ShieldCheck,
  audit: ScrollText,
  settings: Settings,
  faculty: Users,
  events: CalendarCheck,
  resources: Boxes,
  reports: ChartColumn,
  timetable: CalendarDays,
  courses: BookOpen,
  availability: UserCheck,
  requests: ClipboardCheck,
  assistant: Bot,
  notifications: Bell,
  discover: Compass,
  newBooking: CirclePlus,
  history: FileClock,
  official: FlaskConical,
  coursework: NotebookPen,
};

type ShellUser = { name: string; email: string; roleLabel: string; subtitle: string | null };
type Mode = "responsive" | "rail" | "full";
type QuickJump = { label: string; description: string; href: string; icon: NavIconKey; keywords: string };

const QUICK_JUMPS: Record<Role, QuickJump[]> = {
  admin: [
    { label: "Find an available room", description: "Live availability by capacity, date and time", href: "/admin/venues", icon: "venues", keywords: "find free room venue space capacity" },
    { label: "Read the official timetable", description: "CIT views by group, faculty or room", href: "/admin/official#official-results", icon: "official", keywords: "read timetable official cit schedule" },
    { label: "Approve a change", description: "Review validated requests and disruption plans", href: "/admin/approvals", icon: "approvals", keywords: "approve reject change decision request" },
    { label: "Generate a timetable", description: "Open Smart Scheduling and CP-SAT controls", href: "/admin/scheduling", icon: "scheduling", keywords: "generate solve timetable schedule" },
  ],
  coordinator: [
    { label: "Read department timetable", description: "Weekly CSE sessions and conflicts", href: "/coordinator/scheduling", icon: "timetable", keywords: "read timetable schedule department" },
    { label: "Approve a faculty request", description: "Validated changes from your department", href: "/coordinator/approvals", icon: "approvals", keywords: "approve reject change faculty" },
    { label: "Check faculty availability", description: "Teaching load and unavailable slots", href: "/coordinator/faculty", icon: "faculty", keywords: "faculty teacher free availability load" },
  ],
  faculty: [
    { label: "Read my timetable", description: "Phone-friendly agenda and weekly grid", href: "/faculty/timetable", icon: "timetable", keywords: "read timetable schedule classes" },
    { label: "Request a schedule change", description: "Choose a conflict-free alternative", href: "/faculty/requests", icon: "requests", keywords: "move reschedule request class room" },
    { label: "Mark unavailable time", description: "Update weekly availability", href: "/faculty/availability", icon: "availability", keywords: "unavailable block free time" },
    { label: "Ask the schedule assistant", description: "Plain-English, validated proposals", href: "/faculty/assistant", icon: "assistant", keywords: "ai ask help schedule room" },
  ],
  club: [
    { label: "Find an available venue", description: "Check live date and time availability", href: "/club/venues", icon: "discover", keywords: "find free room venue space" },
    { label: "Create a booking", description: "Submit an editable, validated request", href: "/club/bookings/new", icon: "newBooking", keywords: "new request book venue event" },
    { label: "Track my requests", description: "See status, reasons and alternatives", href: "/club/bookings", icon: "bookings", keywords: "status reason pending rejected approved" },
  ],
};

function SidebarContent({
  role,
  user,
  badges,
  mode,
  pathname,
  onNavigate,
  onToggle,
  onClose,
}: {
  role: Role;
  user: ShellUser;
  badges: Record<string, number>;
  mode: Mode;
  pathname: string;
  onNavigate?: () => void;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  const active = activeNavItem(role, pathname);
  const label = mode === "full" ? "" : mode === "rail" ? "sr-only" : "sr-only lg:not-sr-only";
  const center = mode === "full" ? "" : mode === "rail" ? "justify-center px-0" : "justify-center px-0 lg:justify-start lg:px-2.5";
  const showText = mode === "full" ? "flex" : mode === "rail" ? "hidden" : "hidden lg:flex";

  const renderItem = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    const isActive = active?.href === item.href;
    const count = item.badge ? badges[item.badge] ?? 0 : 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          title={mode === "full" ? undefined : item.label}
          className={cn(
            "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-brand-500/30",
            isActive ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle hover:text-ink",
            isActive && "before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-brand-500",
            center,
          )}
        >
          <Icon className={cn("size-[18px] shrink-0 transition-colors", isActive ? "text-brand-600" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
          <span className={cn("min-w-0 flex-1 truncate", label)}>{item.label}</span>
          {count > 0 && (
            <>
              <span
                className={cn(
                  "tabular ml-auto rounded-md px-1.5 py-px text-[11px] font-semibold",
                  isActive ? "bg-brand-100 text-brand-800" : "bg-muted-bg text-ink-2",
                  mode === "full" ? "" : mode === "rail" ? "hidden" : "hidden lg:inline",
                )}
              >
                {count}
                <span className="sr-only"> pending</span>
              </span>
              {mode !== "full" && (
                <span className={cn("absolute right-2 top-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-surface", mode === "responsive" && "lg:hidden")} aria-hidden />
              )}
            </>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4", mode !== "full" && (mode === "rail" ? "justify-center px-0" : "justify-center px-0 lg:justify-start lg:px-4"))}>
        <Link href={NAV[role][0].items[0].href} className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30" onClick={onNavigate}>
          <LogoMark className="size-8" />
          <Wordmark className={showText} />
          <span className="sr-only">TESSRA home</span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className={buttonClasses("ghost", "icon-sm", "ml-auto")} aria-label="Close navigation">
            <X aria-hidden />
          </button>
        )}
      </div>

      <div className={cn("px-3 pt-4", mode === "rail" ? "hidden" : mode === "responsive" ? "hidden lg:block" : "")}>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 py-2">
          <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
          <span className="truncate text-xs font-medium text-ink-2">{ROLE_WORKSPACE[role]}</span>
        </div>
      </div>

      <nav aria-label={`${ROLE_WORKSPACE[role]} navigation`} className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {NAV[role].map((section, i) => (
          <div key={section.title} className={cn(i > 0 && "mt-5")}>
            <p className={cn("mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3", mode === "full" ? "" : mode === "rail" ? "sr-only" : "sr-only lg:not-sr-only lg:block")}>
              {section.title}
            </p>
            {i > 0 && mode !== "full" && <div className={cn("mx-2 mb-2 border-t border-line", mode === "responsive" && "lg:hidden")} aria-hidden />}
            <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className={cn("flex items-center gap-2.5 rounded-lg p-1.5", mode !== "full" && (mode === "rail" ? "flex-col" : "flex-col lg:flex-row"))}>
          <Avatar name={user.name} size="md" />
          <div className={cn("min-w-0 flex-1", mode === "full" ? "block" : mode === "rail" ? "hidden" : "hidden lg:block")}>
            <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-2">{user.roleLabel}</p>
          </div>
          <div className={cn("flex items-center gap-0.5", mode !== "full" && (mode === "rail" ? "flex-col" : "flex-col lg:flex-row"))}>
            {role === "admin" && (
              <Link href="/admin/settings" onClick={onNavigate} className={buttonClasses("ghost", "icon-sm")} aria-label="Settings" title="Settings">
                <Settings aria-hidden />
              </Link>
            )}
            <form action={logoutAction}>
              <button type="submit" className={buttonClasses("ghost", "icon-sm")} aria-label="Sign out" title="Sign out">
                <LogOut aria-hidden />
              </button>
            </form>
          </div>
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(buttonClasses("ghost", "sm", "mt-1 w-full max-lg:hidden"), mode === "rail" ? "justify-center px-0" : "justify-start")}
            aria-label={mode === "rail" ? "Expand sidebar" : "Collapse sidebar"}
            title={mode === "rail" ? "Expand sidebar" : "Collapse sidebar"}
          >
            {mode === "rail" ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            <span className={mode === "rail" ? "sr-only" : ""}>Collapse</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CommandPalette({ role, onClose }: { role: Role; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const quick = QUICK_JUMPS[role].filter((item) => !needle || `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(needle));
  const pages = NAV[role]
    .flatMap((section) => section.items.map((item) => ({ ...item, section: section.title })))
    .filter((item) => !needle || `${item.label} ${item.section}`.toLowerCase().includes(needle));

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh] sm:px-6" role="dialog" aria-modal="true" aria-label="Jump to a page">
      <button type="button" className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]" onClick={onClose} aria-label="Close page search" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-scale-in">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="size-5 shrink-0 text-ink-3" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
            placeholder="Find a room, timetable, approval…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
            aria-label="Search pages and tasks"
          />
          <kbd className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-3">Esc</kbd>
        </div>
        <div className="scrollbar-thin max-h-[min(65vh,520px)] overflow-y-auto p-2">
          {quick.length > 0 && (
            <section aria-labelledby="quick-jumps-label">
              <p id="quick-jumps-label" className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">Common tasks</p>
              <ul className="space-y-1">
                {quick.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <li key={`${item.label}-${item.href}`}>
                      <Link href={item.href} onClick={onClose} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ink">{item.label}</span><span className="block truncate text-xs text-ink-2">{item.description}</span></span>
                        <span className="text-xs font-medium text-brand-700 opacity-0 transition-opacity group-hover:opacity-100">Open</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {pages.length > 0 && (
            <section className={quick.length ? "mt-3 border-t border-line pt-2" : ""} aria-labelledby="all-pages-label">
              <p id="all-pages-label" className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">Pages</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {pages.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link href={item.href} onClick={onClose} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink-2 outline-none transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
                        <Icon className="size-4 shrink-0 text-ink-3" aria-hidden /><span className="min-w-0 flex-1 truncate">{item.label}</span><span className="text-[10px] text-ink-3">{item.section}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {!quick.length && !pages.length && (
            <div className="px-4 py-12 text-center"><Search className="mx-auto size-6 text-ink-3" aria-hidden /><p className="mt-2 text-sm font-semibold text-ink">No matching page</p><p className="mt-1 text-xs text-ink-2">Try “room”, “timetable” or “approval”.</p></div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-subtle px-4 py-2 text-[11px] text-ink-3"><span>Searches navigation only — no data is changed</span><span>⌘ K</span></div>
      </div>
    </div>
  );
}

export function AppFrame({
  role,
  user,
  badges,
  term,
  institution,
  defaultCollapsed,
  children,
}: {
  role: Role;
  user: ShellUser;
  badges: Record<string, number>;
  term: string;
  institution: string;
  defaultCollapsed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = activeNavItem(role, pathname);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Partitioned + SameSite=None over HTTPS so the preference also persists inside an embedded preview.
    const attrs = window.location.protocol === "https:" ? "; SameSite=None; Secure; Partitioned" : "; SameSite=Lax";
    document.cookie = `tessra_sidebar=${next ? "1" : "0"}; path=/; max-age=31536000${attrs}`;
  };

  useEffect(() => {
    if (!drawer) return;
    const button = menuButton.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      button?.focus();
    };
  }, [drawer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawer(false);
        setPalette((value) => !value);
      } else if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setDrawer(false);
        setPalette(true);
      } else if (event.key === "Escape") {
        setPalette(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!palette) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [palette]);

  const notificationsHref = role === "faculty" ? "/faculty/notifications" : role === "club" ? "/club/notifications" : null;
  const approvalsHref = role === "admin" ? "/admin/approvals" : role === "coordinator" ? "/coordinator/approvals" : null;
  const unread = badges.notifications ?? 0;
  const approvals = badges.approvals ?? 0;

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[120] rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {palette && <CommandPalette role={role} onClose={() => setPalette(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-[72px]" : "w-[72px] lg:w-64",
        )}
      >
        <SidebarContent role={role} user={user} badges={badges} mode={collapsed ? "rail" : "responsive"} pathname={pathname} onToggle={toggle} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 animate-fade-in bg-ink/45" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,86vw)] animate-slide-in-left bg-surface shadow-pop">
            <SidebarContent
              role={role}
              user={user}
              badges={badges}
              mode="full"
              pathname={pathname}
              onNavigate={() => setDrawer(false)}
              onClose={() => setDrawer(false)}
            />
          </aside>
        </div>
      )}

      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200 ease-out", collapsed ? "md:pl-[72px]" : "md:pl-[72px] lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setDrawer(true)}
            className={buttonClasses("ghost", "icon-sm", "-ml-1.5 md:hidden")}
            aria-label="Open navigation"
            aria-expanded={drawer}
          >
            <Menu aria-hidden />
          </button>
          <LogoMark className="size-7 md:hidden" />
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2 text-[13px]">
              <li className="hidden truncate text-ink-3 sm:block">{ROLE_WORKSPACE[role]}</li>
              <li className="hidden text-line-strong sm:block" aria-hidden>
                /
              </li>
              <li className="truncate font-semibold text-ink" aria-current="page">
                {current?.label ?? "TESSRA"}
              </li>
            </ol>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-subtle px-2.5 py-1 text-xs font-medium text-ink-2 xl:inline-flex" title={institution}>
              <CalendarRange className="size-3.5 text-ink-3" aria-hidden />
              {term}
            </span>
            <button
              type="button"
              onClick={() => { setDrawer(false); setPalette(true); }}
              className={cn(buttonClasses("secondary", "sm"), "max-sm:size-8 max-sm:px-0")}
              aria-label="Search pages and common tasks"
              title="Search pages (⌘ K)"
            >
              <Search aria-hidden />
              <span className="hidden sm:inline">Jump to</span>
              <kbd className="hidden rounded border border-line bg-surface px-1 font-mono text-[10px] text-ink-3 lg:inline">⌘ K</kbd>
            </button>
            {approvalsHref && (
              <Link href={approvalsHref} className={buttonClasses("secondary", "sm", "relative")}>
                <ShieldCheck className="text-ink-3" aria-hidden />
                <span className="hidden sm:inline">Approvals</span>
                {approvals > 0 && (
                  <span className="tabular rounded-md bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
                    {approvals}
                    <span className="sr-only"> pending</span>
                  </span>
                )}
              </Link>
            )}
            {notificationsHref && (
              <Link
                href={notificationsHref}
                className={buttonClasses("ghost", "icon-sm", "relative")}
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                title="Notifications"
              >
                <Bell aria-hidden />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-surface" aria-hidden />}
              </Link>
            )}
            {role === "club" && (
              <Link href="/club/bookings/new" className={buttonClasses("primary", "sm", "max-sm:hidden")}>
                <CalendarSearch aria-hidden />
                New booking
              </Link>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
