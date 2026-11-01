import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { getNavBadges, getSettings } from "@/lib/queries";
import { AppFrame } from "./shell";

/** Server wrapper: guards the workspace by role and feeds the shell real badge counts. */
export async function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  const user = await requireRole(role);
  const [settings, badges, store] = await Promise.all([getSettings(), getNavBadges(user), cookies()]);
  const subtitle = user.role === "club" ? user.clubName : user.role === "admin" ? user.title : user.departmentName;
  return (
    <AppFrame
      role={role}
      user={{ name: user.name, email: user.email, roleLabel: ROLE_LABEL[user.role], subtitle: subtitle ?? null }}
      badges={badges}
      term={settings.academicTerm}
      institution={settings.institutionName}
      defaultCollapsed={store.get("tessra_sidebar")?.value === "1"}
    >
      {children}
    </AppFrame>
  );
}
