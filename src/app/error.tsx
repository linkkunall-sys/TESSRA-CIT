"use client";

import { RouteError } from "@/components/route-states";

export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-10">
      <RouteError {...props} />
    </main>
  );
}
