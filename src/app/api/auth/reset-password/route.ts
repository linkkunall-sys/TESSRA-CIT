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

  const token = str(fd, "token");
  const password = str(fd, "password");
  const confirmPassword = str(fd, "confirmPassword");

  if (!token) return json({ ok: false, message: "Invalid or missing reset token.", fieldErrors: { token: "Invalid token" } }, 400);
  if (!password || password.length < 8) return json({ ok: false, message: "Password must be at least 8 characters.", fieldErrors: { password: "Too short" } }, 400);
  if (password !== confirmPassword) return json({ ok: false, message: "Passwords do not match.", fieldErrors: { confirmPassword: "Passwords must match" } }, 400);

  const [resetRow] = await db
    .select()
    .from(t.passwordResetTokens)
    .where(eq(t.passwordResetTokens.token, token))
    .limit(1);

  if (!resetRow) return json({ ok: false, message: "Invalid or expired reset token.", fieldErrors: { token: "Invalid token" } }, 400);
  if (new Date(resetRow.expiresAt) < new Date()) return json({ ok: false, message: "Reset token has expired.", fieldErrors: { token: "Token expired" } }, 400);
  if (resetRow.usedAt) return json({ ok: false, message: "Reset token has already been used.", fieldErrors: { token: "Token used" } }, 400);

  const [user] = await db.select().from(t.users).where(eq(t.users.id, resetRow.userId)).limit(1);
  if (!user) return json({ ok: false, message: "User not found.", fieldErrors: { token: "Invalid token" } }, 400);

  const passwordHash = hashPassword(password);
  await db.update(t.users).set({ passwordHash }).where(eq(t.users.id, user.id));
  await db
    .update(t.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(t.passwordResetTokens.id, resetRow.id));

  await audit(user.id, "password.reset_completed", "user", user.id, "Password reset completed");

  return json({ ok: true, message: "Password has been reset. You can now sign in with your new password." });
}
