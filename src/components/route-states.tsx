"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, Skeleton } from "./ui";

export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-danger-bg text-danger-fg">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-ink-2">This view couldn’t be loaded. Your data is safe — try again, and contact support if it keeps happening.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
        <Button onClick={reset} className="mt-5">
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-72 max-w-full" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-3 h-1.5 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card xl:col-span-2">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mt-4 h-10 w-full" />
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mt-4 h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
