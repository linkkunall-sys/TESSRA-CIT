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
          <RotateCcw aria-hidden /> Restore CIT baseline
        </>
      }
      title="Restore the committed CIT baseline?"
      description="This replaces mutable workflows with the validator-clean CIT timetable, booking decisions, constraints, and examinations. Accounts, reference catalogues, and your current login are preserved."
    >
      <div className="rounded-xl border border-warning-bg bg-warning-bg p-4 text-[13px] leading-5 text-warning-fg">
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="size-4" aria-hidden /> This cannot be undone
        </p>
        <p className="mt-1">
          Current bookings, examinations, timetable versions, change requests, disruption plans, notifications,
          assistant conversations, coursework changes, and prior official runs will be replaced atomically. The
          committed CIT baseline becomes the published operational state.
        </p>
      </div>
      <ActionForm action={resetDemoDataAction}>
        <DialogFooter>
          <DialogCancel />
          <SubmitButton variant="destructive" pendingLabel="Restoring CIT baseline…">
            <RotateCcw aria-hidden /> Restore baseline
          </SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );
}
