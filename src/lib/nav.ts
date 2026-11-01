import type { Role } from "./constants";

export type NavIconKey =
  | "overview"
  | "academics"
  | "scheduling"
  | "exams"
  | "venues"
  | "bookings"
  | "disruptions"
  | "approvals"
  | "audit"
  | "settings"
  | "faculty"
  | "events"
  | "resources"
  | "reports"
  | "timetable"
  | "courses"
  | "availability"
  | "requests"
  | "assistant"
  | "notifications"
  | "discover"
  | "newBooking"
  | "history"
  | "official"
  | "coursework";

export type NavItem = { label: string; href: string; icon: NavIconKey; badge?: string };
export type NavSection = { title: string; items: NavItem[] };

/** The four official role workspaces. Every href maps to an implemented route. */
export const NAV: Record<Role, NavSection[]> = {
  admin: [
    { title: "Workspace", items: [{ label: "Overview", href: "/admin", icon: "overview" }] },
    {
      title: "Academics",
      items: [
        { label: "Academic Management", href: "/admin/academics", icon: "academics" },
        { label: "Smart Scheduling", href: "/admin/scheduling", icon: "scheduling" },
        { label: "Examinations", href: "/admin/examinations", icon: "exams" },
        { label: "Official Dataset", href: "/admin/official", icon: "official" },
        { label: "Coursework", href: "/admin/coursework", icon: "coursework" },
      ],
    },
    {
      title: "Campus",
      items: [
        { label: "Venues", href: "/admin/venues", icon: "venues" },
        { label: "Bookings", href: "/admin/bookings", icon: "bookings", badge: "bookings" },
        { label: "Disruptions", href: "/admin/disruptions", icon: "disruptions", badge: "disruptions" },
      ],
    },
    {
      title: "Governance",
      items: [
        { label: "Access Requests", href: "/admin/access-requests", icon: "approvals" },
        { label: "Approval Centre", href: "/admin/approvals", icon: "approvals", badge: "approvals" },
        { label: "Audit & History", href: "/admin/audit", icon: "audit" },
        { label: "Settings", href: "/admin/settings", icon: "settings" },
      ],
    },
  ],
  coordinator: [
    { title: "Workspace", items: [{ label: "Overview", href: "/coordinator", icon: "overview" }] },
    {
      title: "Department",
      items: [
        { label: "Faculty", href: "/coordinator/faculty", icon: "faculty" },
        { label: "Academic Scheduling", href: "/coordinator/scheduling", icon: "scheduling" },
        { label: "Department Events", href: "/coordinator/events", icon: "events" },
        { label: "Resources", href: "/coordinator/resources", icon: "resources" },
      ],
    },
    {
      title: "Governance",
      items: [
        { label: "Approval Centre", href: "/coordinator/approvals", icon: "approvals", badge: "approvals" },
        { label: "Reports", href: "/coordinator/reports", icon: "reports" },
      ],
    },
  ],
  faculty: [
    { title: "Workspace", items: [{ label: "Overview", href: "/faculty", icon: "overview" }] },
    {
      title: "Teaching",
      items: [
        { label: "My Timetable", href: "/faculty/timetable", icon: "timetable" },
        { label: "My Courses", href: "/faculty/courses", icon: "courses" },
        { label: "Coursework", href: "/faculty/coursework", icon: "coursework" },
        { label: "Availability", href: "/faculty/availability", icon: "availability" },
        { label: "Schedule Change Requests", href: "/faculty/requests", icon: "requests", badge: "requests" },
      ],
    },
    {
      title: "Assist",
      items: [
        { label: "AI Assistant", href: "/faculty/assistant", icon: "assistant" },
        { label: "Notifications", href: "/faculty/notifications", icon: "notifications", badge: "notifications" },
      ],
    },
  ],
  club: [
    { title: "Workspace", items: [{ label: "Overview", href: "/club", icon: "overview" }] },
    {
      title: "Venues",
      items: [
        { label: "Discover Venues", href: "/club/venues", icon: "discover" },
        { label: "New Booking", href: "/club/bookings/new", icon: "newBooking" },
      ],
    },
    {
      title: "Activity",
      items: [
        { label: "My Bookings", href: "/club/bookings", icon: "bookings", badge: "bookings" },
        { label: "Booking History", href: "/club/history", icon: "history" },
        { label: "Notifications", href: "/club/notifications", icon: "notifications", badge: "notifications" },
      ],
    },
  ],
};

/** Longest-prefix match so /club/bookings/new highlights “New Booking”, not “My Bookings”. */
export function activeNavItem(role: Role, pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const item of NAV[role].flatMap((s) => s.items)) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
