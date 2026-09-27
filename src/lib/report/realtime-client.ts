"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicKey } from "@/lib/supabase/public-key";

let client: SupabaseClient | null = null;

export function createPublicRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 3 } },
  });
  return client;
}
