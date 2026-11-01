import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import * as t from "@/db/schema";
import { createClient as createSupabaseClient, isConfigured } from "@/lib/supabase/server";
import { ROLE_HOME, type Role } from "./constants";
import { ensureSeeded } from "./seed";
import { verifyPassword } from "./password";

/** Cookie names used by earlier builds (SameSite=Lax, unpartitioned). Cleared on sign-in. */
const LEGACY_COOKIES = ["tessra_session", "tessra_sid"];
const SESSION_COOKIE = "tessra_sid";

/**
 * The preview runs TESSRA inside a cross-site <iframe>, where browsers silently drop
 * SameSite=Lax cookies — sign-in "worked" but the session was never stored. Over HTTPS we
 * therefore issue SameSite=None + Secure + Partitioned (CHIPS): it behaves normally in a
 * top-level tab and survives inside an embedded preview. Plain-HTTP (local dev) keeps Lax.
 *
 * The preview proxy sends no x-forwarded-proto/forwarded header, so HTTPS is inferred from
 * the browser's Origin/Referer, and finally from the host: public host names are always
 * served over TLS, while plain HTTP is only expected for localhost / IP-address development.
 */
function isHttpsRequest(h: Headers) {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const forwarded = h.get("forwarded")?.match(/proto=(https?)/i)?.[1]?.toLowerCase();
  if (proto === "https" || forwarded === "https") return true;
  const origin = h.get("origin") ?? h.get("referer");
  if (origin && origin !== "null") return origin.startsWith("https://");
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().replace(/:\\d+$/, "");
  return Boolean(host) && host !== "localhost" && !host.endsWith(".localhost") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith("[");
}

/** Attributes shared by every TESSRA auth cookie (session + embedded-preview probe). */
export async function cookieOptions() {
  return isHttpsRequest(await headers())
    ? ({ httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/" } as const)
    : ({ httpOnly: true, secure: false, sameSite: "lax", path: "/" } as const);
}

/** Dual-mode: Supabase Auth when configured, custom session cookies otherwise. */
export type AuthMode = "supabase" | "custom";
export const authMode: AuthMode = isConfigured ? "supabase" : "custom";

/** Current user resolved from either Supabase Auth or custom session cookies. */
export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  departmentId: number | null;
  clubId: number | null;
  departmentName: string | null;
  clubName: string | null;
  supabaseUid: string | null;
  approvalStatus: string;
};

/**
 * Fallback: resolve user from a custom session cookie (auth_sessions table).
 * Used when Supabase is not configured.
 */
async function getCurrentUserCustom(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: t.users.id,
      name: t.users.name,
      email: t.users.email,
      role: t.users.role,
      title: t.users.title,
      departmentId: t.users.departmentId,
      clubId: t.users.clubId,
      departmentName: t.departments.name,
      clubName: t.clubs.name,
      supabaseUid: t.users.supabaseUid,
      approvalStatus: t.users.approvalStatus,
    })
    .from(t.authSessions)
    .innerJoin(t.users, eq(t.users.id, t.authSessions.userId))
    .leftJoin(t.departments, eq(t.departments.id, t.users.departmentId))
    .leftJoin(t.clubs, eq(t.clubs.id, t.users.clubId))
    .where(and(eq(t.authSessions.id, token), gt(t.authSessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Current user resolved from Supabase Auth + public profile.
 * Falls back to custom session cookies when Supabase is not configured.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await ensureSeeded();

  if (authMode === "supabase") {
    const supabase = await createSupabaseClient();
    if (!supabase) return null;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const rows = await db
      .select({
        id: t.users.id,
        name: t.users.name,
        email: t.users.email,
        role: t.users.role,
        title: t.users.title,
        departmentId: t.users.departmentId,
        clubId: t.users.clubId,
        departmentName: t.departments.name,
        clubName: t.clubs.name,
        supabaseUid: t.users.supabaseUid,
        approvalStatus: t.users.approvalStatus,
      })
      .from(t.users)
      .leftJoin(t.departments, eq(t.departments.id, t.users.departmentId))
      .leftJoin(t.clubs, eq(t.clubs.id, t.users.clubId))
      .where(eq(t.users.supabaseUid, user.id))
      .limit(1);

    return rows[0] ?? null;
  }

  return getCurrentUserCustom();
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Block pending/rejected accounts from accessing protected routes
  if (user.approvalStatus && user.approvalStatus !== "approved") {
    redirect("/login?status=" + encodeURIComponent(user.approvalStatus));
  }
  return user;
}

/** Guards pages, layouts and server actions. Users in the wrong workspace are sent to their own. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/**
 * Start an authentication session.
 * Supabase mode: sign in with email + password (sets Supabase auth cookie).
 * Custom mode: verify password hash, create custom session cookie.
 */
export async function startSession(email: string, password: string) {
  if (authMode === "supabase") {
    const supabase = await createSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Clear legacy cookies from earlier builds
    const store = await cookies();
    for (const legacy of LEGACY_COOKIES) if (store.has(legacy)) store.delete(legacy);
    return;
  }

  // Custom mode: verify against stored password hash
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase())).limit(1);
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid credentials");
  }
  if (user.approvalStatus !== "approved") {
    throw new Error("Account not approved");
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(t.authSessions).values({ id, userId: user.id, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, id, { ...(await cookieOptions()), expires: expiresAt });
  for (const legacy of LEGACY_COOKIES) if (store.has(legacy)) store.delete(legacy);
}

export async function endSession() {
  if (authMode === "supabase") {
    const supabase = await createSupabaseClient();
    if (supabase) await supabase.auth.signOut();
  } else {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await db.delete(t.authSessions).where(eq(t.authSessions.id, token));
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...(await cookieOptions()), expires: new Date(0), maxAge: 0 });
  for (const legacy of LEGACY_COOKIES) {
    if (store.has(legacy)) store.delete(legacy);
  }
}
