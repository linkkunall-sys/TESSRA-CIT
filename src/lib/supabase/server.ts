import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Creates a Supabase client for use in Server Components and Route Handlers.
 *
 * Returns null when Supabase is not configured (missing URL/ANON_KEY),
 * allowing the app to fall back to its existing auth/database layer.
 *
 * Requires env vars (when configured):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export async function createClient() {
  if (!isConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set(name, value, options);
        } catch {
          // `cookies()` may be read-only in some contexts; ignore.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        } catch {
          // ignore
        }
      },
    },
  });
}

/**
 * Creates a Supabase admin client using the service role key.
 * Returns null when the service role key is not configured.
 * Use only in server-side code — never expose to the browser.
 * Bypasses RLS; for seeding, admin operations, and trusted server actions.
 */
export function createAdminClient() {
  if (!isConfigured || !supabaseServiceKey) return null;

  return createServerClient(supabaseUrl!, supabaseServiceKey!, {
    cookies: {
      get() {
        return undefined;
      },
      set() {},
      remove() {},
    },
  });
}

export { isConfigured, supabaseUrl, supabaseAnonKey, supabaseServiceKey };
