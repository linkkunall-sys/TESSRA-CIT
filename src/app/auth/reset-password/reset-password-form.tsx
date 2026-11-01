"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { buttonClasses } from "@/components/ui";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    formData.set("token", token);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ kind: "success", text: data.message });
        setTimeout(() => router.push("/login"), 1500);
      } else {
        setMessage({ kind: "error", text: data.message || "Something went wrong." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach TESSRA. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-line bg-surface shadow-card p-6 text-center">
            <ShieldCheck className="mx-auto size-10 text-rose-500" aria-hidden />
            <h2 className="mt-4 text-2xl font-semibold text-ink">Invalid reset link</h2>
            <p className="mt-1 text-sm text-ink-2">The reset link is missing or invalid.</p>
            <a href="/login" className={buttonClasses("primary", "md")}>
              Go to sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <a href="/login" className="rounded-lg p-2 hover:bg-subtle transition-colors">
            <ArrowLeft className="size-4" aria-hidden />
          </a>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Reset Password</h2>
            <p className="mt-1 text-sm text-ink-2">Choose a new password for your account.</p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-card p-6">
          {message && (
            <div
              className={`
                rounded-lg p-3 text-sm ${
                  message.kind === "success"
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : message.kind === "error"
                      ? "bg-rose-50 text-rose-700 border border-rose-100"
                      : "bg-blue-50 text-blue-700 border border-blue-100"
                }
              `}
            >
              {message.text}
            </div>
          )}
          {(!message || message.kind !== "success") && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <label className="block text-[13px] font-medium text-ink">New password</label>
                <Input name="password" type="password" placeholder="••••••••" required minLength={8} />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-ink">Confirm password</label>
                <Input name="confirmPassword" type="password" placeholder="••••••••" required minLength={8} />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className={buttonClasses("primary", "lg")}
              >
                {submitting ? "Resetting…" : <><ShieldCheck className="mr-2 size-4" aria-hidden />Reset password</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
