import { CalendarClock, ShieldCheck, Ticket } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_ACCOUNTS, PRODUCT, ROLE_HOME, ROLE_LABEL } from "@/lib/constants";
import { getSettings } from "@/lib/queries";
import { LoginPanel } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: CalendarClock, title: "Smart scheduling", body: "Constraint-aware timetable generation, validated before anything is published." },
  { icon: Ticket, title: "Venue bookings", body: "Conflict-checked requests with suggested alternatives for clubs and departments." },
  { icon: ShieldCheck, title: "Governed decisions", body: "Approvals, disruption plans and a complete audit trail in one workspace." },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const settings = await getSettings();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="tile-pattern relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9 rounded-[9px] ring-1 ring-white/10" />
          <Wordmark inverted />
        </div>
        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-300">{PRODUCT.descriptor}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-[-0.02em] xl:text-[44px]">
            Smarter Schedules.
            <br />
            <span className="text-brand-300">Seamless Campus Operations.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-white/70">{PRODUCT.summary}</p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-brand-300 ring-1 ring-white/10">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-white/60">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/40">
          {settings.institutionName} · {settings.academicTerm}
        </p>
      </aside>
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-9" />
            <Wordmark />
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Sign in to your workspace</h2>
          <p className="mt-1.5 text-sm text-ink-2">
            {settings.institutionName} · <span className="lg:hidden">{PRODUCT.tagline}</span>
            <span className="hidden lg:inline">{settings.academicTerm}</span>
          </p>
          <LoginPanel accounts={DEMO_ACCOUNTS.map((a) => ({ ...a, roleLabel: ROLE_LABEL[a.role] }))} />
        </div>
      </main>
    </div>
  );
}
