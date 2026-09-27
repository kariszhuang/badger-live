"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicKey } from "./public-key";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key) return null;
  client ??= createBrowserClient(url, key);
  return client;
}
