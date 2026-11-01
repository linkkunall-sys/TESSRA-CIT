import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleShell role="admin">{children}</RoleShell>;
}
