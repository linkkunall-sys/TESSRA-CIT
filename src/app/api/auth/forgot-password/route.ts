import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { str } from "@/lib/utils";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/engine";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json({ ok: false, message: "Malformed request." }, 400);
  }

  const email = str(fd, "email").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, message: "Enter a valid email address.", fieldErrors: { email: "Invalid email" } }, 400);
  }

  const [user] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (!user) {
    // Don't reveal whether the email exists
    return json({ ok: true, message: "If an account exists for this email, a reset link has been sent." });
  }

  // Invalidate any existing unused tokens
  await db.delete(t.passwordResetTokens).where(eq(t.passwordResetTokens.userId, user.id));

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(t.passwordResetTokens).values({ userId: user.id, token, expiresAt });

  await audit(user.id, "password.reset_requested", "user", user.id, `Password reset requested for ${email}`);

  return json({ ok: true, message: "If an account exists for this email, a reset link has been sent." });
}
