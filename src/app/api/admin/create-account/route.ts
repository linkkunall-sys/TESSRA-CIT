import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { createClient as createSupabaseClient, createAdminClient, isConfigured } from "@/lib/supabase/server";
import { db } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/password";
import type { Role } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/utils";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const VALID_ROLES: Role[] = ["admin", "coordinator", "faculty", "club"];

export async function POST(req: Request) {
  // Verify admin authentication via session
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return json(fail("Admin access required."), 403);
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json(fail("Malformed request."), 400);
  }

  const name = (fd.get("name") as string)?.trim();
  const email = (fd.get("email") as string)?.toLowerCase().trim();
  const password = (fd.get("password") as string) ?? "";
  const role = (fd.get("role") as string) ?? "";
  const departmentId = Number(fd.get("departmentId")) || null;
  const clubId = Number(fd.get("clubId")) || null;

  const errors: Record<string, string> = {};
  if (!name || name.length < 2) errors.name = "Enter full name";
  if (!email || !/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
  if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!VALID_ROLES.includes(role as Role)) errors.role = "Select a valid role";
  if (Object.keys(errors).length) return json(fail("Please fix the highlighted fields.", errors), 400);

  // Check for duplicate email in users or pending access requests
  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (existingUser) return json(fail("An account with this email already exists."), 409);

  const [existingRequest] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.email, email)).limit(1);
  if (existingRequest) {
    return json(fail("A pending access request already exists for this email."), 409);
  }

  const passwordHash = hashPassword(password);

  // Create the account directly (approved, no request flow)
  const [newUser] = await db
    .insert(t.users)
    .values({
      name,
      email,
      passwordHash,
      role: role as Role,
      departmentId,
      clubId,
      approvalStatus: "approved",
    })
    .returning();

  // Also create Supabase Auth user if configured — admin.createUser requires service role key
  if (isConfigured) {
    const supabase = await createAdminClient();
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role, name },
        });
        if (authData?.user?.id && !authError) {
          // Link Supabase Auth UID to local user profile
          await db.update(t.users).set({ supabaseUid: authData.user.id }).where(eq(t.users.id, newUser.id));
        }
      } catch (err) {
        console.warn("Supabase auth user creation failed:", err);
        // Non-fatal — local account is already created
      }
    }
  }

  return json(
    { ok: true, message: "Account created successfully.", user: { id: newUser.id, email: newUser.email, role: newUser.role } },
    201
  );
}
