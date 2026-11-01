import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { activeNavItem, NAV } from "./nav";

test("every navigation destination is implemented inside its role workspace", () => {
  for (const [role, sections] of Object.entries(NAV)) {
    for (const item of sections.flatMap((section) => section.items)) {
      assert(item.href === `/${role}` || item.href.startsWith(`/${role}/`), `${role}: ${item.href} leaves the role workspace`);
      const page = path.join(process.cwd(), "src/app", item.href.replace(/^\//, ""), "page.tsx");
      assert.equal(existsSync(page), true, `${role}: ${item.href} has no page.tsx`);
    }
  }
});

test("common judge tasks are directly discoverable in role navigation", () => {
  const admin = NAV.admin.flatMap((section) => section.items);
  assert(admin.some((item) => item.href === "/admin/venues"));
  assert(admin.some((item) => item.href === "/admin/official"));
  assert(admin.some((item) => item.href === "/admin/approvals"));
  const coordinator = NAV.coordinator.flatMap((section) => section.items);
  assert(coordinator.some((item) => item.href === "/coordinator/approvals" && item.badge === "approvals"));
});

test("longest matching route controls active navigation", () => {
  assert.equal(activeNavItem("club", "/club/bookings/new")?.href, "/club/bookings/new");
  assert.equal(activeNavItem("faculty", "/faculty/timetable")?.label, "My Timetable");
});
