import { Compass } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <LogoMark className="mx-auto size-10" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This page doesn’t exist</h1>
        <p className="mt-2 text-sm text-ink-2">The link may be outdated, or the page has moved. Head back to your workspace to continue.</p>
        <ButtonLink href="/" className="mt-6">
          <Compass aria-hidden />
          Back to workspace
        </ButtonLink>
      </div>
    </main>
  );
}
