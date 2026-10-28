import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only writer. Book tables have no insert policy, so page uploads use this client.
 * The key stays in SUPABASE_SERVICE_ROLE_KEY. Never log it and never import this from a client component.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service env vars are not set");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
