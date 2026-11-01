"use client";

import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { buttonClasses } from "@/components/ui";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ kind: "success", text: data.message });
      } else {
        setMessage({ kind: "error", text: data.message || "Something went wrong." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach TESSRA. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <a href="/login" className="rounded-lg p-2 hover:bg-subtle transition-colors">
            <ArrowLeft className="size-4" aria-hidden />
          </a>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Forgot Password</h2>
            <p className="mt-1 text-sm text-ink-2">Enter your email and we’ll send you a reset link.</p>
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
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-[13px] font-medium text-ink">Work email</label>
              <Input name="email" type="email" placeholder="name@westbrook.edu" required />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={buttonClasses("primary", "lg")}
            >
              {submitting ? "Sending…" : <><Mail className="mr-2 size-4" aria-hidden />Send reset link</>}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-3">
          Remember your password?{" "}
          <a href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
