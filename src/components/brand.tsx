import { cn } from "@/lib/utils";
import { PRODUCT } from "@/lib/constants";

/** TESSRA mark — three tessellated schedule tiles forming a “T”. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden="true" fill="none">
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <rect x="6.5" y="7" width="8.75" height="8" rx="2" className="fill-brand-400" />
      <rect x="16.75" y="7" width="8.75" height="8" rx="2" className="fill-brand-500" />
      <rect x="11.625" y="17" width="8.75" height="8.5" rx="2" className="fill-brand-200" />
    </svg>
  );
}

export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className={cn("text-[15px] font-semibold tracking-[0.16em]", inverted ? "text-white" : "text-ink")}>{PRODUCT.name}</span>
      <span className={cn("mt-1 truncate text-[11px] font-medium", inverted ? "text-white/60" : "text-ink-3")}>{PRODUCT.descriptor}</span>
    </span>
  );
}
