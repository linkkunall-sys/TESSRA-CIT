import { RotateCcw, TriangleAlert } from "lucide-react";
import { resetDemoDataAction } from "@/lib/actions";
import { ActionForm, Dialog, DialogCancel, DialogFooter, SubmitButton } from "./client";

/** Admin-only control; the server action performs the role check again. */
export function ResetDemoDataButton({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog
      variant="destructive"
      triggerSize={compact ? "sm" : "md"}
      trigger={
        <>
          <RotateCcw aria-hidden /> Reset demo data
        </>
      }
      title="Reset to a clean demo?"
      description="This clears all mutable activity and regenerates a complete timetable. Demo accounts, academic reference data and your current login are preserved."
    >
      <div className="rounded-xl border border-warning-bg bg-warning-bg p-4 text-[13px] leading-5 text-warning-fg">
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="size-4" aria-hidden /> This cannot be undone
        </p>
        <p className="mt-1">
          Bookings, change requests, disruption plans, notifications, assistant conversations, access requests,
          coursework changes and prior generated runs will be removed. A fresh, fully validated timetable is
          published before the old one is deleted.
        </p>
      </div>
      <ActionForm action={resetDemoDataAction}>
        <DialogFooter>
          <DialogCancel />
          <SubmitButton variant="destructive" pendingLabel="Resetting and regenerating…">
            <RotateCcw aria-hidden /> Reset and regenerate
          </SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );
}
