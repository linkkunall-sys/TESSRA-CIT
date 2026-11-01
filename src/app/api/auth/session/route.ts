import { cookies } from "next/headers";
import { createClient as createSupabaseClient, isConfigured } from "@/lib/supabase/server";
import { db } from "@/db";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { ROLE_HOME } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Lets the sign-in screen confirm the browser actually stored and sent the session. */
export async function GET() {
  if (isConfigured) {
    const supabase = await createSupabaseClient();
    if (!supabase) {
      return Response.json(
        { authenticated: false, role: null, home: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { authenticated: false, role: null, home: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = await db
      .select({ role: t.users.role, approvalStatus: t.users.approvalStatus })
      .from(t.users)
      .where(eq(t.users.supabaseUid, user.id))
      .limit(1);

    if (!rows[0] || rows[0].approvalStatus !== "approved") {
      return Response.json(
        { authenticated: false, role: null, home: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        authenticated: true,
        role: rows[0].role,
        home: ROLE_HOME[rows[0].role as keyof typeof ROLE_HOME],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- Custom session mode ---
  const store = await cookies();
  const token = store.get("tessra_sid")?.value;
  if (!token) {
    return Response.json(
      { authenticated: false, role: null, home: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await db
    .select({
      role: t.users.role,
      approvalStatus: t.users.approvalStatus,
      expiresAt: t.authSessions.expiresAt,
    })
    .from(t.authSessions)
    .innerJoin(t.users, eq(t.users.id, t.authSessions.userId))
    .where(eq(t.authSessions.id, token))
    .limit(1);

  if (!rows[0] || rows[0].approvalStatus !== "approved" || new Date(rows[0].expiresAt) < new Date()) {
    return Response.json(
      { authenticated: false, role: null, home: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      authenticated: true,
      role: rows[0].role,
      home: ROLE_HOME[rows[0].role as keyof typeof ROLE_HOME],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
