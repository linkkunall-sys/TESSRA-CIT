"use client";

import "./globals.css";
import { RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { buttonClasses } from "@/components/ui";

/** Last-resort boundary (replaces the root layout) — never leave the user on a blank page. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink antialiased">
        <main className="grid min-h-dvh place-items-center px-6">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
            <LogoMark className="mx-auto size-10" />
            <h1 className="mt-5 text-lg font-semibold">TESSRA couldn’t load this screen</h1>
            <p className="mt-1.5 text-sm text-ink-2">Something unexpected happened. Your data is safe — try again, or reload the page.</p>
            {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={reset} className={buttonClasses("primary", "md")}>
                <RotateCcw aria-hidden /> Try again
              </button>
              <button type="button" onClick={() => window.location.assign("/")} className={buttonClasses("secondary", "md")}>
                Reload TESSRA
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
