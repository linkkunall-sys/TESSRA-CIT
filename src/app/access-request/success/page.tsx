import { CheckCircle2, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT } from "@/lib/constants";
import { buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Request Submitted — " + PRODUCT.name };
export const dynamic = "force-dynamic";

export default function AccessRequestSuccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 sm:px-8">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-line bg-surface shadow-card p-6 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-green-50 text-green-600 ring-1 ring-green-100 mx-auto mb-4">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <h2 className="text-2xl font-semibold text-ink">Request Submitted</h2>
          <p className="mt-1 text-sm text-ink-2">
            Your access request has been submitted. An administrator will review it shortly.
          </p>

          <div className="mt-6">
            <p className="text-sm text-ink-2">
              What happens next?
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-2 list-disc list-inside">
              <li>An administrator reviews your details and role request.</li>
              <li>If approved, you can sign in with your email and password.</li>
              <li>If rejected, you will see the reason and may reapply.</li>
            </ul>
          </div>

          <div className="mt-8 flex gap-3">
            <Link href="/login" className={buttonClasses("primary", "lg")}>
              <Mail className="size-4" aria-hidden />
              Sign in
            </Link>
            <Link href="/" className={buttonClasses("secondary", "lg")}>
              Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
