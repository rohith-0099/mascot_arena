"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

let client: SupabaseClient | null = null;

/** Shared browser client (publishable key only). Returns null when Supabase isn't configured. */
export function browserClient(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}
