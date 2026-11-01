"use server";

import { db } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function submitAccessRequest(fd: FormData) {
  const name = (fd.get("name") as string)?.trim();
  const email = (fd.get("email") as string)?.toLowerCase().trim();
  const password = (fd.get("password") as string) ?? "";
  const requestedRole = (fd.get("requestedRole") as string) ?? "";
  const departmentId = Number(fd.get("departmentId")) || null;
  const clubId = Number(fd.get("clubId")) || null;
  const reason = (fd.get("reason") as string)?.trim();

  if (!name || name.length < 2) throw new Error("Enter your full name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!["coordinator", "faculty", "club"].includes(requestedRole)) throw new Error("Select a valid role");
  if (!reason || reason.length < 10) throw new Error("Please explain why you need access (10+ characters)");

  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (existingUser) throw new Error("An account with this email already exists. Please sign in instead.");
  const [existingRequest] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.email, email)).limit(1);
  if (existingRequest) throw new Error("You already have a pending access request. Wait for admin review.");

  const passwordHash = hashPassword(password);
  await db.insert(t.accessRequests).values({
    name,
    email,
    passwordHash,
    requestedRole: requestedRole as "coordinator" | "faculty" | "club",
    departmentId,
    clubId,
    reason,
    status: "pending",
  });

  redirect("/access-request/success");
}
