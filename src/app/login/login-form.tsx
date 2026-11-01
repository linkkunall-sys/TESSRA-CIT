"use client";

import { ArrowRight, Check, Copy, ExternalLink, LoaderCircle, LogIn, RotateCcw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ActionForm, FormAlert, FormField, SubmitButton, useActionForm } from "@/components/client";
import { Avatar, Input, buttonClasses } from "@/components/ui";
import { DEMO_PASSWORD } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

type Account = { role: string; email: string; name: string; detail: string; roleLabel: string };
type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type SignedIn = (state: NonNullable<ActionState>) => void;

/* ----------------------------- Browser context ---------------------------- */
type BrowserContext = "server" | "top" | "embedded" | "sandboxed";
type Blocked = "embedded" | "sandboxed" | "cookies-off";

const subscribeNever = () => () => {};
function readBrowserContext(): BrowserContext {
  if (window.origin === "null") return "sandboxed"; // sandboxed iframe without its own origin
  try {
    return window.self !== window.top ? "embedded" : "top";
  } catch {
    return "embedded";
  }
}
const useBrowserContext = () => useSyncExternalStore(subscribeNever, readBrowserContext, (): BrowserContext => "server");
const useOrigin = () => useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");

/** Asks the server to set a probe cookie (same attributes as the session) and checks it comes back. */
async function cookiesWorkHere() {
  try {
    const set = await fetch("/api/auth/probe", { method: "POST", credentials: "same-origin", cache: "no-store" });
    const { nonce } = (await set.json()) as { nonce: string };
    const check = await fetch(`/api/auth/probe?n=${encodeURIComponent(nonce)}`, { credentials: "same-origin", cache: "no-store" });
    return Boolean(((await check.json()) as { cookiesWork?: boolean }).cookiesWork);
  } catch {
    return false;
  }
}

/* ------------------------------ Direct link UI ---------------------------- */
const BLOCKED_COPY: Record<Blocked, { title: string; body: string }> = {
  embedded: {
    title: "Sign-in can’t stay active inside this preview panel",
    body: "Your browser blocks cookies in embedded previews — Safari and every iPhone/iPad browser do this by default, as do some privacy settings. Open TESSRA in its own browser tab to sign in; everything works there.",
  },
  sandboxed: {
    title: "This preview panel is sandboxed",
    body: "The panel runs TESSRA without its own storage, so sign-in can’t work here. Open TESSRA in its own browser tab to continue.",
  },
  "cookies-off": {
    title: "Your browser blocked the sign-in cookie",
    body: "Cookies are turned off for this site, so your session can’t be kept. Allow cookies for this site in your browser settings, then try again.",
  },
};

function DirectLinkPanel({ variant, onRetry }: { variant: Blocked; onRetry: () => void }) {
  const origin = useOrigin();
  const url = origin ? `${origin}/login` : "/login";
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const [popupBlocked, setPopupBlocked] = useState(false);
  const text = BLOCKED_COPY[variant];
  const showLink = variant !== "cookies-off";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      // Clipboard API is often unavailable inside iframes — fall back to a selected text field.
      inputRef.current?.focus();
      inputRef.current?.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      setCopied(ok ? "copied" : "manual");
    }
  };

  const openTab = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const tab = window.open(url, "_blank");
    if (tab) {
      tab.opener = null;
      setPopupBlocked(false);
    } else {
      setPopupBlocked(true); // panels without allow-popups return null here
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div role="alert" className="mt-6 animate-slide-up rounded-xl border border-warning-bg bg-warning-bg/50 p-4 text-warning-fg">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {text.title}
      </p>
      <p className="mt-1.5 text-[13px] leading-5">{text.body}</p>
      {showLink && (
        <div className="mt-3">
          <label htmlFor="direct-link" className="block text-xs font-semibold">
            TESSRA address
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="direct-link"
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 min-w-0 flex-1 rounded-lg border border-warning-fg/20 bg-white px-3 font-mono text-xs text-ink outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
            />
            <button type="button" onClick={copyLink} className={buttonClasses("secondary", "md")} aria-live="polite">
              {copied === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === "copied" ? "Copied" : "Copy"}
            </button>
          </div>
          {copied === "manual" && <p className="mt-1.5 text-xs">The address is selected — press Ctrl+C (⌘C on Mac) to copy it.</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {showLink && (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={openTab} className={buttonClasses("primary", "sm")}>
            <ExternalLink aria-hidden /> Open in a new tab
          </a>
        )}
        <button type="button" onClick={onRetry} className={buttonClasses("secondary", "sm")}>
          <RotateCcw aria-hidden /> {variant === "cookies-off" ? "Try again" : "Check again"}
        </button>
      </div>
      {popupBlocked && (
        <p className="mt-2.5 text-xs font-medium">The preview panel blocked new tabs. Copy the address above and paste it into a new browser tab.</p>
      )}
    </div>
  );
}

/* --------------------------------- Forms ---------------------------------- */
function LoginForm({ action, onSignedIn }: { action: FormAction; onSignedIn: SignedIn }) {
  return (
    <ActionForm action={action} onSuccess={onSignedIn} className="mt-8 space-y-4" toastOnSuccess={false} toastOnError={false} aria-label="Sign in">
      <FormAlert />
      <FormField name="email" label="Work email" required>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@cit.ac.in" />
      </FormField>
      <FormField name="password" label="Password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" />
      </FormField>
      <div className="flex justify-end">
        <a href="/auth/forgot-password" className="text-xs text-brand-700 hover:underline">
          Forgot password?
        </a>
      </div>
      <SubmitButton className="w-full" size="lg" icon={<LogIn />} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}

function DemoButton({ a }: { a: Account }) {
  const { pending } = useActionForm();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-brand-300 hover:bg-brand-50/40 focus-visible:ring-[3px] focus-visible:ring-brand-500/30 disabled:opacity-60"
    >
      <Avatar name={a.name} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{a.roleLabel}</span>
        <span className="block truncate text-xs text-ink-2">
          {a.name} · {a.detail}
        </span>
      </span>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin text-brand-600" aria-hidden />
      ) : (
        <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
      )}
      <span className="sr-only">Sign in as {a.roleLabel}</span>
    </button>
  );
}

