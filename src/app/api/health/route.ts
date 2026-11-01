import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type EngineHealth = {
  configured: boolean;
  ok: boolean;
  engine?: string;
  ortools?: string;
  validatorSha256?: string;
  status?: number;
};

async function checkEngine(): Promise<EngineHealth> {
  const engineUrl = process.env.ENGINE_URL?.replace(/\/$/, "");
  if (!engineUrl) return { configured: false, ok: false };

  try {
    const response = await fetch(`${engineUrl}/health`, {
      headers: process.env.ENGINE_TOKEN ? { Authorization: `Bearer ${process.env.ENGINE_TOKEN}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { configured: true, ok: false, status: response.status };
    const value = (await response.json()) as {
      ok?: boolean;
      engine?: string;
      ortools?: string;
      validator_sha256?: string;
    };
    return {
      configured: true,
      ok: value.ok === true,
      engine: value.engine,
      ortools: value.ortools,
      validatorSha256: value.validator_sha256,
      status: response.status,
    };
  } catch {
    return { configured: true, ok: false };
  }
}

export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  const engine = await checkEngine();
  return Response.json(
    { ok: database, database, engine },
    { status: database ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
