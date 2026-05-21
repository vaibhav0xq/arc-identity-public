import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey && serviceRoleKey);
}

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service env vars");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function getSupabaseBrowser() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public env vars");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}