function DemoAccounts({ accounts, action, onSignedIn }: { accounts: Account[]; action: FormAction; onSignedIn: SignedIn }) {
  return (
    <section className="mt-8" aria-labelledby="demo-heading">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" aria-hidden />
        <h3 id="demo-heading" className="text-xs font-medium text-ink-3">
          Explore a demo workspace
        </h3>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      <ul className="mt-4 grid gap-2">
        {accounts.map((a) => (
          <li key={a.email}>
            <ActionForm action={action} onSuccess={onSignedIn} toastOnSuccess={false}>
              <input type="hidden" name="email" value={a.email} />
              <input type="hidden" name="password" value={DEMO_PASSWORD} />
              <DemoButton a={a} />
            </ActionForm>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-ink-3">
        All demo accounts use the password <code className="rounded bg-muted-bg px-1 py-0.5 font-mono text-ink-2">{DEMO_PASSWORD}</code>
      </p>
    </section>
  );
}

/* --------------------------------- Panel ---------------------------------- */
/**
 * Sign-in flow: (1) inside an embedded preview, test cookies up front; (2) post credentials to
 * the route handler; (3) confirm the browser really sent the session back; (4) full navigation
 * into the workspace. Whenever cookies can't persist here, show the direct address instead of
 * failing silently — including when the panel also blocks new tabs.
 */
export function LoginPanel({ accounts }: { accounts: Account[] }) {
  const context = useBrowserContext();
  const [probe, setProbe] = useState<"pending" | "ok" | "blocked">("pending");
  const [probeRun, setProbeRun] = useState(0);
  const [attemptBlocked, setAttemptBlocked] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);

  useEffect(() => {
    if (context !== "embedded") return;
    let cancelled = false;
    cookiesWorkHere().then((works) => {
      if (!cancelled) setProbe(works ? "ok" : "blocked");
    });
    return () => {
      cancelled = true;
    };
  }, [context, probeRun]);

  const blocked: Blocked | null =
    context === "sandboxed"
      ? "sandboxed"
      : context === "embedded" && (probe === "blocked" || attemptBlocked)
        ? "embedded"
        : context === "top" && attemptBlocked
          ? "cookies-off"
          : null;

  const retry = () => {
    setAttemptBlocked(false);
    if (context === "embedded") {
      setProbe("pending");
      setProbeRun((n) => n + 1);
    }
  };

  const signIn = useCallback<FormAction>(async (_prev, fd) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", { method: "POST", body: fd, credentials: "same-origin", cache: "no-store" });
    } catch {
      setAttemptBlocked(true);
      return { ok: false, message: "TESSRA couldn’t be reached from this view. Use the direct address above to open it in a new tab.", at: Date.now() };
    }
    const data = (await res.json().catch(() => null)) as ActionState;
    return data ?? { ok: false, message: `Sign-in failed (HTTP ${res.status}). Please try again.`, at: Date.now() };
  }, []);

  const enterWorkspace = useCallback<SignedIn>(async (state) => {
    setEntering(state.message);
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      const session = (await res.json()) as { authenticated?: boolean; home?: string | null };
      if (session.authenticated) {
        window.location.assign(state.redirectTo ?? session.home ?? "/");
        return;
      }
    } catch {
      // treated as a refused cookie below
    }
    setEntering(null);
    setAttemptBlocked(true);
  }, []);

  if (entering) {
    return (
      <div role="status" aria-live="polite" className="mt-8 flex animate-fade-in flex-col items-center rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card">
        <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold text-ink">{entering}</p>
        <p className="mt-1 text-[13px] text-ink-2">Opening your workspace…</p>
      </div>
    );
  }

  return (
    <>
      {blocked && <DirectLinkPanel variant={blocked} onRetry={retry} />}
      <LoginForm action={signIn} onSignedIn={enterWorkspace} />
      <DemoAccounts accounts={accounts} action={signIn} onSignedIn={enterWorkspace} />
      <p className="mt-6 text-center text-xs text-ink-3">
        Don&apos;t have an account?{" "}
        <a href="/access-request" className="font-medium text-brand-700 hover:underline">
          Request access
        </a>{" "}
        (coordinator, faculty, club). Admins create accounts in the Admin Panel.
      </p>
      {context === "embedded" && probe === "ok" && !blocked && (
        <p className="mt-6 text-center text-xs text-ink-3">
          Working in a preview panel? You can also{" "}
          <a href="/login" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
            open TESSRA in a new tab ↗
          </a>
        </p>
      )}
    </>
  );
}
