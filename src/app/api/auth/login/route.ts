import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { createClient as createSupabaseClient, createAdminClient, isConfigured } from "@/lib/supabase/server";
import { db } from "@/db";
import * as t from "@/db/schema";
import { ROLE_HOME } from "@/lib/constants";
import { fail, ok, str } from "@/lib/utils";
import { ensureSeeded } from "@/lib/seed";
import { verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Rejects cross-site posts (login CSRF). Same-origin fetches from the app — including inside an iframe — pass. */
function isSameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json(fail("Sign-in requests must come from TESSRA itself."), 403);
  await ensureSeeded();
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json(fail("The sign-in request was malformed. Reload the page and try again."), 400);
  }
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const errors: Record<string, string> = {};
  if (!email) errors.email = "Enter your email address";
  if (!password) errors.password = "Enter your password";
  if (Object.keys(errors).length) return json(fail("Please complete the highlighted fields.", errors), 400);

  if (isConfigured) {
    // --- Supabase Auth mode ---
    const supabase = await createSupabaseClient();
    if (!supabase) return json(fail("Authentication service unavailable."), 503);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Self-healing: if the user exists locally (approved, no supabaseUid) but was never
      // created in Supabase Auth (bug in earlier approvals), create their Auth account
      // using the plain password from their access request record, then retry sign-in.
      const [localUser] = await db
        .select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, supabaseUid: t.users.supabaseUid, approvalStatus: t.users.approvalStatus })
        .from(t.users)
        .where(eq(t.users.email, email))
        .limit(1);

      if (localUser && localUser.approvalStatus === "approved" && !localUser.supabaseUid) {
        const [reqRow] = await db
          .select({ passwordHash: t.accessRequests.passwordHash })
          .from(t.accessRequests)
          .where(eq(t.accessRequests.email, email))
          .limit(1);

        if (reqRow) {
          const adminSupabase = await createAdminClient();
          if (adminSupabase) {
            const { data: authData, error: createError } = await adminSupabase.auth.admin.createUser({
              email,
              password: reqRow.passwordHash, // plain password stored in access request
              email_confirm: true,
              user_metadata: { role: localUser.role ?? "club", name: localUser.name ?? "" },
            });
            if (authData?.user?.id && !createError) {
              await db.update(t.users).set({ supabaseUid: authData.user.id }).where(eq(t.users.id, localUser.id));
              // Retry sign-in now that the Auth user exists
              const retryError = (await supabase.auth.signInWithPassword({ email, password })).error;
              if (!retryError) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const rows = await db
                    .select({ role: t.users.role, approvalStatus: t.users.approvalStatus })
                    .from(t.users)
                    .where(eq(t.users.supabaseUid, user.id))
                    .limit(1);
                  if (rows[0] && rows[0].approvalStatus === "approved") {
                    const store = await cookies();
                    for (const legacy of ["tessra_session", "tessra_sid"]) if (store.has(legacy)) store.delete(legacy);
                    return json(ok("Signed in", { redirectTo: ROLE_HOME[rows[0].role as keyof typeof ROLE_HOME] ?? "/" }));
                  }
                }
              }
            }
          }
        }
      }

      return json(fail("Email or password is incorrect.", { password: "Email or password is incorrect." }), 401);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    let redirectTo = "/";
    if (user) {
      const rows = await db
        .select({ role: t.users.role, approvalStatus: t.users.approvalStatus })
        .from(t.users)
        .where(eq(t.users.supabaseUid, user.id))
        .limit(1);
      if (rows[0]) {
        if (rows[0].approvalStatus !== "approved") {
          return json(fail("Your account is pending approval. Please wait for an admin to approve it."), 403);
        }
        redirectTo = ROLE_HOME[rows[0].role as keyof typeof ROLE_HOME] ?? "/";
      }
    }

    // Clear legacy cookies from earlier builds
    const store = await cookies();
    for (const legacy of ["tessra_session", "tessra_sid"]) if (store.has(legacy)) store.delete(legacy);

    return json(ok("Signed in", { redirectTo }));
  }

  // --- Custom session mode (no Supabase) ---
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return json(fail("Email or password is incorrect.", { password: "Email or password is incorrect." }), 401);
  }
  if (user.approvalStatus !== "approved") {
    return json(fail("Your account is pending approval. Please wait for an admin to approve it."), 403);
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(t.authSessions).values({ id, userId: user.id, expiresAt });
  const store = await cookies();
  store.set("tessra_sid", id, { httpOnly: true, secure: false, sameSite: "lax", path: "/", expires: expiresAt });
  // Only clean up the old cookie name; tessra_sid is our current session cookie
  if (store.has("tessra_session")) store.delete("tessra_session");

  return json(ok("Signed in", { redirectTo: ROLE_HOME[user.role as keyof typeof ROLE_HOME] ?? "/" }));
}
