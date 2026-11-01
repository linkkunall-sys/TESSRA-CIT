"use client";

import { Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { PRODUCT } from "@/lib/constants";
import { Input, Select, Textarea } from "@/components/ui";
import { buttonClasses } from "@/components/ui";

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

type FormState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

export default function AccessRequestPage() {
  const [state, setState] = useState<FormState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitAccessRequest(fd: FormData) {
    setIsSubmitting(true);
    setState(null);

    const name = (fd.get("name") as string)?.trim();
    const email = (fd.get("email") as string)?.toLowerCase().trim();
    const password = (fd.get("password") as string) ?? "";
    const requestedRole = (fd.get("requestedRole") as string) ?? "";
    const departmentId = Number(fd.get("departmentId")) || null;
    const clubId = Number(fd.get("clubId")) || null;
    const reason = (fd.get("reason") as string)?.trim();

    const errors: Record<string, string> = {};
    if (!name || name.length < 2) errors.name = "Enter your full name";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
    if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
    if (!["coordinator", "faculty", "club"].includes(requestedRole)) errors.requestedRole = "Select a valid role";
    if (!reason || reason.length < 10) errors.reason = "Please explain why you need access (10+ characters)";
    if (Object.keys(errors).length) {
      setState({ ok: false, message: "Please fix the highlighted fields.", errors });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        body: fd,
      });

      const result = await res.json();

      if (!res.ok) {
        setState({ ok: false, message: result.message || "Submission failed.", errors: result.errors });
        setIsSubmitting(false);
        return;
      }

      setState({ ok: true, message: result.message || "Access request submitted successfully!" });
      setIsSubmitting(false);
    } catch (err) {
      setState({ ok: false, message: "Network error. Please try again." });
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <UserPlus className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Request Access</h2>
            <p className="mt-1 text-sm text-ink-2">
              Join {PRODUCT.name} — coordinators, faculty, and club representatives need admin approval.
              Administrators can create accounts directly in the Admin Panel.
            </p>
          </div>
        </div>

        {state && (
          <div className={`mb-6 rounded-xl p-4 ${state.ok ? "bg-green-50 border border-green-200 text-green-900" : "bg-rose-50 border border-rose-200 text-rose-900"}`}>
            <div className="flex gap-3">
              {state.ok ? (
                <span className="size-5 shrink-0 text-green-600">✓</span>
              ) : (
                <span className="size-5 shrink-0 text-rose-600">⚠</span>
              )}
              <div>
                <h3 className="font-semibold">{state.ok ? "Success!" : "Error"}</h3>
                <p className="mt-1 text-xs">{state.message}</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface shadow-card p-6">
          <form action={submitAccessRequest} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink">Full name</label>
              <Input name="name" placeholder="Dr. Ananya Mishra" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Work email</label>
              <Input name="email" type="email" placeholder="name@cit.ac.in" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Password</label>
              <Input name="password" type="password" placeholder="••••••••" required minLength={8} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink">Requested role</label>
              <Select name="requestedRole" required>
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
            <div>
              <label className="block text-[13px] font-medium text-ink">Why do you need access?</label>
              <Textarea name="reason" placeholder="Describe your role and what you need to do in TESSRA…" required minLength={10} />
            </div>
            <button type="submit" disabled={isSubmitting} className={buttonClasses("primary", "lg")}>
              {isSubmitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>

        <div className="mt-8 rounded-xl border border-line bg-brand-50 p-6 text-brand-900">
          <div className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0" aria-hidden />
            <div>
              <h3 className="font-semibold">What happens next?</h3>
              <ul className="mt-2 space-y-1 text-sm text-brand-800/80 list-disc list-inside">
                <li>Your request is stored securely and marked pending.</li>
                <li>An administrator reviews your details and role request.</li>
                <li>If approved, you can sign in with your email and password.</li>
                <li>If rejected, you will see the reason and may reapply.</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-brand-700">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
