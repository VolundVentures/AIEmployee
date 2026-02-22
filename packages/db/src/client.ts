import { createClient as supabaseCreateClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client for browser/public use (uses anon key).
 */
export function createClient(url?: string, anonKey?: string) {
  const supabaseUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase URL or anon key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabaseCreateClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Create a Supabase client with service role key (server-side only, full access).
 */
export function getServiceClient(url?: string, serviceKey?: string) {
  const supabaseUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase URL or service role key. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return supabaseCreateClient(supabaseUrl, supabaseServiceKey);
}
