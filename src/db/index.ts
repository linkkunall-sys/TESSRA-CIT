import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

/**
 * Supabase admin client (service role). Bypasses RLS.
 * Server-only — for seed, admin operations, and trusted server actions.
 * Call per-request: `const supabase = getSupabaseAdmin()`
 */
export async function getSupabaseAdmin() {
  return createAdminClient();
}
