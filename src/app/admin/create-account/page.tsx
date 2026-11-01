import { Mail, ShieldCheck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PRODUCT } from "@/lib/constants";
import { RoleShell } from "@/components/role-shell";
import { Input, Select, Textarea } from "@/components/ui";
import { buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Create Account — " + PRODUCT.name };
export const dynamic = "force-dynamic";

const DEPARTMENTS = [
  { value: "CSE", label: "Computer Science & Engineering" },
  { value: "ECE", label: "Electronics & Communication Engineering" },
  { value: "MGT", label: "School of Management" },
  { value: "SCI", label: "Mathematics & Sciences" },
];

const CLUBS = [
  { value: "Robotics Society", label: "Robotics Society" },
  { value: "Cultural Committee", label: "Cultural Committee" },
  { value: "Entrepreneurship Cell", label: "Entrepreneurship Cell" },
  { value: "Photography Club", label: "Photography Club" },
];

export default async function CreateAccountPage() {
  const user = await requireRole("admin");

  return (
    <RoleShell role="admin">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Create Admin Account</h1>
            <p className="text-sm text-ink-2">
              Create a new administrator account directly. Instant approval — no request flow needed.
            </p>
          </div>
          <a href="/admin/access-requests" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-subtle hover:text-ink transition-colors">
            <Mail className="size-4" aria-hidden />
            Pending Requests
          </a>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-card p-6">
          <form action="/api/admin/create-account" method="POST" className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink">Full name</label>
              <Input name="name" placeholder="Aditi Kapoor" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Work email</label>
              <Input name="email" type="email" placeholder="name@westbrook.edu" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Password</label>
              <Input name="password" type="password" placeholder="••••••••" required minLength={8} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Role</label>
              <Select name="role" required>
                <option value="admin">Administrator</option>
                <option value="coordinator">Department Coordinator</option>
                <option value="faculty">Faculty</option>
                <option value="club">Club Representative</option>
              </Select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Department</label>
              <Select name="departmentId">
                <option value="">Select a department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Club</label>
              <Select name="clubId">
                <option value="">Select a club</option>
                {CLUBS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <button type="submit" className={buttonClasses("primary", "lg")}>
              Create Account
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-line bg-green-50 p-6 text-green-900">
          <div className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0" aria-hidden />
            <div>
              <h3 className="font-semibold">How it works</h3>
              <ul className="mt-2 space-y-1 text-sm text-green-800/80 list-disc list-inside">
                <li>
                  As an administrator, you can create new accounts instantly with{" "}
                  <strong>approved</strong> status.
                </li>
                <li>
                  The new user can sign in immediately with their email and password.
                </li>
                <li>
                  If Supabase Auth is configured, a matching Supabase Auth user is also created.
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-green-700">
            Need to review pending public requests? Go to{" "}
            <a href="/admin/access-requests" className="font-medium text-green-700 hover:underline">
              Access Requests
            </a>
            .
          </p>
        </div>
      </div>
    </RoleShell>
  );
}
