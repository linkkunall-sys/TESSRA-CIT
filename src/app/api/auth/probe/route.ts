import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PROBE_COOKIE = "tessra_probe";
const noStore = { "Cache-Control": "no-store" };

/**
 * Embedded-preview cookie check, used by the sign-in screen before anyone types a password.
 * POST stores a short-lived probe cookie with exactly the same attributes as the session
 * cookie; GET reports whether the browser kept it and sent it back. If not (Safari, every
 * iPhone/iPad browser, strict privacy settings), sign-in can't persist inside the panel and
 * the UI offers a direct link to open TESSRA in its own tab instead.
 */
export async function POST() {
  const nonce = randomBytes(12).toString("hex");
  (await cookies()).set(PROBE_COOKIE, nonce, { ...(await cookieOptions()), maxAge: 120 });
  return Response.json({ nonce }, { headers: noStore });
}

export async function GET(req: Request) {
  const nonce = new URL(req.url).searchParams.get("n");
  const stored = (await cookies()).get(PROBE_COOKIE)?.value;
  return Response.json({ cookiesWork: Boolean(nonce) && stored === nonce }, { headers: noStore });
}
