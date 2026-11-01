import { and, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { Role } from "@/db/schema";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const VALID_ROLES: Role[] = ["admin", "coordinator", "faculty", "club"];

export async function POST(req: Request) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json({ ok: false, message: "Malformed request." }, 400);
  }

  const name = (fd.get("name") as string)?.trim();
  const email = (fd.get("email") as string)?.toLowerCase().trim();
  const password = (fd.get("password") as string) ?? "";
  const requestedRole = (fd.get("requestedRole") as string) ?? "";
  const departmentId = Number(fd.get("departmentId")) || null;
  const clubId = Number(fd.get("clubId")) || null;
  const reason = (fd.get("reason") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!name || name.length < 2) errors.name = "Enter your full name";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
  if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!VALID_ROLES.includes(requestedRole as Role)) errors.requestedRole = "Select a valid role";
  if (!reason || reason.length < 10) errors.reason = "Please explain why you need access (10+ characters)";
  if (Object.keys(errors).length) return json({ ok: false, message: "Please fix the highlighted fields.", errors }, 400);
  // Check for duplicate email in users or access_requests
  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (existingUser) return json({ ok: false, message: "An account with this email already exists. Please sign in instead.", redirectTo: "/login" }, 409);
  const [existingRequest] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.email, email)).limit(1);
  if (existingRequest) {
    return json({ ok: false, message: "You already have a pending access request. Wait for admin review." }, 409);
  }

  const [reqRow] = await db
    .insert(t.accessRequests)
    .values({
      name,
      email,
      passwordHash: password, // Store plain password temporarily — used for Supabase Auth creation on approval
      requestedRole: requestedRole as Role,
      departmentId,
      clubId,
      reason,
      status: "pending",
    })
    .returning();

  return json({ ok: true, message: "Access request submitted. An admin will review it shortly.", id: reqRow.id }, 201);
}

/** Admin: list all access requests (with optional status filter). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as t.AccessRequestStatus | null;

  const rows = await db
    .select({
      id: t.accessRequests.id,
      name: t.accessRequests.name,
      email: t.accessRequests.email,
      requestedRole: t.accessRequests.requestedRole,
      departmentId: t.accessRequests.departmentId,
      clubId: t.accessRequests.clubId,
      reason: t.accessRequests.reason,
      status: t.accessRequests.status,
      reviewNote: t.accessRequests.reviewNote,
      reviewedAt: t.accessRequests.reviewedAt,
      createdAt: t.accessRequests.createdAt,
      reviewerName: t.users.name,
    })
    .from(t.accessRequests)
    .leftJoin(t.users, eq(t.users.id, t.accessRequests.reviewedById))
    .orderBy(t.accessRequests.createdAt);

  const filtered = status ? rows.filter((r) => r.status === status) : rows;

  return json({ ok: true, requests: filtered });
}
