"use client";

/**
 * Interactive design-system primitives: toasts, accessible dialogs, server-action
 * forms with inline validation, confirmation flows and auto-submitting filters.
 */
import { CircleAlert, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X, ChevronDown } from "lucide-react";
import {
  createContext,
  startTransition,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import { cn, type ActionState } from "@/lib/utils";
import { buttonClasses, controlClasses, type ButtonSize, type ButtonVariant } from "./ui";

/* ================================= Toasts ================================= */
type ToastTone = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; tone: ToastTone; message: string };
const ToastContext = createContext<{ push: (tone: ToastTone, message: string) => void }>({ push: () => undefined });

const TOAST_ICON = {
  success: [CircleCheck, "text-success"],
  error: [CircleX, "text-danger"],
  warning: [TriangleAlert, "text-warning"],
  info: [Info, "text-info"],
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      if (!message) return;
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((t) => {
          const [Icon, color] = TOAST_ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-line bg-surface p-3.5 pr-2.5 shadow-pop"
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", color)} aria-hidden />
              <p className="flex-1 text-sm leading-5 text-ink">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="cursor-pointer rounded-md p-1 text-ink-3 transition-colors hover:bg-muted-bg hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ================================= Dialog ================================= */
const DialogContext = createContext<{ close: () => void } | null>(null);
export const useDialog = () => useContext(DialogContext);

export function Dialog({
  trigger,
  title,
  description,
  children,
  size = "md",
  variant = "secondary",
  triggerSize = "md",
  triggerClassName,
  triggerLabel,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descId = useId();
  const close = useCallback(() => ref.current?.close(), []);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        title={triggerLabel}
        className={buttonClasses(variant, triggerSize, triggerClassName)}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cn(
          "w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-left text-ink shadow-pop open:animate-pop-in",
          size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl",
        )}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-[13px] leading-5 text-ink-2">
                  {description}
                </p>
              )}
            </div>
            <button type="button" onClick={close} className={buttonClasses("ghost", "icon-sm", "-mr-1.5 -mt-1")} aria-label="Close dialog">
              <X aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">
            {open && <DialogContext.Provider value={{ close }}>{children}</DialogContext.Provider>}
          </div>
        </div>
      </dialog>
    </>
  );
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 border-t border-line bg-subtle px-5 py-3.5 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  );
}

export function DialogCancel({ children = "Cancel" }: { children?: ReactNode }) {
  const dialog = useDialog();
  return (
    <button type="button" onClick={() => dialog?.close()} className={buttonClasses("secondary", "md")}>
      {children}
    </button>
  );
}

/* =============================== Action forms ============================== */
type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const FormContext = createContext<{ state: ActionState; pending: boolean }>({ state: null, pending: false });
export const useActionForm = () => useContext(FormContext);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  toastOnSuccess = true,
  toastOnError = true,
  onSuccess,
  id,
  "aria-label": ariaLabel,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  toastOnSuccess?: boolean;
  toastOnError?: boolean;
  onSuccess?: (state: NonNullable<ActionState>) => void;
  id?: string;
  "aria-label"?: string;
}) {
  // Never let an unexpected failure (network drop, server exception, or a stale page whose
  // Server Action IDs changed after a redeploy) crash the tree into a blank screen.
  const safeAction = useCallback(
    async (prev: ActionState, fd: FormData): Promise<ActionState> => {
      try {
        return await action(prev, fd);
      } catch (err) {
        unstable_rethrow(err); // redirect()/notFound() must still reach Next.js
        if (unstable_isUnrecognizedActionError(err)) {
          return { ok: false, message: "TESSRA was updated while this page was open. Reload the page and try again.", at: Date.now() };
        }
        console.error(err);
        return { ok: false, message: "The server couldn't complete this request. Check your connection and try again.", at: Date.now() };
      }
    },
    [action],
  );
  const [state, dispatch, pending] = useActionState(safeAction, null);
  const { push } = useToast();
  const dialog = useContext(DialogContext);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state || state.at === handled.current) return;
    handled.current = state.at;
    if (state.ok) {
      if (toastOnSuccess) push("success", state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      dialog?.close();
    } else if (toastOnError) {
      push("error", state.message);
    }
  }, [state, push, dialog, resetOnSuccess, toastOnSuccess, toastOnError, onSuccess]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };

  return (
    <FormContext.Provider value={{ state, pending }}>
      <form ref={formRef} onSubmit={onSubmit} className={className} id={id} aria-label={ariaLabel} noValidate aria-busy={pending}>
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  icon,
  disabled,
  ...rest
}: Omit<ComponentProps<"button">, "type"> & { pendingLabel?: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  const { pending } = useContext(FormContext);
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={buttonClasses(variant, size, className)} {...rest}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FieldError({ name }: { name: string }) {
  const { state } = useContext(FormContext);
  const msg = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  if (!msg) return null;
  return (
    <p id={`${name}-error`} role="alert" className="flex items-start gap-1.5 text-xs leading-5 text-danger-fg">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {msg}
    </p>
  );
}

export function FormField({
  name,
  label,
  hint,
  required,
  children,
  className,
  htmlFor,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const { state } = useContext(FormContext);
  const invalid = Boolean(state && !state.ok && state.fieldErrors?.[name]);
  return (
    <div
      data-invalid={invalid || undefined}
      className={cn("space-y-1.5 [&[data-invalid]_:is(input,select,textarea)]:border-danger [&[data-invalid]_:is(input,select,textarea)]:ring-danger/15", className)}
    >
      <label htmlFor={htmlFor ?? name} className="block text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !invalid && <p className="text-xs leading-5 text-ink-3">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function FormAlert() {
  const { state } = useContext(FormContext);
  if (!state || state.ok || !state.message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-bg-strong bg-danger-bg/60 px-3 py-2.5 text-[13px] leading-5 text-danger-fg">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{state.message}</span>
    </div>
  );
}

function HiddenFields({ fields }: { fields: Record<string, string | number> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
    </>
  );
}

/** One-click action button backed by a server action (approve, pin, mark read…). */
export function InlineAction({
  action,
  fields,
  children,
  variant = "secondary",
  size = "sm",
  className,
  icon,
  pendingLabel,
  label,
  disabled,
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  icon?: ReactNode;
  pendingLabel?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <ActionForm action={action} className="inline-flex">
      <HiddenFields fields={fields} />
      <SubmitButton variant={variant} size={size} className={className} icon={icon} pendingLabel={pendingLabel} aria-label={label} title={label} disabled={disabled}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}

/** Confirmation dialog for consequential actions; optional extra fields (e.g. a reason). */
export function ConfirmAction({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
  triggerVariant = "secondary",
  triggerSize = "sm",
  triggerClassName,
  triggerLabel,
  children,
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog
      trigger={trigger}
      title={title}
      description={description}
      size="sm"
      variant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
    >
      <ActionForm action={action} className="space-y-4">
        <HiddenFields fields={fields} />
        {children}
        <FormAlert />
        <DialogFooter>
          <DialogCancel />
          <SubmitButton variant={tone === "danger" ? "destructive" : "primary"} pendingLabel="Working…">
            {confirmLabel}
          </SubmitButton>
        </DialogFooter>
      </ActionForm>
    </Dialog>
  );
}

/** Select that submits its (GET) form on change — used for filter bars. */
export function AutoSubmitSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(controlClasses, "h-9 cursor-pointer appearance-none pr-9", className)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
}
